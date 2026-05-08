import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Info,
  User as UserIcon,
} from "lucide-react";
import api from "../api/axios";

interface MyPR {
  _id: string;
  prNumber: number;
  title: string;
  author: { login: string; avatarUrl: string };
  baseBranch: string;
  headBranch: string;
  status: string;
  updatedAt: string;
  githubCreatedAt?: string;
  repoId: { _id: string; fullName: string } | null;
  latestReview: {
    _id: string;
    overallVerdict: string;
    confidenceScore: number;
    finalSummary: string;
    totalFindings: number;
    severityCounts: Record<string, number>;
    createdAt: string;
  } | null;
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
};

export default function MyPRs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prs, setPrs] = useState<MyPR[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [verdictFilter, setVerdictFilter] = useState("");
  const [repoFilter, setRepoFilter] = useState("");
  const [repos, setRepos] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [repoDropOpen, setRepoDropOpen] = useState(false);
  const [verdictDropOpen, setVerdictDropOpen] = useState(false);

  const fetchPRs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("q", search);
      if (verdictFilter) params.set("verdict", verdictFilter);
      if (repoFilter) params.set("repo", repoFilter);

      const { data } = await api.get(`/api/prs/mine?${params.toString()}`);
      setPrs(data.prs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
      if (data.repos) setRepos(data.repos);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [page, search, verdictFilter, repoFilter]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-1">
          {user?.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-8 h-8 rounded-full border border-white/10"
            />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold">My PRs</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pull requests you've authored that were reviewed by LGTM.
        </p>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Search */}
        <div
          className="clay-pressed flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]"
          style={{ borderRadius: "14px" }}
        >
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by PR title or repo..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/30"
          />
        </div>

        {/* Verdict filter */}
        <div className="relative">
          <button
            onClick={() => {
              setVerdictDropOpen(!verdictDropOpen);
              setRepoDropOpen(false);
            }}
            className="clay-pill px-3 py-2 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {verdictFilter
              ? VERDICT_CONFIG[verdictFilter]?.label || verdictFilter
              : "All Verdicts"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {verdictDropOpen && (
            <div
              className="absolute top-full mt-1 right-0 clay p-1.5 z-50 min-w-[160px]"
              style={{ borderRadius: "12px" }}
            >
              <button
                onClick={() => {
                  setVerdictFilter("");
                  setVerdictDropOpen(false);
                  setPage(1);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${!verdictFilter ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
              >
                All Verdicts
              </button>
              {Object.entries(VERDICT_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => {
                    setVerdictFilter(key);
                    setVerdictDropOpen(false);
                    setPage(1);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${verdictFilter === key ? cfg.color : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                >
                  <cfg.icon className="w-3 h-3 flex-shrink-0" />
                  {cfg.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Repo filter */}
        {repos.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                setRepoDropOpen(!repoDropOpen);
                setVerdictDropOpen(false);
              }}
              className="clay-pill px-3 py-2 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              {repoFilter || "All Repos"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {repoDropOpen && (
              <div
                className="absolute top-full mt-1 right-0 clay p-1.5 z-50 min-w-[200px] max-h-60 overflow-y-auto"
                style={{ borderRadius: "12px" }}
              >
                <button
                  onClick={() => {
                    setRepoFilter("");
                    setRepoDropOpen(false);
                    setPage(1);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${!repoFilter ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                >
                  All Repos
                </button>
                {repos.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRepoFilter(r);
                      setRepoDropOpen(false);
                      setPage(1);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate flex items-center gap-2 ${repoFilter === r ? "text-secondary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                  >
                    <FolderGit2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{r}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div
        className="clay-pressed p-3 mb-5 flex items-start gap-2.5"
        style={{ borderRadius: "14px" }}
      >
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Showing pull requests where you are the author across any repository
          where LGTM is installed.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="clay p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading your PRs...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && prs.length === 0 && (
        <div
          className="clay p-8 sm:p-12 text-center"
          style={{ borderRadius: "20px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-primary/10 mx-auto mb-4">
            <UserIcon className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">No reviewed PRs yet</h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Once you open a pull request on a repository where LGTM is
            installed, your AI-powered review will appear here.
          </p>
        </div>
      )}

      {/* PR list */}
      {!loading && prs.length > 0 && (
        <div className="space-y-2">
          {prs.map((pr) => {
            const review = pr.latestReview;
            const verdict = review
              ? VERDICT_CONFIG[review.overallVerdict]
              : null;
            const repoName = (pr.repoId as any)?.fullName || "unknown";

            return (
              <button
                key={pr._id}
                onClick={() => navigate(`/dashboard/my-prs/${pr._id}`)}
                className="w-full clay-sm p-4 text-left hover:scale-[1.005] transition-transform"
                style={{ borderRadius: "16px" }}
              >
                <div className="flex items-start gap-3">
                  {/* Verdict indicator */}
                  <div className="flex-shrink-0 mt-1">
                    {verdict ? (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${verdict.bg}`}
                      >
                        <verdict.icon className={`w-4 h-4 ${verdict.color}`} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted/10">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {repoName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/30">
                        #{pr.prNumber}
                      </span>
                    </div>
                    <p className="text-sm font-semibold truncate mb-1.5">
                      {pr.title}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <GitBranch className="w-3 h-3" />
                        {pr.headBranch}
                      </span>
                      {review && (
                        <>
                          {verdict && (
                            <span
                              className={`clay-pill px-2 py-0.5 text-[9px] font-bold ${verdict.color}`}
                            >
                              {verdict.label}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {review.confidenceScore}% confidence
                          </span>
                          {review.totalFindings > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {review.totalFindings} finding
                              {review.totalFindings !== 1 ? "s" : ""}
                            </span>
                          )}
                        </>
                      )}
                      {!review && pr.status === "reviewing" && (
                        <span className="clay-pill px-2 py-0.5 text-[9px] font-bold text-accent flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Reviewing
                        </span>
                      )}
                      {!review && pr.status === "pending" && (
                        <span className="clay-pill px-2 py-0.5 text-[9px] text-muted-foreground">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(
                        review?.createdAt || pr.updatedAt,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}

      {/* Total count */}
      {!loading && total > 0 && (
        <p className="text-center text-[10px] text-muted-foreground/40 mt-4">
          {total} reviewed PR{total !== 1 ? "s" : ""} total
        </p>
      )}
    </div>
  );
}
