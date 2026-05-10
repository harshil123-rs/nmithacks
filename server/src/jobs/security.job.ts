/**
 * BullMQ Worker: security
 *
 * Scans an enrolled repo's CI/CD config files at a specific commit SHA.
 * Triggered four ways (per STEP-0 + Step 4 plan):
 *   - "push"          push event to the default branch that touched CI files
 *   - "schedule"      nightly/weekly cron rescan
 *   - "manual"        "Run scan now" button in the UI
 *   - "enrollment"    one-shot scan immediately after a repo is enrolled
 *   - "workflow_run"  reserved for v1.1 (CI run finished)
 *
 * The worker is intentionally self-contained — it only depends on the
 * shared rule library, GitHub fetch, Redis (for halt-decision cache), and
 * the SecurityMonitor / SecurityAuditLog / SecurityScan models. No LLM
 * calls in this version — Phase 2 LLM disambiguation comes in v1.1 once
 * we have hash-based caching.
 */
import * as Sentry from "@sentry/node";
import { Worker, Job } from "bullmq";
import mongoose from "mongoose";

import { getRedisConnection, securityQueue } from "./queue";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { SecurityAuditLog } from "../models/SecurityAuditLog";
import { SecurityScan } from "../models/SecurityScan";
import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { sendEmail } from "../services/email.service";
import { renderSecurityAlertEmail } from "../services/templates/securityAlertEmail";
import { getInstallationToken, githubAppFetch } from "../utils/github";
import { runAllRules } from "../security/rules";
import { isCiRelevantPath, type RuleId } from "../security/rules/types";
import {
  resolveRuleAction,
  type SecurityPolicy,
} from "../security/default-policy";
import { getIO } from "../config/socket";
import { redis } from "../config/redis";

export interface SecurityJobData {
  monitorId: string;
  trigger: "push" | "schedule" | "manual" | "workflow_run" | "enrollment";
  /** Required for push/workflow_run; for schedule/manual/enrollment we resolve the default-branch HEAD. */
  headSha?: string;
  /** Optional: workflow_run id, used for v1.1 wiring. */
  runId?: number;
}

const PIPELINE_DECISION_TTL_SECONDS = 60 * 60 * 24; // 24h
const CI_DIRS_TO_LIST = [".github/workflows", ".github/actions"];
const ROOT_FILES_TO_TRY = [
  "Dockerfile",
  "Jenkinsfile",
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  "azure-pipelines.yml",
  "azure-pipelines.yaml",
  ".circleci/config.yml",
  ".circleci/config.yaml",
  "bitbucket-pipelines.yml",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "poetry.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "go.sum",
  "Cargo.lock",
];

function emitSafe(event: string, data: any, userId?: string) {
  try {
    const io = getIO();
    if (userId) io.to(`user:${userId}`).emit(event, data);
    else io.emit(event, data);
  } catch {
    // socket not initialized — okay
  }
}

export async function processSecurityJob(job: Job<SecurityJobData>) {
  const { monitorId, trigger } = job.data;

  const monitor = await SecurityMonitor.findById(monitorId);
  if (!monitor) {
    console.log(`[SecurityJob] Monitor ${monitorId} not found, skipping`);
    return;
  }
  if (monitor.status === "paused") {
    console.log(
      `[SecurityJob] Monitor ${monitorId} is paused, skipping ${trigger} scan`,
    );
    return;
  }

  const repo = await Repo.findById(monitor.repoId);
  if (!repo || !repo.isActive) {
    console.log(
      `[SecurityJob] Repo for monitor ${monitorId} not found or inactive`,
    );
    return;
  }

  const owner = await User.findById(monitor.enabledBy);
  if (!owner || !owner.githubInstallationId) {
    console.log(`[SecurityJob] No installation token for monitor ${monitorId}`);
    return;
  }

  const installationToken = await getInstallationToken(
    owner.githubInstallationId,
  );

  // Resolve head SHA for triggers that don't provide one.
  const headSha = job.data.headSha ?? (await resolveDefaultBranchHead(repo.fullName, installationToken));
  if (!headSha) {
    console.error(`[SecurityJob] Could not resolve head SHA for ${repo.fullName}`);
    return;
  }

  const scan = await SecurityScan.create({
    monitorId: monitor._id,
    repoId: monitor.repoId,
    trigger,
    headSha,
    state: "running",
    startedAt: new Date(),
  });

  const socketUserId = owner._id.toString();
  emitSafe(
    "security:scan-started",
    { scanId: scan._id, repoId: monitor.repoId, trigger, headSha },
    socketUserId,
  );

  const start = Date.now();
  try {
    const ciFiles = await fetchCiFiles(repo.fullName, headSha, installationToken);
    console.log(
      `[SecurityJob] Scanning ${repo.fullName} @ ${headSha.slice(0, 7)} — ${ciFiles.length} CI file(s)`,
    );

    if (ciFiles.length === 0) {
      // No CI config to scan — record a clean scan and bail.
      await finalizeCleanScan(scan._id, monitor._id, monitor.repoId.toString(), headSha);
      monitor.lastScanAt = new Date();
      monitor.lastCleanAt = new Date();
      await monitor.save();
      emitSafe(
        "security:scan-complete",
        { scanId: scan._id, repoId: monitor.repoId, halt: false, counts: emptyCounts() },
        socketUserId,
      );
      return;
    }

    const ruleFindings = runAllRules({
      files: ciFiles,
      repoIsPublic: !(repo as any).private, // GitHub webhook sends `private`; the model doesn't store it. Default-public is conservative for the self-hosted-runner rule.
      allowlist: monitor.policy.allowlist,
    });

    // Diff against the previous scan: any finding from before that's no
    // longer present gets marked resolved. Findings new to this scan are
    // counted in `counts.new`.
    const prevAuditEntries = await SecurityAuditLog.find({
      monitorId: monitor._id,
      source: "monitor",
      resolvedAt: { $exists: false },
    }).lean();

    const fingerprintNew = new Set<string>(
      ruleFindings.map((f) => `${f.ruleId}|${f.file}|${f.line ?? -1}`),
    );
    const fingerprintPrev = new Set<string>(
      prevAuditEntries.map((e) => `${e.ruleId}|${e.file}|${e.line ?? -1}`),
    );

    let newCount = 0;
    const auditDocs = ruleFindings.map((f) => {
      const fp = `${f.ruleId}|${f.file}|${f.line ?? -1}`;
      const isNew = !fingerprintPrev.has(fp);
      if (isNew) newCount++;
      const action = resolveRuleAction(monitor.policy, f.ruleId as RuleId);
      // Map "off" to "warn" defensively. Off rules shouldn't have produced
      // findings; if they did, treat as warn rather than dropping data.
      const policyAction: "block" | "warn" | "info" =
        action === "off" ? "warn" : action;
      return {
        monitorId: monitor._id,
        repoId: monitor.repoId,
        source: "monitor" as const,
        scanId: scan._id,
        ruleId: f.ruleId,
        category: f.ruleId,
        severity: f.severity,
        policyAction,
        message: f.message,
        suggestion: f.suggestion ?? "",
        file: f.file,
        line: f.line,
        codeSnippet: f.codeSnippet,
        headSha,
        detectedBy: f.detectedBy,
        detectedAt: new Date(),
      };
    });

    if (auditDocs.length > 0) {
      await SecurityAuditLog.insertMany(auditDocs, { ordered: false });
    }

    // Mark stale findings as resolved.
    let resolvedCount = 0;
    if (prevAuditEntries.length > 0) {
      const staleIds = prevAuditEntries
        .filter((e) => !fingerprintNew.has(`${e.ruleId}|${e.file}|${e.line ?? -1}`))
        .map((e) => e._id);
      if (staleIds.length > 0) {
        // Use direct collection update so we can $set the resolution fields
        // without tripping the schema's `pre("save")` hook (which is meant
        // to block tampering, not auto-resolution).
        await SecurityAuditLog.updateMany(
          { _id: { $in: staleIds } },
          {
            $set: {
              resolvedAt: new Date(),
              resolution: "fixed",
            },
          },
        );
        resolvedCount = staleIds.length;
      }
    }

    // Aggregate counts.
    const counts = aggregateCounts(auditDocs);
    counts.new = newCount;
    counts.resolved = resolvedCount;
    const halt = counts.block > 0;

    // Update SecurityScan.
    await SecurityScan.updateOne(
      { _id: scan._id },
      {
        $set: {
          state: "complete",
          completedAt: new Date(),
          durationMs: Date.now() - start,
          halt,
          counts,
          filesScanned: ciFiles.length,
        },
      },
    );

    // Update SecurityMonitor.
    monitor.lastScanAt = new Date();
    if (counts.total === 0) monitor.lastCleanAt = new Date();
    await monitor.save();

    // Cache pipeline-halt decision for the runtime Action (Step 6 reads this).
    await cachePipelineDecision({
      repoId: monitor.repoId.toString(),
      headSha,
      halt,
      reasons: auditDocs
        .filter((d) => d.policyAction === "block")
        .slice(0, 10)
        .map((d) => `[${d.ruleId}] ${d.message}`),
    });

    // ── Alerts ──
    // Fire when this scan introduced any *new* blocking finding, OR when
    // there's a pre-existing block but the user hasn't been alerted recently.
    // For now we keep the simple rule: only on new block findings, so
    // re-runs of the same dirty commit don't spam.
    if (newCount > 0 && halt) {
      const blockingDocs = auditDocs.filter(
        (d) => d.policyAction === "block",
      );
      await fireAlerts({
        monitor,
        owner,
        repoFullName: repo.fullName,
        headSha,
        trigger,
        counts,
        newCount,
        blockingFindings: blockingDocs,
        socketUserId,
      });
    }

    emitSafe(
      "security:scan-complete",
      {
        scanId: scan._id,
        repoId: monitor.repoId,
        halt,
        counts,
      },
      socketUserId,
    );

    console.log(
      `[SecurityJob] ${repo.fullName} scan complete: ${counts.total} findings (${counts.block} block, ${counts.warn} warn), halt=${halt}, new=${counts.new}, resolved=${counts.resolved}`,
    );
  } catch (err: any) {
    console.error(`[SecurityJob] Failed for ${repo.fullName}:`, err.message);
    Sentry.captureException(err, {
      tags: { feature: "lgtm-security", monitorId: monitor._id.toString() },
    });
    await SecurityScan.updateOne(
      { _id: scan._id },
      {
        $set: {
          state: "failed",
          completedAt: new Date(),
          durationMs: Date.now() - start,
          error: err.message?.slice(0, 500) ?? "unknown",
        },
      },
    );
    emitSafe(
      "security:scan-failed",
      { scanId: scan._id, repoId: monitor.repoId, error: err.message },
      socketUserId,
    );
    throw err; // BullMQ retry
  }
}

// ---- helpers ---------------------------------------------------------------

interface ScanCounts {
  total: number;
  block: number;
  warn: number;
  info: number;
  new: number;
  resolved: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

function emptyCounts(): ScanCounts {
  return {
    total: 0,
    block: 0,
    warn: 0,
    info: 0,
    new: 0,
    resolved: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

function aggregateCounts(
  docs: Array<{
    policyAction: "block" | "warn" | "info";
    severity: "critical" | "high" | "medium" | "low" | "info";
  }>,
): ScanCounts {
  const c = emptyCounts();
  for (const d of docs) {
    c.total++;
    if (d.policyAction === "block") c.block++;
    else if (d.policyAction === "warn") c.warn++;
    else c.info++;
    c.bySeverity[d.severity]++;
  }
  return c;
}

async function finalizeCleanScan(
  scanId: mongoose.Types.ObjectId,
  monitorId: mongoose.Types.ObjectId,
  repoId: string,
  headSha: string,
): Promise<void> {
  // Resolve any previously-open monitor findings since the new scan is clean.
  await SecurityAuditLog.updateMany(
    { monitorId, source: "monitor", resolvedAt: { $exists: false } },
    { $set: { resolvedAt: new Date(), resolution: "fixed" } },
  );
  await SecurityScan.updateOne(
    { _id: scanId },
    {
      $set: {
        state: "complete",
        completedAt: new Date(),
        halt: false,
        filesScanned: 0,
      },
    },
  );
  // Cache a clean decision so the runtime Action doesn't block.
  await cachePipelineDecision({
    repoId,
    headSha,
    halt: false,
    reasons: [],
  });
}

async function cachePipelineDecision(args: {
  repoId: string;
  headSha: string;
  halt: boolean;
  reasons: string[];
}): Promise<void> {
  if (!redis) return;
  const key = `pipeline:decision:${args.repoId}:${args.headSha}`;
  const body = JSON.stringify({
    halt: args.halt,
    reasons: args.reasons,
    computedAt: new Date().toISOString(),
  });
  try {
    await redis.set(key, body, "EX", PIPELINE_DECISION_TTL_SECONDS);
  } catch (err: any) {
    console.error(`[SecurityJob] Failed to cache pipeline decision:`, err.message);
  }
}

async function resolveDefaultBranchHead(
  repoFullName: string,
  installationToken: string,
): Promise<string | null> {
  try {
    const res = await githubAppFetch(
      `/repos/${repoFullName}`,
      installationToken,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { default_branch?: string };
    if (!data.default_branch) return null;
    const branchRes = await githubAppFetch(
      `/repos/${repoFullName}/branches/${encodeURIComponent(data.default_branch)}`,
      installationToken,
    );
    if (!branchRes.ok) return null;
    const branchData = (await branchRes.json()) as { commit?: { sha?: string } };
    return branchData.commit?.sha ?? null;
  } catch (err: any) {
    console.error(`[SecurityJob] resolveDefaultBranchHead failed:`, err.message);
    return null;
  }
}

interface FetchedFile {
  path: string;
  content: string;
}

/**
 * Fetch all CI-relevant files at a given SHA. We list directories first to
 * discover workflow + action files (which can be named anything), then try
 * a static set of known root files (Dockerfile, lockfiles, etc.).
 */
async function fetchCiFiles(
  repoFullName: string,
  sha: string,
  installationToken: string,
): Promise<FetchedFile[]> {
  const out: FetchedFile[] = [];

  // 1. Workflow + composite-action files (recursive list of subdirs)
  for (const dir of CI_DIRS_TO_LIST) {
    const paths = await listFilesRecursive(repoFullName, dir, sha, installationToken);
    for (const p of paths) {
      if (!isCiRelevantPath(p)) continue;
      const content = await fetchFileContent(repoFullName, p, sha, installationToken);
      if (content !== null) out.push({ path: p, content });
    }
  }

  // 2. Known-name root files (try each, ignore 404s)
  for (const candidate of ROOT_FILES_TO_TRY) {
    const content = await fetchFileContent(repoFullName, candidate, sha, installationToken);
    if (content !== null) out.push({ path: candidate, content });
  }

  return out;
}

async function listFilesRecursive(
  repoFullName: string,
  dir: string,
  sha: string,
  installationToken: string,
): Promise<string[]> {
  const out: string[] = [];
  try {
    const res = await githubAppFetch(
      `/repos/${repoFullName}/contents/${encodeURIComponent(dir)}?ref=${sha}`,
      installationToken,
    );
    if (!res.ok) return out; // 404 is normal — not every repo has actions
    const items = (await res.json()) as Array<{
      type: "file" | "dir";
      path: string;
      name: string;
    }>;
    if (!Array.isArray(items)) return out;
    for (const item of items) {
      if (item.type === "file") {
        out.push(item.path);
      } else if (item.type === "dir") {
        const sub = await listFilesRecursive(repoFullName, item.path, sha, installationToken);
        out.push(...sub);
      }
    }
  } catch {
    // ignore — best effort
  }
  return out;
}

async function fetchFileContent(
  repoFullName: string,
  path: string,
  sha: string,
  installationToken: string,
): Promise<string | null> {
  try {
    const res = await githubAppFetch(
      `/repos/${repoFullName}/contents/${encodeURIComponent(path)}?ref=${sha}`,
      installationToken,
      { headers: { Accept: "application/vnd.github.raw+json" } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    // Cap file size at ~150KB; security configs are tiny in practice and
    // huge files almost always indicate vendored binaries we shouldn't scan.
    return text.length > 150 * 1024 ? text.slice(0, 150 * 1024) : text;
  } catch {
    return null;
  }
}

// ---- worker initialization -------------------------------------------------

export function startSecurityWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    console.warn("[SecurityJob] No REDIS_URL — worker NOT started");
    return null;
  }
  if (process.env.SECURITY_MONITOR_ENABLED === "false") {
    console.warn(
      "[SecurityJob] SECURITY_MONITOR_ENABLED=false — worker NOT started (kill switch)",
    );
    return null;
  }

  const worker = new Worker<SecurityJobData>(
    "security",
    async (job) => processSecurityJob(job),
    {
      connection,
      concurrency: 4,
    },
  );

  worker.on("ready", () => console.log("[SecurityJob] Worker ready"));
  worker.on("error", (err) =>
    console.error(`[SecurityJob] Worker error:`, err.message),
  );
  worker.on("failed", (job, err) => {
    console.error(
      `[SecurityJob] Job ${job?.id} failed:`,
      err.message?.slice(0, 200),
    );
  });
  worker.on("active", (job) => {
    console.log(
      `[SecurityJob] Job ${job.id} active (monitor=${job.data.monitorId}, trigger=${job.data.trigger})`,
    );
  });

  console.log("[SecurityJob] Worker started");
  return worker;
}

/**
 * Convenience: enqueue a scan job. Used by the controller's "scan now"
 * button, by the webhook's push handler, by the cron, and by the
 * enrollment flow's backfill.
 */
export async function enqueueSecurityScan(
  data: SecurityJobData,
  opts?: { jobId?: string },
): Promise<void> {
  if (!securityQueue) {
    console.warn("[SecurityJob] securityQueue unavailable — scan dropped");
    return;
  }
  await securityQueue.add("security-scan", data, {
    jobId: opts?.jobId,
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 200 },
  });
}

/**
 * Fire alerts (in-app + email) when new blocking findings land. Each path
 * is independently best-effort — an SMTP outage shouldn't drop the in-app
 * notification, and vice versa.
 */
async function fireAlerts(args: {
  monitor: import("../models/SecurityMonitor").ISecurityMonitor;
  owner: import("../models/User").IUser;
  repoFullName: string;
  headSha: string;
  trigger: SecurityJobData["trigger"];
  counts: ScanCounts;
  newCount: number;
  blockingFindings: Array<{
    ruleId: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    message: string;
    file: string;
    line?: number;
  }>;
  socketUserId: string;
}): Promise<void> {
  const { monitor, owner, repoFullName, headSha, trigger, counts, newCount, blockingFindings, socketUserId } = args;

  // 1. In-app notification (controlled by monitor.notify.inApp)
  if (monitor.notify.inApp) {
    try {
      await Notification.create({
        userId: monitor.enabledBy,
        type: "critical_security",
        message: `LGTM Security: ${counts.block} blocking issue(s) on ${repoFullName}`,
        repoFullName,
      });
      emitSafe(
        "notification:new",
        { userId: monitor.enabledBy.toString() },
        socketUserId,
      );
    } catch (err: any) {
      console.error(`[SecurityJob] In-app notification error:`, err.message);
    }
  }

  // 2. Email alert (controlled by monitor.notify.email)
  if (monitor.notify.email) {
    if (!owner.email || !owner.email.includes("@")) {
      console.warn(
        `[SecurityJob] Skipping email alert for monitor ${monitor._id}: owner has no email`,
      );
    } else {
      try {
        const clientUrl =
          process.env.CLIENT_URL?.replace(/\/+$/, "") ?? "https://nmithacks.vercel.app";
        const dashboardUrl = `${clientUrl}/dashboard/security/${monitor.repoId.toString()}`;
        const rendered = renderSecurityAlertEmail({
          repoFullName,
          headSha,
          trigger,
          findings: blockingFindings,
          newCount,
          counts: { block: counts.block, warn: counts.warn },
          dashboardUrl,
        });
        const result = await sendEmail({
          to: owner.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        if (result.ok === true) {
          console.log(
            `[SecurityJob] Email alert sent to ${owner.email} (${result.messageId})`,
          );
        } else {
          console.warn(
            `[SecurityJob] Email alert not sent (${result.reason}) for monitor ${monitor._id}`,
          );
        }
      } catch (err: any) {
        console.error(`[SecurityJob] Email alert error:`, err.message);
      }
    }
  }
}
