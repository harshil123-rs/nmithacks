/**
 * Pipeline decision endpoint — read by the LGTM Security runtime Action.
 *
 * The runtime Action runs as the first step of customer CI jobs. It hits
 * GET /pipeline/decision?repo=<full-name>&sha=<commit> with a long-lived
 * API token, and exits non-zero on `halt: true`. That's how we actually
 * stop a CI pipeline (vs. just blocking the merge via the Checks API).
 *
 * The decision is the one cached by `security.job.ts` after each scan, at
 * Redis key `pipeline:decision:{repoId}:{headSha}`. TTL 24h.
 *
 * Soft-fail contract:
 *   - 404 = no decision computed for this commit (Action treats as pass)
 *   - 200 = decision exists, may be halt:true or halt:false
 *   - 5xx = our service is degraded (Action soft-fails — never break CI)
 *
 * The Action *must not* fail-closed on non-200 because that would take
 * down customer CI on every LGTM outage. See lgtm-action/src/index.ts.
 */
import type { Request, Response } from "express";
import { redis } from "../config/redis";
import { Repo } from "../models/Repo";
import { SecurityMonitor } from "../models/SecurityMonitor";

export async function getPipelineDecision(
  req: Request,
  res: Response,
): Promise<void> {
  const repoFullName = (req.query.repo as string | undefined)?.trim();
  const headSha = (req.query.sha as string | undefined)?.trim();

  if (!repoFullName || !headSha) {
    res.status(400).json({ error: "Both 'repo' and 'sha' query params are required" });
    return;
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
    res.status(400).json({ error: "Invalid 'repo' format (expected owner/repo)" });
    return;
  }
  if (!/^[a-f0-9]{7,40}$/i.test(headSha)) {
    res.status(400).json({ error: "Invalid 'sha' format" });
    return;
  }

  // Resolve the repo so we can build the canonical Redis key. Authorization:
  // the API token's owner must own the repo (i.e. be the user who connected
  // it). Without this check, any token holder could probe arbitrary repos.
  const repo = await Repo.findOne({ fullName: repoFullName, isActive: true });
  if (!repo) {
    res.status(404).json({
      halt: false,
      reasons: [],
      reason: "repo-not-tracked",
    });
    return;
  }
  if (repo.connectedBy.toString() !== req.apiToken!.userId) {
    // Don't 403 here — that leaks repo existence to other tokens. Treat as
    // not found from this token's perspective.
    res.status(404).json({
      halt: false,
      reasons: [],
      reason: "repo-not-tracked",
    });
    return;
  }

  // Confirm the repo is enrolled in LGTM Security. If it isn't, the runtime
  // Action shouldn't have anything to evaluate — return 404.
  const monitor = await SecurityMonitor.findOne({ repoId: repo._id }).select("_id status");
  if (!monitor) {
    res.status(404).json({
      halt: false,
      reasons: [],
      reason: "repo-not-enrolled",
    });
    return;
  }
  if (monitor.status === "paused") {
    res.status(200).json({
      halt: false,
      reasons: [],
      reason: "monitor-paused",
    });
    return;
  }

  if (!redis) {
    // Redis is required for this endpoint — there's no DB-backed fallback
    // for the decision cache. Soft-fail (200 with halt:false) so the
    // runtime Action doesn't block customer CI on our outage.
    res.status(503).json({
      halt: false,
      reasons: [],
      reason: "decision-store-unavailable",
    });
    return;
  }

  const key = `pipeline:decision:${repo._id.toString()}:${headSha}`;
  let raw: string | null;
  try {
    raw = await redis.get(key);
  } catch (err: any) {
    console.error(`[Pipeline] Redis get failed:`, err.message);
    res.status(503).json({
      halt: false,
      reasons: [],
      reason: "decision-store-unavailable",
    });
    return;
  }

  if (!raw) {
    // No scan has run for this exact commit yet. Soft-pass — the worker
    // may pick up the push in seconds, but we can't make the customer's
    // CI block waiting on us.
    res.status(404).json({
      halt: false,
      reasons: [],
      reason: "decision-not-found",
    });
    return;
  }

  let parsed: { halt?: boolean; reasons?: string[]; computedAt?: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    res.status(500).json({
      halt: false,
      reasons: [],
      reason: "decision-parse-error",
    });
    return;
  }

  res.status(200).json({
    halt: !!parsed.halt,
    reasons: parsed.reasons ?? [],
    computedAt: parsed.computedAt,
    repoFullName,
    headSha,
  });
}
