/**
 * Test script for the Review Agent Pipeline.
 * Run: npx ts-node src/scripts/test-review-agents.ts [repoFullName] [prNumber]
 *
 * Tests the full review pipeline end-to-end:
 * 1. Diff fetching + parsing
 * 2. Context building (changed files + vector search)
 * 3. All 6 specialist agents (parallel)
 * 4. Synthesizer (verdict + summary + changelog)
 * 5. (Optional) GitHub PR review posting
 *
 * Requires:
 * - GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY in .env
 * - A connected repo with AI provider keys configured
 * - An open PR on the repo to test against
 *
 * Usage:
 *   npx ts-node src/scripts/test-review-agents.ts                    # auto-detect repo + latest PR
 *   npx ts-node src/scripts/test-review-agents.ts owner/repo         # latest PR on specific repo
 *   npx ts-node src/scripts/test-review-agents.ts owner/repo 42      # specific PR
 *   npx ts-node src/scripts/test-review-agents.ts owner/repo 42 post # also post review to GitHub
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { RepoContext } from "../models/RepoContext";
import { getInstallationToken, githubAppFetch } from "../utils/github";
import { decrypt } from "../utils/encryption";
import {
  resolveProvider,
  resolveEmbeddingProvider,
  type CallLLMOptions,
  type EmbeddingOptions,
} from "../services/ai.service";
import {
  parseDiff,
  truncateDiff,
  formatFileChanges,
} from "../agents/review/diff-parser";
import { buildReviewContext } from "../agents/review/context-builder";
import { runSecurityAgent } from "../agents/review/security";
import { runBugsAgent } from "../agents/review/bugs";
import { runPerformanceAgent } from "../agents/review/performance";
import { runReadabilityAgent } from "../agents/review/readability";
import { runBestPracticesAgent } from "../agents/review/best-practices";
import { runDocumentationAgent } from "../agents/review/documentation";
import { runSynthesizer } from "../agents/review/synthesizer";
import type {
  AgentInput,
  AgentOutput,
  ReviewAgentType,
} from "../agents/review/types";
import { MAX_DIFF_SIZE } from "../agents/review/types";

const AGENT_RUNNERS: Record<
  ReviewAgentType,
  (input: AgentInput) => Promise<AgentOutput>
> = {
  security: runSecurityAgent,
  bugs: runBugsAgent,
  performance: runPerformanceAgent,
  readability: runReadabilityAgent,
  "best-practices": runBestPracticesAgent,
  documentation: runDocumentationAgent,
};

function log(label: string, ok: boolean, detail?: string) {
  const icon = ok ? "[PASS]" : "[FAIL]";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

function logInfo(msg: string) {
  console.log(`  [INFO] ${msg}`);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

async function main() {
  const targetRepo = process.argv[2];
  const targetPR = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  const shouldPost = process.argv[4] === "post";

  console.log("=== Review Agent Pipeline Test ===\n");

  await connectDB();

  // ── 1. Find repo ──
  logSection("Setup");

  const query = targetRepo
    ? { fullName: targetRepo, isActive: true }
    : { isActive: true };
  const repo = await Repo.findOne(query);

  if (!repo) {
    console.error("No connected repo found. Connect a repo first via the UI.");
    process.exit(1);
  }
  logInfo(`Repo: ${repo.fullName}`);
  logInfo(`Focus areas: ${repo.settings.focusAreas.join(", ")}`);

  // ── 2. Load user + resolve providers ──
  const user = await User.findById(repo.connectedBy);
  if (!user || !user.githubInstallationId) {
    console.error("User not found or no GitHub App installation.");
    process.exit(1);
  }

  const decryptedProviders = user.aiConfig.providers.map((p) => ({
    provider: p.provider,
    apiKey: decrypt(p.apiKey),
  }));

  let llmOptions: CallLLMOptions;
  let embeddingOptions: EmbeddingOptions;

  try {
    const resolved = resolveProvider({
      repoAiProvider: repo.settings.aiProvider,
      repoAiModel: repo.settings.aiModel,
      userDefaultProvider: user.aiConfig.defaultProvider,
      userDefaultModel: user.aiConfig.defaultModel,
      userProviders: decryptedProviders,
    });
    llmOptions = {
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
    };
    logInfo(`LLM: ${resolved.provider}/${resolved.model}`);
  } catch (err: any) {
    console.error(`LLM provider error: ${err.message}`);
    process.exit(1);
  }

  try {
    embeddingOptions = resolveEmbeddingProvider(decryptedProviders);
    logInfo(`Embeddings: ${embeddingOptions.provider}`);
  } catch (err: any) {
    console.error(`Embedding provider error: ${err.message}`);
    process.exit(1);
  }

  // ── 3. Get installation token ──
  const installationToken = await getInstallationToken(
    user.githubInstallationId,
  );
  logInfo("Installation token acquired");

  // ── 4. Find a PR to test with ──
  let prNumber: number;
  let prTitle: string;
  let prBody: string;
  let prAuthor: string;
  let headSha: string;
  let baseBranch: string;
  let headBranch: string;

  if (targetPR) {
    // Fetch specific PR
    const prRes = await githubAppFetch(
      `/repos/${repo.fullName}/pulls/${targetPR}`,
      installationToken,
    );
    if (!prRes.ok) {
      console.error(`Failed to fetch PR #${targetPR}: ${prRes.status}`);
      process.exit(1);
    }
    const prData = (await prRes.json()) as any;
    prNumber = prData.number;
    prTitle = prData.title;
    prBody = prData.body || "";
    prAuthor = prData.user.login;
    headSha = prData.head.sha;
    baseBranch = prData.base.ref;
    headBranch = prData.head.ref;
  } else {
    // Find latest open PR, or latest closed PR if none open
    const openRes = await githubAppFetch(
      `/repos/${repo.fullName}/pulls?state=open&sort=updated&direction=desc&per_page=1`,
      installationToken,
    );
    let prs = (await openRes.json()) as any[];

    if (!prs || prs.length === 0) {
      logInfo("No open PRs found, checking closed PRs...");
      const closedRes = await githubAppFetch(
        `/repos/${repo.fullName}/pulls?state=closed&sort=updated&direction=desc&per_page=1`,
        installationToken,
      );
      prs = (await closedRes.json()) as any[];
    }

    if (!prs || prs.length === 0) {
      console.error("No PRs found on this repo. Create a PR first.");
      process.exit(1);
    }

    const pr = prs[0];
    prNumber = pr.number;
    prTitle = pr.title;
    prBody = pr.body || "";
    prAuthor = pr.user.login;
    headSha = pr.head.sha;
    baseBranch = pr.base.ref;
    headBranch = pr.head.ref;
  }

  logInfo(`PR #${prNumber}: "${prTitle}" by @${prAuthor}`);
  logInfo(`Branch: ${headBranch} → ${baseBranch}`);
  logInfo(`HEAD: ${headSha.slice(0, 7)}`);
  if (shouldPost) logInfo("Will POST review to GitHub after test");

  // ══════════════════════════════════════════════════════════
  //  TEST 1: Diff Fetching + Parsing
  // ══════════════════════════════════════════════════════════
  logSection("Test 1: Diff Fetching + Parsing");

  const diffRes = await githubAppFetch(
    `/repos/${repo.fullName}/pulls/${prNumber}`,
    installationToken,
    { headers: { Accept: "application/vnd.github.diff" } },
  );

  if (!diffRes.ok) {
    console.error(`Failed to fetch diff: ${diffRes.status}`);
    process.exit(1);
  }

  const rawDiff = await diffRes.text();
  log("Diff fetched", rawDiff.length > 0, `${rawDiff.length} bytes`);

  let parsedDiff = parseDiff(rawDiff);
  log(
    "Diff parsed",
    parsedDiff.files.length > 0,
    `${parsedDiff.totalFiles} files, +${parsedDiff.totalAdditions} -${parsedDiff.totalDeletions}`,
  );

  // Show parsed files
  for (const file of parsedDiff.files) {
    logInfo(
      `  ${file.status.padEnd(8)} ${file.path} (+${file.additions} -${file.deletions}, ${file.hunks.length} hunks)`,
    );
  }

  // Test truncation
  if (rawDiff.length > MAX_DIFF_SIZE) {
    parsedDiff = truncateDiff(parsedDiff, MAX_DIFF_SIZE);
    logInfo(`Diff truncated to ${parsedDiff.totalFiles} files (was too large)`);
  }

  // Test formatFileChanges
  if (parsedDiff.files.length > 0) {
    const formatted = formatFileChanges(parsedDiff.files[0]);
    log(
      "formatFileChanges works",
      formatted.length > 0,
      `${formatted.split("\n").length} lines for ${parsedDiff.files[0].path}`,
    );
  }

  // ══════════════════════════════════════════════════════════
  //  TEST 2: Context Building
  // ══════════════════════════════════════════════════════════
  logSection("Test 2: Context Building");

  const contextStart = Date.now();
  const context = await buildReviewContext(parsedDiff, {
    repoId: repo._id,
    repoFullName: repo.fullName,
    headSha,
    installationToken,
    //@ts-ignore
    embeddingOptions,
  });
  const contextMs = Date.now() - contextStart;

  log(
    "Changed files fetched",
    context.changedFiles.length > 0,
    `${context.changedFiles.length} files`,
  );
  for (const f of context.changedFiles.slice(0, 5)) {
    logInfo(`  ${f.path} (${f.content.length} chars)`);
  }
  if (context.changedFiles.length > 5) {
    logInfo(`  ... and ${context.changedFiles.length - 5} more`);
  }

  log(
    "Related files found",
    true,
    `${context.relatedFiles.length} via vector search`,
  );
  for (const f of context.relatedFiles.slice(0, 5)) {
    logInfo(`  ${f.path}${f.summary ? ` — ${f.summary.slice(0, 80)}...` : ""}`);
  }

  log("Conventions loaded", true, `${context.conventions.length} conventions`);
  log("Recent history loaded", true, `${context.recentHistory.length} entries`);
  logInfo(`Context built in ${contextMs}ms`);

  // ══════════════════════════════════════════════════════════
  //  TEST 3: Specialist Agents (Parallel)
  // ══════════════════════════════════════════════════════════
  logSection("Test 3: Specialist Agents (Parallel)");
  //@ts-ignore
  const agentInput: AgentInput = {
    diff: parsedDiff,
    rawDiff,
    changedFiles: context.changedFiles,
    relatedFiles: context.relatedFiles,
    conventions: context.conventions,
    recentHistory: context.recentHistory,
    pr: {
      title: prTitle,
      body: prBody,
      author: prAuthor,
      baseBranch,
      headBranch,
      prNumber,
    },
    repoFullName: repo.fullName,
    llmOptions,
  };

  const agentTypes: ReviewAgentType[] = [
    "security",
    "bugs",
    "performance",
    "readability",
    "best-practices",
    "documentation",
  ];

  logInfo(`Running ${agentTypes.length} agents in parallel...`);
  const parallelStart = Date.now();

  const agentResults = await Promise.allSettled(
    agentTypes.map(async (agentType) => {
      const start = Date.now();
      try {
        const runner = AGENT_RUNNERS[agentType];
        const output = await runner(agentInput);
        return output;
      } catch (err: any) {
        throw new Error(`${agentType}: ${err.message}`);
      }
    }),
  );

  const parallelMs = Date.now() - parallelStart;
  logInfo(`All agents completed in ${parallelMs}ms (parallel wall time)\n`);

  const successfulOutputs: AgentOutput[] = [];
  let totalFindings = 0;

  for (let i = 0; i < agentTypes.length; i++) {
    const agentType = agentTypes[i];
    const result = agentResults[i];

    if (result.status === "fulfilled") {
      const output = result.value;
      successfulOutputs.push(output);
      totalFindings += output.findings.length;

      const severityCounts: Record<string, number> = {};
      for (const f of output.findings) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
      }
      const severityStr = Object.entries(severityCounts)
        .map(([s, c]) => `${c} ${s}`)
        .join(", ");

      log(
        `${agentType}`,
        true,
        `${output.findings.length} findings (${severityStr || "clean"}) — ${output.durationMs}ms`,
      );
      logInfo(
        `  Summary: ${output.summary.slice(0, 120)}${output.summary.length > 120 ? "..." : ""}`,
      );

      // Show top findings
      const topFindings = output.findings
        .filter((f) => f.severity === "critical" || f.severity === "high")
        .slice(0, 3);
      for (const f of topFindings) {
        logInfo(
          `  [${f.severity.toUpperCase()}] ${f.file}:${f.line || "?"} — ${f.message.slice(0, 100)}`,
        );
      }
    } else {
      log(`${agentType}`, false, result.reason?.message || "Unknown error");
    }
  }

  console.log(`\n  --- Agent Summary ---`);
  logInfo(`${successfulOutputs.length}/${agentTypes.length} agents succeeded`);
  logInfo(`${totalFindings} total findings across all agents`);
  logInfo(`Parallel wall time: ${parallelMs}ms`);
  const totalAgentMs = successfulOutputs.reduce((s, o) => s + o.durationMs, 0);
  logInfo(
    `Total agent CPU time: ${totalAgentMs}ms (saved ${totalAgentMs - parallelMs}ms via parallelism)`,
  );

  // ══════════════════════════════════════════════════════════
  //  TEST 4: Synthesizer
  // ══════════════════════════════════════════════════════════
  logSection("Test 4: Synthesizer");

  if (successfulOutputs.length === 0) {
    console.error(
      "  [SKIP] No successful agent outputs — cannot run synthesizer",
    );
  } else {
    const synthStart = Date.now();
    const synthResult = await runSynthesizer({
      agentOutputs: successfulOutputs,
      pr: {
        title: prTitle,
        body: prBody,
        author: prAuthor,
        baseBranch,
        headBranch,
        prNumber,
      },
      repoFullName: repo.fullName,
      llmOptions,
      diffStats: {
        totalFiles: parsedDiff.totalFiles,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
      },
    });
    const synthMs = Date.now() - synthStart;

    log("Synthesizer completed", true, `${synthMs}ms`);
    log(
      "Verdict",
      ["approve", "request_changes", "comment"].includes(synthResult.verdict),
      `${synthResult.verdict} (confidence: ${synthResult.confidenceScore}%)`,
    );
    log(
      "Summary generated",
      synthResult.summary.length > 0,
      `${synthResult.summary.length} chars`,
    );

    console.log(`\n  --- Synthesizer Output ---`);
    logInfo(`Verdict: ${synthResult.verdict}`);
    logInfo(`Confidence: ${synthResult.confidenceScore}%`);
    logInfo(`Summary: ${synthResult.summary}`);

    logInfo(`Severity counts: ${JSON.stringify(synthResult.severityCounts)}`);

    if (synthResult.topActions.length > 0) {
      logInfo(`Top actions:`);
      synthResult.topActions.forEach((a, i) => logInfo(`  ${i + 1}. ${a}`));
    }

    log(
      "Inline comments",
      true,
      `${synthResult.inlineComments.length} comments (max 25)`,
    );
    for (const c of synthResult.inlineComments.slice(0, 5)) {
      logInfo(
        `  ${c.file}:${c.line} [${c.agentSource}] — ${c.body.slice(0, 80)}...`,
      );
    }
    if (synthResult.inlineComments.length > 5) {
      logInfo(`  ... and ${synthResult.inlineComments.length - 5} more`);
    }

    log(
      "Changelog entry",
      synthResult.changelog.entry.length > 0,
      `[${synthResult.changelog.type}] ${synthResult.changelog.entry}${synthResult.changelog.isBreaking ? " (BREAKING)" : ""}`,
    );

    // ══════════════════════════════════════════════════════════
    //  TEST 5: GitHub PR Review Posting (optional)
    // ══════════════════════════════════════════════════════════
    if (shouldPost) {
      logSection("Test 5: GitHub PR Review Posting");

      const clientUrl = process.env.CLIENT_URL || "https://nmithacks.vercel.app";
      const reviewId = "test-" + Date.now();

      // Build review body (same logic as review.job.ts)
      const verdictLabel =
        synthResult.verdict === "approve"
          ? "LGTM"
          : synthResult.verdict === "request_changes"
            ? "Changes Requested"
            : "Comments";

      const severityLine = [
        synthResult.severityCounts.critical > 0
          ? `${synthResult.severityCounts.critical} critical`
          : "",
        synthResult.severityCounts.high > 0
          ? `${synthResult.severityCounts.high} high`
          : "",
        synthResult.severityCounts.medium > 0
          ? `${synthResult.severityCounts.medium} medium`
          : "",
        synthResult.severityCounts.low > 0
          ? `${synthResult.severityCounts.low} low`
          : "",
      ]
        .filter(Boolean)
        .join(", ");

      let body = `## Looks Good To Meow — ${verdictLabel}\n\n`;
      body += `${synthResult.summary}\n\n`;
      if (severityLine) body += `**Findings:** ${severityLine}\n`;
      body += `**Confidence:** ${synthResult.confidenceScore}%\n\n`;

      if (synthResult.topActions.length > 0) {
        body += `### Top Actions\n`;
        synthResult.topActions.forEach((a, i) => {
          body += `${i + 1}. ${a}\n`;
        });
        body += "\n";
      }

      body += `---\n`;
      body += `*Reviewed by [LGTM](${clientUrl}/dashboard/reviews/${reviewId}) — AI-powered PR review (test run)*`;

      const eventMap: Record<string, string> = {
        approve: "APPROVE",
        request_changes: "REQUEST_CHANGES",
        comment: "COMMENT",
      };

      const comments = synthResult.inlineComments
        .filter((c) => c.line > 0)
        .map((c) => ({ path: c.file, line: c.line, body: c.body }));

      const reviewPayload: Record<string, any> = {
        commit_id: headSha,
        body,
        event: eventMap[synthResult.verdict] || "COMMENT",
      };
      if (comments.length > 0) reviewPayload.comments = comments;

      logInfo(
        `Posting review as ${reviewPayload.event} with ${comments.length} inline comments...`,
      );

      const postRes = await githubAppFetch(
        `/repos/${repo.fullName}/pulls/${prNumber}/reviews`,
        installationToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reviewPayload),
        },
      );

      if (postRes.ok) {
        const postData = (await postRes.json()) as {
          id: number;
          html_url?: string;
        };
        log("GitHub review posted", true, `ID: ${postData.id}`);
        if (postData.html_url) logInfo(`URL: ${postData.html_url}`);
      } else {
        const errBody = await postRes.json().catch(() => ({}));
        log("GitHub review posted", false, `${postRes.status}`);
        logInfo(`Error: ${JSON.stringify(errBody)}`);

        // Retry without inline comments
        if (comments.length > 0) {
          logInfo("Retrying without inline comments...");
          const retryPayload = {
            commit_id: headSha,
            body,
            event: eventMap[synthResult.verdict] || "COMMENT",
          };

          const retryRes = await githubAppFetch(
            `/repos/${repo.fullName}/pulls/${prNumber}/reviews`,
            installationToken,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(retryPayload),
            },
          );

          if (retryRes.ok) {
            const retryData = (await retryRes.json()) as { id: number };
            log(
              "GitHub review posted (no inline)",
              true,
              `ID: ${retryData.id}`,
            );
          } else {
            log("GitHub review retry failed", false, `${retryRes.status}`);
          }
        }
      }
    } else {
      logSection("Test 5: GitHub PR Review Posting");
      logInfo("Skipped — pass 'post' as 4th arg to post review to GitHub");
      logInfo(
        `Usage: npx ts-node src/scripts/test-review-agents.ts ${repo.fullName} ${prNumber} post`,
      );
    }

    // ── Final Summary ──
    logSection("Final Summary");

    const totalMs = Date.now() - contextStart;
    logInfo(`Repo: ${repo.fullName}`);
    logInfo(`PR #${prNumber}: "${prTitle}"`);
    logInfo(
      `Diff: ${parsedDiff.totalFiles} files, +${parsedDiff.totalAdditions} -${parsedDiff.totalDeletions}`,
    );
    logInfo(`Context build: ${contextMs}ms`);
    logInfo(
      `Agents: ${successfulOutputs.length}/${agentTypes.length} succeeded, ${totalFindings} findings, ${parallelMs}ms parallel`,
    );
    logInfo(
      `Synthesizer: ${synthResult.verdict} (${synthResult.confidenceScore}% confidence), ${synthMs}ms`,
    );
    logInfo(`Total pipeline time: ${totalMs}ms`);
  }

  // ── Cleanup ──
  console.log("\n--- Cleanup ---");
  await mongoose.disconnect();
  console.log("[DB] MongoDB disconnected");
  console.log("\n=== Review agent pipeline test complete ===\n");
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
