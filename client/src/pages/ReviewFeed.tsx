import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Inbox,
  Info,
} from "lucide-react";
import api from "../api/axios";

interface ReviewFeedItem {
  _id: string;
  overallVerdict: string;
  finalSummary: string;
  confidenceScore: number;
  createdAt: string;
  totalFindings: number;
  localTitle: string | null;
  severityCounts: Record<string, number>;
  pr: {
    _id: string;
    prNumber: number;
    title: string;
    author: { login: string; avatarUrl: string };
    headBranch: string;
    baseBranch: string;
  } | null;
  repo: { _id: string; fullName: string } | null;
}

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

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-destructive",
  high: "text-accent",
  medium: "text-chart-5",
  low: "text-muted-foreground",
  info: "text-primary/60",
};

export default function ReviewFeed() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [reviews, setReviews] = useState<ReviewFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const repoFilter = searchParams.get("repo") || "";
  const searchQuery = searchParams.get("q") || "";

  const [repos, setRepos] = useState<{ _id: string; fullName: string }[]>([]);
  const [repoDropOpen, setRepoDropOpen] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: "20",
      };
      if (repoFilter) params.repo = repoFilter;
      if (searchQuery) params.q = searchQuery;
      const { data } = await api.get("/api/reviews", { params });
      setReviews(data.reviews);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [page, repoFilter, searchQuery]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

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
  }, []);

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
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">
            Review History
          </h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} reviews across your repos`
              : "All past AI reviews in one place"}
          </p>
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
            placeholder="Search by PR title, author, or repo..."
            className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/30"
          />
        </div>

        {repos.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setRepoDropOpen(!repoDropOpen)}
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
      </div>

      {/* Review List */}
      {loading && reviews.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="clay p-8 flex flex-col items-center gap-4"
            style={{ borderRadius: "24px" }}
          >
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading reviews...</p>
          </div>
        </div>
      ) : reviews.length === 0 ? (
        <div
          className="clay p-8 sm:p-12 flex flex-col items-center text-center"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-primary/8 mb-4">
            <Inbox className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">No reviews yet</h2>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            Reviews will appear here once you run your first AI review on a PR.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((rev) => {
            const verdictCfg = VERDICT_CONFIG[rev.overallVerdict];
            const VerdictIcon = verdictCfg?.icon || Info;

            return (
              <button
                key={rev._id}
                onClick={() => {
                  if (rev.pr?._id) {
                    navigate(`/dashboard/pr/${rev.pr._id}`);
                  } else {
                    navigate(`/dashboard/reviews/${rev._id}`);
                  }
                }}
                className="clay w-full p-4 text-left transition-all hover:scale-[1.005] cursor-pointer"
                style={{ borderRadius: "16px" }}
              >
                <div className="flex items-start gap-3">
                  {/* Verdict icon */}
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`clay-pressed w-9 h-9 flex items-center justify-center ${verdictCfg?.bg || "bg-muted/10"}`}
                      style={{ borderRadius: "10px" }}
                    >
                      <VerdictIcon
                        className={`w-4 h-4 ${verdictCfg?.color || "text-muted-foreground"}`}
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {rev.repo && (
                        <span className="clay-pill px-2 py-0.5 text-[10px] text-secondary flex items-center gap-1">
                          <FolderGit2 className="w-2.5 h-2.5" />
                          {rev.repo.fullName}
                        </span>
                      )}
                      {rev.pr ? (
                        <span className="text-[10px] text-muted-foreground">
                          #{rev.pr.prNumber}
                        </span>
                      ) : (
                        <span className="clay-pill px-2 py-0.5 text-[10px] text-primary/70">
                          CLI
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {timeAgo(rev.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold truncate mb-1">
                      {rev.pr?.title || rev.localTitle || "Local Review"}
                    </p>

                    <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
                      {rev.finalSummary}
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">
                      {rev.pr && (
                        <>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            {rev.pr.author.avatarUrl ? (
                              <img
                                src={rev.pr.author.avatarUrl}
                                alt=""
                                className="w-3.5 h-3.5 rounded-full"
                              />
                            ) : null}
                            @{rev.pr.author.login}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <GitBranch className="w-2.5 h-2.5" />
                            {rev.pr.headBranch}
                          </span>
                        </>
                      )}

                      {/* Severity breakdown pills */}
                      {rev.severityCounts &&
                        Object.entries(rev.severityCounts)
                          .filter(([, count]) => count > 0)
                          .sort(
                            ([a], [b]) =>
                              [
                                "critical",
                                "high",
                                "medium",
                                "low",
                                "info",
                              ].indexOf(a) -
                              [
                                "critical",
                                "high",
                                "medium",
                                "low",
                                "info",
                              ].indexOf(b),
                          )
                          .map(([sev, count]) => (
                            <span
                              key={sev}
                              className={`text-[9px] ${SEVERITY_COLORS[sev] || "text-muted-foreground"}`}
                            >
                              {count} {sev}
                            </span>
                          ))}
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {verdictCfg && (
                      <span
                        className={`clay-pill px-2.5 py-1 text-[10px] font-semibold ${verdictCfg.color} ${verdictCfg.bg}`}
                      >
                        {verdictCfg.label}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {rev.totalFindings} findings
                      </span>
                      <span
                        className={`text-[10px] font-mono ${verdictCfg?.color || "text-muted-foreground"}`}
                      >
                        {rev.confidenceScore}%
                      </span>
                    </div>
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
