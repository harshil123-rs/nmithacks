/**
 * Policy editor (`/dashboard/security/:repoId/policy`).
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Loader2,
  Save,
  AlertTriangle,
  CheckCircle2,
  Ban,
  AlertOctagon,
  CircleSlash,
  Bell,
  Mail,
} from "lucide-react";
import {
  getMonitor,
  listRuleStats,
  updateNotify,
  updatePolicy,
  type MonitorDetail,
  type PolicyAction,
  type RuleStat,
} from "../api/security";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";

const RULE_LABELS: Record<string, { label: string; description: string }> = {
  "secrets.hardcoded": {
    label: "Hardcoded secrets",
    description: "API keys, tokens, private keys committed to source files.",
  },
  "workflow.privileged-container": {
    label: "Privileged container",
    description:
      "Workflows that launch containers with --privileged or privileged: true.",
  },
  "workflow.untrusted-input-shell-injection": {
    label: "Shell injection (untrusted input)",
    description:
      "PR title/body/comment text interpolated directly into a 'run:' block.",
  },
  "workflow.pull-request-target-with-head-checkout": {
    label: "pull_request_target + PR head checkout",
    description:
      "The classic supply-chain RCE pattern. Forked PR runs with your secrets.",
  },
  "workflow.self-hosted-runner-on-public-repo": {
    label: "Self-hosted runner on public repo",
    description:
      "Fork PRs can execute on your runners. High-impact escalation path.",
  },
  "workflow.unpinned-action-checkout": {
    label: "actions/checkout pinned to a tag",
    description: "Should be pinned to a 40-char commit SHA.",
  },
  "workflow.unpinned-third-party-action": {
    label: "Third-party action pinned to a tag",
    description: "Should be pinned to a 40-char commit SHA.",
  },
  "workflow.permissions-write-all": {
    label: "permissions: write-all",
    description: "GITHUB_TOKEN gets unrestricted scope.",
  },
  "workflow.missing-job-permissions": {
    label: "Missing job-level permissions",
    description: "Job uses GITHUB_TOKEN without explicit 'permissions:' scoping.",
  },
  "workflow.trigger-weakening": {
    label: "Weak workflow_dispatch inputs",
    description: "workflow_dispatch inputs without type/options constraints.",
  },
  "workflow.external-reusable-workflow": {
    label: "External reusable workflow",
    description: "Reusable workflow call into an external org. Consider auditing.",
  },
  "dockerfile.privileged-flag": {
    label: "Dockerfile --privileged flag",
    description: "RUN/CMD/ENTRYPOINT invokes a command with --privileged.",
  },
  "dockerfile.user-root-final": {
    label: "Dockerfile final stage runs as root",
    description: "Final stage has no USER directive or ends as USER root.",
  },
  "dockerfile.add-from-url": {
    label: "Dockerfile ADD <url>",
    description: "ADD over HTTP without integrity verification.",
  },
  "deps.lockfile-hash-mismatch": {
    label: "Lockfile-only edit",
    description:
      "Lockfile changed without manifest change — possible hand-edit or hash swap.",
  },
  "network.unallowlisted-outbound": {
    label: "Outbound to non-allowlisted domain",
    description: "curl/wget to a domain not in the allowlist during build.",
  },
};

const ACTION_OPTIONS: Array<{
  value: PolicyAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = [
  {
    value: "block",
    label: "Block",
    icon: Ban,
    className: "text-destructive",
  },
  {
    value: "warn",
    label: "Warn",
    icon: AlertOctagon,
    className: "text-yellow-400",
  },
  {
    value: "off",
    label: "Off",
    icon: CircleSlash,
    className: "text-muted-foreground",
  },
];

export default function LgtmSecurityPolicy() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local editable state
  const [rules, setRules] = useState<
    Record<string, { action: PolicyAction }>
  >({});
  const [actionAllowlist, setActionAllowlist] = useState("");
  const [domainAllowlist, setDomainAllowlist] = useState("");
  const [runnerAllowlist, setRunnerAllowlist] = useState("");
  const [stats, setStats] = useState<Record<string, RuleStat>>({});

  useEffect(() => {
    if (!repoId) return;
    void (async () => {
      try {
        // Monitor is required; stats are best-effort (no audit log yet =
        // empty stats). Don't fail the whole page on a stats error.
        const m = await getMonitor(repoId);
        setMonitor(m);
        setRules(
          Object.fromEntries(
            Object.entries(m.policy.rules).map(([k, v]) => [
              k,
              { action: v.action },
            ]),
          ),
        );
        setActionAllowlist(m.policy.allowlist.actions.join("\n"));
        setDomainAllowlist(m.policy.allowlist.domains.join("\n"));
        setRunnerAllowlist(m.policy.allowlist.runners.join("\n"));
        try {
          const s = await listRuleStats(repoId);
          setStats(Object.fromEntries(s.map((r) => [r.ruleId, r])));
        } catch {
          // Stats are non-critical — leave the map empty.
        }
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [repoId]);

  if (loading) {
    return (
      <div className="clay p-10 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading policy…
      </div>
    );
  }

  if (error || !monitor || !repoId) {
    return (
      <div className="clay p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">{error ?? "Repo not enrolled."}</div>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePolicy(repoId, {
        rules: rules as MonitorDetail["policy"]["rules"],
        allowlist: {
          actions: linesToList(actionAllowlist),
          domains: linesToList(domainAllowlist),
          runners: linesToList(runnerAllowlist),
        },
      });
      setSavedAt(Date.now());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Helmet>
        <title>Policy · {monitor.repoFullName} · LGTM Security</title>
      </Helmet>

      {/* ─────────── Top bar ─────────── */}
      <div className="flex items-start gap-4 flex-wrap">
        <button
          onClick={() => navigate(`/dashboard/security/${repoId}`)}
          aria-label="Back"
          className="clay-sm p-2 rounded-xl shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            Policy · {monitor.repoFullName}
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            Tune which rules block, warn, or are disabled. Changes apply on the
            next scan.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Save}
          loading={saving}
          onClick={save}
        >
          Save changes
        </Button>
      </div>

      {savedAt && Date.now() - savedAt < 5000 && (
        <div className="clay p-3 flex items-center gap-2 text-sm text-chart-5">
          <CheckCircle2 className="w-4 h-4" />
          Saved.
        </div>
      )}

      {error && (
        <div className="clay p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* ─────────── Rules panel ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-bold">Rules</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Per-rule action: block fails the merge + halts CI · warn surfaces
            without blocking · off disables the rule entirely
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {Object.entries(rules).map(([ruleId, r]) => {
            const meta = RULE_LABELS[ruleId] ?? {
              label: ruleId,
              description: "",
            };
            return (
              <div
                key={ruleId}
                className="px-6 py-4 flex items-start gap-4 hover:bg-white/1.5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  {meta.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {meta.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <p className="text-[10px] font-mono text-muted-foreground/60">
                      {ruleId}
                    </p>
                    <RuleStatBadge stat={stats[ruleId]} />
                  </div>
                </div>
                <Select
                  value={r.action}
                  options={ACTION_OPTIONS}
                  onChange={(action) =>
                    setRules((prev) => ({
                      ...prev,
                      [ruleId]: { action },
                    }))
                  }
                  ariaLabel={`Action for ${meta.label}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────── Allowlists panel ─────────── */}
      <div className="clay-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-sm font-bold">Allowlists</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Suppress findings on patterns you've explicitly approved
          </p>
        </div>
        <div className="p-6 grid sm:grid-cols-2 gap-3">
          <AllowlistField
            label="Actions"
            placeholder={"actions/*\nmyorg/*"}
            help="Action `uses:` patterns that suppress unpinned-action and external-workflow findings."
            value={actionAllowlist}
            onChange={setActionAllowlist}
          />
          <AllowlistField
            label="Outbound domains"
            placeholder={"my-internal-mirror.example.com"}
            help="Hosts your CI is permitted to reach via curl/wget. Defaults include the standard package registries."
            value={domainAllowlist}
            onChange={setDomainAllowlist}
          />
          <AllowlistField
            label="Runner labels"
            placeholder={"self-hosted-prod"}
            help="`runs-on:` labels permitted on public repos."
            value={runnerAllowlist}
            onChange={setRunnerAllowlist}
          />
        </div>
      </div>

      {/* Notifications */}
      <NotifySection
        repoId={repoId}
        initial={monitor.notify}
        onUpdated={(notify) =>
          setMonitor((m) => (m ? { ...m, notify } : m))
        }
      />
    </div>
  );
}

function NotifySection({
  repoId,
  initial,
  onUpdated,
}: {
  repoId: string;
  initial: MonitorDetail["notify"];
  onUpdated: (notify: MonitorDetail["notify"]) => void;
}) {
  const [notify, setNotify] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<keyof MonitorDetail["notify"] | null>(
    null,
  );

  // Auto-save on toggle. Optimistic update: flip locally, send the patch,
  // revert on error. Saves a click and matches Settings-page expectations.
  const toggle = async (key: keyof MonitorDetail["notify"]) => {
    const prev = notify[key];
    const next = !prev;
    setNotify((n) => ({ ...n, [key]: next }));
    setPendingKey(key);
    setError(null);
    try {
      const result = await updateNotify(repoId, { [key]: next });
      onUpdated(result.notify);
    } catch (err: any) {
      // Revert
      setNotify((n) => ({ ...n, [key]: prev }));
      setError(err?.response?.data?.error ?? err.message ?? "Failed to update");
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="clay-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <h2 className="text-sm font-bold">Notifications</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Alerts fire only on <strong className="text-foreground/80">new</strong>{" "}
          block-action findings — re-runs of the same dirty commit don't
          re-notify
        </p>
      </div>
      {error && (
        <div className="px-6 pt-4 -mb-1">
          <div className="clay-sm p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}
      <div className="divide-y divide-white/5">
        <NotifyToggle
          icon={Bell}
          label="In-app notifications"
          description="A notification appears in the bell icon at the top of the dashboard when a new blocking issue lands."
          enabled={notify.inApp}
          pending={pendingKey === "inApp"}
          onToggle={() => void toggle("inApp")}
        />
        <NotifyToggle
          icon={Mail}
          label="Email alerts"
          description="A digest email goes to your account address listing new blocking issues, the offending file/line, and a link back to the dashboard."
          enabled={notify.email}
          pending={pendingKey === "email"}
          onToggle={() => void toggle("email")}
        />
      </div>
    </div>
  );
}

function NotifyToggle({
  icon: Icon,
  label,
  description,
  enabled,
  pending,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  enabled: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="px-6 py-4 flex items-start gap-3 hover:bg-white/1.5 transition-colors">
      <div
        className={`clay-icon p-2 shrink-0 mt-0.5 ${enabled ? "bg-primary/10" : "bg-muted/20"}`}
      >
        <Icon className={`w-4 h-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-busy={pending}
        disabled={pending}
        onClick={onToggle}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 mt-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          enabled ? "bg-primary/40" : "bg-muted/30"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground shadow-sm transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-3 h-3 animate-spin text-foreground/70" />
          </span>
        )}
      </button>
    </div>
  );
}

function AllowlistField({
  label,
  placeholder,
  help,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold mb-1">{label}</p>
      <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
        {help}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        spellCheck={false}
        className="clay-pressed w-full p-3 text-xs font-mono bg-transparent resize-y focus:outline-none placeholder:text-muted-foreground/40 text-foreground/90"
        style={{ borderRadius: "12px" }}
      />
      <p className="text-[10px] text-muted-foreground mt-1.5">One per line.</p>
    </div>
  );
}

function linesToList(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Compact rule-level stat. We show:
 *   - total count (always)
 *   - FP rate when there are enough resolutions to be meaningful
 *
 * Threshold: at least 5 resolved findings. Below that, FP rate is too
 * noisy to report — one false-positive on a sample of 2 is "50%" but tells
 * you nothing. We surface "n samples" instead so users know we're waiting.
 */
function RuleStatBadge({ stat }: { stat: RuleStat | undefined }) {
  if (!stat || stat.total === 0) return null;

  const fpThreshold = 5;
  const fpKnown = stat.resolved >= fpThreshold && stat.fpRate !== null;
  const fpPct = fpKnown ? Math.round((stat.fpRate as number) * 100) : null;

  // High FP-rate (>=50%) is surfaced as a "noisy" warning hint to nudge
  // the user toward muting the rule. Anything lower is purely informational.
  const isNoisy = fpPct !== null && fpPct >= 50;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="clay-pill text-[10px] px-2 py-0.5 text-muted-foreground/80">
        {stat.total} finding{stat.total === 1 ? "" : "s"}
      </span>
      {stat.open > 0 && (
        <span className="clay-pill text-[10px] px-2 py-0.5 text-yellow-400">
          {stat.open} open
        </span>
      )}
      {fpKnown ? (
        <span
          className={`clay-pill text-[10px] px-2 py-0.5 font-semibold ${
            isNoisy ? "text-orange-400" : "text-muted-foreground/80"
          }`}
          title={
            isNoisy
              ? `${fpPct}% of resolved findings on this rule were marked false-positive. Consider muting it.`
              : `${fpPct}% of resolved findings on this rule were marked false-positive.`
          }
        >
          {fpPct}% false-positive
          {isNoisy && " · noisy"}
        </span>
      ) : (
        stat.resolved > 0 && (
          <span
            className="clay-pill text-[10px] px-2 py-0.5 text-muted-foreground/60"
            title={`Need at least ${fpThreshold} resolved findings before we report a false-positive rate.`}
          >
            {stat.resolved}/{fpThreshold} resolutions
          </span>
        )
      )}
    </div>
  );
}
