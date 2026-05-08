import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Shield,
  Bug,
  Zap,
  Eye,
  Code2,
  FileText,
  ChevronDown,
  FolderGit2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import api from "../api/axios";

const RANGE_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#fcd34d",
  medium: "#4ade80",
  low: "#94a3b8",
  info: "#818cf8",
};

const VERDICT_COLORS: Record<string, string> = {
  approve: "#4ade80",
  request_changes: "#fcd34d",
  block: "#ef4444",
};

const AGENT_CONFIG: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  security: { icon: Shield, color: "#fcd34d", label: "Security" },
  bugs: { icon: Bug, color: "#ef4444", label: "Bugs" },
  performance: { icon: Zap, color: "#4ade80", label: "Performance" },
  readability: { icon: Eye, color: "#818cf8", label: "Readability" },
  "best-practices": { icon: Code2, color: "#2dd4bf", label: "Best Practices" },
  documentation: { icon: FileText, color: "#94a3b8", label: "Docs" },
};

interface OverviewData {
  totalReviews: number;
  totalPRs: number;
  verdictDistribution: Record<string, number>;
  avgReviewTimeMs: number;
  avgConfidence: number;
  totalFindings: number;
  severityBreakdown: Record<string, number>;
}

interface TrendsData {
  severityByWeek: Array<Record<string, any>>;
  reviewTimeByWeek: Array<{ week: string; avgMs: number; reviews: number }>;
  prsByWeek: Array<{ week: string; count: number }>;
  agentFindings: Array<{ agent: string; findings: number }>;
}

interface TopIssue {
  message: string;
  severity: string;
  agent: string;
  count: number;
  fileCount: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="clay p-3"
      style={{ borderRadius: "10px", fontSize: "11px" }}
    >
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}:{" "}
          {typeof p.value === "number" && p.value > 1000
            ? `${(p.value / 1000).toFixed(1)}s`
            : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [range, setRange] = useState("30d");
  const [repoFilter, setRepoFilter] = useState("");
  const [repoDropOpen, setRepoDropOpen] = useState(false);
  const [repos, setRepos] = useState<{ _id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [topIssues, setTopIssues] = useState<TopIssue[]>([]);

  // Fetch repos for filter
  useEffect(() => {
    api
      .get("/repos")
      .then(({ data }) =>
        setRepos(
          (data.repos || []).map((r: any) => ({
            _id: r._id,
            fullName: r.fullName,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { range };
    if (repoFilter) params.repo = repoFilter;

    try {
      const [ovRes, trRes, tiRes] = await Promise.all([
        api.get("/analytics/overview", { params }),
        api.get("/analytics/trends", { params }),
        api.get("/analytics/top-issues", { params }),
      ]);
      setOverview(ovRes.data);
      setTrends(trRes.data);
      setTopIssues(tiRes.data.topIssues || []);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [range, repoFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const verdictPieData = overview
    ? [
        {
          name: "Approved",
          value: overview.verdictDistribution.approve || 0,
          color: VERDICT_COLORS.approve,
        },
        {
          name: "Changes Requested",
          value: overview.verdictDistribution.request_changes || 0,
          color: VERDICT_COLORS.request_changes,
        },
        {
          name: "Blocked",
          value: overview.verdictDistribution.block || 0,
          color: VERDICT_COLORS.block,
        },
      ].filter((d) => d.value > 0)
    : [];

  const formatWeek = (w: string) => {
    const d = new Date(w);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Review insights across your repositories
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Repo filter */}
          {repos.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setRepoDropOpen(!repoDropOpen)}
                className={`clay-btn px-3 py-2.5 text-xs flex items-center gap-2 ${repoFilter ? "text-secondary" : "text-muted-foreground"}`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span className="max-w-[100px] truncate">
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
                      setRepoFilter("");
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
                        setRepoFilter(r._id);
                        setRepoDropOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate ${repoFilter === r._id ? "text-secondary bg-secondary/5" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                    >
                      {r.fullName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Range filter */}
          <div className="flex clay-pressed" style={{ borderRadius: "12px" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-2 text-[11px] transition-all rounded-xl ${
                  range === opt.value
                    ? "clay text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="clay p-8 flex flex-col items-center gap-4"
            style={{ borderRadius: "24px" }}
          >
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading analytics...
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatCard
              icon={BarChart3}
              label="Reviews"
              value={overview?.totalReviews || 0}
              color="text-primary"
            />
            <StatCard
              icon={Activity}
              label="PRs Tracked"
              value={overview?.totalPRs || 0}
              color="text-secondary"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Confidence"
              value={`${overview?.avgConfidence || 0}%`}
              color="text-chart-5"
            />
            <StatCard
              icon={Clock}
              label="Avg Review Time"
              value={
                overview?.avgReviewTimeMs
                  ? `${(overview.avgReviewTimeMs / 1000).toFixed(0)}s`
                  : "—"
              }
              color="text-accent"
            />
            <StatCard
              icon={AlertTriangle}
              label="Total Findings"
              value={overview?.totalFindings || 0}
              color="text-destructive"
            />
            <StatCard
              icon={CheckCircle2}
              label="Approval Rate"
              value={
                overview && overview.totalReviews > 0
                  ? `${Math.round(((overview.verdictDistribution.approve || 0) / overview.totalReviews) * 100)}%`
                  : "—"
              }
              color="text-chart-5"
            />
          </div>

          {/* Row 1: Verdict pie + Severity breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Verdict distribution */}
            <div className="clay p-5" style={{ borderRadius: "20px" }}>
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
                Verdict Distribution
              </p>
              {verdictPieData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="w-36 h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={verdictPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={60}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {verdictPieData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {verdictPieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {d.name}
                        </span>
                        <span className="text-xs font-bold ml-auto">
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="No reviews yet" />
              )}
            </div>

            {/* Findings by agent */}
            <div className="clay p-5" style={{ borderRadius: "20px" }}>
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
                Findings by Agent
              </p>
              {trends?.agentFindings && trends.agentFindings.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={trends.agentFindings}
                    layout="vertical"
                    margin={{ left: 0, right: 16 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="agent"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                      tickFormatter={(v) => AGENT_CONFIG[v]?.label || v}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="findings" radius={[0, 6, 6, 0]}>
                      {trends.agentFindings.map((d, i) => (
                        <Cell
                          key={i}
                          fill={AGENT_CONFIG[d.agent]?.color || "#818cf8"}
                          fillOpacity={0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No findings data" />
              )}
            </div>
          </div>

          {/* Row 2: Severity trend + Review time trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Severity over time */}
            <div className="clay p-5" style={{ borderRadius: "20px" }}>
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
                Issues by Severity Over Time
              </p>
              {trends?.severityByWeek && trends.severityByWeek.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={trends.severityByWeek}
                    margin={{ left: -20, right: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatWeek}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      stackId="1"
                      stroke={SEVERITY_COLORS.critical}
                      fill={SEVERITY_COLORS.critical}
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="high"
                      stackId="1"
                      stroke={SEVERITY_COLORS.high}
                      fill={SEVERITY_COLORS.high}
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="medium"
                      stackId="1"
                      stroke={SEVERITY_COLORS.medium}
                      fill={SEVERITY_COLORS.medium}
                      fillOpacity={0.2}
                    />
                    <Area
                      type="monotone"
                      dataKey="low"
                      stackId="1"
                      stroke={SEVERITY_COLORS.low}
                      fill={SEVERITY_COLORS.low}
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Not enough data yet" />
              )}
            </div>

            {/* Review time trend */}
            <div className="clay p-5" style={{ borderRadius: "20px" }}>
              <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
                Average Review Time
              </p>
              {trends?.reviewTimeByWeek &&
              trends.reviewTimeByWeek.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart
                    data={trends.reviewTimeByWeek}
                    margin={{ left: -20, right: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatWeek}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="avgMs"
                      name="Avg Time"
                      stroke="#818cf8"
                      strokeWidth={2}
                      dot={{ fill: "#818cf8", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Not enough data yet" />
              )}
            </div>
          </div>

          {/* Row 3: PRs per week */}
          <div className="clay p-5 mb-4" style={{ borderRadius: "20px" }}>
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
              Reviews Per Week
            </p>
            {trends?.prsByWeek && trends.prsByWeek.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={trends.prsByWeek}
                  margin={{ left: -20, right: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatWeek}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Reviews"
                    fill="#818cf8"
                    fillOpacity={0.6}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Not enough data yet" />
            )}
          </div>

          {/* Row 4: Top recurring issues */}
          <div className="clay p-5" style={{ borderRadius: "20px" }}>
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
              Top Recurring Issues
            </p>
            {topIssues.length > 0 ? (
              <div className="space-y-1.5">
                {topIssues.slice(0, 15).map((issue, i) => {
                  const agentCfg = AGENT_CONFIG[issue.agent];
                  const AgentIcon = agentCfg?.icon || Code2;
                  return (
                    <div
                      key={i}
                      className="clay-pressed p-3 flex items-start gap-3"
                      style={{ borderRadius: "12px" }}
                    >
                      <span className="text-xs font-bold text-muted-foreground/30 w-5 text-right flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <AgentIcon
                        className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                        style={{ color: agentCfg?.color || "#94a3b8" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-relaxed">
                          {issue.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{
                              color:
                                SEVERITY_COLORS[issue.severity] || "#94a3b8",
                              backgroundColor: `${SEVERITY_COLORS[issue.severity] || "#94a3b8"}15`,
                            }}
                          >
                            {issue.severity}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {issue.count}x across {issue.fileCount} file
                            {issue.fileCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No recurring issues found" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="clay p-4" style={{ borderRadius: "16px" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-xs text-muted-foreground/50">{message}</p>
    </div>
  );
}
