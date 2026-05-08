/**
 * BullMQ Worker: context-index
 *
 * Orchestrates the 3 context agents sequentially:
 * 1. Repo Indexer (tree-sitter parsing + dependency graph + PageRank)
 * 2. Pattern Extractor (conventions)
 * 3. History Summarizer (recent changes)
 *
 * Sets indexStatus throughout the lifecycle.
 */
import * as Sentry from "@sentry/node";
import { Worker, Job } from "bullmq";
import { Repo } from "../models/Repo";
import { RepoContext } from "../models/RepoContext";
import { User } from "../models/User";
import { getInstallationToken } from "../utils/github";
import { decrypt } from "../utils/encryption";
import { resolveProvider, type CallLLMOptions } from "../services/ai.service";
import { getIO } from "../config/socket";
import { runIndexer } from "../agents/context/indexer";
import { runPatternExtractor } from "../agents/context/patterns";
import { runHistorySummarizer } from "../agents/context/history";
import FilePushHistory from "../models/FilePushHistory";
import { computeAndSaveHealthScore } from "../services/healthScore.service";
import mongoose from "mongoose";

function emitSafe(event: string, data: any, userId?: string) {
  try {
    const io = getIO();
    if (userId) {
      io.to(`user:${userId}`).emit(event, data);
    } else {
      io.emit(event, data);
    }
  } catch {
    // Socket not initialized — skip
  }
}

export interface ContextJobData {
  repoId: string;
  repoFullName: string;
  branch: string;
  headSha: string;
  pusher?: string;
  commits?: number;
  changedFiles?: string[];
}

async function processContextJob(job: Job<ContextJobData>) {
  const { repoId, repoFullName, headSha, changedFiles } = job.data;

  console.log(
    `[ContextJob] Starting for ${repoFullName} @ ${headSha.slice(0, 7)}`,
  );
  console.log(
    `[ContextJob] Changed files received:`,
    changedFiles?.length || 0,
    "files",
    changedFiles || [],
  );

  // 1. Load repo + user
  const repo = await Repo.findById(repoId);
  if (!repo || !repo.isActive) {
    console.log(`[ContextJob] Repo ${repoId} not found or inactive, skipping`);
    return;
  }

  const user = await User.findById(repo.connectedBy);
  if (!user) {
    console.log(`[ContextJob] User not found for repo ${repoFullName}`);
    return;
  }

  // 2. Get installation token
  if (!user.githubInstallationId) {
    console.log(
      `[ContextJob] No installation ID for user ${user.username}, skipping`,
    );
    return;
  }

  const installationToken = await getInstallationToken(
    user.githubInstallationId,
  );

  // 2.5. Fetch commit details from GitHub API (always, to get diffs)
  let finalChangedFiles = changedFiles || [];
  let fileDiffs: Array<{
    filename: string;
    additions: number;
    deletions: number;
    patch?: string;
  }> = [];

  if (headSha) {
    try {
      console.log(
        `[ContextJob] Fetching commit details from GitHub API for ${headSha.slice(0, 7)}`,
      );
      const commitRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/commits/${headSha}`,
        {
          headers: {
            Authorization: `Bearer ${installationToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );
      if (commitRes.ok) {
        const commitData = (await commitRes.json()) as {
          files?: Array<{
            filename: string;
            additions: number;
            deletions: number;
            patch?: string;
          }>;
        };
        const files = commitData.files || [];
        // Use GitHub API files if webhook didn't provide them
        if (!changedFiles || changedFiles.length === 0) {
          finalChangedFiles = files.map((f: any) => f.filename);
        }
        // Always extract diffs (webhook never provides patch data)
        fileDiffs = files.map((f: any) => ({
          filename: f.filename,
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          patch: f.patch,
        }));
        console.log(
          `[ContextJob] Fetched ${files.length} files with diffs from GitHub API`,
        );
      }
    } catch (err) {
      console.warn(`[ContextJob] Failed to fetch commit details:`, err);
    }
  }

  // 3. Resolve AI providers (needed for pattern extractor + history summarizer, NOT for indexer)
  // Defer resolution — indexer runs without LLM. If no provider, we still index.
  let llmOptions: CallLLMOptions | null = null;

  try {
    const decryptedProviders = user.aiConfig.providers.map((p) => ({
      provider: p.provider,
      apiKey: decrypt(p.apiKey),
    }));
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
    console.warn(
      `[ContextJob] No LLM provider configured — indexer will run but pattern/history agents will be skipped: ${err.message}`,
    );
  }

  // 4. Set status to indexing
  await setIndexStatus(repoId, "indexing");

  const socketUserId = user._id.toString();

  emitSafe(
    "context:started",
    { repoId, repoFullName, step: "indexer" },
    socketUserId,
  );

  try {
    // 5. Run agents sequentially
    await job.updateProgress(10);

    // Agent 1: Repo Indexer
    console.log(`[ContextJob] Running indexer for ${repoFullName}...`);
    emitSafe(
      "context:progress",
      {
        repoId,
        repoFullName,
        step: "indexer",
        progress: 10,
      },
      socketUserId,
    );

    const indexResult = await runIndexer({
      repoFullName,
      headSha,
      installationToken,
      repoId: repo._id,
      changedFiles,
    });
    console.log(
      `[ContextJob] Indexer done: ${indexResult.indexedFiles}/${indexResult.totalFiles} files (${indexResult.durationMs}ms)`,
    );
    if (indexResult.errors.length > 0) {
      console.warn(
        `[ContextJob] Indexer errors:`,
        indexResult.errors.slice(0, 5),
      );
    }
    await job.updateProgress(50);
    emitSafe(
      "context:progress",
      {
        repoId,
        repoFullName,
        step: "patterns",
        progress: 50,
      },
      socketUserId,
    );

    // Agent 2: Pattern Extractor (requires LLM)
    let patternResult = { conventions: [], filesAnalyzed: 0, durationMs: 0 };
    if (llmOptions) {
      console.log(
        `[ContextJob] Running pattern extractor for ${repoFullName}...`,
      );
      patternResult = await runPatternExtractor({
        repoFullName,
        headSha,
        installationToken,
        repoId: repo._id,
        llmOptions,
      });
      console.log(
        `[ContextJob] Patterns done: ${patternResult.conventions.length} conventions from ${patternResult.filesAnalyzed} files (${patternResult.durationMs}ms)`,
      );
    } else {
      console.log(`[ContextJob] Skipping pattern extractor (no LLM provider)`);
    }
    await job.updateProgress(80);
    emitSafe(
      "context:progress",
      {
        repoId,
        repoFullName,
        step: "history",
        progress: 80,
      },
      socketUserId,
    );

    // Agent 3: History Summarizer (requires LLM)
    let historyResult = { summaries: [], prsAnalyzed: 0, durationMs: 0 };
    if (llmOptions) {
      console.log(
        `[ContextJob] Running history summarizer for ${repoFullName}...`,
      );
      historyResult = await runHistorySummarizer({
        repoFullName,
        installationToken,
        repoId: repo._id,
        llmOptions,
      });
      console.log(
        `[ContextJob] History done: ${historyResult.summaries.length} summaries from ${historyResult.prsAnalyzed} PRs (${historyResult.durationMs}ms)`,
      );
    } else {
      console.log(`[ContextJob] Skipping history summarizer (no LLM provider)`);
    }
    await job.updateProgress(100);

    // 6. Mark as ready
    const ctx = await RepoContext.findOne({ repoId: repo._id });
    if (ctx) {
      ctx.indexStatus = "ready";
      ctx.lastIndexedAt = new Date();
      await ctx.save();

      console.log(`[ContextJob] Saving push history for ${repoFullName}...`);
      // Persist push history for churn signal
      await FilePushHistory.create({
        repoId: new mongoose.Types.ObjectId(repoId),
        pushedAt: new Date(),
        files: finalChangedFiles || [],
        commitSha: job.data.headSha ?? "",
        fileDiffs: fileDiffs.length > 0 ? fileDiffs : undefined,
      });
      console.log(
        `[ContextJob] Push history saved with ${finalChangedFiles?.length || 0} files and ${fileDiffs.length} diffs`,
      );

      // Compute health score in isolation — don't let it tank the whole job
      try {
        console.log(
          `[ContextJob] Computing health score for ${repoFullName}...`,
        );
        await computeAndSaveHealthScore(new mongoose.Types.ObjectId(repoId));
        console.log(`[ContextJob] Health score computed and saved`);
      } catch (healthErr: any) {
        console.error(
          `[ContextJob] Health score computation failed (non-fatal):`,
          healthErr.message,
        );
      }
    }

    emitSafe(
      "context:completed",
      {
        repoId,
        repoFullName,
        fileCount: ctx?.fileTree?.length || 0,
        conventionCount: ctx?.conventions?.length || 0,
        historyCount: ctx?.recentHistory?.length || 0,
      },
      socketUserId,
    );

    console.log(`[ContextJob] Completed for ${repoFullName}`);
  } catch (err: any) {
    console.error(`[ContextJob] Failed for ${repoFullName}:`, err.message);
    // Wrap failure handling so errors here don't crash the worker
    try {
      await setIndexStatus(repoId, "failed");
      emitSafe(
        "context:failed",
        { repoId, repoFullName, error: err.message },
        socketUserId,
      );
    } catch (failErr: any) {
      console.error(
        `[ContextJob] Error during failure handling:`,
        failErr.message,
      );
    }
    throw err; // Let BullMQ handle retries
  }
}

async function setIndexStatus(
  repoId: string,
  status: "idle" | "indexing" | "ready" | "failed",
) {
  await RepoContext.findOneAndUpdate(
    { repoId },
    { indexStatus: status },
    { upsert: true },
  );
}

// ── Worker initialization ──

import { getRedisConnection } from "./queue";

export function startContextWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    console.warn("[ContextJob] No REDIS_URL — worker not started");
    return null;
  }

  console.log("[ContextJob] Initializing worker with Redis...");

  const worker = new Worker<ContextJobData>("context", processContextJob, {
    connection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // Max 10 context jobs per minute
    },
    stalledInterval: 60000,
    maxStalledCount: 2,
  });

  worker.on("completed", (job) => {
    console.log(`[ContextJob] Job ${job.id} completed`);
  });

  // Fires after ALL retries are exhausted — reset index status so user can retry
  worker.on("failed", async (job, err) => {
    console.error(`[ContextJob] Job ${job?.id} failed:`, err.message);
    Sentry.captureException(err, {
      tags: { job: "context", repo: job?.data.repoFullName },
    });
    console.error(`[ContextJob] Error stack:`, err.stack);
    if (job?.data?.repoId) {
      try {
        await setIndexStatus(job.data.repoId, "failed");
        console.log(
          `[ContextJob] Reset indexStatus to failed for repo ${job.data.repoFullName}`,
        );
      } catch (resetErr: any) {
        console.error(
          `[ContextJob] Failed to reset indexStatus:`,
          resetErr.message,
        );
      }
    }
  });

  worker.on("error", (err) => {
    console.error(`[ContextJob] Worker error:`, err);
  });

  worker.on("active", (job) => {
    console.log(`[ContextJob] Job ${job.id} is now active`);
  });

  worker.on("stalled", async (jobId) => {
    console.warn(
      `[ContextJob] Job ${jobId} stalled — will be retried by BullMQ`,
    );
  });

  worker.on("ready", () => {
    console.log(`[ContextJob] Worker is ready and waiting for jobs`);
  });

  console.log("[ContextJob] Worker started");
  return worker;
}
