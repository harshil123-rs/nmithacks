import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";
import {
  FolderGit2,
  Plus,
  Search,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  Lock,
  Globe,
  Star,
  X,
  RefreshCw,
  ChevronDown,
  Shield,
  Bug,
  Zap,
  Eye,
  Code2,
  FileText,
  Sparkles,
  ExternalLink,
  Database,
  AlertTriangle,
  FileCode2,
  BookOpen,
  History,
  ChevronRight,
  MessageCircle,
  Crown,
} from "lucide-react";
import api from "../api/axios";

interface AvailableRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
  connected: boolean;
}

interface RepoSettings {
  autoReview: boolean;
  focusAreas: string[];
  aiProvider?: string;
  aiModel?: string;
  prChat?: boolean;
  allowedCommands?: string[];
  dailyChatLimit?: number;
}

interface ConnectedRepo {
  _id: string;
  owner: string;
  name: string;
  fullName: string;
  githubRepoId: number;
  webhookId: number;
  settings: RepoSettings;
  isActive: boolean;
  createdAt: string;
}

interface ContextDetail {
  indexStatus: string;
  files: string[];
  conventions: string[];
  prSummaries: string[];
  lastIndexedAt: string | null;
}

const FOCUS_AREAS = [
  { id: "bugs", label: "Bugs", icon: Bug, color: "text-destructive" },
  { id: "security", label: "Security", icon: Shield, color: "text-accent" },
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
    label: "Documentation",
    icon: FileText,
    color: "text-muted-foreground",
  },
];

export default function Repos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPaymentsLive = import.meta.env.VITE_DODO_ENV === "live";
  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [connecting, setConnecting] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState<string | null>(null);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [indexing, setIndexing] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [contextStatus, setContextStatus] = useState<
    Record<
      string,
      {
        indexStatus: string;
        lastIndexedAt: string | null;
        fileCount: number;
        conventionCount: number;
        historyCount: number;
      }
    >
  >({});
  const [liveProgress, setLiveProgress] = useState<
    Record<string, { step: string; progress: number }>
  >({});
  const [contextDetails, setContextDetails] = useState<
    Record<string, ContextDetail>
  >({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  // Which detail tab is active per repo
  const [detailTab, setDetailTab] = useState<
    Record<string, "files" | "conventions" | "history">
  >({});

  const { on, connected } = useSocket(user?._id);

  // Handle installation callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instId = params.get("installation_id");
    if (instId) {
      api
        .post("/auth/installation", { installationId: parseInt(instId, 10) })
        .then(() => {
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => {});
    }
  }, []);

  const fetchConnected = useCallback(async () => {
    try {
      const { data } = await api.get("/repos");
      setConnectedRepos(data.repos);
    } catch {
      /* handle error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnected();
  }, [fetchConnected]);

  const fetchContextStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/repos/context-status");
      setContextStatus(data.contexts || {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchContextStatus();
  }, [fetchContextStatus]);

  useEffect(() => {
    if (connectedRepos.length > 0) fetchContextStatus();
  }, [connectedRepos, fetchContextStatus]);

  // When socket reconnects after a server restart/deploy, refetch context
  // status so stale "indexing" spinners recover to the actual state.
  const prevConnected = useRef(connected);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      fetchContextStatus();
      // Clear stale live progress — server reset means those jobs are gone
      setLiveProgress({});
      setIndexing(null);
    }
    prevConnected.current = connected;
  }, [connected, fetchContextStatus]);

  // Real-time context indexing progress
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      on("context:started", (data: { repoId: string }) => {
        setLiveProgress((prev) => ({
          ...prev,
          [data.repoId]: { step: "indexer", progress: 5 },
        }));
        setContextStatus((prev) => ({
          ...prev,
          [data.repoId]: {
            ...prev[data.repoId],
            indexStatus: "indexing",
            fileCount: 0,
            conventionCount: 0,
            historyCount: 0,
            lastIndexedAt: null,
          },
        }));
      }),
    );

    cleanups.push(
      on(
        "context:progress",
        (data: { repoId: string; step: string; progress: number }) => {
          setLiveProgress((prev) => ({
            ...prev,
            [data.repoId]: { step: data.step, progress: data.progress },
          }));
        },
      ),
    );

    cleanups.push(
      on(
        "context:completed",
        (data: {
          repoId: string;
          fileCount: number;
          conventionCount: number;
          historyCount: number;
        }) => {
          setLiveProgress((prev) => {
            const next = { ...prev };
            delete next[data.repoId];
            return next;
          });
          setContextStatus((prev) => ({
            ...prev,
            [data.repoId]: {
              indexStatus: "ready",
              lastIndexedAt: new Date().toISOString(),
              fileCount: data.fileCount,
              conventionCount: data.conventionCount,
              historyCount: data.historyCount,
            },
          }));
          setIndexing(null);
          // Clear cached detail so it re-fetches
          setContextDetails((prev) => {
            const next = { ...prev };
            delete next[data.repoId];
            return next;
          });
        },
      ),
    );

    cleanups.push(
      on("context:failed", (data: { repoId: string }) => {
        setLiveProgress((prev) => {
          const next = { ...prev };
          delete next[data.repoId];
          return next;
        });
        setContextStatus((prev) => ({
          ...prev,
          [data.repoId]: { ...prev[data.repoId], indexStatus: "failed" },
        }));
        setIndexing(null);
      }),
    );

    return () => cleanups.forEach((c) => c());
  }, [on]);

  const fetchAvailable = async () => {
    setLoadingAvailable(true);
    setError(null);
    setInstallUrl(null);
    try {
      const { data } = await api.get("/repos/available");
      setAvailableRepos(data.repos);
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.needsInstall) {
        setInstallUrl(errData.installUrl);
        setError(errData.error);
      } else {
        setError(errData?.error || "Failed to fetch repositories");
      }
    } finally {
      setLoadingAvailable(false);
    }
  };

  const fetchContextDetail = async (repoId: string) => {
    if (contextDetails[repoId]) return; // already cached
    setLoadingDetail(repoId);
    try {
      const { data } = await api.get(`/repos/${repoId}/context-detail`);
      setContextDetails((prev) => ({ ...prev, [repoId]: data }));
    } catch {
      /* ignore */
    } finally {
      setLoadingDetail(null);
    }
  };

  const handleConnect = async (repo: AvailableRepo) => {
    setConnecting(repo.id);
    try {
      await api.post("/repos/connect", {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        githubRepoId: repo.id,
      });
      await fetchConnected();
      setAvailableRepos((prev) =>
        prev.map((r) => (r.id === repo.id ? { ...r, connected: true } : r)),
      );
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to connect repository");
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (repoId: string) => {
    setDisconnecting(repoId);
    try {
      await api.delete(`/repos/${repoId}`);
      setConnectedRepos((prev) => prev.filter((r) => r._id !== repoId));
      const disconnected = connectedRepos.find((r) => r._id === repoId);
      if (disconnected) {
        setAvailableRepos((prev) =>
          prev.map((r) =>
            r.id === disconnected.githubRepoId ? { ...r, connected: false } : r,
          ),
        );
      }
    } catch {
      /* handle error */
    } finally {
      setDisconnecting(null);
    }
  };

  const handleToggleAutoReview = async (repoId: string, current: boolean) => {
    setUpdatingSettings(repoId);
    try {
      const { data } = await api.patch(`/repos/${repoId}/settings`, {
        autoReview: !current,
      });
      setConnectedRepos((prev) =>
        prev.map((r) =>
          r._id === repoId ? { ...r, settings: data.repo.settings } : r,
        ),
      );
    } catch {
      /* handle error */
    } finally {
      setUpdatingSettings(null);
    }
  };

  const handleToggleFocusArea = async (
    repoId: string,
    areaId: string,
    currentAreas: string[],
  ) => {
    const newAreas = currentAreas.includes(areaId)
      ? currentAreas.filter((a) => a !== areaId)
      : [...currentAreas, areaId];
    setUpdatingSettings(repoId);
    try {
      const { data } = await api.patch(`/repos/${repoId}/settings`, {
        focusAreas: newAreas,
      });
      setConnectedRepos((prev) =>
        prev.map((r) =>
          r._id === repoId ? { ...r, settings: data.repo.settings } : r,
        ),
      );
    } catch {
      /* handle error */
    } finally {
      setUpdatingSettings(null);
    }
  };

  const handleTogglePrChat = async (repoId: string, current: boolean) => {
    setUpdatingSettings(repoId);
    try {
      const { data } = await api.patch(`/repos/${repoId}/settings`, {
        prChat: !current,
      });
      setConnectedRepos((prev) =>
        prev.map((r) =>
          r._id === repoId ? { ...r, settings: data.repo.settings } : r,
        ),
      );
    } catch {
      /* handle error */
    } finally {
      setUpdatingSettings(null);
    }
  };

  const handleToggleChatCommand = async (
    repoId: string,
    cmd: string,
    currentCommands: string[],
  ) => {
    const newCommands = currentCommands.includes(cmd)
      ? currentCommands.filter((c) => c !== cmd)
      : [...currentCommands, cmd];
    setUpdatingSettings(repoId);
    try {
      const { data } = await api.patch(`/repos/${repoId}/settings`, {
        allowedCommands: newCommands,
      });
      setConnectedRepos((prev) =>
        prev.map((r) =>
          r._id === repoId ? { ...r, settings: data.repo.settings } : r,
        ),
      );
    } catch {
      /* handle error */
    } finally {
      setUpdatingSettings(null);
    }
  };

  const handleUpdateDailyChatLimit = async (repoId: string, limit: number) => {
    setUpdatingSettings(repoId);
    try {
      const { data } = await api.patch(`/repos/${repoId}/settings`, {
        dailyChatLimit: limit,
      });
      setConnectedRepos((prev) =>
        prev.map((r) =>
          r._id === repoId ? { ...r, settings: data.repo.settings } : r,
        ),
      );
    } catch {
      /* handle error */
    } finally {
      setUpdatingSettings(null);
    }
  };

  const handleIndexRepo = async (repoId: string) => {
    setIndexing(repoId);
    try {
      await api.post(`/repos/${repoId}/index`);
      setContextStatus((prev) => ({
        ...prev,
        [repoId]: {
          ...prev[repoId],
          indexStatus: "indexing",
          fileCount: 0,
          conventionCount: 0,
          historyCount: 0,
          lastIndexedAt: null,
        },
      }));
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to trigger indexing");
    } finally {
      setIndexing(null);
    }
  };

  const handleSyncPRs = (repoId: string) => {
    setSyncing(repoId);
    api
      .post(`/repos/${repoId}/sync`)
      .catch((err: any) => {
        setError(err.response?.data?.error || "Failed to sync PRs");
      })
      .finally(() => setSyncing(null));
  };

  const filteredAvailable = availableRepos.filter(
    (r) =>
      !r.connected &&
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="clay p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Loading repositories...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Repositories</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Connect GitHub repos to enable AI-powered PR reviews.
          </p>
        </div>
        <button
          onClick={() => {
            setShowConnect(!showConnect);
            if (!showConnect && availableRepos.length === 0) fetchAvailable();
          }}
          className="clay-btn px-4 py-2.5 text-sm flex items-center gap-2 text-primary flex-shrink-0 w-full sm:w-auto justify-center sm:justify-start"
        >
          {showConnect ? (
            <X className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {showConnect ? "Close" : "Connect Repo"}
        </button>
      </div>

      {error && (
        <div
          className="clay-sm p-4 mb-6 flex items-start gap-3"
          style={{ borderRadius: "16px" }}
        >
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive break-words">{error}</p>
            {installUrl && (
              <a
                href={installUrl}
                className="clay-btn px-4 py-2 text-xs text-primary mt-3 inline-flex items-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Install GitHub App
              </a>
            )}
          </div>
          <button
            onClick={() => {
              setError(null);
              setInstallUrl(null);
            }}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connect new repo panel */}
      {showConnect && (
        <div className="clay p-4 sm:p-5 mb-6" style={{ borderRadius: "20px" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-secondary" />
              <p className="text-sm font-bold">Available Repositories</p>
            </div>
            <button
              onClick={fetchAvailable}
              disabled={loadingAvailable}
              className="clay-pill px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-3 h-3 ${loadingAvailable ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          <div
            className="clay-pressed p-1 flex items-center gap-2 mb-4"
            style={{ borderRadius: "14px" }}
          >
            <Search className="w-4 h-4 text-muted-foreground/40 ml-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/30"
            />
          </div>

          {loadingAvailable ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground ml-2">
                Fetching your repos from GitHub...
              </p>
            </div>
          ) : filteredAvailable.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                {availableRepos.length === 0
                  ? "No repositories found. Make sure the GitHub App is installed on your account."
                  : "No matching repositories."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {filteredAvailable.map((repo) => (
                <div
                  key={repo.id}
                  className="clay-pressed p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3"
                  style={{ borderRadius: "12px" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      {repo.isPrivate ? (
                        <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium truncate">
                        {repo.fullName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {repo.language && <span>{repo.language}</span>}
                      {repo.stars > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />
                          {repo.stars}
                        </span>
                      )}
                      {repo.description && (
                        <span className="truncate max-w-[200px] hidden sm:inline">
                          {repo.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleConnect(repo)}
                    disabled={connecting === repo.id}
                    className="clay-btn px-3 py-1.5 text-xs text-primary flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-center sm:justify-start"
                  >
                    {connecting === repo.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    Connect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connected repos */}
      {connectedRepos.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-wider">
            Connected Repositories ({connectedRepos.length})
          </p>
          {connectedRepos.map((repo) => {
            const isExpanded = expandedRepo === repo._id;
            const isUpdating = updatingSettings === repo._id;
            const ctx = contextStatus[repo._id];
            const detail = contextDetails[repo._id];
            const activeTab = detailTab[repo._id] || "files";

            return (
              <div
                key={repo._id}
                className="clay p-4 sm:p-5"
                style={{ borderRadius: "20px" }}
              >
                {/* Repo header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="clay-icon w-10 h-10 flex items-center justify-center bg-secondary/8 flex-shrink-0">
                      <FolderGit2 className="w-5 h-5 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">
                        {repo.fullName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {(() => {
                          const isPro =
                            user?.billing?.plan === "pro" &&
                            user?.billing?.subscriptionStatus === "active";
                          const isPaused = !isPro && repo.settings.autoReview;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] ${isPaused ? "text-accent" : repo.settings.autoReview ? "text-chart-5" : "text-muted-foreground"}`}
                            >
                              <GitPullRequest className="w-2.5 h-2.5" />
                              {isPaused
                                ? "Auto-review paused"
                                : repo.settings.autoReview
                                  ? "Auto-review on"
                                  : "Auto-review off"}
                            </span>
                          );
                        })()}
                        <span className="text-[10px] text-muted-foreground">
                          {repo.settings.focusAreas.length} focus areas
                        </span>
                        <ContextBadge
                          status={ctx?.indexStatus}
                          fileCount={ctx?.fileCount}
                          isLive={!!liveProgress[repo._id]}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-start">
                    {/* Go to repo on GitHub */}
                    <a
                      href={`https://github.com/${repo.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clay-btn clay-btn-ghost p-2 text-muted-foreground hover:text-foreground"
                      title="Open on GitHub"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => {
                        const next = isExpanded ? null : repo._id;
                        setExpandedRepo(next);
                        if (next && ctx?.indexStatus === "ready") {
                          fetchContextDetail(repo._id);
                        }
                      }}
                      className="clay-btn clay-btn-ghost p-2 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => handleDisconnect(repo._id)}
                      disabled={disconnecting === repo._id}
                      className="clay-btn clay-btn-ghost p-2 text-destructive/60 hover:text-destructive"
                    >
                      {disconnecting === repo._id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded settings + context detail */}
                {isExpanded && (
                  <div className="mt-4 space-y-4">
                    {/* Auto-review toggle */}
                    {(() => {
                      const isPro =
                        user?.billing?.plan === "pro" &&
                        user?.billing?.subscriptionStatus === "active";
                      const isPaused = !isPro && repo.settings.autoReview;
                      return (
                        <div
                          className="clay-pressed p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          style={{ borderRadius: "14px" }}
                        >
                          <div className="flex items-center gap-3">
                            <Sparkles
                              className={`w-4 h-4 flex-shrink-0 ${isPaused ? "text-accent" : "text-primary"}`}
                            />
                            <div>
                              <p className="text-xs font-bold flex items-center gap-1.5">
                                Auto-Review PRs
                                {isPaused && (
                                  <span className="clay-pill px-1.5 py-0.5 text-[9px] font-bold text-accent bg-accent/10">
                                    Paused
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {isPaused
                                  ? "Auto-review is paused because your Pro subscription is inactive. Reviews will resume when you re-subscribe."
                                  : "Automatically review new and updated pull requests"}
                              </p>
                              {!isPro && !isPaused && (
                                <button
                                  onClick={() =>
                                    isPaymentsLive &&
                                    navigate("/dashboard/pricing")
                                  }
                                  className="text-[10px] text-primary hover:underline mt-0.5 flex items-center gap-1"
                                  style={
                                    !isPaymentsLive
                                      ? { cursor: "default", opacity: 0.5 }
                                      : {}
                                  }
                                >
                                  <Crown className="w-2.5 h-2.5" />
                                  {isPaymentsLive
                                    ? "Pro plan required"
                                    : "Pro plan coming soon"}
                                </button>
                              )}
                              {isPaused && (
                                <button
                                  onClick={() =>
                                    isPaymentsLive &&
                                    navigate("/dashboard/pricing")
                                  }
                                  className="text-[10px] text-accent hover:underline mt-0.5 flex items-center gap-1"
                                  style={
                                    !isPaymentsLive
                                      ? { cursor: "default", opacity: 0.5 }
                                      : {}
                                  }
                                >
                                  <Crown className="w-2.5 h-2.5" />
                                  {isPaymentsLive
                                    ? "Re-subscribe to resume"
                                    : "Pro plan coming soon"}
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (!isPro) {
                                navigate("/dashboard/pricing");
                                return;
                              }
                              handleToggleAutoReview(
                                repo._id,
                                repo.settings.autoReview,
                              );
                            }}
                            disabled={isUpdating || isPaused}
                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${!isPro ? "opacity-40 cursor-not-allowed" : ""} ${repo.settings.autoReview && isPro ? "bg-primary" : isPaused ? "bg-accent/30" : "bg-muted-foreground/20"}`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${repo.settings.autoReview && (isPro || isPaused) ? "translate-x-5" : "translate-x-0"}`}
                            />
                          </button>
                        </div>
                      );
                    })()}

                    {/* Focus areas */}
                    <div
                      className="clay-pressed p-3 sm:p-4"
                      style={{ borderRadius: "14px" }}
                    >
                      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-3">
                        Review Focus Areas
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {FOCUS_AREAS.map((area) => {
                          const isActive = repo.settings.focusAreas.includes(
                            area.id,
                          );
                          return (
                            <button
                              key={area.id}
                              onClick={() =>
                                handleToggleFocusArea(
                                  repo._id,
                                  area.id,
                                  repo.settings.focusAreas,
                                )
                              }
                              disabled={isUpdating}
                              className={`clay-pill px-3 py-2 text-xs flex items-center gap-2 transition-all ${
                                isActive
                                  ? `${area.color} border border-current/20`
                                  : "text-muted-foreground/50 hover:text-muted-foreground"
                              }`}
                            >
                              <area.icon className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{area.label}</span>
                              {isActive && (
                                <CheckCircle2 className="w-3 h-3 ml-auto flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* PR Chat toggle */}
                    <div
                      className="clay-pressed p-3 sm:p-4"
                      style={{ borderRadius: "14px" }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <MessageCircle className="w-4 h-4 text-secondary flex-shrink-0" />
                          <div>
                            <p className="text-xs font-bold">PR Chat</p>
                            <p className="text-[10px] text-muted-foreground">
                              Let contributors mention @tarin-lgtm in PR
                              comments to interact with the bot
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleTogglePrChat(repo._id, !!repo.settings.prChat)
                          }
                          disabled={isUpdating}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${repo.settings.prChat ? "bg-secondary" : "bg-muted-foreground/20"}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${repo.settings.prChat ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </button>
                      </div>

                      {repo.settings.prChat && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-2">
                            Allowed Commands
                          </p>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              {
                                id: "explain",
                                label: "Explain",
                              },
                              {
                                id: "fix",
                                label: "Fix",
                              },
                              {
                                id: "improve",
                                label: "Improve",
                              },
                              {
                                id: "test",
                                label: "Test",
                              },
                            ].map((cmd) => {
                              const isActive = (
                                repo.settings.allowedCommands || []
                              ).includes(cmd.id);
                              return (
                                <button
                                  key={cmd.id}
                                  onClick={() =>
                                    handleToggleChatCommand(
                                      repo._id,
                                      cmd.id,
                                      repo.settings.allowedCommands || [],
                                    )
                                  }
                                  disabled={isUpdating}
                                  className={`clay-pill px-3 py-2 text-xs flex items-center gap-2 transition-all ${
                                    isActive
                                      ? "text-secondary border border-current/20"
                                      : "text-muted-foreground/50 hover:text-muted-foreground"
                                  }`}
                                >
                                  <span className="font-semibold">
                                    {cmd.label}
                                  </span>
                                  {isActive && (
                                    <CheckCircle2 className="w-3 h-3 ml-auto" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Daily chat limit */}
                      {repo.settings.prChat && (
                        <div className="mt-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                              Daily Reply Limit
                            </p>
                            <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                              Max bot replies per day for this repo
                            </p>
                          </div>
                          <div
                            className="clay-pressed flex items-center"
                            style={{ borderRadius: "10px" }}
                          >
                            <button
                              onClick={() =>
                                handleUpdateDailyChatLimit(
                                  repo._id,
                                  Math.max(
                                    5,
                                    (repo.settings.dailyChatLimit ?? 50) - 5,
                                  ),
                                )
                              }
                              disabled={isUpdating}
                              className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              -
                            </button>
                            <span className="px-2 py-1.5 text-xs font-bold min-w-[36px] text-center">
                              {repo.settings.dailyChatLimit ?? 50}
                            </span>
                            <button
                              onClick={() =>
                                handleUpdateDailyChatLimit(
                                  repo._id,
                                  Math.min(
                                    500,
                                    (repo.settings.dailyChatLimit ?? 50) + 5,
                                  ),
                                )
                              }
                              disabled={isUpdating}
                              className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI override info */}
                    {(repo.settings.aiProvider || repo.settings.aiModel) && (
                      <div
                        className="clay-pressed p-3 flex items-start gap-2 text-xs text-muted-foreground"
                        style={{ borderRadius: "12px" }}
                      >
                        <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-accent" />
                        <span>
                          Using {repo.settings.aiProvider}/
                          {repo.settings.aiModel} override for this repo
                        </span>
                      </div>
                    )}

                    {/* Context Status Card */}
                    <div
                      className="clay-pressed p-3 sm:p-4"
                      style={{ borderRadius: "14px" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Database
                            className={`w-4 h-4 ${ctx?.indexStatus === "ready" ? "text-chart-5" : ctx?.indexStatus === "failed" ? "text-destructive" : ctx?.indexStatus === "indexing" ? "text-accent" : "text-muted-foreground/40"}`}
                          />
                          <p className="text-xs font-bold">Codebase Index</p>
                        </div>
                        {ctx?.indexStatus === "ready" && (
                          <span className="clay-pill px-2 py-0.5 text-[9px] font-semibold text-chart-5 bg-chart-5/10">
                            Ready
                          </span>
                        )}
                        {ctx?.indexStatus === "failed" && (
                          <span className="clay-pill px-2 py-0.5 text-[9px] font-semibold text-destructive bg-destructive/10">
                            Failed
                          </span>
                        )}
                        {(ctx?.indexStatus === "indexing" ||
                          liveProgress[repo._id]) && (
                          <span className="clay-pill px-2 py-0.5 text-[9px] font-semibold text-accent bg-accent/10 flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            Indexing
                          </span>
                        )}
                      </div>

                      {(ctx?.indexStatus === "indexing" ||
                        liveProgress[repo._id]) && (
                        <p className="text-[10px] text-accent/70 leading-relaxed mb-2">
                          Indexing might take a while depending on the repo
                          size. You can safely navigate away.
                        </p>
                      )}

                      {ctx?.indexStatus === "ready" && ctx && (
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <div className="text-center">
                            <p className="text-sm font-bold text-foreground">
                              {ctx.fileCount}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              Files
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-foreground">
                              {ctx.conventionCount}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              Conventions
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-foreground">
                              {ctx.historyCount}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              PR Summaries
                            </p>
                          </div>
                        </div>
                      )}

                      {ctx?.lastIndexedAt && (
                        <p className="text-[9px] text-muted-foreground/50">
                          Last indexed{" "}
                          {new Date(ctx.lastIndexedAt).toLocaleString()}
                        </p>
                      )}

                      {(!ctx || ctx.indexStatus === "idle") && (
                        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                          Click "Index Codebase" to parse your repo with
                          tree-sitter. This helps the AI understand your
                          codebase for better reviews.
                        </p>
                      )}

                      {ctx?.indexStatus === "failed" && (
                        <p className="text-[10px] text-destructive/60 leading-relaxed">
                          Indexing failed. Make sure you have an AI provider
                          configured. Try again with "Index Codebase".
                        </p>
                      )}
                    </div>

                    {/* Detailed context data — files, conventions, PR summaries */}
                    {ctx?.indexStatus === "ready" && (
                      <div
                        className="clay-pressed p-3 sm:p-4"
                        style={{ borderRadius: "14px" }}
                      >
                        {/* Tab bar */}
                        <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide">
                          {(
                            [
                              {
                                id: "files" as const,
                                label: "Indexed Files",
                                icon: FileCode2,
                                count: ctx.fileCount,
                              },
                              {
                                id: "conventions" as const,
                                label: "Conventions",
                                icon: BookOpen,
                                count: ctx.conventionCount,
                              },
                              {
                                id: "history" as const,
                                label: "PR Summaries",
                                icon: History,
                                count: ctx.historyCount,
                              },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => {
                                setDetailTab((prev) => ({
                                  ...prev,
                                  [repo._id]: tab.id,
                                }));
                                fetchContextDetail(repo._id);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg whitespace-nowrap transition-all ${
                                activeTab === tab.id
                                  ? "clay-sm text-foreground font-semibold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <tab.icon className="w-3 h-3" />
                              {tab.label}
                              {tab.count > 0 && (
                                <span className="text-[9px] text-muted-foreground/50">
                                  ({tab.count})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Tab content */}
                        {loadingDetail === repo._id ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            <p className="text-[10px] text-muted-foreground ml-2">
                              Loading...
                            </p>
                          </div>
                        ) : detail ? (
                          <div>
                            {activeTab === "files" && (
                              <FilesList files={detail.files} />
                            )}
                            {activeTab === "conventions" && (
                              <ConventionsList
                                conventions={detail.conventions}
                              />
                            )}
                            {activeTab === "history" && (
                              <PRSummariesList summaries={detail.prSummaries} />
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/40 text-center py-4">
                            Click a tab to load details
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <button
                        onClick={() => handleIndexRepo(repo._id)}
                        disabled={
                          indexing === repo._id ||
                          ctx?.indexStatus === "indexing"
                        }
                        className="clay-btn px-3 py-2 text-xs text-accent flex items-center gap-1.5 flex-1 justify-center"
                      >
                        {indexing === repo._id ||
                        ctx?.indexStatus === "indexing" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {indexing === repo._id ||
                        ctx?.indexStatus === "indexing"
                          ? "Indexing..."
                          : "Index Codebase"}
                      </button>
                      <button
                        onClick={() => handleSyncPRs(repo._id)}
                        disabled={syncing === repo._id}
                        className="clay-btn px-3 py-2 text-xs text-primary flex items-center gap-1.5 flex-1 justify-center"
                      >
                        {syncing === repo._id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {syncing === repo._id ? "Syncing..." : "Sync PRs"}
                      </button>
                      <a
                        href={`https://github.com/${repo.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clay-btn px-3 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 flex-1 justify-center"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View on GitHub
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !showConnect ? (
        <div
          className="clay p-8 sm:p-12 flex flex-col items-center text-center"
          style={{ borderRadius: "24px" }}
        >
          <div className="clay-icon w-14 h-14 flex items-center justify-center bg-secondary/8 mb-4">
            <FolderGit2 className="w-7 h-7 text-secondary" />
          </div>
          <h2 className="text-lg font-bold mb-1">No repos connected</h2>
          <p className="text-xs text-muted-foreground mb-5 max-w-sm leading-relaxed">
            Once you connect a repository, LGTM will automatically review pull
            requests using your configured AI providers.
          </p>
          <button
            onClick={() => {
              setShowConnect(true);
              if (availableRepos.length === 0) fetchAvailable();
            }}
            className="clay-btn px-5 py-2.5 text-sm flex items-center gap-2 text-primary"
          >
            <Plus className="w-4 h-4" />
            Connect Repository
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Helper components ── */

function ContextBadge({
  status,
  fileCount,
  isLive,
}: {
  status?: string;
  fileCount?: number;
  isLive: boolean;
}) {
  if (isLive || status === "indexing") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-accent">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Indexing
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-chart-5">
        <Database className="w-2.5 h-2.5" />
        {fileCount} files indexed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
        <AlertTriangle className="w-2.5 h-2.5" />
        Index failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40">
      <Database className="w-2.5 h-2.5" />
      Not indexed
    </span>
  );
}

function FilesList({ files }: { files: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? files : files.slice(0, 50);

  if (files.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/40 text-center py-4">
        No files indexed yet.
      </p>
    );
  }

  // Group files by top-level directory
  const grouped: Record<string, string[]> = {};
  for (const f of displayed) {
    const parts = f.split("/");
    const dir = parts.length > 1 ? parts[0] : ".";
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  }

  return (
    <div>
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, dirFiles]) => (
            <div key={dir}>
              <p className="text-[10px] font-bold text-muted-foreground/50 mb-1 flex items-center gap-1">
                <FolderGit2 className="w-2.5 h-2.5" />
                {dir}/
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 ml-3">
                {dirFiles.map((f) => (
                  <p
                    key={f}
                    className="text-[10px] text-muted-foreground font-mono truncate"
                    title={f}
                  >
                    {f}
                  </p>
                ))}
              </div>
            </div>
          ))}
      </div>
      {files.length > 50 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[10px] text-primary hover:underline mt-2 flex items-center gap-1"
        >
          <ChevronRight className="w-2.5 h-2.5" />
          Show all {files.length} files
        </button>
      )}
      {showAll && files.length > 50 && (
        <button
          onClick={() => setShowAll(false)}
          className="text-[10px] text-primary hover:underline mt-2"
        >
          Show less
        </button>
      )}
    </div>
  );
}

function ConventionsList({ conventions }: { conventions: string[] }) {
  if (conventions.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/40 text-center py-4">
        No conventions detected yet.
      </p>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
      {conventions.map((c, i) => (
        <div
          key={i}
          className="clay-sm p-2.5 flex items-start gap-2"
          style={{ borderRadius: "10px" }}
        >
          <BookOpen className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {c}
          </p>
        </div>
      ))}
    </div>
  );
}

function PRSummariesList({ summaries }: { summaries: string[] }) {
  if (summaries.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/40 text-center py-4">
        No PR summaries saved yet.
      </p>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
      {summaries.map((s, i) => (
        <div
          key={i}
          className="clay-sm p-2.5 flex items-start gap-2"
          style={{ borderRadius: "10px" }}
        >
          <History className="w-3 h-3 text-secondary flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {s}
          </p>
        </div>
      ))}
    </div>
  );
}
