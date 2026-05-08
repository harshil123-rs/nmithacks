import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Bug,
  Zap,
  Eye,
  Code2,
  FileText,
  Sparkles,
  Clock,
  Copy,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";
import api from "../api/axios";

interface Finding {
  file: string;
  line: number;
  severity: string;
  message: string;
  suggestion: string;
}

interface AgentReport {
  _id: string;
  agentType: string;
  status: string;
  findings: Finding[];
  rawOutput: string;
  durationMs: number;
}

interface ReviewData {
  _id: string;
  overallVerdict: string;
  finalSummary: string;
  confidenceScore: number;
  agentReports: AgentReport[];
  githubCommentId: number;
  createdAt: string;
}

interface PRData {
  _id: string;
  prNumber: number;
  title: string;
  body: string;
  author: { login: string; avatarUrl: string };
  headSha: string;
  baseBranch: string;
  headBranch: string;
  status: string;
  createdAt: string;
  githubCreatedAt?: string;
  repoId: { _id: string; fullName: string; owner: string; name: string } | null;
}

const AGENT_TABS = [
  { id: "security", label: "Security", icon: Shield, color: "text-accent" },
  { id: "bugs", label: "Bugs", icon: Bug, color: "text-destructive" },
  { id: "performance", label: "Performance", icon: Zap, color: "text-chart-5" },
  { id: "readability", label: "Readability", icon: Eye, color: "text-primary" },
  {
    id: "best-practices",
    label: "Best Practices",
    icon: Code2,
    color: "text-secondary",
  },
  {
    id: "documentation",
    label: "Docs",
    icon: FileText,
    color: "text-muted-foreground",
  },
  { id: "final", label: "Final Review", icon: Sparkles, color: "text-primary" },
];

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-accent", bg: "bg-accent/10" },
  medium: { color: "text-chart-5", bg: "bg-chart-5/10" },
  low: { color: "text-muted-foreground", bg: "bg-muted-foreground/10" },
  info: { color: "text-primary/60", bg: "bg-primary/5" },
};

const VERDICT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: any }
> = {
  approve: {
    label: "Approved",
    color: "text-chart-5",
    bg: "bg-chart-5/10",
    icon: CheckCircle2,
  },
  request_changes: {
    label: "Changes Requested",
    color: "text-accent",
    bg: "bg-accent/10",
    icon: AlertTriangle,
  },
  comment: {
    label: "Commented",
    color: "text-primary",
    bg: "bg-primary/10",
    icon: Info,
  },
  block: {
    label: "Blocked",
    color: "text-destructive",
    bg: "bg-destructive/10",
    icon: XCircle,
  },
};

export default function MyPRDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pr, setPr] = useState<PRData | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("final");
  const [copied, setCopied] = useState(false);

  const fetchPR = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/prs/${id}/contributor`);
      setPr(data.pr);
      setReviews(data.reviews || []);
    } catch {
      navigate("/dashboard/my-prs");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchPR();
  }, [fetchPR]);

  const handleCopyShareLink = () => {
    if (!latestReview) return;
    const url = `${window.location.origin}/review/${latestReview._id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="clay p-8 flex flex-col items-center gap-4"
          style={{ borderRadius: "24px" }}
        >
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading PR details...</p>
        </div>
      </div>
    );
  }

  if (!pr) return null;

  const latestReview = reviews[0] || null;
  const repoFullName = (pr.repoId as any)?.fullName || "";
  const verdictCfg = latestReview
    ? VERDICT_CONFIG[latestReview.overallVerdict]
    : null;
  const VerdictIcon = verdictCfg?.icon || Info;

  const activeReport = latestReview?.agentReports.find(
    (r) => r.agentType === activeTab,
  );

  // Parse synthesizer output
  const synthReport = latestReview?.agentReports.find(
    (r) => r.agentType === "reviewer" || r.agentType === "synthesizer",
  );
  let synthData: any = null;
  if (synthReport?.rawOutput) {
    try {
      synthData = JSON.parse(synthReport.rawOutput);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate("/dashboard/my-prs")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to My PRs
      </button>

      {/* PR Header */}
      <div className="clay p-5 mb-5" style={{ borderRadius: "20px" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {repoFullName && (
                <span className="clay-pill px-2 py-0.5 text-[10px] text-secondary">
                  {repoFullName}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                #{pr.prNumber}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2">{pr.title}</h1>
            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {pr.author.avatarUrl ? (
                  <img
                    src={pr.author.avatarUrl}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                ) : null}
                @{pr.author.login}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {pr.headBranch} <ChevronRight className="w-2.5 h-2.5" />{" "}
                {pr.baseBranch}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(
                  pr.githubCreatedAt || pr.createdAt,
                ).toLocaleDateString()}
              </span>
              <span className="font-mono text-[10px]">
                {pr.headSha.slice(0, 7)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Share link */}
            {latestReview && (
              <button
                onClick={handleCopyShareLink}
                className="clay-btn px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-chart-5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied" : "Share"}
              </button>
            )}

            {/* GitHub link */}
            {repoFullName && (
              <a
                href={`https://github.com/${repoFullName}/pull/${pr.prNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="clay-btn px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                GitHub
              </a>
            )}
          </div>
        </div>

        {/* Verdict banner */}
        {verdictCfg && latestReview && (
          <div
            className={`mt-4 clay-pressed p-4 flex items-center gap-3 ${verdictCfg.bg}`}
            style={{ borderRadius: "14px" }}
          >
            <VerdictIcon className={`w-5 h-5 ${verdictCfg.color}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${verdictCfg.color}`}>
                {verdictCfg.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {latestReview.finalSummary}
              </p>
            </div>
            <span className={`text-xs font-mono ${verdictCfg.color}`}>
              {latestReview.confidenceScore}%
            </span>
          </div>
        )}
      </div>

      {/* Agent Tabs */}
      {latestReview && (
        <>
          <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {AGENT_TABS.map((tab) => {
              const report = latestReview.agentReports.find(
                (r) => r.agentType === tab.id,
              );
              const findingsCount = report?.findings?.length || 0;
              const isActive = activeTab === tab.id;
              const TabIcon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
                    isActive
                      ? "clay-pressed text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
                  }`}
                >
                  <TabIcon
                    className={`w-3.5 h-3.5 ${isActive ? tab.color : ""}`}
                  />
                  {tab.label}
                  {tab.id !== "final" && findingsCount > 0 && (
                    <span
                      className={`clay-pill px-1.5 py-0.5 text-[9px] ${isActive ? tab.color : "text-muted-foreground/50"}`}
                    >
                      {findingsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="clay p-5" style={{ borderRadius: "20px" }}>
            {activeTab === "final" ? (
              <FinalReviewTab
                review={latestReview}
                synthData={synthData}
                verdictCfg={verdictCfg}
                VerdictIcon={VerdictIcon}
              />
            ) : activeReport ? (
              <AgentTab report={activeReport} />
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">
                  This agent was not run for this review.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Review History */}
      {reviews.length > 1 && (
        <div className="clay p-5 mt-5" style={{ borderRadius: "20px" }}>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
            Review History ({reviews.length} reviews)
          </p>
          <div className="space-y-2">
            {reviews.map((rev, i) => {
              const vc = VERDICT_CONFIG[rev.overallVerdict];
              const VIcon = vc?.icon || Info;
              const totalFindings = rev.agentReports.reduce(
                (sum, r) => sum + (r.findings?.length || 0),
                0,
              );
              const isLatest = i === 0;
              return (
                <button
                  key={rev._id}
                  onClick={() => {
                    setReviews((prev) => {
                      const clicked = prev[i];
                      const rest = prev.filter((_, idx) => idx !== i);
                      return [clicked, ...rest];
                    });
                    setActiveTab("final");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`clay-pressed w-full p-3 text-left transition-all hover:bg-white/[0.02] ${isLatest ? "ring-1 ring-primary/20" : ""}`}
                  style={{ borderRadius: "12px" }}
                >
                  <div className="flex items-center gap-3">
                    <VIcon
                      className={`w-4 h-4 flex-shrink-0 ${vc?.color || "text-muted-foreground"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${vc?.color || "text-muted-foreground"}`}
                        >
                          {vc?.label || "Pending"}
                        </span>
                        {isLatest && (
                          <span className="clay-pill px-1.5 py-0.5 text-[8px] text-primary bg-primary/10">
                            Latest
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {totalFindings} findings / {rev.confidenceScore}%
                        confidence
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(rev.createdAt).toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No review yet */}
      {!latestReview && (
        <div
          className="clay p-8 sm:p-12 flex flex-col items-center text-center"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-primary/8 mb-4">
            <GitPullRequest className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">No review yet</h2>
          <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
            This PR hasn't been reviewed by LGTM yet. The maintainer will
            trigger a review when ready.
          </p>
        </div>
      )}
    </div>
  );
}

function AgentTab({ report }: { report: AgentReport }) {
  let summary = "";
  try {
    const parsed = JSON.parse(report.rawOutput);
    summary = parsed.summary || "";
  } catch {
    /* ignore */
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {report.status === "completed" ? (
            <CheckCircle2 className="w-4 h-4 text-chart-5" />
          ) : report.status === "failed" ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <Clock className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold capitalize">
            {report.status}
          </span>
        </div>
        {report.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {(report.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {summary && (
        <div className="clay-pressed p-3 mb-4" style={{ borderRadius: "12px" }}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {summary}
          </p>
        </div>
      )}

      {report.findings.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-8 h-8 text-chart-5/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No issues found</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            {report.findings.length} Finding
            {report.findings.length !== 1 ? "s" : ""}
          </p>
          {report.findings.map((finding, i) => {
            const sev =
              SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
            return (
              <div
                key={i}
                className="clay-pressed p-3"
                style={{ borderRadius: "12px" }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`clay-pill px-1.5 py-0.5 text-[9px] font-bold uppercase ${sev.color} ${sev.bg} flex-shrink-0 mt-0.5`}
                  >
                    {finding.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium mb-0.5">
                      {finding.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {finding.file}
                      {finding.line > 0 ? `:${finding.line}` : ""}
                    </p>
                    {finding.suggestion && (
                      <p className="text-[10px] text-primary/70 mt-1.5 leading-relaxed">
                        {finding.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FinalReviewTab({
  review,
  synthData,
  verdictCfg,
  VerdictIcon,
}: {
  review: ReviewData;
  synthData: any;
  verdictCfg: any;
  VerdictIcon: any;
}) {
  const allFindings: (Finding & { agentType: string })[] = [];
  for (const report of review.agentReports) {
    if (report.agentType === "reviewer" || report.agentType === "synthesizer")
      continue;
    for (const f of report.findings || []) {
      allFindings.push({ ...f, agentType: report.agentType });
    }
  }
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  allFindings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  const counts: Record<string, number> = {};
  for (const f of allFindings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  return (
    <div>
      {verdictCfg && (
        <div
          className={`clay-pressed p-4 mb-5 flex items-center gap-3 ${verdictCfg.bg}`}
          style={{ borderRadius: "14px" }}
        >
          <VerdictIcon className={`w-6 h-6 ${verdictCfg.color}`} />
          <div className="flex-1">
            <p className={`text-sm font-bold ${verdictCfg.color}`}>
              {verdictCfg.label}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {review.finalSummary}
            </p>
          </div>
          <span className={`text-lg font-bold font-mono ${verdictCfg.color}`}>
            {review.confidenceScore}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2 mb-5">
        {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          return (
            <div
              key={sev}
              className="clay-pressed p-3 text-center"
              style={{ borderRadius: "12px" }}
            >
              <p className={`text-lg font-bold ${cfg.color}`}>
                {counts[sev] || 0}
              </p>
              <p className="text-[9px] text-muted-foreground capitalize">
                {sev}
              </p>
            </div>
          );
        })}
      </div>

      {synthData?.topActions?.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Top Actions
          </p>
          <div className="space-y-1.5">
            {synthData.topActions.map((action: string, i: number) => (
              <div
                key={i}
                className="clay-pressed p-3 flex items-start gap-2"
                style={{ borderRadius: "12px" }}
              >
                <span className="clay-pill px-1.5 py-0.5 text-[9px] font-bold text-primary bg-primary/10 flex-shrink-0">
                  {i + 1}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {action}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {synthData?.changelog && (
        <div className="clay-pressed p-3 mb-5" style={{ borderRadius: "12px" }}>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-1.5">
            Changelog Entry
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="clay-pill px-1.5 py-0.5 text-[9px] font-bold text-secondary bg-secondary/10 mr-1.5">
              {synthData.changelog.type}
            </span>
            {synthData.changelog.entry}
            {synthData.changelog.isBreaking && (
              <span className="clay-pill px-1.5 py-0.5 text-[9px] font-bold text-destructive bg-destructive/10 ml-1.5">
                BREAKING
              </span>
            )}
          </p>
        </div>
      )}

      {synthData?.inlineComments?.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Inline Comments ({synthData.inlineComments.length})
          </p>
          <div className="space-y-1.5">
            {synthData.inlineComments.slice(0, 10).map((c: any, i: number) => (
              <div
                key={i}
                className="clay-pressed p-3"
                style={{ borderRadius: "12px" }}
              >
                <p className="text-[10px] text-muted-foreground font-mono mb-1">
                  {c.file}:{c.line}
                  <span className="text-muted-foreground/40 ml-2">
                    [{c.agentSource}]
                  </span>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {c.body.replace(/\*\*/g, "").slice(0, 200)}
                </p>
              </div>
            ))}
            {synthData.inlineComments.length > 10 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                + {synthData.inlineComments.length - 10} more comments
              </p>
            )}
          </div>
        </div>
      )}

      {allFindings.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            All Findings ({allFindings.length})
          </p>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {allFindings.slice(0, 30).map((f, i) => {
              const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
              return (
                <div
                  key={i}
                  className="clay-pressed p-3"
                  style={{ borderRadius: "12px" }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`clay-pill px-1.5 py-0.5 text-[9px] font-bold uppercase ${sev.color} ${sev.bg} flex-shrink-0 mt-0.5`}
                    >
                      {f.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium mb-0.5">{f.message}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {f.file}
                        {f.line > 0 ? `:${f.line}` : ""}
                        <span className="text-muted-foreground/40 ml-2">
                          [{f.agentType}]
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {allFindings.length > 30 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                + {allFindings.length - 30} more findings
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
