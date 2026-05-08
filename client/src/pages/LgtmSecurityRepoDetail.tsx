/**
 * Per-repo Security detail page (`/dashboard/security/:repoId`).
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Play,
  AlertTriangle,
  Settings as SettingsIcon,
  CheckCircle2,
  Clock,
  Github,
  ExternalLink,
  Filter,
  Download,
  RefreshCw,
  GitPullRequest,
} from "lucide-react";
import {
  getMonitor,
  listAudit,
  listScans,
  rescanPr,
  resolveAuditEntry,
  triggerScan,
  type AuditEntry,
  type MonitorDetail,
  type ScanRow,
  type Severity,
} from "../api/security";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import SearchInput from "../components/ui/SearchInput";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";

function rel(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function severityColor(sev: Severity): string {
  switch (sev) {
    case "critical":
      return "text-destructive bg-destructive/10";
    case "high":
      return "text-yellow-400 bg-yellow-400/10";
    case "medium":
      return "text-orange-400 bg-orange-400/10";
    case "low":
      return "text-blue-400 bg-blue-400/10";
    default:
      return "text-muted-foreground bg-muted/20";
  }
}

const RESOLVED_OPTIONS = [
  { value: "open" as const, label: "Open only" },
  { value: "resolved" as const, label: "Resolved only" },
  { value: "all" as const, label: "All findings" },
];

const SEVERITY_OPTIONS: Array<{ value: Severity | ""; label: string }> = [
  { value: "", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

export default function LgtmSecurityRepoDetail() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on, connected: socketConnected } = useSocket(user?._id);

  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [enqueuing, setEnqueuing] = useState(false);
  /**
   * PR number we just told the server to rescan. We hold this state from the
   * moment the API call resolves until either (a) a scan with this PR's head
   * SHA shows up in the scans list (worker picked it up) or (b) a short
   * timeout elapses. Without this, there's a 1-2s window where the API has
   * returned but the worker hasn't created the SecurityScan row yet, and
   * the banner would disappear → flicker → reappear. Keyed by PR number
   * so the per-card spinner knows which row to highlight.
   */
  const [rescanningPr, setRescanningPr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    severity?: Severity;
    resolved: "all" | "open" | "resolved";
    q: string;
    prNumber: string;
  }>({ resolved: "open", q: "", prNumber: "" });

  /**
   * Derive scan-in-flight state from the data, not from the click handler's
   * promise. That way:
   *   - Refreshing the page mid-scan still shows "scanning" until the worker
   *     marks the row complete.
   *   - Closing the tab and coming back works the same way.
   *   - The button doesn't lie when the API enqueue resolves but the worker
   *     hasn't picked the job up yet.
   */
  const activeScan = useMemo(
    () =>
      scans.find((s) => s.state === "queued" || s.state === "running") ?? null,
    [scans],
  );
  const isScanning = enqueuing || rescanningPr !== null || !!activeScan;

  const refresh = useCallback(async () => {
    if (!repoId) return;
    try {
      setError(null);
      const [m, s, a] = await Promise.all([
        getMonitor(repoId),
        listScans(repoId),
        listAudit(repoId, {
          severity: filter.severity,
          resolved: filter.resolved,
          q: filter.q.trim() || undefined,
          prNumber: filter.prNumber.trim() || undefined,
        }),
      ]);
      setMonitor(m);
      setScans(s);
      setAudit(a);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [repoId, filter]);

  // Initial load + reload when filters change
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Real-time updates via Socket.IO. The server-side worker emits these
   * events as it processes the scan job:
   *   - security:scan-started   (worker picked up the job)
   *   - security:scan-complete  (rules ran, audit log updated)
   *   - security:scan-failed    (worker errored)
   *
   * We filter to the current repo since the user might have multiple
   * monitors and the events are broadcast to their whole user room.
   */
  useEffect(() => {
    if (!repoId) return;
    const cleanups: Array<() => void> = [];

    const handleEvent = (data: { repoId?: string }) => {
      // The repoId on the event payload is the Mongo ObjectId stringified.
      // Compare loosely to handle both string and ObjectId-like values.
      if (String(data?.repoId) !== String(repoId)) return;
      void refresh();
    };

    cleanups.push(on("security:scan-started", handleEvent));
    cleanups.push(on("security:scan-complete", handleEvent));
    cleanups.push(on("security:scan-failed", handleEvent));

    return () => cleanups.forEach((fn) => fn());
  }, [on, repoId, refresh]);

  /**
   * Polling fallback. Runs only while a scan is in flight, OR when the
   * socket isn't connected. Slow cadence (4s) since this is a backstop
   * against missed events, not the primary update mechanism.
   */
  useEffect(() => {
    const needsFallback = !!activeScan && !socketConnected;
    const needsBoot = !!activeScan; // also poll when socket IS connected, in case the user just landed mid-scan and the started event already fired
    if (!needsFallback && !needsBoot) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [activeScan, socketConnected, refresh]);

  /**
   * When the tab regains focus, do an immediate refresh. Covers the case
   * where the user switched tabs, the worker finished while the page was
   * hidden, and they came back — they shouldn't need to wait on the next
   * poll tick.
   */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  /**
   * Clear the per-card rescan spinner once the worker has picked up the job
   * (a queued/running scan now exists in the list) — at that point the
   * banner-level `activeScan` takes over the in-flight UI and the per-card
   * spinner becomes redundant. 8s safety timeout in case the worker never
   * picks up (e.g. queue down), so the spinner doesn't pin forever.
   */
  useEffect(() => {
    if (rescanningPr === null) return;
    if (activeScan) {
      setRescanningPr(null);
      return;
    }
    const t = setTimeout(() => setRescanningPr(null), 8000);
    return () => clearTimeout(t);
  }, [rescanningPr, activeScan]);

  /**
   * Parent-owned rescan handler. Lifts the loading state out of the
   * AuditCard so the page-level banner can show through the API-call
   * window AND the worker-pickup window — same UX as the "Scan default
   * branch" button. Returns an error message to the card so it can render
   * an inline label, or null on success.
   */
  const handleRescanPr = useCallback(
    async (prNumber: number): Promise<string | null> => {
      if (!repoId) return "missing-repo";
      setRescanningPr(prNumber);
      try {
        await rescanPr(repoId, prNumber);
        await refresh();
        return null;
      } catch (err: any) {
        setRescanningPr(null);
        const code = err?.response?.data?.code;
        if (code === "review_in_progress") return "Already running";
        return err?.response?.data?.error ?? err.message ?? "Failed";
      }
    },
    [repoId, refresh],
  );

  if (loading) {
    return (
      <div className="clay p-10 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="space-y-4">
        <Button
          variant="subtle"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate("/dashboard/security")}
        >
          Back
        </Button>
        <div className="clay p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">{error ?? "Repo not enrolled."}</div>
        </div>
      </div>
    );
  }

  const openCounts = audit.reduce<Record<string, number>>((acc, e) => {
    if (e.resolvedAt) return acc;
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {});

  const postureSev =
    (openCounts.critical ?? 0) > 0
      ? "critical"
      : (openCounts.high ?? 0) > 0
        ? "warn"
        : (openCounts.medium ?? 0) + (openCounts.low ?? 0) > 0
          ? "warn"
          : "clean";

  const exportCsv = () => {
    const cols = [
      "detectedAt",
      "ruleId",
      "severity",
      "policyAction",
      "source",
      "file",
      "line",
      "message",
      "headSha",
      "resolution",
    ];
    const rows = audit.map((a) =>
      [
        a.detectedAt,
        a.ruleId,
        a.severity,
        a.policyAction,
        a.source,
        a.file,
        a.line ?? "",
        JSON.stringify(a.message),
        a.headSha,
        a.resolution ?? "",
      ].join(","),
    );
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lgtm-security-${monitor.repoFullName.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtersActive =
    !!filter.q ||
    !!filter.prNumber ||
    !!filter.severity ||
    filter.resolved !== "open";

  return (
    <div className="space-y-6 max-w-6xl">
      <Helmet>
        <title>{monitor.repoFullName} · LGTM Security</title>
      </Helmet>

      {/* ─────────── Top bar: back + title + actions ─────────── */}
      <div className="flex items-start gap-4 flex-wrap">
        <button
          onClick={() => navigate("/dashboard/security")}
          aria-label="Back to LGTM Security"
          className="clay-sm p-2 rounded-xl shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Github className="w-4 h-4 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-bold tracking-tight truncate">
              {monitor.repoFullName}
            </h1>
            <a
              href={`https://github.com/${monitor.repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open on GitHub"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {monitor.status === "paused" && (
              <span className="clay-pill text-[9px] font-bold uppercase px-2 py-0.5 text-yellow-400">
                Paused
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Enrolled {rel(monitor.enabledAt)} · policy v
            {monitor.policy.policyVersion}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/dashboard/security/${repoId}/policy`}>
            <Button variant="ghost" size="sm" icon={SettingsIcon}>
              Edit policy
            </Button>
          </Link>
        </div>
      </div>

      {/* ─────────── Scan-in-progress banner (only when active) ─────────── */}
      {isScanning && (
        <div className="clay p-4 flex items-center gap-3">
          <div className="clay-icon p-2 bg-primary/10 shrink-0">
            <RefreshCw className="w-4 h-4 text-primary animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {(enqueuing || rescanningPr !== null) && !activeScan
                ? rescanningPr !== null
                  ? `Rescanning PR #${rescanningPr}…`
                  : "Queuing scan…"
                : activeScan?.state === "running"
                  ? "Scan in progress"
                  : "Scan queued — waiting for worker"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeScan
                ? `Triggered ${rel(activeScan.startedAt)} · ${activeScan.trigger}${activeScan.headSha ? ` · commit ${activeScan.headSha.slice(0, 7)}` : ""}`
                : rescanningPr !== null
                  ? `Worker will pick up PR #${rescanningPr} in a moment`
                  : "Worker will pick up the job in a moment"}
              {!socketConnected && (
                <span className="text-yellow-400/80">
                  {" "}
                  · live updates offline, polling every 4s
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ─────────── Posture card ─────────── */}
      <div className="clay-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-bold">
              Open findings
            </p>
            {isScanning && (
              <span className="text-primary text-[10px] font-medium flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating…
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={isScanning ? undefined : Play}
            loading={isScanning}
            disabled={monitor.status === "paused"}
            onClick={async () => {
              if (!repoId) return;
              setEnqueuing(true);
              try {
                await triggerScan(repoId);
                await refresh();
              } catch (err: any) {
                setError(err?.response?.data?.error ?? err.message);
              } finally {
                setEnqueuing(false);
              }
            }}
          >
            {isScanning
              ? activeScan?.state === "running"
                ? "Scanning…"
                : "Queued…"
              : "Scan default branch"}
          </Button>
        </div>

        <div
          className={`flex items-center gap-6 flex-wrap transition-opacity ${
            isScanning ? "opacity-60" : ""
          }`}
        >
          <div
            className={`clay-icon p-4 shrink-0 ${
              postureSev === "critical"
                ? "bg-destructive/10"
                : postureSev === "warn"
                  ? "bg-yellow-400/10"
                  : "bg-chart-5/10"
            }`}
          >
            {postureSev === "critical" ? (
              <ShieldAlert className="w-8 h-8 text-destructive" />
            ) : postureSev === "warn" ? (
              <Shield className="w-8 h-8 text-yellow-400" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-chart-5" />
            )}
          </div>
          <div className="flex items-baseline gap-6 flex-wrap">
            <Counter
              value={openCounts.critical ?? 0}
              label="critical"
              color="text-destructive"
            />
            <Counter
              value={openCounts.high ?? 0}
              label="high"
              color="text-yellow-400"
            />
            <Counter
              value={openCounts.medium ?? 0}
              label="medium"
              color="text-orange-400"
            />
            <Counter
              value={openCounts.low ?? 0}
              label="low"
              color="text-blue-400"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-5 flex items-center gap-1.5 flex-wrap pt-4 border-t border-white/5">
          <Clock className="w-3 h-3 shrink-0" />
          Last scan {rel(monitor.lastScanAt)}
          {monitor.lastCleanAt && (
            <span className="text-chart-5/70">
              · last clean {rel(monitor.lastCleanAt)}
            </span>
          )}
        </p>
      </div>

      {/* ─────────── Recent scans (panel) ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-bold">Recent scans</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Every push, schedule tick, and manual trigger
            </p>
          </div>
        </div>
        {scans.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground text-center">
            No scans yet. Click <strong className="text-foreground">Scan default branch</strong> to scan immediately.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-white/5 bg-white/1.5">
                <th className="px-6 py-2.5 font-bold">When</th>
                <th className="px-4 py-2.5 font-bold">Trigger</th>
                <th className="px-4 py-2.5 font-bold">Commit</th>
                <th className="px-4 py-2.5 font-bold">State</th>
                <th className="px-4 py-2.5 font-bold text-right">Findings</th>
                <th className="px-6 py-2.5 font-bold">Decision</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-white/3 last:border-0 hover:bg-white/2 transition-colors"
                >
                  <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {rel(s.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs">{s.trigger}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                    {s.headSha.slice(0, 7)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.state === "complete" ? (
                      <span className="text-chart-5 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> complete
                      </span>
                    ) : s.state === "failed" ? (
                      <span className="text-destructive inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> failed
                      </span>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> {s.state}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-right">
                    <span className="font-bold">{s.counts.total}</span>
                    {s.counts.new > 0 && (
                      <span className="text-yellow-400 ml-1">
                        (+{s.counts.new} new)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-xs">
                    {s.halt ? (
                      <span className="clay-pill px-2 py-0.5 text-destructive font-bold text-[10px]">
                        HALT
                      </span>
                    ) : s.counts.warn > 0 ? (
                      <span className="text-yellow-400">warn</span>
                    ) : s.state === "complete" ? (
                      <span className="text-chart-5">clean</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─────────── Audit log (panel with toolbar) ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/5 flex-wrap">
          <div>
            <h2 className="text-sm font-bold">Audit log</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Every finding, with provenance — searchable + exportable
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={Download}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-4 space-y-3 border-b border-white/5">
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput
              value={filter.q}
              onChange={(v) => setFilter((f) => ({ ...f, q: v }))}
              placeholder='Search findings — try "secret" or a file path · press / to focus'
              className="flex-1 min-w-65"
              ariaLabel="Search audit log"
            />
            <SearchInput
              value={filter.prNumber}
              onChange={(v) => setFilter((f) => ({ ...f, prNumber: v }))}
              placeholder="PR #"
              hotkey={false}
              className="w-28"
              ariaLabel="Filter by PR number"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground/60" />
            <Select
              value={filter.resolved}
              options={RESOLVED_OPTIONS}
              onChange={(v) => setFilter((f) => ({ ...f, resolved: v }))}
              size="sm"
              ariaLabel="Filter by resolution state"
            />
            <Select
              value={(filter.severity ?? "") as Severity | ""}
              options={SEVERITY_OPTIONS}
              onChange={(v) =>
                setFilter((f) => ({
                  ...f,
                  severity: (v || undefined) as Severity | undefined,
                }))
              }
              size="sm"
              ariaLabel="Filter by severity"
            />
            {filtersActive && (
              <button
                onClick={() =>
                  setFilter({
                    q: "",
                    prNumber: "",
                    severity: undefined,
                    resolved: "open",
                  })
                }
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Reset
              </button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {audit.length} finding{audit.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Findings list */}
        <div className="p-4">
          {audit.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground text-center">
              {filter.q || filter.prNumber
                ? `No findings match "${filter.q || `PR #${filter.prNumber}`}".`
                : filter.resolved === "open"
                  ? "No open findings. Nice work."
                  : "No findings match the current filter."}
            </div>
          ) : (
            <div className="space-y-2">
              {audit.map((entry) => (
                <AuditCard
                  key={entry.id}
                  entry={entry}
                  repoFullName={monitor.repoFullName}
                  onResolved={() => void refresh()}
                  onRescan={handleRescanPr}
                  isRescanning={
                    !!entry.prNumber && rescanningPr === entry.prNumber
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Counter({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  // Stacked vertically — number on top, label underneath. Far cleaner with
  // multiple counters than the inline "42 critical" style; the eye scans
  // numbers in a row without labels mixing into them.
  const dim = value === 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`text-3xl font-bold tabular-nums leading-none ${dim ? "text-muted-foreground/30" : color}`}
      >
        {value}
      </span>
      <span
        className={`text-[11px] uppercase tracking-wider font-medium ${dim ? "text-muted-foreground/50" : color}`}
      >
        {label}
      </span>
    </div>
  );
}

function AuditCard({
  entry,
  repoFullName,
  onResolved,
  onRescan,
  isRescanning,
}: {
  entry: AuditEntry;
  repoFullName: string;
  onResolved: () => void;
  /**
   * Parent-owned rescan trigger. We don't fire the API ourselves so the
   * parent can keep the page-level "Scan in progress" banner alive through
   * the API call AND the worker-pickup window. Returns an error message
   * for the card to render inline, or null on success.
   */
  onRescan: (prNumber: number) => Promise<string | null>;
  /** True while this specific PR's rescan is in flight (parent decides). */
  isRescanning: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isResolved = !!entry.resolvedAt;

  const githubBase = `https://github.com/${repoFullName}`;
  const prUrl = entry.prNumber ? `${githubBase}/pull/${entry.prNumber}` : null;
  const commitUrl = entry.headSha
    ? `${githubBase}/commit/${entry.headSha}`
    : null;
  const fileUrl =
    entry.headSha && entry.file
      ? `${githubBase}/blob/${entry.headSha}/${entry.file}${entry.line ? `#L${entry.line}` : ""}`
      : null;

  return (
    <div className={`clay p-4 transition-opacity ${isResolved ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`clay-pill text-[10px] font-bold uppercase px-2 py-0.5 mt-0.5 shrink-0 ${severityColor(entry.severity)}`}
        >
          {entry.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-medium">{entry.message}</p>
            {entry.policyAction === "block" && !isResolved && (
              <span className="clay-pill text-[9px] font-bold uppercase px-2 py-0.5 text-destructive">
                BLOCK
              </span>
            )}
          </div>

          {/* PR linkage line — shown when this finding came from a PR review */}
          {entry.prNumber && (
            <div className="text-xs mt-1 mb-1 flex items-center gap-1.5 flex-wrap">
              <GitPullRequest className="w-3.5 h-3.5 text-primary shrink-0" />
              {prUrl ? (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono"
                >
                  PR #{entry.prNumber}
                </a>
              ) : (
                <span className="text-primary font-mono">
                  PR #{entry.prNumber}
                </span>
              )}
              {entry.prTitle && (
                <span
                  className="text-muted-foreground truncate min-w-0"
                  title={entry.prTitle}
                >
                  · {entry.prTitle}
                </span>
              )}
              <button
                disabled={isRescanning}
                onClick={async () => {
                  if (!entry.prNumber) return;
                  setRescanError(null);
                  const errMsg = await onRescan(entry.prNumber);
                  if (errMsg) setRescanError(errMsg);
                }}
                title={
                  rescanError ?? `Re-scan PR #${entry.prNumber} at its current commit`
                }
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/4 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
              >
                {isRescanning ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {rescanError ? rescanError : isRescanning ? "Rescanning…" : "Rescan PR"}
              </button>
            </div>
          )}

          {/* Metadata line — file:line, ruleId, source, commit */}
          <p className="text-[11px] text-muted-foreground font-mono break-all">
            {fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground hover:underline"
              >
                {entry.file}
                {entry.line ? `:${entry.line}` : ""}
              </a>
            ) : (
              <>
                {entry.file}
                {entry.line ? `:${entry.line}` : ""}
              </>
            )}{" "}
            · {entry.ruleId} · {entry.source}
            {commitUrl && (
              <>
                {" "}
                ·{" "}
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground hover:underline"
                  title={`Commit ${entry.headSha}`}
                >
                  {entry.headSha.slice(0, 7)}
                </a>
              </>
            )}
          </p>
          {expanded && (
            <div className="mt-3 space-y-2 text-xs">
              {entry.codeSnippet && (
                <pre className="clay-pressed p-3 overflow-x-auto font-mono text-[11px] text-foreground/90 whitespace-pre">
                  {entry.codeSnippet}
                </pre>
              )}
              {entry.suggestion && (
                <div className="clay-sm p-3 text-muted-foreground leading-relaxed">
                  <p className="font-semibold text-foreground mb-2">Fix</p>
                  <SuggestionMarkdown text={entry.suggestion} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Details"}
          </Button>
          {!isResolved && (
            <>
              <Button
                variant="subtle"
                size="sm"
                disabled={busy}
                className="hover:text-chart-5! hover:bg-chart-5/10!"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await resolveAuditEntry(entry.id, "fixed");
                    onResolved();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Mark fixed
              </Button>
              <Button
                variant="subtle"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await resolveAuditEntry(entry.id, "false-positive");
                    onResolved();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                False positive
              </Button>
            </>
          )}
          {isResolved && (
            <span className="text-[10px] text-muted-foreground">
              {entry.resolution} · {rel(entry.resolvedAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny, deliberate markdown renderer for finding suggestions.
 *
 * The rule library writes suggestions as a *small* subset of markdown:
 *   - Fenced code blocks with optional language: ```yaml … ```
 *   - Inline code: `text`
 *   - Bold: **text**
 *   - Paragraph breaks (blank line)
 *
 * No links, no headings, no lists, no images. We control the input (it
 * comes from our own rule library), so a permissive parser would just be
 * dead weight — and a third-party library would balloon the bundle for
 * a feature that needs ~30 lines.
 *
 * Anything else stays as plain text. HTML in the source is rendered as
 * literal characters (React escapes by default), so this is XSS-safe.
 */
function SuggestionMarkdown({ text }: { text: string }) {
  // Split on fenced code blocks first — we want them as standalone <pre>s,
  // not joined with surrounding paragraphs. The regex is non-greedy.
  const segments = text.split(/```(\w*)\n([\s\S]*?)```/g);
  // After split, segments alternate: [text, lang, code, text, lang, code, …]
  const out: React.ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i % 3 === 0) {
      // Plain text segment — render as paragraphs with inline formatting.
      const para = segments[i];
      if (para && para.trim() !== "") {
        out.push(<TextSegment key={`t${i}`} text={para} />);
      }
    } else if (i % 3 === 2) {
      // Code segment — segments[i-1] is the language hint (we don't use
      // it for highlighting; just kept for future).
      const code = segments[i];
      out.push(
        <pre
          key={`c${i}`}
          className="clay-pressed p-3 overflow-x-auto font-mono text-[11px] text-foreground/90 whitespace-pre my-2"
        >
          {code}
        </pre>,
      );
    }
  }
  return <div>{out}</div>;
}

function TextSegment({ text }: { text: string }) {
  // Split into paragraphs on blank lines, then render inline formatting
  // (bold + inline code) within each.
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim() !== "");
  return (
    <>
      {paras.map((p, idx) => (
        <p key={idx} className="my-1.5 leading-relaxed">
          {renderInline(p)}
        </p>
      ))}
    </>
  );
}

/** Inline render: **bold** + `code`. Order-independent, single pass. */
function renderInline(s: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Combined regex: capture either **bold** or `code`.
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      tokens.push(<span key={`p${i++}`}>{s.slice(last, m.index)}</span>);
    }
    if (m[1] !== undefined) {
      tokens.push(
        <strong key={`b${i++}`} className="text-foreground">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      tokens.push(
        <code
          key={`c${i++}`}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-primary/90"
        >
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    tokens.push(<span key={`p${i++}`}>{s.slice(last)}</span>);
  }
  return tokens;
}
