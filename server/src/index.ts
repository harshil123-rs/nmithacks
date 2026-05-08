import dotenv from "dotenv";
dotenv.config();

// Sentry must be initialized before all other imports
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.2,
  });
  console.log("[Sentry] Initialized");
}

import http from "http";
import app from "./app";
import { connectDB } from "./config/db";
import { initSocket } from "./config/socket";
import { startContextWorker } from "./jobs/context.job";
import { startReviewWorker } from "./jobs/review.job";
import { startSecurityWorker } from "./jobs/security.job";
import { startSecurityCron, stopSecurityCron } from "./jobs/security-cron";
import { PR } from "./models/PR";
import { RepoContext } from "./models/RepoContext";

// Import models to ensure indexes are created
import "./models/FilePushHistory";
import "./models/RepoHealthSnapshot";

const server = http.createServer(app);

// Socket.io
initSocket(server);

// Sentry error handler — must be after routes, before other error handlers
Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 3000;

/**
 * Startup cleanup: reset any orphaned statuses left by a previous crash/deploy.
 * PRs stuck at "reviewing" → "pending" (user can re-trigger)
 * Repos stuck at "indexing" → "failed" (user can re-index)
 */
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
        `[LGTM] Startup cleanup: reset ${prResult.modifiedCount} stuck PRs (reviewing → pending)`,
      );
    }
    if (ctxResult.modifiedCount > 0) {
      console.log(
        `[LGTM] Startup cleanup: reset ${ctxResult.modifiedCount} stuck repos (indexing → failed)`,
      );
    }
  } catch (err: any) {
    console.error("[LGTM] Startup cleanup error:", err.message);
  }
}

async function start() {
  await connectDB();

  // Clean up orphaned statuses from previous crash/deploy
  await cleanupOrphanedStatuses();

  // Start workers after DB connection (skip if using standalone worker process)
  let contextWorker: ReturnType<typeof startContextWorker> = null;
  let reviewWorker: ReturnType<typeof startReviewWorker> = null;
  let securityWorker: ReturnType<typeof startSecurityWorker> = null;

  if (process.env.WORKER_MODE === "separate") {
    console.log(
      "[LGTM] WORKER_MODE=separate — skipping inline workers (use src/worker.ts)",
    );
  } else {
    contextWorker = startContextWorker();
    reviewWorker = startReviewWorker();
    securityWorker = startSecurityWorker();
    startSecurityCron();

    if (contextWorker) {
      console.log("[LGTM] Context worker initialized");
    } else {
      console.warn("[LGTM] Context worker NOT initialized - check REDIS_URL");
    }

    if (reviewWorker) {
      console.log("[LGTM] Review worker initialized");
    } else {
      console.warn("[LGTM] Review worker NOT initialized - check REDIS_URL");
    }

    if (securityWorker) {
      console.log("[LGTM] Security worker initialized");
    } else {
      console.warn(
        "[LGTM] Security worker NOT initialized — check REDIS_URL or SECURITY_MONITOR_ENABLED",
      );
    }

    // console.log("No Error")


    // console.log("hard testing security initialization")
  }

  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[LGTM] Server running on 0.0.0.0:${PORT}`);
  });

  // ── Graceful shutdown ──
  // On SIGTERM (Fly.io deploy) or SIGINT (Ctrl+C), drain in-flight jobs
  // before killing the process. This prevents orphaned statuses.
  let shuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[LGTM] ${signal} received — starting graceful shutdown...`);

    // Stop accepting new HTTP connections
    server.close(() => {
      console.log("[LGTM] HTTP server closed");
    });

    // Close workers — waits for current job to finish, stops picking up new ones
    const closePromises: Promise<void>[] = [];

    if (contextWorker) {
      console.log(
        "[LGTM] Closing context worker (waiting for in-flight jobs)...",
      );
      closePromises.push(
        contextWorker
          .close()
          .then(() => console.log("[LGTM] Context worker closed")),
      );
    }

    if (reviewWorker) {
      console.log(
        "[LGTM] Closing review worker (waiting for in-flight jobs)...",
      );
      closePromises.push(
        reviewWorker
          .close()
          .then(() => console.log("[LGTM] Review worker closed")),
      );
    }

    if (securityWorker) {
      console.log(
        "[LGTM] Closing security worker (waiting for in-flight jobs)...",
      );
      closePromises.push(
        securityWorker
          .close()
          .then(() => console.log("[LGTM] Security worker closed")),
      );
    }
    stopSecurityCron();

    // Hard kill fallback — if workers don't close in 30s, force exit
    const hardKillTimer = setTimeout(() => {
      console.error(
        "[LGTM] Graceful shutdown timed out after 30s — forcing exit",
      );
      process.exit(1);
    }, 30000);

    try {
      await Promise.all(closePromises);
      console.log("[LGTM] All workers closed — exiting cleanly");
    } catch (err: any) {
      console.error("[LGTM] Error during worker shutdown:", err.message);
    }

    clearTimeout(hardKillTimer);
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

start();

export { app, server };
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          