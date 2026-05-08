/**
 * Test script for Context Agents.
 * Run: npx ts-node src/scripts/test-context-agents.ts
 *
 * Tests the 3 context agents against a real GitHub repo.
 * Requires: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY in .env
 * and a connected repo with AI provider keys configured.
 *
 * Usage:
 *   npx ts-node src/scripts/test-context-agents.ts [repoFullName]
 *
 * If no repo is specified, uses the first connected repo found.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { RepoContext } from "../models/RepoContext";
import { getInstallationToken } from "../utils/github";
import { githubAppFetch } from "../utils/github";
import { decrypt } from "../utils/encryption";
import {
  resolveProvider,
  resolveEmbeddingProvider,
  type CallLLMOptions,
  type EmbeddingOptions,
} from "../services/ai.service";
import { runIndexer } from "../agents/context/indexer";
import { runPatternExtractor } from "../agents/context/patterns";
import { runHistorySummarizer } from "../agents/context/history";

function log(label: string, ok: boolean, detail?: string) {
  const icon = ok ? "[PASS]" : "[FAIL]";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

function logInfo(msg: string) {
  console.log(`  [INFO] ${msg}`);
}

async function main() {
  const targetRepo = process.argv[2]; // optional: owner/repo
  console.log("=== Context Agent Tests ===\n");

  await connectDB();

  // 1. Find a connected repo to test with
  const query = targetRepo
    ? { fullName: targetRepo, isActive: true }
    : { isActive: true };
  const repo = await Repo.findOne(query);

  if (!repo) {
    console.error("No connected repo found. Connect a repo first via the UI.");
    process.exit(1);
  }
  console.log(`Using repo: ${repo.fullName}\n`);

  // 2. Load user + resolve providers
  const user = await User.findById(repo.connectedBy);
  if (!user) {
    console.error("User not found for this repo.");
    process.exit(1);
  }

  if (!user.githubInstallationId) {
    console.error(
      "No GitHub App installation ID on user. Install the app first.",
    );
    process.exit(1);
  }

  const decryptedProviders = user.aiConfig.providers.map((p) => ({
    provider: p.provider,
    apiKey: decrypt(p.apiKey),
  }));

  if (decryptedProviders.length === 0) {
    console.error(
      "No AI providers configured. Add an API key in Settings first.",
    );
    process.exit(1);
  }

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

  // 3. Get installation token
  const installationToken = await getInstallationToken(
    user.githubInstallationId,
  );
  logInfo("Installation token acquired\n");

  // 4. Get the default branch HEAD sha
  const repoRes = await githubAppFetch(
    `/repos/${repo.fullName}`,
    installationToken,
  );
  if (!repoRes.ok) {
    console.error(`Failed to fetch repo info: ${repoRes.status}`);
    process.exit(1);
  }
  const repoInfo = (await repoRes.json()) as {
    default_branch: string;
  };

  const branchRes = await githubAppFetch(
    `/repos/${repo.fullName}/git/ref/heads/${repoInfo.default_branch}`,
    installationToken,
  );
  if (!branchRes.ok) {
    console.error(`Failed to fetch branch ref: ${branchRes.status}`);
    process.exit(1);
  }
  const branchData = (await branchRes.json()) as {
    object: { sha: string };
  };
  const headSha = branchData.object.sha;
  logInfo(`HEAD: ${headSha.slice(0, 7)} (${repoInfo.default_branch})\n`);

  // Clean up any previous test context
  await RepoContext.deleteOne({ repoId: repo._id });

  // ── Test 1: Repo Indexer ──
  console.log("--- Agent 1: Repo Indexer ---");
  try {
    const indexResult = await runIndexer({
      repoFullName: repo.fullName,
      headSha,
      installationToken,
      repoId: repo._id,
      embeddingOptions,
      llmOptions,
    });

    log("Indexer completed", true, `${indexResult.durationMs}ms`);
    log(
      "Files found",
      indexResult.totalFiles > 0,
      `${indexResult.totalFiles} eligible files`,
    );
    log(
      "Files indexed",
      indexResult.indexedFiles > 0,
      `${indexResult.indexedFiles} indexed`,
    );

    if (indexResult.errors.length > 0) {
      logInfo(`${indexResult.errors.length} errors (first 3):`);
      indexResult.errors.slice(0, 3).forEach((e) => logInfo(`  ${e}`));
    }

    // Verify DB
    const ctx = await RepoContext.findOne({ repoId: repo._id });
    log("RepoContext created", !!ctx);
    log(
      "File summaries stored",
      (ctx?.fileSummaries.length || 0) > 0,
      `${ctx?.fileSummaries.length} entries`,
    );

    // Check embedding dimensions
    const firstWithEmb = ctx?.fileSummaries.find((f) => f.embedding.length > 0);
    log(
      "Embedding dimensions correct",
      firstWithEmb?.embedding.length === 768,
      `${firstWithEmb?.embedding.length} dims`,
    );

    // Show a sample
    if (ctx && ctx.fileSummaries.length > 0) {
      const sample = ctx.fileSummaries[0];
      logInfo(`Sample: ${sample.path}`);
      logInfo(`  Summary: ${sample.summary.slice(0, 100)}...`);
    }
  } catch (err: any) {
    log("Indexer", false, err.message);
  }

  // ── Test 2: Pattern Extractor ──
  console.log("\n--- Agent 2: Pattern Extractor ---");
  try {
    const patternResult = await runPatternExtractor({
      repoFullName: repo.fullName,
      headSha,
      installationToken,
      repoId: repo._id,
      llmOptions,
    });

    log("Pattern extractor completed", true, `${patternResult.durationMs}ms`);
    log(
      "Files analyzed",
      patternResult.filesAnalyzed > 0,
      `${patternResult.filesAnalyzed} files`,
    );
    log(
      "Conventions extracted",
      patternResult.conventions.length > 0,
      `${patternResult.conventions.length} conventions`,
    );

    // Verify DB
    const ctx = await RepoContext.findOne({ repoId: repo._id });
    log(
      "Conventions stored in DB",
      (ctx?.conventions.length || 0) > 0,
      `${ctx?.conventions.length}`,
    );

    // Show conventions
    if (patternResult.conventions.length > 0) {
      logInfo("Sample conventions:");
      patternResult.conventions.slice(0, 5).forEach((c) => logInfo(`  - ${c}`));
    }
  } catch (err: any) {
    log("Pattern extractor", false, err.message);
  }

  // ── Test 3: History Summarizer ──
  console.log("\n--- Agent 3: History Summarizer ---");
  try {
    const historyResult = await runHistorySummarizer({
      repoFullName: repo.fullName,
      installationToken,
      repoId: repo._id,
      llmOptions,
    });

    log("History summarizer completed", true, `${historyResult.durationMs}ms`);
    log("PRs analyzed", true, `${historyResult.prsAnalyzed} merged PRs`);
    log(
      "Summaries generated",
      historyResult.summaries.length > 0,
      `${historyResult.summaries.length} summaries`,
    );

    // Verify DB
    const ctx = await RepoContext.findOne({ repoId: repo._id });
    log(
      "History stored in DB",
      (ctx?.recentHistory.length || 0) > 0,
      `${ctx?.recentHistory.length}`,
    );

    // Show summaries
    if (historyResult.summaries.length > 0) {
      logInfo("Sample summaries:");
      historyResult.summaries.slice(0, 3).forEach((s) => logInfo(`  - ${s}`));
    }
  } catch (err: any) {
    log("History summarizer", false, err.message);
  }

  // ── Test 4: Incremental Indexing ──
  console.log("\n--- Test 4: Incremental Indexing ---");
  try {
    // Get current count
    const ctxBefore = await RepoContext.findOne({ repoId: repo._id });
    const countBefore = ctxBefore?.fileSummaries.length || 0;

    // Run indexer with only 2 specific files (simulating a push with changes)
    const sampleFiles =
      ctxBefore?.fileSummaries.slice(0, 2).map((f) => f.path) || [];

    if (sampleFiles.length > 0) {
      const incrResult = await runIndexer({
        repoFullName: repo.fullName,
        headSha,
        installationToken,
        repoId: repo._id,
        embeddingOptions,
        llmOptions,
        changedFiles: sampleFiles,
      });

      log(
        "Incremental indexing completed",
        true,
        `${incrResult.indexedFiles} files re-indexed in ${incrResult.durationMs}ms`,
      );

      // Verify total count didn't change (incremental should merge, not replace)
      const ctxAfter = await RepoContext.findOne({ repoId: repo._id });
      log(
        "File count preserved",
        (ctxAfter?.fileSummaries.length || 0) >= countBefore - 2,
        `before: ${countBefore}, after: ${ctxAfter?.fileSummaries.length}`,
      );
    } else {
      logInfo("Skipped — no files to test incremental indexing with");
    }
  } catch (err: any) {
    log("Incremental indexing", false, err.message);
  }

  // ── Final: Set indexStatus + lastIndexedAt like the real worker ──
  const finalCtx = await RepoContext.findOne({ repoId: repo._id });
  if (finalCtx) {
    finalCtx.indexStatus = "ready";
    finalCtx.lastIndexedAt = new Date();
    await finalCtx.save();
  }

  // ── Final summary ──
  console.log("\n--- Final RepoContext State ---");
  // Re-read after update
  const stateCtx = await RepoContext.findOne({ repoId: repo._id });
  if (stateCtx) {
    logInfo(`File summaries: ${stateCtx.fileSummaries.length}`);
    logInfo(`Conventions: ${stateCtx.conventions.length}`);
    logInfo(`Recent history: ${stateCtx.recentHistory.length}`);
    logInfo(`Index status: ${stateCtx.indexStatus}`);
    logInfo(`Last indexed: ${stateCtx.lastIndexedAt || "never"}`);

    const withEmbeddings = stateCtx.fileSummaries.filter(
      (f) => f.embedding.length > 0,
    ).length;
    logInfo(
      `Files with embeddings: ${withEmbeddings}/${stateCtx.fileSummaries.length}`,
    );
  }

  // Cleanup
  console.log("\n--- Cleanup ---");
  await RepoContext.deleteOne({ repoId: repo._id });
  console.log("  [DONE] Test context cleaned up.\n");

  await mongoose.disconnect();
  console.log("=== All context agent tests complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
