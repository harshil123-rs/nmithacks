/**
 * LGTM Security — overview page (`/dashboard/security`).
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Loader2,
  AlertTriangle,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  Trash2,
  KeyRound,
} from "lucide-react";
import {
  enrollRepo,
  listConnectedRepos,
  listEnrolled,
  pauseRepo,
  resumeRepo,
  unenrollRepo,
  type MonitorListItem,
} from "../api/security";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

interface ConnectedRepo {
  _id: string;
  fullName: string;
  owner: string;
  name: string;
  isActive: boolean;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function postureSeverity(p: MonitorListItem["posture"]): "clean" | "warn" | "critical" {
  if ((p.critical ?? 0) > 0) return "critical";
  if ((p.high ?? 0) > 0) return "warn";
  if ((p.medium ?? 0) + (p.low ?? 0) > 0) return "warn";
  return "clean";
}

export default function LgtmSecurity() {
  const navigate = useNavigate();
  const [monitors, setMonitors] = useState<MonitorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEnroll, setShowEnroll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await listEnrolled();
      setMonitors(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6 max-w-6xl">
      <Helmet>
        <title>LGTM Security · Dashboard</title>
      </Helmet>

      {/* ─────────── Page header ─────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="clay-icon p-2.5 bg-primary/10 shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                LGTM Security
              </h1>
              <span className="clay-pill text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 text-primary">
                Beta
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl mt-1 leading-relaxed">
              Continuous CI/CD security monitoring. Workflows, Dockerfiles,
              and lockfiles scanned on every push and on a schedule.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            icon={KeyRound}
            onClick={() => navigate("/dashboard/security/tokens")}
          >
            Tokens
          </Button>
          {monitors.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowEnroll(true)}
            >
              Enroll repo
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="clay p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="clay p-10 rounded-2xl flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading enrolled repos…
        </div>
      )}

      {/* Empty state */}
      {!loading && monitors.length === 0 && (
        <div className="clay-lg p-12 text-center">
          <div className="clay-icon p-3 bg-primary/10 inline-block mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No repos enrolled yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
            Pick one of your connected repos to enroll. We'll run an immediate
            backfill scan against the default branch so you can see your
            current posture in seconds.
          </p>
          <Button
            variant="primary"
            size="lg"
            icon={Plus}
            onClick={() => setShowEnroll(true)}
          >
            Enroll your first repo
          </Button>
        </div>
      )}

      {/* ─────────── Monitor list ─────────── */}
      {!loading && monitors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Enrolled repos
            </h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {monitors.length} monitor{monitors.length === 1 ? "" : "s"}
            </span>
          </div>

          {monitors.map((m) => {
            const sev = postureSeverity(m.posture);
            const total =
              (m.posture.critical ?? 0) +
              (m.posture.high ?? 0) +
              (m.posture.medium ?? 0) +
              (m.posture.low ?? 0);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/dashboard/security/${m.repoId}`)}
                className="clay w-full p-4 text-left hover:scale-[1.005] transition-transform group"
              >
                <div className="flex items-center gap-4">
                  {/* Posture icon */}
                  <div
                    className={`clay-icon p-2.5 shrink-0 ${
                      sev === "critical"
                        ? "bg-destructive/10"
                        : sev === "warn"
                          ? "bg-yellow-400/10"
                          : "bg-chart-5/10"
                    }`}
                  >
                    {sev === "critical" ? (
                      <ShieldAlert className="w-5 h-5 text-destructive" />
                    ) : sev === "warn" ? (
                      <Shield className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-chart-5" />
                    )}
                  </div>

                  {/* Title + sub */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">
                        {m.repoFullName}
                      </p>
                      {m.status === "paused" && (
                        <span className="clay-pill text-[9px] font-bold uppercase px-2 py-0.5 text-yellow-400">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Last scan {formatRelativeTime(m.lastScanAt)} · policy v
                      {m.policyVersion}
                    </p>
                  </div>

                  {/* Posture pills */}
                  <div className="hidden md:flex items-center gap-1.5">
                    {(m.posture.critical ?? 0) > 0 && (
                      <span className="clay-pill px-2 py-0.5 text-[10px] text-destructive font-bold">
                        {m.posture.critical} critical
                      </span>
                    )}
                    {(m.posture.high ?? 0) > 0 && (
                      <span className="clay-pill px-2 py-0.5 text-[10px] text-yellow-400 font-bold">
                        {m.posture.high} high
                      </span>
                    )}
                    {total === 0 && (
                      <span className="clay-pill px-2 py-0.5 text-[10px] text-chart-5 font-bold">
                        Clean
                      </span>
                    )}
                  </div>

                  {/* Quick actions */}
                  <QuickActions
                    monitor={m}
                    onChange={() => void refresh()}
                  />

                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-foreground/70 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Enroll modal */}
      <Modal
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        title={
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span>Enroll a repo</span>
          </div>
        }
      >
        <EnrollPicker
          enrolledRepoIds={new Set(monitors.map((m) => m.repoId))}
          onEnrolled={() => {
            setShowEnroll(false);
            void refresh();
          }}
        />
      </Modal>
    </div>
  );
}

function QuickActions({
  monitor,
  onChange,
}: {
  monitor: MonitorListItem;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant="subtle"
        size="sm"
        title={
          monitor.status === "active"
            ? "Pause monitoring"
            : "Resume monitoring"
        }
        loading={busy}
        icon={monitor.status === "active" ? PauseCircle : PlayCircle}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            if (monitor.status === "active") {
              await pauseRepo(monitor.repoId);
            } else {
              await resumeRepo(monitor.repoId);
            }
            onChange();
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="subtle"
        size="sm"
        title="Unenroll"
        loading={busy}
        icon={Trash2}
        className="hover:text-destructive! hover:bg-destructive/8!"
        onClick={async (e) => {
          e.stopPropagation();
          if (
            !confirm(
              `Unenroll ${monitor.repoFullName} from LGTM Security? Audit history is preserved.`,
            )
          ) {
            return;
          }
          setBusy(true);
          try {
            await unenrollRepo(monitor.repoId);
            onChange();
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function EnrollPicker({
  enrolledRepoIds,
  onEnrolled,
}: {
  enrolledRepoIds: Set<string>;
  onEnrolled: () => void;
}) {
  const [repos, setRepos] = useState<ConnectedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listConnectedRepos();
        setRepos(data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const candidates = repos.filter(
    (r) => r.isActive && !enrolledRepoIds.has(r._id),
  );

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        We'll run an immediate scan against the default branch and start
        monitoring on every push.
      </p>

      {error && (
        <div className="clay-sm p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading your repos…</span>
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          All your connected repos are already enrolled. Connect more under{" "}
          <a href="/dashboard/repos" className="text-primary underline">
            Repos
          </a>
          .
        </div>
      ) : (
        <div className="space-y-1.5">
          {candidates.map((r) => (
            <button
              key={r._id}
              onClick={async () => {
                setEnrollingId(r._id);
                setError(null);
                try {
                  await enrollRepo(r._id);
                  onEnrolled();
                } catch (err: any) {
                  if (err?.response?.data?.code === "plan_limit_reached") {
                    setError(
                      err.response.data.error +
                        " · Upgrade at /dashboard/pricing",
                    );
                  } else {
                    setError(
                      err?.response?.data?.error ??
                        err.message ??
                        "Failed to enroll",
                    );
                  }
                } finally {
                  setEnrollingId(null);
                }
              }}
              disabled={enrollingId !== null}
              className="clay-sm w-full text-left p-3 flex items-center justify-between disabled:opacity-50 hover:scale-[1.005] transition-transform"
            >
              <span className="text-sm truncate">{r.fullName}</span>
              {enrollingId === r._id ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              ) : (
                <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
