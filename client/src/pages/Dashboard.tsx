import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import type { ReviewCompletedEvent } from "../hooks/useSocket";
import {
  Loader2,
  Search,
  Filter,
  Play,
  CheckCircle2,
  Clock,
  ChevronDown,
  GitBranch,
  RefreshCw,
  Inbox,
  FolderGit2,
  Database,
} from "lucide-react";
import api from "../api/axios";

interface PRItem {
  _id: string;
  prNumber: number;
  title: string;
  body: string;
  author: { login: string; avatarUrl: string };
  headSha: string;
  baseBranch: string;
  headBranch: string;
  status: "pending" | "reviewing" | "reviewed";
  createdAt: string;
  githubCreatedAt?: string;
  repoId: { _id: string; fullName: string; owner: string; name: string } | null;
  latestReview: {
    _id: string;
    overallVerdict: string;
    confidenceScore: number;
    finalSummary: string;
  } | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: any; color: string }
> = {
  pending: { label: "Pending", icon: Clock, color: "text-muted-foreground" },
  reviewing: { label: "Reviewing", icon: Loader2, color: "text-accent" },
  reviewed: { label: "Reviewed", icon: CheckCircle2, color: "text-chart-5" },
};

const VERDICT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  approve: { label: "Approved", color: "text-chart-5", bg: "bg-chart-5/10" },
  request_changes: {
    label: "Changes Requested",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  comment: {
    label: "Commented",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  block: {
    label: "Blocked",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { on, connected } = useSocket(
    localStorage.getItem("socket_user_id") || undefined,
  );

  const [prs, setPrs] = useState<PRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const statusFilter = searchParams.get("status") || "pending";
  const repoFilter = searchParams.get("repo") || "";
  const searchQuery = searchParams.get("q") || "";

  const [repos, setRepos] = useState<{ _id: string; fullName: string }[]>([]);
  const [repoDropOpen, setRepoDropOpen] = useState(false);
  const [contextStatus, setContextStatus] = useState<Record<string, string>>(
    {},
  );

  const fetchPRs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: "20",
      };
      if (statusFilter) params.status = statusFilter;
      if (repoFilter) params.repo = repoFilter;
      const { data } = await api.get("/api/prs", { params });
      setPrs(data.prs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      /* handled by axios interceptor */
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, repoFilter]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  // Fetch connected repos for the repo filter dropdown
  useEffect(() => {
    api
      .get("/repos")
      .then(({ data }) => {
        setRepos(
          (data.repos || []).map((r: any) => ({
            _id: r._id,
            fullName: r.fullName,
          })),
        );
      })
      .catch(() => {});

    api
      .get("/repos/context-status")
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const [id, ctx] of Object.entries(data.contexts || {})) {
          map[id] = (ctx as any).indexStatus;
        }
        setContextStatus(map);
      })
      .catch(() => {});
  }, []);

  // Stable ref so socket listeners don't re-register on every fetchPRs change
  const fetchPRsRef = useRef(fetchPRs);
  useEffect(() => {
    fetchPRsRef.current = fetchPRs;
  }, [fetchPRs]);

  // When socket reconnects after server restart, refetch PR list
  // so stale "reviewing" statuses update to the reset "pending" state.
  const prevConnected = useRef(connected);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      fetchPRsRef.current();
    }
    prevConnected.current = connected;
  }, [connected]);

  // Real-time: update PR status when review events fire
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      on("review:started", (data: any) => {
        setPrs((prev) =>
          prev.map((p) =>
            p.prNumber === data.prNumber &&
            (p.repoId as any)?.fullName === data.repoFullName
              ? { ...p, status: "reviewing" as const, latestReview: null }
              : p,
          ),
        );
      }),
    );

    cleanups.push(
      on("review:completed", (_data: ReviewCompletedEvent) => {
        fetchPRsRef.current();
      }),
    );

    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const handleTriggerReview = async (prId: string) => {
    setTriggering(prId);
    try {
      await api.post(`/api/prs/${prId}/review`);
      setPrs((prev) =>
        prev.map((p) =>
          p._id === prId
            ? { ...p, status: "reviewing" as const, latestReview: null }
            : p,
        ),
      );
    } catch {
      /* error */
    } finally {
      setTriggering(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data } = await api.get("/repos");
      const repos = data.repos || [];
      await Promise.allSettled(
        repos.map((r: any) => api.post(`/repos/${r._id}/sync`)),
      );
      // Give background sync a moment, then refresh
      setTimeout(() => fetchPRs(), 3000);
    } catch {
      /* error */
    } finally {
      setSyncing(false);
    }
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Filter PRs by search query (client-side)
  const filteredPRs = searchQuery
    ? prs.filter(
        (p) =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.author.login.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.repoId?.fullName || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()),
      )
    : prs;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Pull Requests</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} PRs across your connected repos`
              : "Your PR review inbox"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="clay-btn px-3 py-2.5 text-xs flex items-center gap-1.5 text-primary"
            title="Sync PRs from GitHub"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing..." : "Sync PRs"}
          </button>
          <button
            onClick={fetchPRs}
            disabled={loading}
            className="clay-btn px-3 py-2.5 text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="clay-pressed p-1 flex items-center gap-2 flex-1"
          style={{ borderRadius: "14px" }}
        >
          <Search className="w-4 h-4 text-muted-foreground/40 ml-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Search PRs..."
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/30"
          />
        </div>

        {/* Repo filter */}
        {repos.length > 1 && (
          <div className="relative">
            <button
              onClick={() => {
                setRepoDropOpen(!repoDropOpen);
                setFilterOpen(false);
              }}
              className={`clay-btn px-3 py-2.5 text-sm flex items-center gap-2 ${repoFilter ? "text-secondary" : "text-muted-foreground"}`}
            >
              <FolderGit2 className="w-4 h-4" />
              <span className="hidden sm:inline max-w-[120px] truncate">
                {repoFilter
                  ? repos
                      .find((r) => r._id === repoFilter)
                      ?.fullName?.split("/")[1] || "Repo"
                  : "All repos"}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {repoDropOpen && (
              <div
                className="absolute right-0 top-full mt-2 clay p-1.5 z-50 w-56"
                style={{ borderRadius: "14px" }}
              >
                <button
                  onClick={() => {
                    setFilter("repo", "");
                    setRepoDropOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${!repoFilter ? "text-secondary bg-secondary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                >
                  All repositories
                </button>
                {repos.map((r) => (
                  <button
                    key={r._id}
                    onClick={() => {
                      setFilter("repo", r._id);
                      setRepoDropOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 truncate ${repoFilter === r._id ? "text-secondary bg-secondary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                  >
                    <FolderGit2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{r.fullName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status filter */}
        <div className="relative">
          <button
            onClick={() => {
              setFilterOpen(!filterOpen);
              setRepoDropOpen(false);
            }}
            className={`clay-btn px-3 py-2.5 text-sm flex items-center gap-2 ${statusFilter ? "text-primary" : "text-muted-foreground"}`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">
              {statusFilter ? STATUS_CONFIG[statusFilter]?.label : "All"}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {filterOpen && (
            <div
              className="absolute right-0 top-full mt-2 clay p-1.5 z-50 w-44"
              style={{ borderRadius: "14px" }}
            >
              <button
                onClick={() => {
                  setFilter("status", "");
                  setFilterOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${!statusFilter ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
              >
                All statuses
              </button>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => {
                    setFilter("status", key);
                    setFilterOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${statusFilter === key ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                >
                  <cfg.icon className={`w-3 h-3 ${cfg.color}`} />
                  {cfg.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PR List */}
      {loading && prs.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="clay p-8 flex flex-col items-center gap-4"
            style={{ borderRadius: "24px" }}
          >
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading pull requests...
            </p>
          </div>
        </div>
      ) : filteredPRs.length === 0 ? (
        <div
          className="clay p-8 sm:p-12 flex flex-col items-center text-center"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-primary/8 mb-4">
            <Inbox className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">
            {total === 0 ? "No pull requests yet" : "No matching PRs"}
          </h2>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            {total === 0
              ? "PRs will appear here once a webhook fires on your connected repos. Open a PR to get started."
              : "Try adjusting your search or filters. Switch to 'All statuses' to see reviewed PRs."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPRs.map((pr) => {
            // Derive effective status — if a review exists, it's reviewed regardless of DB field
            const effectiveStatus =
              pr.latestReview && pr.status === "pending"
                ? "reviewed"
                : pr.status;
            const statusCfg = STATUS_CONFIG[effectiveStatus];
            const verdictCfg = pr.latestReview
              ? VERDICT_CONFIG[pr.latestReview.overallVerdict]
              : null;
            const StatusIcon = statusCfg.icon;

            return (
              <button
                key={pr._id}
                onClick={() => navigate(`/dashboard/pr/${pr._id}`)}
                className="clay w-full p-4 text-left transition-all hover:scale-[1.005] cursor-pointer"
                style={{ borderRadius: "16px" }}
              >
                <div className="flex items-start gap-3">
                  {/* Author avatar */}
                  <div className="flex-shrink-0 mt-0.5">
                    {pr.author.avatarUrl ? (
                      <img
                        src={pr.author.avatarUrl}
                        alt={pr.author.login}
                        className="w-8 h-8 rounded-full border border-white/10"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {pr.author.login.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {/* Repo pill */}
                      {pr.repoId && (
                        <span className="clay-pill px-2 py-0.5 text-[10px] text-secondary flex items-center gap-1">
                          <FolderGit2 className="w-2.5 h-2.5" />
                          {(pr.repoId as any).fullName ||
                            (pr.repoId as any).name}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        #{pr.prNumber}
                      </span>
                    </div>

                    <p className="text-sm font-semibold truncate mb-1">
                      {pr.title}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        @{pr.author.login}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <GitBranch className="w-2.5 h-2.5" />
                        {pr.headBranch}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(pr.githubCreatedAt || pr.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Right side: status + verdict + action */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Verdict badge — hide while reviewing */}
                    {verdictCfg && pr.status !== "reviewing" && (
                      <span
                        className={`clay-pill px-2.5 py-1 text-[10px] font-semibold ${verdictCfg.color} ${verdictCfg.bg}`}
                      >
                        {verdictCfg.label}
                      </span>
                    )}

                    {/* Status badge */}
                    <span
                      className={`flex items-center gap-1 text-[10px] ${statusCfg.color}`}
                    >
                      <StatusIcon
                        className={`w-3 h-3 ${effectiveStatus === "reviewing" ? "animate-spin" : ""}`}
                      />
                      {statusCfg.label}
                    </span>

                    {/* Manual review button — only for genuinely pending (no review yet) */}
                    {effectiveStatus === "pending" &&
                      (() => {
                        const repoId =
                          typeof pr.repoId === "object" && pr.repoId
                            ? (pr.repoId as any)._id
                            : pr.repoId;
                        const isIndexed = contextStatus[repoId] === "ready";
                        return isIndexed ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerReview(pr._id);
                            }}
                            disabled={triggering === pr._id}
                            className="clay-btn px-2.5 py-1.5 text-[10px] text-primary flex items-center gap-1"
                            title="Trigger review"
                          >
                            {triggering === pr._id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            Review
                          </button>
                        ) : (
                          <span
                            className="clay-pill px-2 py-1 text-[9px] text-muted-foreground/50 flex items-center gap-1"
                            title="Index this repo's codebase first"
                          >
                            <Database className="w-2.5 h-2.5" />
                            Not indexed
                          </span>
                        );
                      })()}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="clay-btn px-3 py-2 text-xs text-muted-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="clay-btn px-3 py-2 text-xs text-muted-foreground disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
