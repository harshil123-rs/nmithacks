import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  GitBranch,
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
  Info,
  ChevronRight,
  Terminal,
  ShieldOff,
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
  localTitle: string | null;
  agentReports: AgentReport[];
  createdAt: string;
  repoId: { _id: string; fullName: string } | null;
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

function AgentTab({ report }: { report: AgentReport }) {
  const findings = report.findings || [];
  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <CheckCircle2 className="w-8 h-8 text-chart-5 mb-3" />
        <p className="text-sm font-semibold mb-1">No issues found</p>
        <p className="text-xs text-muted-foreground">
          This agent found nothing to flag.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {findings.map((f, i) => {
        const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
        return (
          <div
            key={i}
            className="clay-pressed p-4"
            style={{ borderRadius: "14px" }}
          >
            <div className="flex items-start gap-3">
              <span
                className={`clay-pill px-2 py-0.5 text-[9px] font-bold uppercase flex-shrink-0 mt-0.5 ${sev.color} ${sev.bg}`}
              >
                {f.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium mb-1">{f.message}</p>
                <p className="text-[10px] text-muted-foreground font-mono mb-2">
                  {f.file}
                  {f.line > 0 ? `:${f.line}` : ""}
                </p>
                {f.suggestion && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/20 pl-3">
                    {f.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FinalTab({
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
  const severityCounts: Record<string, number> = {};
  for (const report of review.agentReports) {
    if (report.agentType === "reviewer" || report.agentType === "synthesizer")
      continue;
    for (const f of report.findings || []) {
      severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    }
  }

  return (
    <div className="space-y-5">
      {verdictCfg && (
        <div
          className={`clay-pressed p-4 flex items-center gap-3 ${verdictCfg.bg}`}
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
          <span className={`text-xl font-bold font-mono ${verdictCfg.color}`}>
            {review.confidenceScore}%
          </span>
        </div>
      )}

      {Object.keys(severityCounts).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Severity Breakdown
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {["critical", "high", "medium", "low", "info"]
              .filter((s) => severityCounts[s] > 0)
              .map((sev) => {
                const sc = SEVERITY_CONFIG[sev];
                return (
                  <div
                    key={sev}
                    className={`clay-pressed px-3 py-1.5 flex items-center gap-1.5 ${sc.bg}`}
                    style={{ borderRadius: "10px" }}
                  >
                    <span className={`text-xs font-bold ${sc.color}`}>
                      {severityCounts[sev]}
                    </span>
                    <span className={`text-[10px] ${sc.color}`}>{sev}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {synthData?.topActions?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Top Actions
          </p>
          <div className="space-y-2">
            {synthData.topActions.map((action: string, i: number) => (
              <div
                key={i}
                className="clay-pressed p-3 flex items-start gap-2"
                style={{ borderRadius: "12px" }}
              >
                <ChevronRight className="w-3.5 h-3.5 text-primary/50 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {synthData?.changelog?.entry && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
            Changelog
          </p>
          <div className="clay-pressed p-3" style={{ borderRadius: "12px" }}>
            <span className="clay-pill px-2 py-0.5 text-[9px] text-primary mr-2">
              {synthData.changelog.type}
            </span>
            <span className="text-xs text-muted-foreground">
              {synthData.changelog.entry}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState("final");
  const [copied, setCopied] = useState(false);

  const fetchReview = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/reviews/${id}`);
      setReview(data.review);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setAccessDenied(true);
      } else {
        navigate("/dashboard/reviews");
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const handleCopyShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/review/${id}`);
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
          <p className="text-sm text-muted-foreground">Loading review...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="clay p-8 sm:p-10 flex flex-col items-center text-center max-w-md"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-accent/10 mb-4">
            <ShieldOff className="w-7 h-7 text-accent" />
          </div>
          <h2 className="text-lg font-bold mb-1">Access restricted</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-5">
            This review belongs to a repo you don't have access to. You can
            still view the public summary.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/review/${id}`)}
              className="clay-btn px-4 py-2.5 text-xs text-primary"
            >
              View Public Summary
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="clay-btn px-4 py-2.5 text-xs text-muted-foreground"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const verdictCfg = VERDICT_CONFIG[review.overallVerdict];
  const VerdictIcon = verdictCfg?.icon || Info;

  const activeReport = review.agentReports.find(
    (r) => r.agentType === activeTab,
  );
  const synthReport = review.agentReports.find(
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

  const title = review.localTitle || "Local Review";
  const repoFullName = (review.repoId as any)?.fullName || "";

  return (
    <div className="max-w-5xl">
      <button
        onClick={() => navigate("/dashboard/reviews")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Reviews
      </button>

      {/* Header */}
      <div className="clay p-5 mb-5" style={{ borderRadius: "20px" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {repoFullName && (
                <span className="clay-pill px-2 py-0.5 text-[10px] text-secondary">
                  {repoFullName}
                </span>
              )}
              <span className="clay-pill px-2 py-0.5 text-[10px] text-primary/70 flex items-center gap-1">
                <Terminal className="w-2.5 h-2.5" />
                CLI
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2">{title}</h1>
            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(review.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCopyShare}
              className="clay-btn px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-chart-5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>

        {verdictCfg && (
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
                {review.finalSummary}
              </p>
            </div>
            <span className={`text-xs font-mono ${verdictCfg.color}`}>
              {review.confidenceScore}%
            </span>
          </div>
        )}
      </div>

      {/* Agent Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {AGENT_TABS.map((tab) => {
          const report = review.agentReports.find(
            (r) => r.agentType === tab.id,
          );
          const count = report?.findings?.length || 0;
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
              <TabIcon className={`w-3.5 h-3.5 ${isActive ? tab.color : ""}`} />
              {tab.label}
              {tab.id !== "final" && count > 0 && (
                <span
                  className={`clay-pill px-1.5 py-0.5 text-[9px] ${isActive ? tab.color : "text-muted-foreground/50"}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="clay p-5" style={{ borderRadius: "20px" }}>
        {activeTab === "final" ? (
          <FinalTab
            review={review}
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
    </div>
  );
}
