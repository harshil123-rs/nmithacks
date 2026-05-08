/**
 * Cron-style scheduled security scans.
 *
 * Iterates active monitors and enqueues a scan for each. The cadence is
 * plan-tier dependent (Step 0 decision):
 *   - Pro plan: daily
 *   - Free plan: weekly
 *
 * Implementation note: BullMQ has a built-in JobScheduler, but it requires
 * one repeat config per repo and gets messy when monitors come and go.
 * We do it the simpler way: a single setInterval at the application level
 * that fans out enqueues. Drift on the precise time-of-day is fine — the
 * actual scan runs whenever the worker picks the job up.
 */
import { SecurityMonitor } from "../models/SecurityMonitor";
import { User } from "../models/User";
import { enqueueSecurityScan } from "./security.job";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PRO_RESCAN_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const FREE_RESCAN_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

let timer: NodeJS.Timeout | null = null;

export function startSecurityCron() {
  if (process.env.SECURITY_MONITOR_ENABLED === "false") {
    console.log("[SecurityCron] Disabled via env (SECURITY_MONITOR_ENABLED=false)");
    return null;
  }
  if (timer) return timer;

  console.log(
    `[SecurityCron] Starting — checks every ${CHECK_INTERVAL_MS / 60_000} min`,
  );

  // Run once at startup, then on the interval.
  void runOnce();
  timer = setInterval(() => void runOnce(), CHECK_INTERVAL_MS);
  return timer;
}

export function stopSecurityCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runOnce(): Promise<void> {
  try {
    const now = Date.now();
    const monitors = await SecurityMonitor.find({ status: "active" })
      .select("_id repoId enabledBy lastScanAt")
      .lean();

    if (monitors.length === 0) return;

    // Resolve each owner's plan in one batched query.
    const ownerIds = Array.from(new Set(monitors.map((m) => String(m.enabledBy))));
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select("_id billing.plan billing.subscriptionStatus")
      .lean();
    const planOf = new Map<string, "pro" | "free">();
    for (const o of owners) {
      const isPro =
        o.billing?.plan === "pro" && o.billing?.subscriptionStatus === "active";
      planOf.set(String(o._id), isPro ? "pro" : "free");
    }

    let dispatched = 0;
    for (const m of monitors) {
      const plan = planOf.get(String(m.enabledBy)) ?? "free";
      const ageThreshold =
        plan === "pro" ? PRO_RESCAN_AGE_MS : FREE_RESCAN_AGE_MS;
      const lastScanAge = m.lastScanAt
        ? now - new Date(m.lastScanAt).getTime()
        : Infinity;
      if (lastScanAge < ageThreshold) continue;

      await enqueueSecurityScan(
        { monitorId: String(m._id), trigger: "schedule" },
        // Idempotency: don't double-schedule the same monitor for the same
        // calendar day. BullMQ rejects duplicate jobIds within retention.
        { jobId: `security-cron-${m._id}-${dayKey()}` },
      );
      dispatched++;
    }

    if (dispatched > 0) {
      console.log(
        `[SecurityCron] Dispatched ${dispatched} scheduled scan(s) (of ${monitors.length} active monitors)`,
      );
    }
  } catch (err: any) {
    console.error("[SecurityCron] Tick failed:", err.message);
  }
}

function dayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${d.getUTCMonth() + 1}${d.getUTCDate()}`;
}
