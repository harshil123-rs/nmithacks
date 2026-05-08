/**
 * Standalone worker process.
 *
 * Run this separately from the main server to isolate CPU-heavy
 * job processing (tree-sitter parsing, LLM calls) from the HTTP/Socket layer.
 *
 * Usage:
 *   npx ts-node-dev src/worker.ts
 *
 * In production (Docker/Fly.io), run as a separate container:
 *   node dist/worker.js
 *
 * The main server (src/index.ts) still starts workers inline for single-process
 * dev mode. Set WORKER_MODE=separate in .env to skip inline workers and use
 * this process instead.
 */
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./config/db";
import { initSocket } from "./config/socket";
import http from "http";
import { startContextWorker } from "./jobs/context.job";
import { startReviewWorker } from "./jobs/review.job";
import { startSecurityWorker } from "./jobs/security.job";
import { startSecurityCron, stopSecurityCron } from "./jobs/security-cron";
import { PR } from "./models/PR";
import { RepoContext } from "./models/RepoContext";

// Import models to ensure indexes are created
import "./models/FilePushHistory";
import "./models/RepoHealthSnapshot";

async function cleanupOrphanedStatuses() {
  try {
    const [prResult, ctxResult] = await Promise.all([
      PR.updateMany({ status: "reviewing" }, { $set: { status: "pending" } }),
      RepoContext.updateMany(
        { indexStatus: "indexing" },
        { $set: { indexStatus: "failed" } },
      ),
    ]);
    if (prResult.modifiedCount > 0) {
      console.log(
        `[Worker] Cleanup: reset ${prResult.modifiedCount} stuck PRs`,
      );
    }
    if (ctxResult.modifiedCount > 0) {
      console.log(
        `[Worker] Cleanup: reset ${ctxResult.modifiedCount} stuck repos`,
      );
    }
  } catch (err: any) {
    console.error("[Worker] Cleanup error:", err.message);
  }
}

async function start() {
  console.log("[Worker] Starting standalone worker process...");

  await connectDB();

  // Socket.io is needed for emitSafe() in job processors.
  // Create a minimal HTTP server just for the socket instance.
  const minimalServer = http.createServer();
  initSocket(minimalServer);
  // Don't listen — we only need the io instance for emitting events.
  // The main server handles actual socket connections from clients.

  await cleanupOrphanedStatuses();

  const contextWorker = startContextWorker();
  const reviewWorker = startReviewWorker();
  const securityWorker = startSecurityWorker();
  startSecurityCron();

  console.log(
    "[Worker] Context worker:",
    contextWorker ? "started" : "SKIPPED (no REDIS_URL)",
  );
  console.log(
    "[Worker] Review worker:",
    reviewWorker ? "started" : "SKIPPED (no REDIS_URL)",
  );
  console.log(
    "[Worker] Security worker:",
    securityWorker ? "started" : "SKIPPED",
  );
  console.log("[Worker] Ready and processing jobs");

  // Graceful shutdown
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Worker] ${signal} — shutting down...`);

    const closes: Promise<void>[] = [];
    if (contextWorker) closes.push(contextWorker.close());
    if (reviewWorker) closes.push(reviewWorker.close());
    if (securityWorker) closes.push(securityWorker.close());
    stopSecurityCron();

    const hardKill = setTimeout(() => {
      console.error("[Worker] Shutdown timed out — forcing exit");
      process.exit(1);
    }, 30000);

    await Promise.all(closes).catch(() => {});
    clearTimeout(hardKill);
    console.log("[Worker] Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
