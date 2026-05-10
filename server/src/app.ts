import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import aiRoutes from "./routes/ai.routes";
import repoRoutes from "./routes/repo.routes";
import webhookRoutes from "./routes/webhook.routes";
import prRoutes from "./routes/pr.routes";
import notificationRoutes from "./routes/notification.routes";
import analyticsRoutes from "./routes/analytics.routes";
import billingRoutes from "./routes/billing.routes";
import healthRoutes from "./routes/health.routes";
import securityRoutes from "./routes/security.routes";
import pipelineRoutes from "./routes/pipeline.routes";
import n8nRoutes from "./routes/n8n.routes";
import { handleDodoWebhook } from "./controllers/dodo-webhook.controller";
import { redis } from "./config/redis";
import { contextQueue, reviewQueue, securityQueue } from "./jobs/queue";
import { getLLMPoolStats } from "./lib/llm-pool";

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "https://nmithacks.vercel.app",
    credentials: true,
  }),
);

// Raw body parser for webhook HMAC verification (must come before express.json)
app.use(
  "/webhooks",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    (req as any).rawBody = req.body;
    // Re-parse as JSON for downstream handlers
    if (Buffer.isBuffer(req.body)) {
      req.body = JSON.parse(req.body.toString("utf8"));
    }
    next();
  },
);

app.use(express.json());

// Health check (no auth — must come before /health routes)
app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    db: !!process.env.MONGODB_URI,
    redis: !!redis,
    queues: {
      context: !!contextQueue,
      review: !!reviewQueue,
      security: !!securityQueue,
    },
    llmPool: getLLMPoolStats(),
  });
});

// Routes
app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use("/repos", repoRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/api", prRoutes);
app.use("/notifications", notificationRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/billing", billingRoutes);
app.use("/health", healthRoutes);
app.use("/security", securityRoutes);
app.use("/pipeline", pipelineRoutes);
app.use("/api/n8n", n8nRoutes);

// Dodo Payments webhook (uses raw body from /webhooks middleware)
app.post("/webhooks/dodo", handleDodoWebhook);

import path from "path";
import fs from "fs";

// Serve frontend static files if they exist (used for single-container Docker deployment)
const clientDistPath = path.join(__dirname, "../../client/dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  
  // React SPA catch-all (exclude API routes)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/webhooks")) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

export default app;
