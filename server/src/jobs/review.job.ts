/**
 * BullMQ Worker: review
 *
 * Orchestrates the full PR review pipeline:
 * 1. Fetch PR diff from GitHub
 * 2. Parse diff + build context
 * 3. Run 6 specialist agents in parallel (with timeouts)
 * 4. Run synthesizer (7th agent)
 * 5. Post GitHub PR review with inline comments
 * 6. Save Review document to MongoDB
 */
import * as Sentry from "@sentry/node";
import { Worker, Job } from "bullmq";
import { PR } from "../models/PR";
import { Repo } from "../models/Repo";
import { Review } from "../models/Review";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { getInstallationToken, githubAppFetch } from "../utils/github";
import { decrypt } from "../utils/encryption";
import { resolveProvider, type CallLLMOptions } from "../services/ai.service";
import { getIO } from "../config/socket";
import { parseDiff, truncateDiff } from "../agents/review/diff-parser";
import { buildReviewContext } from "../agents/review/context-builder";
import { buildChatFooter } from "../services/chat.service";
import { runSecurityAgent } from "../agents/review/security";
import { runBugsAgent } from "../agents/review/bugs";
import { runPerformanceAgent } from "../agents/review/performance";
import { runReadabilityAgent } from "../agents/review/readability";
import { runBestPracticesAgent } from "../agents/review/best-practices";
import { runDocumentationAgent } from "../agents/review/documentation";
import { runCiSecurityAgent } from "../agents/review/ci-security";
import { runSynthesizer } from "../agents/review/synthesizer";
import type {
  AgentInput,
  AgentOutput,
  ReviewAgentType,
} from "../agents/review/types";
import {
  FOCUS_AREA_TO_AGENT,
  AGENT_TIMEOUT_MS,
  MAX_DIFF_SIZE,
} from "../agents/review/types";

export interface ReviewJobData {
  repoId: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  action: string;
  sender: string;
  senderAvatarUrl?: string;
  githubCreatedAt?: string;
}

// Agent registry — maps agent type to its runner function
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
  "ci-security": runCiSecurityAgent,
};

/**
 * Wrap an agent call with a timeout.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  agentType: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${agentType} agent timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function emitSafe(event: string, data: any, userId?: string) {
  try {
    const io = getIO();
    if (userId) {
      const room = `user:${userId}`;
      const sockets = io.sockets.adapter.rooms.get(room);
      const count = sockets ? sockets.size : 0;
      console.log(
        `[Socket] Emitting ${event} to room ${room} (${count} clients)`,
      );
      io.to(room).emit(event, data);
    } else {
      console.log(`[Socket] Broadcasting ${event}`);
      io.emit(event, data);
    }
  } catch (err: any) {
    console.error(`[Socket] emitSafe failed for ${event}:`, err.message);
  }
}

async function processReviewJob(job: Job<ReviewJobData>) {
  const {
    repoId,
    repoFullName,
    prNumber,
    prTitle,
    prBody,
    headSha,
    baseBranch,
    headBranch,
    sender,
    senderAvatarUrl,
    githubCreatedAt,
  } = job.data;

  console.log(
    `[ReviewJob] Starting review for ${repoFullName} PR #${prNumber} @ ${headSha.slice(0, 7)}`,
  );

  // Top-level safety net: if anything throws unexpectedly, reset PR status
  // so the user isn't permanently locked out of re-triggering.
  const resetPRStatus = async () => {
    try {
      await PR.updateOne(
        { repoId, prNumber, status: "reviewing" },
        { $set: { status: "pending" } },
      );
      console.log(
        `[ReviewJob] Reset PR #${prNumber} status to pending after failure`,
      );
    } catch (resetErr: any) {
      console.error(`[ReviewJob] Failed to reset PR status:`, resetErr.message);
    }
  };

  try {
    return await _processReviewJobInner(job);
  } catch (err) {
    await resetPRStatus();
    throw err; // Re-throw so BullMQ can handle retries
  }
}

async function _processReviewJobInner(job: Job<ReviewJobData>) {
  const {
    repoId,
    repoFullName,
    prNumber,
    prTitle,
    prBody,
    headSha,
    baseBranch,
    headBranch,
    sender,
    senderAvatarUrl,
    githubCreatedAt,
  } = job.data;

  // 1. Load repo + user + resolve providers
  const repo = await Repo.findById(repoId);
  if (!repo || !repo.isActive) {
    console.log(`[ReviewJob] Repo ${repoId} not found or inactive`);
    await PR.updateOne({ repoId, prNumber }, { $set: { status: "reviewed" } });
    return;
  }

  const user = await User.findById(repo.connectedBy);
  if (!user || !user.githubInstallationId) {
    console.log(`[ReviewJob] User not found or no installation ID`);
    await PR.updateOne(
      { repoId: repo._id, prNumber },
      { $set: { status: "reviewed" } },
    );
    return;
  }

  // Note: billing was already checked atomically via reserveReview() in the
  // controller/webhook that enqueued this job. No duplicate check here —
  // that would consume a billing slot without running the review.

  const installationToken = await getInstallationToken(
    user.githubInstallationId,
  );

  const decryptedProviders = user.aiConfig.providers.map((p) => ({
    provider: p.provider,
    apiKey: decrypt(p.apiKey),
  }));

  let llmOptions: CallLLMOptions;

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
  } catch (err: any) {
    console.error(`[ReviewJob] LLM provider error: ${err.message}`);
    await PR.updateOne(
      { repoId: repo._id, prNumber },
      { $set: { status: "reviewed" } },
    );
    return;
  }

  // 2. Create/update PR record
  const pr = await PR.findOneAndUpdate(
    { repoId: repo._id, prNumber },
    {
      repoId: repo._id,
      prNumber,
      title: prTitle,
      body: prBody || "",
      author: { login: sender, avatarUrl: senderAvatarUrl || "" },
      headSha,
      baseBranch,
      headBranch,
      diffUrl: `https://github.com/${repoFullName}/pull/${prNumber}.diff`,
      status: "reviewing",
      githubPRId: prNumber,
      ...(githubCreatedAt
        ? { githubCreatedAt: new Date(githubCreatedAt) }
        : {}),
    },
    { upsert: true, new: true },
  );

  // 3. Fetch the raw diff from GitHub
  const diffRes = await githubAppFetch(
    `/repos/${repoFullName}/pulls/${prNumber}`,
    installationToken,
    { headers: { Accept: "application/vnd.github.diff" } },
  );

  if (!diffRes.ok) {
    console.error(`[ReviewJob] Failed to fetch diff: ${diffRes.status}`);
    pr.status = "reviewed";
    await pr.save();
    return;
  }

  const rawDiff = await diffRes.text();
  let parsedDiff = parseDiff(rawDiff);

  // Truncate if too large
  if (rawDiff.length > MAX_DIFF_SIZE) {
    console.log(
      `[ReviewJob] Diff too large (${rawDiff.length} bytes), truncating`,
    );
    parsedDiff = truncateDiff(parsedDiff, MAX_DIFF_SIZE);
  }

  console.log(
    `[ReviewJob] Diff parsed: ${parsedDiff.totalFiles} files, +${parsedDiff.totalAdditions} -${parsedDiff.totalDeletions}`,
  );

  // 4. Build context (fetch changed files, find related via repo map)
  const context = await buildReviewContext(parsedDiff, {
    repoId: repo._id,
    repoFullName,
    headSha,
    installationToken,
  });

  // 5. Assemble AgentInput
  const agentInput: AgentInput = {
    diff: parsedDiff,
    rawDiff,
    changedFiles: context.changedFiles,
    relatedFiles: context.relatedFiles,
    conventions: context.conventions,
    recentHistory: context.recentHistory,
    repoMap: context.personalizedRepoMap,
    pr: {
      title: prTitle,
      body: prBody || "",
      author: sender,
      baseBranch,
      headBranch,
      prNumber,
    },
    repoFullName,
    llmOptions,
  };

  // 6. Determine which agents to run based on focus areas
  const focusAreas = repo.settings.focusAreas || [];
  const agentsToRun: ReviewAgentType[] = [];

  for (const area of focusAreas) {
    const agentType = FOCUS_AREA_TO_AGENT[area];
    if (agentType && AGENT_RUNNERS[agentType]) {
      agentsToRun.push(agentType);
    }
  }

  // If no focus areas configured, run all agents
  if (agentsToRun.length === 0) {
    agentsToRun.push(
      "security",
      "bugs",
      "performance",
      "readability",
      "best-practices",
      "documentation",
    );
  }

  // ci-security is special: it's cheap (deterministic, no LLM) and short-
  // circuits when no CI files changed, so we always run it regardless of
  // focusAreas. This is what makes "we catch CI vulns in PRs" reliable —
  // a repo with focusAreas: ["bugs"] should still get CI vulns flagged.
  if (!agentsToRun.includes("ci-security")) {
    agentsToRun.push("ci-security");
  }

  // Create Review document
  const review = new Review({
    prId: pr._id,
    repoId: repo._id,
    agentReports: agentsToRun.map((type) => ({
      agentType: type,
      status: "pending",
    })),
  });
  await review.save();

  const socketUserId = user._id.toString();

  emitSafe(
    "review:started",
    {
      reviewId: review._id,
      repoFullName,
      prNumber,
      agents: agentsToRun,
    },
    socketUserId,
  );

  await job.updateProgress(10);

  // 7. Run specialist agents in parallel with staggered starts
  // Stagger by 150ms to avoid slamming the LLM API with simultaneous requests
  console.log(
    `[ReviewJob] Running ${agentsToRun.length} agents: ${agentsToRun.join(", ")}`,
  );

  const agentResults = await Promise.allSettled(
    agentsToRun.map(async (agentType, index) => {
      // Stagger agent launches to reduce LLM rate-limit pressure
      if (index > 0) {
        await new Promise((r) => setTimeout(r, index * 150));
      }

      // Mark as running — use atomic update to avoid Mongoose VersionError
      try {
        await Review.updateOne(
          { _id: review._id, "agentReports.agentType": agentType },
          { $set: { "agentReports.$.status": "running" } },
        );
      } catch (e) {
        // Non-critical, continue with the agent
      }

      emitSafe(
        "agent:started",
        {
          reviewId: review._id,
          agentType,
          repoFullName,
          prNumber,
        },
        socketUserId,
      );

      try {
        const runner = AGENT_RUNNERS[agentType];
        const output = await withTimeout(
          runner(agentInput),
          AGENT_TIMEOUT_MS,
          agentType,
        );

        // Save result — use atomic update to avoid concurrent save conflicts
        await Review.updateOne(
          { _id: review._id, "agentReports.agentType": agentType },
          {
            $set: {
              "agentReports.$.status": "completed",
              "agentReports.$.findings": output.findings.map((f) => ({
                file: f.file,
                line: f.line || 0,
                severity: f.severity,
                message: f.message,
                suggestion: f.suggestion || "",
              })),
              "agentReports.$.rawOutput": JSON.stringify(output),
              "agentReports.$.durationMs": output.durationMs,
            },
          },
        );

        emitSafe(
          "agent:completed",
          {
            reviewId: review._id,
            agentType,
            findingsCount: output.findings.length,
            durationMs: output.durationMs,
          },
          socketUserId,
        );

        console.log(
          `[ReviewJob] ${agentType}: ${output.findings.length} findings (${output.durationMs}ms)`,
        );
        if (output.findings.length === 0) {
          console.warn(
            `[ReviewJob] ${agentType} returned 0 findings — check agent logs above for details`,
          );
        }

        return output;
      } catch (err: any) {
        console.error(`[ReviewJob] ${agentType} failed:`, err.message);
        console.error(
          `[ReviewJob] ${agentType} stack:`,
          err.stack?.slice(0, 500),
        );

        try {
          await Review.updateOne(
            { _id: review._id, "agentReports.agentType": agentType },
            {
              $set: {
                "agentReports.$.status": "failed",
                "agentReports.$.rawOutput": err.message,
              },
            },
          );
        } catch (saveErr) {
          // Non-critical
        }

        emitSafe(
          "agent:failed",
          {
            reviewId: review._id,
            agentType,
            error: err.message,
          },
          socketUserId,
        );

        throw err;
      }
    }),
  );

  await job.updateProgress(70);

  // 8. Collect successful agent outputs
  const successfulOutputs: AgentOutput[] = [];
  for (const result of agentResults) {
    if (result.status === "fulfilled") {
      successfulOutputs.push(result.value);
    }
  }

  console.log(
    `[ReviewJob] ${successfulOutputs.length}/${agentsToRun.length} agents completed successfully`,
  );

  // If most agents failed, mark the review as failed and don't run synthesizer
  const failedCount = agentResults.filter(
    (r) => r.status === "rejected",
  ).length;
  if (failedCount > agentsToRun.length / 2) {
    console.error(
      `[ReviewJob] ${failedCount}/${agentsToRun.length} agents failed — skipping synthesizer`,
    );

    pr.status = "reviewed";
    await pr.save();

    await Review.updateOne(
      { _id: review._id },
      {
        $set: {
          overallVerdict: "comment",
          finalSummary: `Review incomplete: ${failedCount} of ${agentsToRun.length} agents failed (likely due to token limits). Try re-running the review or use a model with higher rate limits.`,
          confidenceScore: 0,
        },
      },
    );

    emitSafe(
      "review:completed",
      {
        reviewId: review._id,
        repoFullName,
        prNumber,
        verdict: "comment",
        confidenceScore: 0,
        findingsCount: successfulOutputs.reduce(
          (s, o) => s + o.findings.length,
          0,
        ),
      },
      socketUserId,
    );

    // Create notification about partial failure
    try {
      await Notification.create({
        userId: user._id,
        type: "review_complete",
        message: `PR #${prNumber} on ${repoFullName}: Review incomplete — ${failedCount} agents failed due to rate limits`,
        reviewId: review._id,
        prId: pr._id,
        prNumber,
        repoFullName,
      });
      emitSafe(
        "notification:new",
        { userId: user._id.toString() },
        socketUserId,
      );
    } catch (err: any) {
      console.error("[ReviewJob] Notification error:", err.message);
    }

    return;
  }

  // 9. Run synthesizer
  console.log(`[ReviewJob] Running synthesizer...`);

  emitSafe(
    "synthesizer:started",
    {
      reviewId: review._id,
      repoFullName,
      prNumber,
    },
    socketUserId,
  );

  const synthResult = await runSynthesizer({
    agentOutputs: successfulOutputs,
    pr: {
      title: prTitle,
      body: prBody || "",
      author: sender,
      baseBranch,
      headBranch,
      prNumber,
    },
    repoFullName,
    llmOptions,
    diffStats: {
      totalFiles: parsedDiff.totalFiles,
      totalAdditions: parsedDiff.totalAdditions,
      totalDeletions: parsedDiff.totalDeletions,
    },
  });

  console.log(
    `[ReviewJob] Synthesizer: verdict=${synthResult.verdict}, confidence=${synthResult.confidenceScore}`,
  );

  await job.updateProgress(85);

  // 10. Update Review document with synthesizer results
  // Trust the synthesizer/LLM verdict directly — don't remap "comment" to "approve"
  // "comment" means there are findings worth discussing but not blocking
  let finalVerdict = synthResult.verdict;
  if (finalVerdict === "comment") {
    // Only escalate to request_changes if there are critical/high blockers
    const hasBlockers =
      synthResult.severityCounts.critical > 0 ||
      synthResult.severityCounts.high > 0;
    if (hasBlockers) {
      finalVerdict = "request_changes";
    }
    // Otherwise keep "comment" as-is — do NOT auto-promote to "approve"
  }

  await Review.updateOne(
    { _id: review._id },
    {
      $set: {
        overallVerdict: finalVerdict,
        finalSummary: synthResult.summary,
        confidenceScore: synthResult.confidenceScore,
      },
      $push: {
        agentReports: {
          agentType: "reviewer" as any,
          status: "completed",
          findings: [],
          rawOutput: JSON.stringify(synthResult),
          durationMs: synthResult.durationMs,
        },
      },
    },
  );

  // 11. Mark PR as reviewed — do this before GitHub post so status is correct
  // even if the GitHub API call fails
  pr.status = "reviewed";
  await pr.save();

  // 12. Post GitHub PR review
  try {
    const githubCommentId = await postGitHubReview(
      repoFullName,
      prNumber,
      headSha,
      installationToken,
      synthResult,
      review._id.toString(),
      finalVerdict,
      repo.settings.prChat ? repo.settings.allowedCommands : [],
    );

    review.githubCommentId = githubCommentId;
    await Review.updateOne({ _id: review._id }, { $set: { githubCommentId } });
    console.log(`[ReviewJob] GitHub review posted: ${githubCommentId}`);
  } catch (err: any) {
    console.error(`[ReviewJob] Failed to post GitHub review:`, err.message);
  }

  // 12b + 12c + 12d + 12e. LGTM Security side-effects from the ci-security agent.
  //
  // Four independent best-effort steps that all consume the agent's findings:
  //   (b) Post a GitHub Check Run so branch protection blocks the merge.
  //   (c) Persist findings to the immutable LGTM Security audit log.
  //   (d) Cache a pipeline halt decision so the runtime Action can halt CI.
  //   (e) Record a SecurityScan row + update monitor.lastScanAt + emit
  //       Socket events so the Security tab shows live progress + a fresh
  //       "Last scan" timestamp. (Without this, PR reviews are invisible to
  //       the Security UI — last-scan stays stale, recent-scans table never
  //       shows PR activity.)
  //
  // CRITICAL: keep these in SEPARATE try/catch blocks. An earlier bug had
  // (c) nested inside (b)'s try, which silently dropped every PR-source
  // audit log entry on any GitHub Check Run failure.
  const ciAgent = successfulOutputs.find((o) => o.agentType === "ci-security");
  if (ciAgent) {
    const blockingFindings = ciAgent.findings.filter(
      (f) => f.policyAction === "block",
    );
    const warnFindings = ciAgent.findings.filter(
      (f) => f.policyAction === "warn",
    );

    console.log(
      `[ReviewJob] ci-security: ${blockingFindings.length} block, ${warnFindings.length} warn — posting Check Run + audit log + halt decision + scan row`,
    );

    // (e1) Look up SecurityMonitor + create SecurityScan row + emit
    // scan-started so the Security tab can show live progress. We do this
    // FIRST so the spinner appears even if the rest fails.
    let scanCtx: {
      monitorId: import("mongoose").Types.ObjectId;
      scanId: import("mongoose").Types.ObjectId;
    } | null = null;
    try {
      scanCtx = await openPrReviewScan({
        repoId: repo._id,
        headSha,
        userId: user._id.toString(),
        emit: emitSafe,
      });
    } catch (err: any) {
      console.error(
        `[ReviewJob] Failed to open SecurityScan row:`,
        err.message,
      );
    }

    // (b) Check Run — depends on GitHub
    try {
      await postCiSecurityCheckRun(
        repoFullName,
        headSha,
        installationToken,
        blockingFindings,
        warnFindings,
      );
      console.log(`[ReviewJob] LGTM Security check run posted`);
    } catch (err: any) {
      console.error(
        `[ReviewJob] Failed to post LGTM Security check run:`,
        err.message,
      );
    }

    // (c) Audit log — depends only on Mongo. Independent of (b).
    try {
      await persistCiFindingsToAuditLog({
        repoId: repo._id,
        reviewId: review._id,
        prNumber,
        headSha,
        findings: ciAgent.findings,
        scanId: scanCtx?.scanId,
      });
    } catch (err: any) {
      console.error(
        `[ReviewJob] Failed to persist ci-security findings to audit log:`,
        err.message,
      );
    }

    // (d) Pipeline halt decision — depends only on Redis. Independent of (b)
    // and (c). This is what makes the runtime LGTM Action actually halt on
    // PR commits.
    try {
      await persistCiHaltDecision({
        repoId: repo._id.toString(),
        headSha,
        findings: ciAgent.findings,
      });
    } catch (err: any) {
      console.error(
        `[ReviewJob] Failed to cache ci-security halt decision:`,
        err.message,
      );
    }

    // (e2) Close the SecurityScan: write counts, refresh monitor.lastScanAt,
    // emit scan-complete so the dashboard re-fetches.
    if (scanCtx) {
      try {
        await closePrReviewScan({
          monitorId: scanCtx.monitorId,
          scanId: scanCtx.scanId,
          headSha,
          findings: ciAgent.findings,
          userId: user._id.toString(),
          emit: emitSafe,
        });
      } catch (err: any) {
        console.error(
          `[ReviewJob] Failed to close SecurityScan row:`,
          err.message,
        );
      }
    }
  }

  await job.updateProgress(100);

  emitSafe(
    "review:completed",
    {
      reviewId: review._id,
      repoFullName,
      prNumber,
      verdict: finalVerdict,
      confidenceScore: synthResult.confidenceScore,
      findingsCount: successfulOutputs.reduce(
        (s, o) => s + o.findings.length,
        0,
      ),
    },
    socketUserId,
  );

  console.log(
    `[ReviewJob] Completed review for ${repoFullName} PR #${prNumber}`,
  );

  // 13. Create notification
  try {
    const hasCritical = successfulOutputs.some((o) =>
      o.findings.some((f) => f.severity === "critical"),
    );
    const notifType = hasCritical
      ? "critical_security"
      : finalVerdict === "approve"
        ? "ai_approved"
        : "review_complete";
    const verdictLabel =
      finalVerdict === "approve"
        ? "Approved"
        : finalVerdict === "request_changes"
          ? "Changes Requested"
          : "Commented";

    await Notification.create({
      userId: user._id,
      type: notifType,
      message: `PR #${prNumber} on ${repoFullName}: ${verdictLabel} (${synthResult.confidenceScore}% confidence)`,
      reviewId: review._id,
      prId: pr._id,
      prNumber,
      repoFullName,
    });

    emitSafe("notification:new", { userId: user._id.toString() }, socketUserId);
  } catch (err: any) {
    console.error("[ReviewJob] Notification error:", err.message);
  }
}

/**
 * Post a review on the GitHub PR using the GitHub API.
 * Uses the createReview endpoint to submit APPROVE, REQUEST_CHANGES, or COMMENT
 * with inline comments on specific files+lines.
 */
async function postGitHubReview(
  repoFullName: string,
  prNumber: number,
  headSha: string,
  installationToken: string,
  synth: import("../agents/review/types").SynthesizerOutput,
  reviewId: string,
  finalVerdict: string,
  chatAllowedCommands: string[] = [],
): Promise<number> {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  // ── Build the review body — written like a senior maintainer, not a robot ──

  const totalFindings =
    synth.severityCounts.critical +
    synth.severityCounts.high +
    synth.severityCounts.medium +
    synth.severityCounts.low +
    synth.severityCounts.info;

  const hasBlockers =
    synth.severityCounts.critical > 0 || synth.severityCounts.high > 0;

  // Verdict header — conversational
  let body = "";
  if (finalVerdict === "approve") {
    body += `## Looks Good To Meow :cat:\n\n`;
    body += `Hey @${synth.inlineComments.length > 0 ? "" : ""}! Nice work on this one. `;
    body += `${synth.summary}\n\n`;
    if (totalFindings > 0) {
      body += `I left a few minor suggestions below — nothing blocking, just things to consider.\n\n`;
    }
    body += `> **Note:** This is an AI-generated approval. A maintainer will follow up with the final human review shortly.\n\n`;
  } else if (finalVerdict === "request_changes") {
    body += `## Changes Requested :cat2:\n\n`;
    body += `${synth.summary}\n\n`;
    body += `There are a few things I'd like to see addressed before we merge this:\n\n`;
  } else {
    body += `## Review Notes :cat2:\n\n`;
    body += `${synth.summary}\n\n`;
  }

  // Top actions — framed as asks from a reviewer
  if (synth.topActions.length > 0 && hasBlockers) {
    body += `### Before merging\n`;
    synth.topActions.forEach((a, i) => {
      body += `${i + 1}. ${a}\n`;
    });
    body += "\n";
  } else if (synth.topActions.length > 0) {
    body += `### Nice-to-haves\n`;
    synth.topActions.forEach((a, i) => {
      body += `${i + 1}. ${a}\n`;
    });
    body += "\n";
  }

  // Findings summary — compact severity breakdown
  const severityParts = [
    synth.severityCounts.critical > 0
      ? `**${synth.severityCounts.critical} critical**`
      : "",
    synth.severityCounts.high > 0
      ? `**${synth.severityCounts.high} high**`
      : "",
    synth.severityCounts.medium > 0
      ? `${synth.severityCounts.medium} medium`
      : "",
    synth.severityCounts.low > 0 ? `${synth.severityCounts.low} low` : "",
    synth.severityCounts.info > 0 ? `${synth.severityCounts.info} info` : "",
  ].filter(Boolean);

  if (severityParts.length > 0) {
    body += `<details>\n<summary>Findings breakdown (${totalFindings} total)</summary>\n\n`;
    body += severityParts.join(" / ") + "\n\n";
    body += `Confidence: ${synth.confidenceScore}%\n`;
    body += `</details>\n\n`;
  }

  // Prominent public review link
  body += `---\n\n`;
  body += `> :link: **[View Full Review Report](${clientUrl}/review/${reviewId})** — detailed findings, severity breakdown, and agent analysis\n\n`;
  body += `<sub>Reviewed by **Looks Good To Meow** — AI-powered code review</sub>`;

  // Append chat footer if PR Chat is enabled
  if (chatAllowedCommands.length > 0) {
    body += buildChatFooter(chatAllowedCommands);
  }

  // Map verdict to GitHub review event
  const eventMap: Record<string, string> = {
    approve: "APPROVE",
    request_changes: "REQUEST_CHANGES",
    comment: "COMMENT",
  };

  // Build inline comments (GitHub format)
  const comments = synth.inlineComments
    .filter((c) => c.line > 0)
    .map((c) => ({
      path: c.file,
      line: c.line,
      body: c.body,
    }));

  const reviewPayload: Record<string, any> = {
    commit_id: headSha,
    body,
    event: eventMap[finalVerdict] || "COMMENT",
  };

  // Only include comments if there are valid ones
  if (comments.length > 0) {
    reviewPayload.comments = comments;
  }

  const res = await githubAppFetch(
    `/repos/${repoFullName}/pulls/${prNumber}/reviews`,
    installationToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewPayload),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("[ReviewJob] GitHub review API error:", errBody);

    // If inline comments fail (e.g. line not in diff), retry without comments
    if (comments.length > 0) {
      console.log("[ReviewJob] Retrying without inline comments...");
      const retryPayload = {
        commit_id: headSha,
        body,
        event: eventMap[finalVerdict] || "COMMENT",
      };

      const retryRes = await githubAppFetch(
        `/repos/${repoFullName}/pulls/${prNumber}/reviews`,
        installationToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retryPayload),
        },
      );

      if (!retryRes.ok) {
        const retryErr = await retryRes.json().catch(() => ({}));
        throw new Error(
          `GitHub review API failed: ${JSON.stringify(retryErr)}`,
        );
      }

      const retryData = (await retryRes.json()) as { id: number };
      return retryData.id;
    }

    throw new Error(`GitHub review API failed: ${JSON.stringify(errBody)}`);
  }

  const data = (await res.json()) as { id: number };
  return data.id;
}

// ── Worker initialization ──

import { getRedisConnection } from "./queue";

export function startReviewWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    console.warn("[ReviewJob] No REDIS_URL — worker not started");
    return null;
  }

  const worker = new Worker<ReviewJobData>("review", processReviewJob, {
    connection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // Max 10 review jobs per minute
    },
    stalledInterval: 60000,
    maxStalledCount: 2,
  });

  worker.on("completed", (job) => {
    console.log(
      `[ReviewJob] Job ${job.id} completed for PR #${job.data.prNumber}`,
    );
  });

  // Fires after ALL retries are exhausted — reset PR status so user can retry
  worker.on("failed", async (job, err) => {
    console.error(
      `[ReviewJob] Job ${job?.id} failed for PR #${job?.data.prNumber}:`,
      err.message,
    );
    Sentry.captureException(err, {
      tags: {
        job: "review",
        prNumber: job?.data.prNumber,
        repo: job?.data.repoFullName,
      },
    });
    if (job?.data) {
      try {
        await PR.updateOne(
          {
            repoId: job.data.repoId,
            prNumber: job.data.prNumber,
            status: "reviewing",
          },
          { $set: { status: "pending" } },
        );
        console.log(
          `[ReviewJob] Reset PR #${job.data.prNumber} status to pending`,
        );
      } catch (resetErr: any) {
        console.error(
          `[ReviewJob] Failed to reset PR status:`,
          resetErr.message,
        );
      }
    }
  });

  worker.on("stalled", async (jobId) => {
    console.warn(
      `[ReviewJob] Job ${jobId} stalled — will be retried by BullMQ`,
    );
  });

  worker.on("error", (err) => {
    console.error(`[ReviewJob] Worker error:`, err.message);
  });

  worker.on("active", (job) => {
    console.log(
      `[ReviewJob] Job ${job.id} is now active for PR #${job.data.prNumber}`,
    );
  });

  worker.on("ready", () => {
    console.log(`[ReviewJob] Worker is ready and waiting for jobs`);
  });

  console.log("[ReviewJob] Worker started");
  return worker;
}

/**
 * Post a GitHub Check Run summarizing LGTM Security findings.
 *
 * Why a separate Check Run instead of leaning on the PR review's verdict?
 *
 * - Branch protection rules in GitHub gate on Check Runs, not on PR review
 *   approvals from a bot. A failing check is what actually stops the merge.
 * - It's a separate surface in the PR UI ("Checks" tab) so security teams
 *   can audit it independently of the human-readable PR review comments.
 * - It can be re-run on demand from the GitHub UI if a finding is
 *   false-positive — the customer marks the check as neutral and it
 *   doesn't block.
 *
 * Conclusion mapping:
 *   - Any block-action finding → conclusion: "failure"  (merge blocked)
 *   - Only warn-action findings → conclusion: "neutral" (visible, not blocking)
 *   - No findings              → conclusion: "success"
 */
async function postCiSecurityCheckRun(
  repoFullName: string,
  headSha: string,
  installationToken: string,
  blockingFindings: import("../agents/review/types").AgentFinding[],
  warnFindings: import("../agents/review/types").AgentFinding[],
): Promise<void> {
  const total = blockingFindings.length + warnFindings.length;

  const conclusion: "success" | "neutral" | "failure" =
    blockingFindings.length > 0
      ? "failure"
      : warnFindings.length > 0
        ? "neutral"
        : "success";

  const title =
    conclusion === "success"
      ? "LGTM Security · clean"
      : conclusion === "neutral"
        ? `LGTM Security · ${warnFindings.length} warning${warnFindings.length === 1 ? "" : "s"}`
        : `LGTM Security · ${blockingFindings.length} blocking issue${blockingFindings.length === 1 ? "" : "s"}`;

  // Build the markdown summary. Group by ruleId so duplicates collapse.
  const lines: string[] = [];
  if (conclusion === "success") {
    lines.push("No CI/CD security issues detected. :white_check_mark:");
  } else {
    if (blockingFindings.length > 0) {
      lines.push(
        `### :no_entry: Blocking — must be resolved before merge`,
        "",
      );
      for (const f of blockingFindings) {
        lines.push(
          `- **${f.ruleId ?? f.category}** · \`${f.file}${f.line ? `:${f.line}` : ""}\` — ${f.message}`,
        );
        if (f.suggestion) lines.push(`  - **Fix:** ${f.suggestion}`);
      }
      lines.push("");
    }
    if (warnFindings.length > 0) {
      lines.push(`### :warning: Warnings`, "");
      for (const f of warnFindings) {
        lines.push(
          `- **${f.ruleId ?? f.category}** · \`${f.file}${f.line ? `:${f.line}` : ""}\` — ${f.message}`,
        );
      }
      lines.push("");
    }
    lines.push(
      "_LGTM Security scans every PR that touches CI/CD configuration. Manage rules at https://looksgoodtomeow.in/security_",
    );
  }

  const body = {
    name: "LGTM Security",
    head_sha: headSha,
    status: "completed" as const,
    conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title,
      summary: lines.join("\n"),
    },
  };

  const res = await githubAppFetch(
    `/repos/${repoFullName}/check-runs`,
    installationToken,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`GitHub Check Run create failed: ${res.status} ${errText.slice(0, 300)}`);
  }

  console.log(
    `[ReviewJob] Check Run created (conclusion=${conclusion}, total findings=${total})`,
  );
}

/**
 * Persist ci-security agent findings to the LGTM Security audit log when
 * the repo is enrolled. Skipped silently for non-enrolled repos so the
 * review path stays cheap for users who haven't opted into Security.
 *
 * Each finding becomes one immutable audit entry. Re-running a review on
 * the same PR + headSha will produce duplicates by design — every detection
 * event is its own row, and the resolution side (audit-list query filters
 * by `resolvedAt: {$exists: false}`) handles dedup at read time.
 */
async function persistCiFindingsToAuditLog(args: {
  repoId: import("mongoose").Types.ObjectId;
  reviewId: import("mongoose").Types.ObjectId;
  prNumber: number;
  headSha: string;
  findings: import("../agents/review/types").AgentFinding[];
  /** SecurityScan row id, if openPrReviewScan succeeded. Lets the audit log link back. */
  scanId?: import("mongoose").Types.ObjectId;
}): Promise<void> {
  // Lazy-load these models so the cross-wire is a soft dependency. If
  // Security isn't installed yet the rest of the review flow is unaffected.
  const { SecurityMonitor } = await import("../models/SecurityMonitor");
  const { SecurityAuditLog } = await import("../models/SecurityAuditLog");

  const monitor = await SecurityMonitor.findOne({ repoId: args.repoId });
  if (!monitor) return; // not enrolled — no-op

  if (args.findings.length === 0) return;

  const docs = args.findings.map((f) => ({
    monitorId: monitor._id,
    repoId: args.repoId,
    source: "pr-review" as const,
    reviewId: args.reviewId,
    scanId: args.scanId,
    prNumber: args.prNumber,
    ruleId: f.ruleId ?? f.category,
    category: f.category,
    severity: f.severity,
    policyAction: (f.policyAction ?? "warn") as "block" | "warn" | "info",
    message: f.message,
    suggestion: f.suggestion ?? "",
    file: f.file,
    line: f.line,
    codeSnippet: f.codeSnippet,
    headSha: args.headSha,
    detectedBy: detectorFor(f.ruleId ?? f.category),
    detectedAt: new Date(),
  }));

  await SecurityAuditLog.insertMany(docs, { ordered: false });
  console.log(
    `[ReviewJob] Persisted ${docs.length} ci-security finding(s) to audit log (monitor ${monitor._id})`,
  );
}

/** Map ruleId → which detector found it. Used for audit log analytics. */
function detectorFor(ruleId: string): "regex" | "yaml-ast" | "dockerfile" | "lockfile" | "llm" {
  if (ruleId.startsWith("workflow.")) return "yaml-ast";
  if (ruleId.startsWith("dockerfile.")) return "dockerfile";
  if (ruleId.startsWith("deps.")) return "lockfile";
  if (ruleId.startsWith("network.")) return "regex";
  return "regex"; // secrets.hardcoded + anything new defaults to regex
}

/**
 * Cache a pipeline halt decision in Redis from the PR review path.
 *
 * Mirrors the cache the monitor worker writes (security.job.ts) so the
 * runtime LGTM Action sees the same answer regardless of which side of the
 * pipeline computed it. Same key shape (`pipeline:decision:{repoId}:{sha}`),
 * same TTL (24h), same body shape.
 *
 * Critical: this is what makes the runtime halt fire on PR head SHAs. Before
 * this, the Action would soft-pass on every PR commit because no decision
 * had been computed for those SHAs (the monitor only scans the default
 * branch).
 */
async function persistCiHaltDecision(args: {
  repoId: string;
  headSha: string;
  findings: import("../agents/review/types").AgentFinding[];
}): Promise<void> {
  const { redis } = await import("../config/redis");
  if (!redis) return;

  const blocks = args.findings.filter((f) => f.policyAction === "block");
  const halt = blocks.length > 0;
  const reasons = blocks
    .slice(0, 10)
    .map((f) => `[${f.ruleId ?? f.category}] ${f.message}`);

  const key = `pipeline:decision:${args.repoId}:${args.headSha}`;
  const body = JSON.stringify({
    halt,
    reasons,
    computedAt: new Date().toISOString(),
  });

  // Same TTL as the monitor side (24h).
  await redis.set(key, body, "EX", 60 * 60 * 24);
  console.log(
    `[ReviewJob] Cached pipeline decision for ${args.headSha.slice(0, 7)}: halt=${halt} (${reasons.length} reason${reasons.length === 1 ? "" : "s"})`,
  );
}

/**
 * Open a SecurityScan row at the start of the PR-review ci-security work,
 * and emit `security:scan-started` so the dashboard's running-scan banner
 * lights up.
 *
 * Returns null when the repo isn't enrolled in LGTM Security — caller
 * skips the scan-row lifecycle entirely.
 */
async function openPrReviewScan(args: {
  repoId: import("mongoose").Types.ObjectId;
  headSha: string;
  userId: string;
  emit: (event: string, data: unknown, userId?: string) => void;
}): Promise<{
  monitorId: import("mongoose").Types.ObjectId;
  scanId: import("mongoose").Types.ObjectId;
} | null> {
  const { SecurityMonitor } = await import("../models/SecurityMonitor");
  const { SecurityScan } = await import("../models/SecurityScan");

  const monitor = await SecurityMonitor.findOne({ repoId: args.repoId }).select(
    "_id repoId",
  );
  if (!monitor) return null;

  const scan = await SecurityScan.create({
    monitorId: monitor._id,
    repoId: monitor.repoId,
    trigger: "pr-review",
    headSha: args.headSha,
    state: "running",
    startedAt: new Date(),
  });

  // Emit using the SAME event names the monitor worker emits, so the
  // dashboard's existing socket listeners work without any UI changes.
  args.emit(
    "security:scan-started",
    {
      scanId: scan._id,
      repoId: monitor.repoId,
      trigger: "pr-review",
      headSha: args.headSha,
    },
    args.userId,
  );

  return { monitorId: monitor._id, scanId: scan._id };
}

/**
 * Close out the SecurityScan row + refresh the monitor's lastScanAt so the
 * dashboard's "Last scan" timestamp finally moves. Emits scan-complete.
 */
async function closePrReviewScan(args: {
  monitorId: import("mongoose").Types.ObjectId;
  scanId: import("mongoose").Types.ObjectId;
  headSha: string;
  findings: import("../agents/review/types").AgentFinding[];
  userId: string;
  emit: (event: string, data: unknown, userId?: string) => void;
}): Promise<void> {
  const { SecurityMonitor } = await import("../models/SecurityMonitor");
  const { SecurityScan } = await import("../models/SecurityScan");

  const blocks = args.findings.filter((f) => f.policyAction === "block");
  const warns = args.findings.filter((f) => f.policyAction === "warn");
  const infos = args.findings.filter(
    (f) => (f.policyAction ?? "warn") === "info",
  );

  const counts = {
    total: args.findings.length,
    block: blocks.length,
    warn: warns.length,
    info: infos.length,
    new: args.findings.length, // PR-review path doesn't compute "new vs reappearing"; v1.1
    resolved: 0,
    bySeverity: {
      critical: args.findings.filter((f) => f.severity === "critical").length,
      high: args.findings.filter((f) => f.severity === "high").length,
      medium: args.findings.filter((f) => f.severity === "medium").length,
      low: args.findings.filter((f) => f.severity === "low").length,
      info: args.findings.filter((f) => f.severity === "info").length,
    },
  };

  const halt = counts.block > 0;
  const completedAt = new Date();

  await SecurityScan.updateOne(
    { _id: args.scanId },
    {
      $set: {
        state: "complete",
        completedAt,
        halt,
        counts,
      },
    },
  );

  // Refresh monitor.lastScanAt + lastCleanAt. The dashboard reads these
  // for the "Last scan 3h ago" caption, which previously only updated on
  // monitor-side scans — even though PR reviews ARE producing fresh data.
  // We need the repoId for the socket payload too; fetch it back atomically.
  const monitorUpdate: Record<string, unknown> = { lastScanAt: completedAt };
  if (counts.total === 0) monitorUpdate.lastCleanAt = completedAt;
  const updatedMonitor = await SecurityMonitor.findOneAndUpdate(
    { _id: args.monitorId },
    { $set: monitorUpdate },
    { new: true },
  ).select("repoId");

  args.emit(
    "security:scan-complete",
    {
      scanId: args.scanId,
      repoId: updatedMonitor?.repoId,
      halt,
      counts,
    },
    args.userId,
  );
}
