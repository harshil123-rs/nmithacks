import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  ChevronDown,
  Activity,
  TrendingUp,
  FileCode,
  GitBranch,
  Clock,
  BarChart3,
} from "lucide-react";
import api from "../api/axios";
import { ScoreGauge } from "../components/health/ScoreGauge";
import { EmptyHealth } from "../components/health/EmptyHealth";
import { SignalCard } from "../components/health/SignalCard";
import { TrendChart } from "../components/health/TrendChart";
import { HotFileList } from "../components/health/HotFileList";
import { StatCard } from "../components/health/StatCard";
import { CommitTimeline } from "../components/health/CommitTimeline";
import { SignalTrendChart } from "../components/health/SignalTrendChart";
import { CodebaseGrowthChart } from "../components/health/CodebaseGrowthChart";

interface Repo {
  _id: string;
  fullName: string;
}

interface HealthSnapshot {
  repoId: string;
  repoFullName: string;
  score: number;
  signals: {
    coupling: { gini: number; normalized: number };
    churnRisk: { hotFileCount: number; normalized: number };
    debt: { weightedTotal: number; avgPerPR: number; normalized: number };
    confidence: { rollingAvg: number; normalized: number };
  };
  hotFiles: string[];
  totalFiles: number;
  totalDefs: number;
  prCount: number;
  computedAt: string;
  recentPushes: Array<{
    commitSha: string;
    files: string[];
    pushedAt: string;
    fileDiffs: Array<{
      filename: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
  }>;
  metrics: {
    totalSnapshots: number;
    scoreChange: number;
    daysTracked: number;
  };
}

interface HistoryPoint {
  score: number;
  computedAt: string;
  gini: number;
  hotFileCount: number;
  coupling: number;
  churnRisk: number;
  debt: number;
  confidence: number;
  totalFiles: number;
  totalDefs: number;
}

/**
 * Repo Health dashboard page. Displays structural health scores, signal breakdowns
 * (coupling, churn risk, debt, confidence), trend charts, commit timeline, and
 * hot file analysis for the selected repository. Supports multi-repo switching
 * via URL search params.
 */
export default function RepoHealth() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapError, setSnapError] = useState<any>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch repos on mount
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const { data } = await api.get("/repos");
        const repoList = (data.repos || []).map((r: any) => ({
          _id: r._id,
          fullName: r.fullName,
        }));
        setRepos(repoList);

        // Redirect if no repos
        if (repoList.length === 0) {
          navigate("/dashboard/repos");
          // Note: Toast would go here if toast system is available
        }
      } catch (err) {
        console.error("Failed to fetch repos:", err);
      } finally {
        setReposLoading(false);
      }
    };

    fetchRepos();
  }, [navigate]);

  // Determine active repo
  const activeRepoId = searchParams.get("repoId") || repos[0]?._id;
  const activeRepo = repos.find((r) => r._id === activeRepoId);

  // Fetch health data when activeRepoId changes
  useEffect(() => {
    if (!activeRepoId) return;

    const fetchHealthData = async () => {
      setSnapLoading(true);
      setSnapError(null);

      try {
        // Fetch snapshot
        const { data: snapshotData } = await api.get(
          `/health/${activeRepoId}/latest`,
        );
        setSnapshot(snapshotData);

        // Fetch history
        try {
          const { data: historyData } = await api.get(
            `/health/${activeRepoId}/history?days=90`,
          );
          setHistory(historyData.history || []);
        } catch (histErr) {
          // History is optional, don't fail if it errors
          setHistory([]);
        }
      } catch (err: any) {
        setSnapError(err);
        setSnapshot(null);
        setHistory([]);
      } finally {
        setSnapLoading(false);
      }
    };

    fetchHealthData();
  }, [activeRepoId]);

  // Handle repo selection
  const handleRepoChange = (repoId: string) => {
    setSearchParams({ repoId });
    setDropdownOpen(false);
  };

  // Retry function
  const handleRetry = () => {
    if (activeRepoId) {
      setSnapError(null);
      setSnapLoading(true);
      // Trigger re-fetch by updating a dummy state or calling fetch directly
      api
        .get(`/health/${activeRepoId}/latest`)
        .then(({ data }) => {
          setSnapshot(data);
          setSnapError(null);
        })
        .catch((err) => setSnapError(err))
        .finally(() => setSnapLoading(false));
    }
  };

  // STATE 1: LOADING
  if (snapLoading || reposLoading) {
    return (
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Repo Health</h1>
          <p className="text-sm text-muted-foreground">
            Loading health data...
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="clay-card p-6 animate-pulse">
              <div className="h-32 bg-gray-700/20 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // STATE 2: NO REPOS (handled by redirect in useEffect)
  if (repos.length === 0) {
    return (
      <div className="max-w-6xl">
        <div className="clay-card p-8 flex flex-col items-center gap-4">
          <AlertCircle size={40} className="text-amber-500" />
          <h3 className="text-lg font-medium">No repositories connected</h3>
          <p className="text-sm text-gray-400 text-center">
            Connect a repository first to see health data
          </p>
          <button
            onClick={() => navigate("/dashboard/repos")}
            className="clay-btn px-4 py-2 text-sm text-primary"
          >
            Go to Repos
          </button>
        </div>
      </div>
    );
  }

  // STATE 3: NO HEALTH DATA (404)
  if (snapError?.response?.status === 404) {
    return (
      <div className="max-w-6xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Repo Health</h1>
            <p className="text-sm text-muted-foreground">
              Structural health of {activeRepo?.fullName || "your repository"}
            </p>
          </div>

          {/* Repo selector */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="clay-btn px-4 py-2.5 text-sm flex items-center gap-2 min-w-[200px] justify-between"
            >
              <span className="truncate">
                {activeRepo?.fullName || "Select repo"}
              </span>
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            </button>
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-2 clay p-1.5 z-50 w-64"
                style={{ borderRadius: "14px" }}
              >
                {repos.map((r) => (
                  <button
                    key={r._id}
                    onClick={() => handleRepoChange(r._id)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate ${
                      r._id === activeRepoId
                        ? "text-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                    }`}
                  >
                    {r.fullName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <EmptyHealth repoName={activeRepo?.fullName} />
      </div>
    );
  }

  // STATE 4: ERROR (non-404)
  if (snapError) {
    return (
      <div className="max-w-6xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Repo Health</h1>
            <p className="text-sm text-muted-foreground">
              Structural health of {activeRepo?.fullName || "your repository"}
            </p>
          </div>

          {/* Repo selector */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="clay-btn px-4 py-2.5 text-sm flex items-center gap-2 min-w-[200px] justify-between"
            >
              <span className="truncate">
                {activeRepo?.fullName || "Select repo"}
              </span>
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            </button>
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-2 clay p-1.5 z-50 w-64"
                style={{ borderRadius: "14px" }}
              >
                {repos.map((r) => (
                  <button
                    key={r._id}
                    onClick={() => handleRepoChange(r._id)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate ${
                      r._id === activeRepoId
                        ? "text-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                    }`}
                  >
                    {r.fullName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="clay-card p-6 flex items-start gap-4 bg-destructive/5 border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-destructive mb-1">
              Failed to load health data
            </h3>
            <p className="text-xs text-gray-400">
              {snapError?.response?.data?.error ||
                snapError?.message ||
                "Unknown error occurred"}
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="clay-btn px-3 py-1.5 text-xs text-primary flex-shrink-0"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // STATE 5 & 6: LOADED (with or without stale data)
  if (!snapshot) return null;

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Repo Health</h1>
          <p className="text-sm text-muted-foreground">
            Structural health of {activeRepo?.fullName || "your repository"}
          </p>
        </div>

        {/* Repo selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="clay-btn px-4 py-2.5 text-sm flex items-center gap-2 min-w-[200px] justify-between"
          >
            <span className="truncate">
              {activeRepo?.fullName || "Select repo"}
            </span>
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          </button>
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-2 clay p-1.5 z-50 w-64"
              style={{ borderRadius: "14px" }}
            >
              {repos.map((r) => (
                <button
                  key={r._id}
                  onClick={() => handleRepoChange(r._id)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate ${
                    r._id === activeRepoId
                      ? "text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                  }`}
                >
                  {r.fullName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard
          icon={Activity}
          label="Health Score"
          value={Math.round(snapshot.score)}
          color={
            snapshot.score >= 80
              ? "text-chart-5"
              : snapshot.score >= 60
                ? "text-accent"
                : "text-destructive"
          }
          trend={snapshot.metrics.scoreChange}
        />
        <StatCard
          icon={FileCode}
          label="Total Files"
          value={snapshot.totalFiles}
          color="text-primary"
        />
        <StatCard
          icon={GitBranch}
          label="Definitions"
          value={snapshot.totalDefs}
          color="text-secondary"
        />
        <StatCard
          icon={TrendingUp}
          label="Snapshots"
          value={snapshot.metrics.totalSnapshots}
          color="text-chart-5"
        />
        <StatCard
          icon={Clock}
          label="Days Tracked"
          value={snapshot.metrics.daysTracked}
          color="text-accent"
        />
        <StatCard
          icon={BarChart3}
          label="PRs Analyzed"
          value={snapshot.prCount}
          color="text-muted-foreground"
        />
      </div>

      {/* Main dashboard layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Score Gauge */}
        <div className="lg:col-span-1">
          <ScoreGauge
            score={Math.round(snapshot.score)}
            computedAt={snapshot.computedAt}
          />
        </div>

        {/* Signal Cards - 2x2 grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SignalCard signal="coupling" value={snapshot.signals.coupling} />
          <SignalCard signal="churnRisk" value={snapshot.signals.churnRisk} />
          <SignalCard signal="debt" value={snapshot.signals.debt} />
          <SignalCard signal="confidence" value={snapshot.signals.confidence} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Score Trend Chart */}
        {history.length > 0 && <TrendChart data={history} />}

        {/* Commit Timeline with integrated diff viewer */}
        {snapshot.recentPushes && snapshot.recentPushes.length > 0 && (
          <CommitTimeline
            pushes={snapshot.recentPushes}
            repoId={activeRepoId!}
          />
        )}
      </div>

      {/* Signal trends */}
      {history.length > 1 && (
        <div className="mb-4">
          <SignalTrendChart data={history} />
        </div>
      )}

      {/* Codebase growth */}
      {history.length > 1 && (
        <div className="mb-4">
          <CodebaseGrowthChart data={history} />
        </div>
      )}

      {/* Hot Files List - full width, only if files exist */}
      {snapshot.hotFiles.length > 0 && (
        <div>
          <HotFileList files={snapshot.hotFiles} />
        </div>
      )}
    </div>
  );
}
