/**
 * LGTM Security controllers — repo enrollment, policy management, audit log.
 *
 * Mounted at `/security/*`. All endpoints require the standard auth
 * middleware (handled at the route level).
 *
 * Plan tier gate (per STEP-0 decisions):
 *   - free: 1 enrolled repo
 *   - pro:  unlimited
 * Returns HTTP 402 with `code: "plan_limit_reached"` when exceeded — matches
 * the shape the CLI already handles for review limits.
 */
import { Request, Response } from "express";
import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { SecurityAuditLog } from "../models/SecurityAuditLog";
import { SecurityScan } from "../models/SecurityScan";
import { PR } from "../models/PR";
import { enqueueSecurityScan } from "../jobs/security.job";
import { DEFAULT_POLICY, type SecurityPolicy } from "../security/default-policy";

const FREE_MONITOR_LIMIT = 1;

function isPro(user: { billing: { plan: string; subscriptionStatus?: string } }): boolean {
  return user.billing.plan === "pro" && user.billing.subscriptionStatus === "active";
}

/**
 * POST /security/enroll
 * Body: { repoId: string }
 * Enrolls a repo in LGTM Security with the default policy snapshot.
 */
export async function enroll(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.body as { repoId?: string };

  if (!repoId) {
    res.status(400).json({ error: "repoId is required" });
    return;
  }

  const [user, repo] = await Promise.all([
    User.findById(userId),
    Repo.findById(repoId),
  ]);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!repo || !repo.isActive) {
    res.status(404).json({ error: "Repo not found or inactive" });
    return;
  }
  // Authorization: only the user who connected the repo can enroll it.
  if (repo.connectedBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized to enroll this repo" });
    return;
  }

  // Plan tier gate — count CURRENT enrollments (not including the one we're about to create)
  if (!isPro(user)) {
    const currentCount = await SecurityMonitor.countDocuments({
      enabledBy: userId,
      status: { $ne: "paused" }, // paused doesn't count against the cap
    });
    // If a monitor for this repo already exists, we're updating, not creating —
    // skip the cap check.
    const existing = await SecurityMonitor.findOne({ repoId });
    if (!existing && currentCount >= FREE_MONITOR_LIMIT) {
      res.status(402).json({
        error: `Free plan allows ${FREE_MONITOR_LIMIT} enrolled repo. Upgrade to Pro for unlimited.`,
        code: "plan_limit_reached",
        limit: FREE_MONITOR_LIMIT,
      });
      return;
    }
  }

  // Idempotent upsert: re-enrolling an existing monitor reactivates it but
  // does not overwrite the user's customized policy.
  const existing = await SecurityMonitor.findOne({ repoId });
  const monitor = await SecurityMonitor.findOneAndUpdate(
    { repoId },
    {
      $setOnInsert: {
        repoId,
        enabledBy: userId,
        enabledAt: new Date(),
        policy: { ...DEFAULT_POLICY },
      },
      $set: {
        status: "active",
      },
    },
    { upsert: true, new: true },
  );

  // Backfill: kick off an immediate scan so users see their current posture
  // instead of waiting for the next push. Skip on re-enroll where the monitor
  // already had a recent scan.
  if (!existing) {
    try {
      await enqueueSecurityScan(
        { monitorId: monitor._id.toString(), trigger: "enrollment" },
        { jobId: `security-enroll-${monitor._id}` },
      );
    } catch (err: any) {
      // Non-fatal — enrollment still succeeded.
      console.error(`[Security] Backfill scan enqueue failed:`, err.message);
    }
  }

  res.status(201).json({
    id: monitor._id,
    repoId: monitor.repoId,
    repoFullName: repo.fullName,
    status: monitor.status,
    enabledAt: monitor.enabledAt,
    policyVersion: monitor.policy.policyVersion,
  });
}

/**
 * DELETE /security/repos/:repoId
 * Unenrolls a repo. Audit log entries are NOT deleted — they survive
 * unenroll/re-enroll cycles for compliance.
 */
export async function unenroll(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;

  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized to unenroll this repo" });
    return;
  }

  await SecurityMonitor.deleteOne({ _id: monitor._id });
  res.json({ ok: true });
}

/**
 * POST /security/repos/:repoId/pause  /  /resume
 */
export async function pause(req: Request, res: Response): Promise<void> {
  await setStatus(req, res, "paused");
}
export async function resume(req: Request, res: Response): Promise<void> {
  await setStatus(req, res, "active");
}
async function setStatus(
  req: Request,
  res: Response,
  status: "active" | "paused",
): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  monitor.status = status;
  await monitor.save();
  res.json({ id: monitor._id, status: monitor.status });
}

/**
 * GET /security/repos
 * Lists all repos the current user has enrolled. Includes posture summary
 * (open critical/high counts) for the dashboard.
 */
export async function listEnrolled(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const monitors = await SecurityMonitor.find({ enabledBy: userId })
    .populate({ path: "repoId", select: "fullName isActive owner name" })
    .sort({ enabledAt: -1 })
    .lean();

  // Posture: per-monitor counts of unresolved findings by severity.
  const monitorIds = monitors.map((m) => m._id);
  const counts = await SecurityAuditLog.aggregate<{
    _id: { monitorId: any; severity: string };
    count: number;
  }>([
    {
      $match: {
        monitorId: { $in: monitorIds },
        resolvedAt: { $exists: false },
      },
    },
    {
      $group: {
        _id: { monitorId: "$monitorId", severity: "$severity" },
        count: { $sum: 1 },
      },
    },
  ]);

  const postureByMonitor = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const key = String(row._id.monitorId);
    if (!postureByMonitor.has(key)) postureByMonitor.set(key, {});
    postureByMonitor.get(key)![row._id.severity] = row.count;
  }

  res.json({
    monitors: monitors.map((m) => {
      const repo = m.repoId as unknown as { fullName?: string; isActive?: boolean } | null;
      return {
        id: m._id,
        repoId: typeof m.repoId === "object" && m.repoId !== null
          ? (m.repoId as { _id: any })._id
          : m.repoId,
        repoFullName: repo?.fullName ?? "(unknown)",
        repoActive: repo?.isActive ?? false,
        status: m.status,
        enabledAt: m.enabledAt,
        lastScanAt: m.lastScanAt,
        lastCleanAt: m.lastCleanAt,
        policyVersion: m.policy.policyVersion,
        posture: postureByMonitor.get(String(m._id)) ?? {},
      };
    }),
  });
}

/**
 * GET /security/repos/:repoId
 * Detailed view of a single enrolled repo: monitor doc + recent audit log.
 */
export async function getMonitor(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;

  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const repo = await Repo.findById(repoId).select("fullName owner name isActive").lean();
  if (!repo) {
    res.status(404).json({ error: "Repo not found" });
    return;
  }

  res.json({
    id: monitor._id,
    repoId: monitor.repoId,
    repoFullName: repo.fullName,
    status: monitor.status,
    enabledAt: monitor.enabledAt,
    lastScanAt: monitor.lastScanAt,
    lastCleanAt: monitor.lastCleanAt,
    policy: monitor.policy,
    notify: monitor.notify,
  });
}

/**
 * PATCH /security/repos/:repoId/policy
 * Update the monitor's policy. Body: partial { rules?, allowlist? }.
 */
export async function updatePolicy(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const body = req.body as Partial<Pick<SecurityPolicy, "rules" | "allowlist">>;

  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // Merge — don't replace. Keeps unspecified rules at their current setting.
  if (body.rules) {
    monitor.policy.rules = { ...monitor.policy.rules, ...body.rules };
  }
  if (body.allowlist) {
    monitor.policy.allowlist = {
      actions: body.allowlist.actions ?? monitor.policy.allowlist.actions,
      domains: body.allowlist.domains ?? monitor.policy.allowlist.domains,
      runners: body.allowlist.runners ?? monitor.policy.allowlist.runners,
    };
  }
  // Mongoose can't auto-detect Mixed-type changes
  monitor.markModified("policy");
  await monitor.save();

  res.json({ ok: true, policy: monitor.policy });
}

/**
 * GET /security/repos/:repoId/rule-stats
 *
 * Aggregates per-rule signal: total findings, how many are still open, how
 * many were marked false-positive. Used by the policy editor to surface
 * "this rule is 80% noise for your stack — consider muting" indicators.
 *
 * Counts only the audit log for this monitor; cross-repo learning is a
 * v2 concern. We return the raw numbers and let the client do the framing
 * so we don't bake "noise" thresholds into the API.
 */
export async function ruleStats(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // Aggregation: group findings by ruleId, count totals + each resolution.
  const rows = await SecurityAuditLog.aggregate<{
    _id: string;
    total: number;
    open: number;
    fixed: number;
    falsePositive: number;
    muted: number;
    lastSeen: Date;
  }>([
    { $match: { monitorId: monitor._id } },
    {
      $group: {
        _id: "$ruleId",
        total: { $sum: 1 },
        open: {
          $sum: { $cond: [{ $eq: [{ $type: "$resolvedAt" }, "missing"] }, 1, 0] },
        },
        fixed: {
          $sum: { $cond: [{ $eq: ["$resolution", "fixed"] }, 1, 0] },
        },
        falsePositive: {
          $sum: { $cond: [{ $eq: ["$resolution", "false-positive"] }, 1, 0] },
        },
        muted: {
          $sum: { $cond: [{ $eq: ["$resolution", "muted"] }, 1, 0] },
        },
        lastSeen: { $max: "$detectedAt" },
      },
    },
  ]);

  res.json({
    rules: rows.map((r) => {
      // FP rate is computed only over *resolved* findings — open ones haven't
      // had a verdict yet. Avoids the early-days bias where every rule looks
      // like 0% FP just because nobody's reviewed anything yet.
      const resolved = r.fixed + r.falsePositive + r.muted;
      const fpRate = resolved > 0 ? r.falsePositive / resolved : null;
      return {
        ruleId: r._id,
        total: r.total,
        open: r.open,
        fixed: r.fixed,
        falsePositive: r.falsePositive,
        muted: r.muted,
        resolved,
        fpRate, // null when no resolutions yet — UI shows "—" instead of "0%"
        lastSeen: r.lastSeen,
      };
    }),
  });
}

/**
 * GET /security/repos/:repoId/audit
 * Returns recent audit log entries for a repo. Filterable.
 *
 * Query: severity?, ruleId?, source?, resolved? (all|open|resolved), limit?
 */
export async function listAudit(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;

  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const q: Record<string, unknown> = { monitorId: monitor._id };
  if (typeof req.query.severity === "string") q.severity = req.query.severity;
  if (typeof req.query.ruleId === "string") q.ruleId = req.query.ruleId;
  if (typeof req.query.source === "string") q.source = req.query.source;
  if (req.query.resolved === "open") q.resolvedAt = { $exists: false };
  if (req.query.resolved === "resolved") q.resolvedAt = { $exists: true };

  // PR-number filter: accepts numeric or "#42" / "PR42" / "PR #42" forms.
  if (typeof req.query.prNumber === "string" && req.query.prNumber.trim() !== "") {
    const m = /\d+/.exec(req.query.prNumber);
    if (m) q.prNumber = Number(m[0]);
  }

  // Text search across message / file / ruleId. Mongo $regex is fine here
  // because the working set is small (one monitor's audit log) and we cap
  // at 1000 rows. We escape user input to avoid regex injection.
  if (typeof req.query.q === "string" && req.query.q.trim() !== "") {
    const safe = escapeRegex(req.query.q.trim());
    q.$or = [
      { message: { $regex: safe, $options: "i" } },
      { file: { $regex: safe, $options: "i" } },
      { ruleId: { $regex: safe, $options: "i" } },
    ];
  }

  const limit = Math.min(Number(req.query.limit) || 200, 1000);

  const entries = await SecurityAuditLog.find(q)
    .sort({ detectedAt: -1 })
    .limit(limit)
    .lean();

  // Batch-fetch PR titles for any entries that have a prNumber. Single
  // round-trip — no per-row N+1.
  const prNumbers = Array.from(
    new Set(
      entries
        .map((e) => e.prNumber)
        .filter((n): n is number => typeof n === "number"),
    ),
  );
  let prTitleByNumber = new Map<number, string>();
  if (prNumbers.length > 0) {
    const prRows = await PR.find({
      repoId: monitor.repoId,
      prNumber: { $in: prNumbers },
    })
      .select("prNumber title")
      .lean();
    prTitleByNumber = new Map(prRows.map((p) => [p.prNumber, p.title]));
  }

  res.json({
    entries: entries.map((e) => ({
      id: e._id,
      source: e.source,
      ruleId: e.ruleId,
      severity: e.severity,
      policyAction: e.policyAction,
      message: e.message,
      suggestion: e.suggestion,
      file: e.file,
      line: e.line,
      codeSnippet: e.codeSnippet,
      headSha: e.headSha,
      prNumber: e.prNumber,
      prTitle:
        typeof e.prNumber === "number"
          ? prTitleByNumber.get(e.prNumber) ?? null
          : null,
      detectedAt: e.detectedAt,
      detectedBy: e.detectedBy,
      resolvedAt: e.resolvedAt,
      resolution: e.resolution,
    })),
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * PATCH /security/repos/:repoId/notify
 * Update notification preferences for a monitor. Body: partial of
 * { onBlock, onWarn, inApp, email }.
 */
export async function updateNotify(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const body = req.body as Partial<{
    onBlock: boolean;
    onWarn: boolean;
    inApp: boolean;
    email: boolean;
  }>;

  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // Only update keys that were explicitly provided (and only the ones we know).
  const allowed: Array<keyof NonNullable<typeof body>> = [
    "onBlock",
    "onWarn",
    "inApp",
    "email",
  ];
  for (const key of allowed) {
    if (typeof body[key] === "boolean") {
      monitor.notify[key] = body[key] as boolean;
    }
  }
  await monitor.save();
  res.json({ ok: true, notify: monitor.notify });
}

/**
 * POST /security/repos/:repoId/scan
 * Manually trigger a scan. Used by the "Run scan now" button.
 */
export async function triggerScan(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  if (monitor.status === "paused") {
    res
      .status(409)
      .json({ error: "Monitor is paused. Resume before scanning." });
    return;
  }

  try {
    await enqueueSecurityScan({
      monitorId: monitor._id.toString(),
      trigger: "manual",
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message ?? "Failed to enqueue scan" });
    return;
  }

  res.status(202).json({ accepted: true });
}

/**
 * POST /security/repos/:repoId/prs/:prNumber/rescan
 * Re-trigger a PR review for a specific PR number on this repo. Used by the
 * "Rescan PR" button on audit log cards.
 *
 * Distinct from `POST /security/repos/:repoId/scan` (default-branch HEAD)
 * because users want to re-evaluate a specific PR's commit without scanning
 * main. Internally this enqueues a review job on the existing reviewQueue,
 * same path as `POST /api/prs/:id/review` — just keyed by prNumber instead
 * of PR doc id since the audit log card doesn't carry the doc id.
 */
export async function rescanPr(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId, prNumber } = req.params;
  const prNumberInt = Number(prNumber);
  if (!Number.isInteger(prNumberInt) || prNumberInt <= 0) {
    res.status(400).json({ error: "prNumber must be a positive integer" });
    return;
  }

  // Authorization: scope to the user's monitor for this repo. If they don't
  // own the monitor, treat the repo as not-tracked (avoids leaking repo
  // existence to other users).
  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor || monitor.enabledBy.toString() !== userId) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }

  // Find the PR doc; we need its full row to re-enqueue with the same
  // shape `reviewQueue.add("pr-review", ...)` expects.
  const { PR } = await import("../models/PR");
  const pr = await PR.findOne({ repoId, prNumber: prNumberInt });
  if (!pr) {
    res
      .status(404)
      .json({ error: `PR #${prNumberInt} not found for this repo` });
    return;
  }

  if (pr.status === "reviewing") {
    res.status(409).json({
      error: "Review already in progress for this PR",
      code: "review_in_progress",
    });
    return;
  }

  // Lazy-import the queue + repo for the same reason elsewhere — keeps the
  // security controller free of cyclic deps with jobs/.
  const { reviewQueue } = await import("../jobs/queue");
  if (!reviewQueue) {
    res.status(503).json({ error: "Review queue not available" });
    return;
  }

  const repo = await Repo.findById(repoId).select(
    "fullName settings",
  );
  if (!repo) {
    res.status(404).json({ error: "Repo not found" });
    return;
  }

  pr.status = "reviewing";
  await pr.save();

  await reviewQueue.add("pr-review", {
    repoId: repoId,
    repoFullName: repo.fullName,
    prNumber: pr.prNumber,
    prTitle: pr.title,
    prBody: pr.body,
    headSha: pr.headSha,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    action: "manual-rescan-from-security",
    sender: pr.author.login,
    senderAvatarUrl: pr.author.avatarUrl,
    githubCreatedAt: pr.githubCreatedAt?.toISOString(),
  });

  res.status(202).json({ accepted: true, prId: pr._id, prNumber: pr.prNumber });
}

/**
 * GET /security/repos/:repoId/scans
 * Recent scan executions for a repo. Used by the "Recent scans" table.
 */
export async function listScans(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { repoId } = req.params;
  const monitor = await SecurityMonitor.findOne({ repoId });
  if (!monitor) {
    res.status(404).json({ error: "Repo is not enrolled in LGTM Security" });
    return;
  }
  if (monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const scans = await SecurityScan.find({ monitorId: monitor._id })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
  res.json({
    scans: scans.map((s) => ({
      id: s._id,
      trigger: s.trigger,
      state: s.state,
      headSha: s.headSha,
      halt: s.halt,
      counts: s.counts,
      filesScanned: s.filesScanned,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      error: s.error,
    })),
  });
}

/**
 * PATCH /security/audit/:id  (resolve / mute / mark false-positive)
 */
export async function resolveAuditEntry(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
  const { resolution, note } = req.body as {
    resolution?: "fixed" | "muted" | "false-positive";
    note?: string;
  };

  if (!resolution || !["fixed", "muted", "false-positive"].includes(resolution)) {
    res.status(400).json({ error: "resolution must be one of: fixed, muted, false-positive" });
    return;
  }

  const entry = await SecurityAuditLog.findById(id);
  if (!entry) {
    res.status(404).json({ error: "Audit entry not found" });
    return;
  }

  // Authorization: the user must own the monitor that owns the entry.
  const monitor = await SecurityMonitor.findById(entry.monitorId);
  if (!monitor || monitor.enabledBy.toString() !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  entry.resolution = resolution;
  entry.resolvedAt = new Date();
  // resolvedBy is a Types.ObjectId; the auth middleware gives us a string.
  // Mongoose will coerce a valid ObjectId string for us.
  (entry.resolvedBy as unknown) = userId;
  if (note) entry.resolvedNote = note;
  await entry.save();

  res.json({
    id: entry._id,
    resolution: entry.resolution,
    resolvedAt: entry.resolvedAt,
  });
}
