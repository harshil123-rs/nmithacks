import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import type {
  ReviewStartedEvent,
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  ReviewCompletedEvent,
  SynthesizerStartedEvent,
} from "../hooks/useSocket";
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
  Play,
  Copy,
  Check,
  ChevronRight,
  Info,
  Database,
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
  repoId: {
    _id: string;
    fullName: string;
    owner: string;
    name: string;
    settings?: { focusAreas?: string[] };
  } | null;
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

export default function PRDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { on, connected } = useSocket(
    localStorage.getItem("socket_user_id") || undefined,
  );

  const [pr, setPr] = useState<PRData | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("final");
  const [triggering, setTriggering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [repoIndexed, setRepoIndexed] = useState<boolean | null>(null);

  // Real-time agent status tracking
  const [liveAgents, setLiveAgents] = useState<Record<string, string>>({});
  const [synthesizerStatus, setSynthesizerStatus] = useState<
    "idle" | "running" | "done"
  >("idle");

  // Track whether socket events are actively driving agent state.
  // When true, fetchPR won't overwrite liveAgents (socket is the source of truth).
  const socketDriving = useRef(false);

  // Use a ref for prNumber so socket listeners don't re-register on every pr state change
  const prNumberRef = useRef<number | null>(null);
  useEffect(() => {
    prNumberRef.current = pr?.prNumber ?? null;
  }, [pr?.prNumber]);

  const fetchPR = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/api/prs/${id}`);
      setPr(data.pr);

      // If PR is currently being reviewed, show the progress panel
      if (data.pr?.status === "reviewing") {
        const allReviews = data.reviews || [];

        // Find the in-progress review (one without a finalSummary/overallVerdict)
        const inProgressReview = allReviews.find(
          (r: ReviewData) => !r.overallVerdict && !r.finalSummary,
        );

        if (inProgressReview) {
          // Show only the in-progress review so old verdicts don't leak through
          setReviews([inProgressReview]);

          // If socket events are actively driving state, don't overwrite from DB
          // (socket is more up-to-date than the API response)
          if (!socketDriving.current) {
            const agentStatuses: Record<string, string> = {};
            for (const report of inProgressReview.agentReports || []) {
              if (
                report.agentType === "reviewer" ||
                report.agentType === "synthesizer"
              )
                continue;
              agentStatuses[report.agentType] = report.status;
            }
            // Merge with existing liveAgents — never downgrade a status
            const STATUS_RANK: Record<string, number> = {
              pending: 0,
              running: 1,
              completed: 2,
              failed: 2,
            };
            setLiveAgents((prev) => {
              const merged = { ...prev };
              for (const [agent, status] of Object.entries(agentStatuses)) {
                const prevRank = STATUS_RANK[merged[agent]] ?? -1;
                const newRank = STATUS_RANK[status] ?? -1;
                if (newRank >= prevRank) {
                  merged[agent] = status;
                }
              }
              for (const [agent, status] of Object.entries(agentStatuses)) {
                if (!(agent in merged)) {
                  merged[agent] = status;
                }
              }
              return merged;
            });
          }
        } else {
          // Job hasn't created a Review doc yet — only seed liveAgents if socket isn't driving
          setReviews([]);
          if (!socketDriving.current) {
            const repoFocusAreas = (data.pr?.repoId as any)?.settings
              ?.focusAreas ?? [
              "security",
              "bugs",
              "performance",
              "readability",
              "best-practices",
              "documentation",
            ];
            const initial: Record<string, string> = {};
            repoFocusAreas.forEach((a: string) => (initial[a] = "pending"));
            setLiveAgents(initial);
          }
        }
      } else {
        // Not reviewing — show all reviews, clear stale live progress
        setReviews(data.reviews || []);
        setLiveAgents({});
        setSynthesizerStatus("idle");
        socketDriving.current = false;
      }

      // Check if repo is indexed
      const repoId = data.pr?.repoId?._id || data.pr?.repoId;
      if (repoId) {
        try {
          const ctxRes = await api.get("/repos/context-status");
          const ctx = ctxRes.data.contexts?.[repoId];
          setRepoIndexed(ctx?.indexStatus === "ready");
        } catch {
          setRepoIndexed(null);
        }
      }
    } catch {
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Use a ref for fetchPR so socket listeners don't re-register when it changes
  const fetchPRRef = useRef(fetchPR);
  useEffect(() => {
    fetchPRRef.current = fetchPR;
  }, [fetchPR]);

  useEffect(() => {
    fetchPR();
  }, [fetchPR]);

  // When socket reconnects after a disconnect (e.g. server restart/deploy),
  // refetch PR data so the UI recovers from stale "reviewing" state.
  const prevConnected = useRef(connected);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      // Socket just reconnected — refetch to pick up any status resets
      fetchPRRef.current();
    }
    prevConnected.current = connected;
  }, [connected]);

  // Polling fallback: only when socket is disconnected (no realtime events).
  // When socket IS connected, events drive the UI — no polling needed.
  useEffect(() => {
    if (pr?.status !== "reviewing") return;
    if (connected) return; // Socket is live — don't poll

    console.log("[PRDetail] Socket disconnected — starting poll fallback");
    const interval = setInterval(() => {
      console.log("[PRDetail] Polling fallback — refetching PR status");
      fetchPRRef.current();
    }, 5000);

    return () => clearInterval(interval);
  }, [pr?.status, connected]);

  // Socket listeners for real-time progress
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      on("review:started", (data: ReviewStartedEvent) => {
        console.log("[PRDetail] review:started", data);
        const currentPrNumber = prNumberRef.current;
        if (!currentPrNumber || data.prNumber === currentPrNumber) {
          socketDriving.current = true;
          const initial: Record<string, string> = {};
          data.agents.forEach((a) => (initial[a] = "pending"));
          setLiveAgents(initial);
          setSynthesizerStatus("idle");
          setReviews([]);
          setPr((prev) => (prev ? { ...prev, status: "reviewing" } : prev));
        }
      }),
    );

    cleanups.push(
      on("agent:started", (data: AgentStartedEvent) => {
        console.log("[PRDetail] agent:started", data.agentType);
        socketDriving.current = true;
        setLiveAgents((prev) => {
          // Never downgrade: only set to "running" if not already completed/failed
          const current = prev[data.agentType];
          if (current === "completed" || current === "failed") return prev;
          return { ...prev, [data.agentType]: "running" };
        });
      }),
    );

    cleanups.push(
      on("agent:completed", (data: AgentCompletedEvent) => {
        console.log("[PRDetail] agent:completed", data.agentType);
        socketDriving.current = true;
        setLiveAgents((prev) => ({ ...prev, [data.agentType]: "completed" }));
      }),
    );

    cleanups.push(
      on("agent:failed", (data: AgentFailedEvent) => {
        console.log("[PRDetail] agent:failed", data.agentType);
        socketDriving.current = true;
        setLiveAgents((prev) => ({ ...prev, [data.agentType]: "failed" }));
      }),
    );

    cleanups.push(
      on("synthesizer:started", (_data: SynthesizerStartedEvent) => {
        console.log("[PRDetail] synthesizer:started");
        socketDriving.current = true;
        setSynthesizerStatus("running");
      }),
    );

    cleanups.push(
      on("review:completed", (_data: ReviewCompletedEvent) => {
        console.log("[PRDetail] review:completed");
        socketDriving.current = false;
        setLiveAgents({});
        setSynthesizerStatus("done");
        setPr((prev) => (prev ? { ...prev, status: "reviewed" } : prev));
        fetchPRRef.current();
      }),
    );

    return () => cleanups.forEach((c) => c());
    // Only register once on mount — stable refs handle the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const handleTriggerReview = async () => {
    if (!id) return;
    setTriggering(true);
    try {
      await api.post(`/api/prs/${id}/review`);
      setPr((prev) => (prev ? { ...prev, status: "reviewing" } : prev));
      // Clear old review data so the UI shows progress panel, not stale verdict
      setReviews([]);
      // Pre-populate live agents from repo's focus areas (or all 6 as fallback)
      const repoFocusAreas = (pr?.repoId as any)?.settings?.focusAreas ?? [
        "security",
        "bugs",
        "performance",
        "readability",
        "best-practices",
        "documentation",
      ];
      const initial: Record<string, string> = {};
      repoFocusAreas.forEach((a: string) => (initial[a] = "pending"));
      setLiveAgents(initial);
      setSynthesizerStatus("idle");
      setActiveTab("final");
    } catch {
      /* error */
    } finally {
      setTriggering(false);
    }
  };

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

  // Get agent report for active tab
  const activeReport = latestReview?.agentReports.find(
    (r) => r.agentType === activeTab,
  );

  // Parse synthesizer output from the "reviewer" agent report
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

  const isReviewing =
    pr.status === "reviewing" || Object.keys(liveAgents).length > 0;

  return (
    <div className="max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to PRs
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

            {/* Trigger review */}
            {(pr.status === "pending" || pr.status === "reviewed") &&
              repoIndexed && (
                <button
                  onClick={handleTriggerReview}
                  disabled={triggering}
                  className="clay-btn px-4 py-2 text-xs text-primary flex items-center gap-1.5"
                >
                  {triggering ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {pr.status === "reviewed" ? "Re-review" : "Review"}
                </button>
              )}
          </div>
        </div>

        {/* Verdict banner — hide during active review */}
        {verdictCfg && latestReview && !isReviewing && (
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

      {/* Not indexed warning */}
      {repoIndexed === false && (
        <div
          className="clay p-4 mb-5 flex items-start gap-3"
          style={{ borderRadius: "20px" }}
        >
          <Database className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-accent mb-0.5">
              Codebase not indexed
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This repo needs to be indexed before running reviews. Go to{" "}
              <button
                onClick={() => navigate("/dashboard/repos")}
                className="text-primary hover:underline"
              >
                Repos
              </button>{" "}
              and click "Index Codebase" first.
            </p>
          </div>
        </div>
      )}

      {/* Real-time progress panel */}
      {isReviewing && Object.keys(liveAgents).length > 0 && (
        <div className="clay p-4 mb-5" style={{ borderRadius: "20px" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
              Review in Progress
            </p>
            <span
              className={`flex items-center gap-1.5 text-[10px] ${connected ? "text-chart-5" : "text-accent"}`}
              title={connected ? "Live updates active" : "Reconnecting..."}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-chart-5 animate-pulse" : "bg-accent"}`}
              />
              {connected ? "Live" : "Reconnecting"}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {AGENT_TABS.filter((t) => t.id !== "final" && liveAgents[t.id]).map(
              (tab) => {
                const status = liveAgents[tab.id];
                const TabIcon = tab.icon;
                return (
                  <div
                    key={tab.id}
                    className={`clay-pressed px-3 py-2 flex items-center gap-2 transition-all duration-300 ${status === "running" ? "ring-1 ring-primary/20" : ""}`}
                    style={{ borderRadius: "10px" }}
                  >
                    {status === "running" ? (
                      <Loader2
                        className={`w-3.5 h-3.5 ${tab.color} animate-spin`}
                      />
                    ) : status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-chart-5" />
                    ) : status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      /* pending / queued — pulsing icon to show it's waiting */
                      <TabIcon className="w-3.5 h-3.5 text-muted-foreground/40 animate-pulse" />
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {tab.label}
                    </span>
                    {status === "pending" && (
                      <span className="text-[9px] text-muted-foreground/40">
                        queued
                      </span>
                    )}
                  </div>
                );
              },
            )}

            {/* Synthesizer step */}
            <div
              className={`clay-pressed px-3 py-2 flex items-center gap-2 ${synthesizerStatus === "running" ? "ring-1 ring-primary/30" : ""}`}
              style={{ borderRadius: "10px" }}
            >
              {synthesizerStatus === "running" ? (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : synthesizerStatus === "done" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-chart-5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground/30" />
              )}
              <span className="text-[10px] text-muted-foreground">
                Synthesizer
              </span>
            </div>
          </div>
        </div>
      )}

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
                    // Switch to viewing this review
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
      {!latestReview && !isReviewing && (
        <div
          className="clay p-8 sm:p-12 flex flex-col items-center text-center"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-primary/8 mb-4">
            <GitPullRequest className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">No review yet</h2>
          {repoIndexed === false ? (
            <>
              <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
                This repo's codebase hasn't been indexed yet. Index it first so
                the AI agents have full context for the review.
              </p>
              <button
                onClick={() => navigate("/dashboard/repos")}
                className="clay-btn px-5 py-2.5 text-sm flex items-center gap-2 text-accent"
              >
                <Database className="w-4 h-4" />
                Go to Repos
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
                This PR hasn't been reviewed yet. Trigger a review to get
                AI-powered analysis.
              </p>
              <button
                onClick={handleTriggerReview}
                disabled={triggering}
                className="clay-btn px-5 py-2.5 text-sm flex items-center gap-2 text-primary"
              >
                {triggering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Start Review
              </button>
            </>
          )}
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
      {/* Agent status + duration */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {report.status === "completed" ? (
            <CheckCircle2 className="w-4 h-4 text-chart-5" />
          ) : report.status === "failed" ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : report.status === "running" ? (
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
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

      {/* Summary */}
      {summary && (
        <div className="clay-pressed p-3 mb-4" style={{ borderRadius: "12px" }}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {summary}
          </p>
        </div>
      )}

      {/* Findings */}
      {report.status === "failed" ? (
        <div className="text-center py-6">
          <XCircle className="w-8 h-8 text-destructive/30 mx-auto mb-2" />
          <p className="text-xs text-destructive/70 font-medium">
            Agent failed
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            This agent timed out or encountered an error. Re-run the review to
            retry.
          </p>
        </div>
      ) : report.findings.length === 0 ? (
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
  // Collect all findings across agents, sorted by severity
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

  // Severity counts
  const counts: Record<string, number> = {};
  for (const f of allFindings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  return (
    <div>
      {/* Verdict */}
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

      {/* Severity counts */}
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

      {/* Top actions from synthesizer */}
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

      {/* Changelog */}
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

      {/* Inline comments preview */}
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

      {/* All findings (prioritized) */}
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
