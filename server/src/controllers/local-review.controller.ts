/**
 * POST /prs/local-review
 *
 * Accepts a raw git diff from the CLI, runs the full agent pipeline inline,
 * and streams progress back via Server-Sent Events (SSE).
 *
 * No BullMQ — agents run directly in the request handler so we can stream.
 */
import { Request, Response } from "express";
import { Repo } from "../models/Repo";
import { RepoContext } from "../models/RepoContext";
import { Review } from "../models/Review";
import { User } from "../models/User";
import { decrypt } from "../utils/encryption";
import { resolveProvider } from "../services/ai.service";
import { parseDiff, truncateDiff } from "../agents/review/diff-parser";
import { runPageRank, generateRepoMap } from "../agents/context/indexer";
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
import { reserveReview } from "../controllers/billing.controller";

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

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function sendSSE(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function localReview(req: Request, res: Response): Promise<void> {
  const {
    repo: repoFullName,
    diff: rawDiff,
    baseBranch,
    headBranch,
    title,
  } = req.body;

  if (!repoFullName || !rawDiff) {
    res.status(400).json({ error: "repo and diff are required" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // 1. Load repo
    const repo = await Repo.findOne({
      fullName: repoFullName,
      connectedBy: req.user!.userId,
      isActive: true,
    });
    if (!repo) {
      sendSSE(res, "error", {
        message: "Repo not connected. Run: lgtm repo connect",
      });
      res.end();
      return;
    }

    // 2. Check indexed
    const repoCtx = await RepoContext.findOne({ repoId: repo._id }).lean();
    if (!repoCtx || repoCtx.indexStatus !== "ready") {
      sendSSE(res, "error", {
        message: "Repo not indexed. Run: lgtm repo index",
      });
      res.end();
      return;
    }

    // 3. Resolve LLM provider
    const user = await User.findById(req.user!.userId);
    if (!user) {
      sendSSE(res, "error", { message: "User not found" });
      res.end();
      return;
    }

    // Billing guard — atomically reserve a review slot
    const billingCheck = await reserveReview(user._id.toString());
    if (!billingCheck.allowed) {
      sendSSE(res, "error", {
        message: billingCheck.reason || "Review limit reached",
      });
      res.end();
      return;
    }

    const decryptedProviders = user.aiConfig.providers.map((p) => ({
      provider: p.provider,
      apiKey: decrypt(p.apiKey),
    }));

    let llmOptions;
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
      sendSSE(res, "error", { message: err.message });
      res.end();
      return;
    }

    // 4. Parse diff
    let parsedDiff = parseDiff(rawDiff);
    if (rawDiff.length > MAX_DIFF_SIZE) {
      parsedDiff = truncateDiff(parsedDiff, MAX_DIFF_SIZE);
    }

    // 5. Build context from RepoContext (no GitHub fetch needed — local diff)
    const conventions = repoCtx.conventions || [];
    const recentHistory = repoCtx.recentHistory || [];

    let personalizedRepoMap = repoCtx.repoMap || "";
    if (repoCtx.graphEdges && repoCtx.graphEdges.length > 0) {
      const changedPaths = parsedDiff.files.map((f) => f.path);
      const ranks = runPageRank(
        repoCtx.graphEdges,
        repoCtx.fileTree,
        changedPaths,
      );
      const rankedFiles = [...repoCtx.fileTree].sort(
        (a, b) => (ranks.get(b) || 0) - (ranks.get(a) || 0),
      );
      personalizedRepoMap = generateRepoMap(
        rankedFiles,
        repoCtx.definitions,
        4096,
      );
    }

    // For local review, changedFiles content comes from the diff itself (no GitHub fetch)
    const changedFiles = parsedDiff.files.map((f) => ({
      path: f.path,
      content: f.hunks
        .map((h) => h.lines.map((l) => l.content).join("\n"))
        .join("\n"),
    }));

    // 6. Determine agents to run
    const focusAreas = repo.settings.focusAreas || [];
    const agentsToRun: ReviewAgentType[] =
      focusAreas.length > 0
        ? (focusAreas
            .map((a) => FOCUS_AREA_TO_AGENT[a])
            .filter(Boolean) as ReviewAgentType[])
        : [
            "security",
            "bugs",
            "performance",
            "readability",
            "best-practices",
            "documentation",
          ];

    // 7. Create Review document
    const review = new Review({
      prId: null, // local review — no PR in DB
      repoId: repo._id,
      localTitle:
        title ||
        `Local review (${headBranch || "local"} → ${baseBranch || "main"})`,
      agentReports: agentsToRun.map((type) => ({
        agentType: type,
        status: "pending",
      })),
    });
    await review.save();

    const reviewId = review._id.toString();

    sendSSE(res, "review:started", { reviewId, agents: agentsToRun });

    // 8. Build agent input
    const agentInput: AgentInput = {
      diff: parsedDiff,
      rawDiff,
      changedFiles,
      relatedFiles: [],
      conventions,
      recentHistory,
      repoMap: personalizedRepoMap,
      pr: {
        title: title || "Local review",
        body: "",
        author: user.username,
        baseBranch: baseBranch || "main",
        headBranch: headBranch || "local",
        prNumber: 0,
      },
      repoFullName,
      llmOptions,
    };

    // 9. Run agents in parallel
    const agentResults = await Promise.allSettled(
      agentsToRun.map(async (agentType) => {
        await Review.updateOne(
          { _id: review._id, "agentReports.agentType": agentType },
          { $set: { "agentReports.$.status": "running" } },
        );
        sendSSE(res, "agent:started", { reviewId, agentType });

        try {
          const output = await withTimeout(
            AGENT_RUNNERS[agentType](agentInput),
            AGENT_TIMEOUT_MS,
            agentType,
          );

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

          sendSSE(res, "agent:completed", {
            reviewId,
            agentType,
            findingsCount: output.findings.length,
            durationMs: output.durationMs,
          });

          return output;
        } catch (err: any) {
          await Review.updateOne(
            { _id: review._id, "agentReports.agentType": agentType },
            {
              $set: {
                "agentReports.$.status": "failed",
                "agentReports.$.rawOutput": err.message,
              },
            },
          );
          sendSSE(res, "agent:failed", {
            reviewId,
            agentType,
            error: err.message,
          });
          throw err;
        }
      }),
    );

    // 10. Collect successful outputs
    const successfulOutputs: AgentOutput[] = agentResults
      .filter(
        (r): r is PromiseFulfilledResult<AgentOutput> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    // 11. Run synthesizer
    sendSSE(res, "synthesizer:started", { reviewId });

    const synthResult = await runSynthesizer({
      agentOutputs: successfulOutputs,
      pr: {
        title: title || "Local review",
        body: "",
        author: user.username,
        baseBranch: baseBranch || "main",
        headBranch: headBranch || "local",
        prNumber: 0,
      },
      repoFullName,
      llmOptions,
      diffStats: {
        totalFiles: parsedDiff.totalFiles,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
      },
    });

    // 12. Finalize verdict — trust the synthesizer, don't auto-promote "comment" to "approve"
    let finalVerdict = synthResult.verdict;
    if (finalVerdict === "comment") {
      const hasBlockers =
        synthResult.severityCounts.critical > 0 ||
        synthResult.severityCounts.high > 0;
      if (hasBlockers) {
        finalVerdict = "request_changes";
      }
      // Keep "comment" as-is — do NOT auto-promote to "approve"
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

    const clientUrl = process.env.CLIENT_URL || "https://nmithacks.vercel.app";
    const totalFindings = successfulOutputs.reduce(
      (s, o) => s + o.findings.length,
      0,
    );

    sendSSE(res, "review:completed", {
      reviewId,
      verdict: finalVerdict,
      confidenceScore: synthResult.confidenceScore,
      findingsCount: totalFindings,
      severityCounts: synthResult.severityCounts,
      summary: synthResult.summary,
      topActions: synthResult.topActions,
      reportUrl: `${clientUrl}/review/${reviewId}`,
    });
  } catch (err: any) {
    console.error("[LocalReview] Error:", err.message);
    sendSSE(res, "error", { message: err.message });
  }

  res.end();
}
