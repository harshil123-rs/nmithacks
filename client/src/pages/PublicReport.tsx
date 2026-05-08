import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  GitPullRequest,
  GitBranch,
  Loader2,
  Lock,
  Shield,
  Bug,
  Zap,
  Eye,
  Code2,
  FileText,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import api from "../api/axios";

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
    icon: Sparkles,
  },
  block: {
    label: "Blocked",
    color: "text-destructive",
    bg: "bg-destructive/10",
    icon: XCircle,
  },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-accent", bg: "bg-accent/10" },
  medium: { color: "text-chart-5", bg: "bg-chart-5/10" },
  low: { color: "text-muted-foreground", bg: "bg-muted-foreground/10" },
  info: { color: "text-primary/60", bg: "bg-primary/5" },
};

const BLURRED_TABS = [
  { label: "Security", icon: Shield, color: "text-accent" },
  { label: "Bugs", icon: Bug, color: "text-destructive" },
  { label: "Performance", icon: Zap, color: "text-chart-5" },
  { label: "Readability", icon: Eye, color: "text-primary" },
  { label: "Best Practices", icon: Code2, color: "text-secondary" },
  { label: "Docs", icon: FileText, color: "text-muted-foreground" },
];

export default function PublicReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, login, user } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchPublic = async () => {
      try {
        const { data: res } = await api.get(`/api/reviews/${id}/public`);
        setData(res);
      } catch {
        setError("Review not found");
      } finally {
        setLoading(false);
      }
    };
    fetchPublic();
  }, [id]);

  // If authenticated, redirect to full detail
  useEffect(() => {
    if (isAuthenticated && data?.review?._id) {
      // Find the PR to navigate to detail — for now just show the public page
      // They can click through to the full review
    }
  }, [isAuthenticated, data]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div
          className="clay p-8 flex flex-col items-center gap-4 text-center"
          style={{ borderRadius: "24px" }}
        >
          <XCircle className="w-8 h-8 text-destructive/50" />
          <p className="text-sm text-muted-foreground">
            {error || "Review not found"}
          </p>
          <button
            onClick={() => navigate("/")}
            className="clay-btn px-4 py-2 text-xs text-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const { review, pr } = data;
  const verdictCfg = VERDICT_CONFIG[review.overallVerdict];
  const VerdictIcon = verdictCfg?.icon || CheckCircle2;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header
        className="clay-sm mx-4 mt-4 px-4 py-3 flex items-center justify-between"
        style={{ borderRadius: "16px" }}
      >
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <img
            src="/logo.png"
            alt="LGTM"
            className="w-8 h-8 rounded-full scale-125"
          />
          <div>
            <span className="text-sm font-bold tracking-tight">LGTM</span>
            <p className="text-[8px] text-muted-foreground leading-none">
              Looks Good To Meow
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="clay-btn px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5"
          >
            {copied ? (
              <Check className="w-3 h-3 text-chart-5" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {copied ? "Copied" : "Share"}
          </button>
          {!isAuthenticated && (
            <button
              onClick={login}
              className="clay-btn px-3 py-1.5 text-xs text-primary"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* PR info */}
        {pr ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {pr.repoId?.fullName && (
                <span className="clay-pill px-2 py-0.5 text-[10px] text-secondary">
                  {pr.repoId.fullName}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                #{pr.prNumber}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2">{pr.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>@{pr.author?.login}</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {pr.headBranch} to {pr.baseBranch}
              </span>
            </div>
          </div>
        ) : review.localTitle ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="clay-pill px-2 py-0.5 text-[10px] text-primary/70">
                CLI
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2">
              {review.localTitle}
            </h1>
          </div>
        ) : null}

        {/* Verdict banner */}
        {verdictCfg && (
          <div
            className={`clay p-5 mb-6 flex items-center gap-4 ${verdictCfg.bg}`}
            style={{ borderRadius: "20px" }}
          >
            <VerdictIcon className={`w-8 h-8 ${verdictCfg.color}`} />
            <div className="flex-1">
              <p className={`text-lg font-bold ${verdictCfg.color}`}>
                {verdictCfg.label}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {review.finalSummary}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-2xl font-bold font-mono ${verdictCfg.color}`}>
                {review.confidenceScore}%
              </p>
              <p className="text-[9px] text-muted-foreground">confidence</p>
            </div>
          </div>
        )}

        {/* Top 3 findings */}
        {review.topFindings?.length > 0 && (
          <div className="clay p-5 mb-6" style={{ borderRadius: "20px" }}>
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
              Top Findings
            </p>
            <div className="space-y-2">
              {review.topFindings.map((f: any, i: number) => {
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
                        <p className="text-xs font-medium mb-0.5">
                          {f.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {f.file}
                          {f.line > 0 ? `:${f.line}` : ""}
                          {f.agentType && (
                            <span className="text-muted-foreground/40 ml-2">
                              [{f.agentType}]
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Blurred agent tabs — CTA to sign in */}
        {!isAuthenticated && (
          <div className="relative">
            <div
              className="clay p-5"
              style={{
                borderRadius: "20px",
                filter: "blur(4px)",
                pointerEvents: "none",
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                {BLURRED_TABS.map((tab) => (
                  <div
                    key={tab.label}
                    className="clay-pressed px-3 py-2 flex items-center gap-1.5"
                    style={{ borderRadius: "10px" }}
                  >
                    <tab.icon className={`w-3.5 h-3.5 ${tab.color}`} />
                    <span className="text-[10px] text-muted-foreground">
                      {tab.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="clay-pressed p-3 h-12"
                    style={{ borderRadius: "12px" }}
                  />
                ))}
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Lock className="w-6 h-6 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-bold mb-1">Full analysis locked</p>
              <p className="text-xs text-muted-foreground mb-4">
                Sign in with GitHub to unlock all agent reports
              </p>
              <button
                onClick={login}
                className="clay-btn px-5 py-2.5 text-sm text-primary flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Sign in with GitHub
              </button>
            </div>
          </div>
        )}

        {/* If authenticated, link to full review */}
        {isAuthenticated && (
          <div
            className="clay p-5 text-center"
            style={{ borderRadius: "20px" }}
          >
            <p className="text-xs text-muted-foreground mb-3">
              You're signed in. View the full analysis in your dashboard.
            </p>
            <button
              onClick={() => {
                // CLI local reviews always go to ReviewDetail
                if (!data?.pr) {
                  navigate(`/dashboard/reviews/${id}`);
                  return;
                }
                // PR reviews: contributors see their view, maintainers see full detail
                const prAuthor = data.pr?.author?.login?.toLowerCase();
                const currentUser = (user as any)?.username?.toLowerCase();
                if (prAuthor && currentUser && prAuthor === currentUser) {
                  navigate(`/dashboard/my-prs/${data.pr._id}`);
                } else {
                  // For any authenticated user, show the review detail (read-only)
                  // instead of the PR detail page which requires repo ownership
                  navigate(`/dashboard/reviews/${id}`);
                }
              }}
              className="clay-btn px-5 py-2.5 text-sm text-primary"
            >
              View Full Review
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-[10px] text-muted-foreground/40">
          Reviewed by LGTM — Looks Good To Meow
        </div>
      </div>
    </div>
  );
}
