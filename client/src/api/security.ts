/**
 * Typed client for the LGTM Security API.
 *
 * Mirrors `server/src/routes/security.routes.ts`. Keep in sync — when the
 * server adds an endpoint, add the function here so callers don't ad-hoc
 * `api.get("/security/...")` and lose typing.
 */
import api from "./axios";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type PolicyAction = "block" | "warn" | "off";
export type AuditSource = "pr-review" | "monitor" | "runtime";
export type ScanTrigger =
  | "push"
  | "schedule"
  | "manual"
  | "workflow_run"
  | "enrollment";
export type ScanState = "queued" | "running" | "complete" | "failed";

export interface PostureCounts {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
}

export interface MonitorListItem {
  id: string;
  repoId: string;
  repoFullName: string;
  repoActive: boolean;
  status: "active" | "paused";
  enabledAt: string;
  lastScanAt?: string;
  lastCleanAt?: string;
  policyVersion: number;
  posture: PostureCounts;
}

export interface MonitorDetail {
  id: string;
  repoId: string;
  repoFullName: string;
  status: "active" | "paused";
  enabledAt: string;
  lastScanAt?: string;
  lastCleanAt?: string;
  policy: {
    policyVersion: number;
    rules: Record<string, { action: PolicyAction; severityOverride?: Severity }>;
    allowlist: { actions: string[]; domains: string[]; runners: string[] };
  };
  notify: { onBlock: boolean; onWarn: boolean; inApp: boolean; email: boolean };
}

export interface AuditEntry {
  id: string;
  source: AuditSource;
  ruleId: string;
  severity: Severity;
  policyAction: "block" | "warn" | "info";
  message: string;
  suggestion: string;
  file: string;
  line?: number;
  codeSnippet?: string;
  headSha: string;
  prNumber?: number;
  /** PR title — populated when prNumber is set and the PR doc still exists. */
  prTitle?: string | null;
  detectedAt: string;
  detectedBy: string;
  resolvedAt?: string;
  resolution?: "fixed" | "muted" | "false-positive";
}

export interface ScanRow {
  id: string;
  trigger: ScanTrigger;
  state: ScanState;
  headSha: string;
  halt: boolean;
  counts: {
    total: number;
    block: number;
    warn: number;
    info: number;
    new: number;
    resolved: number;
    bySeverity: PostureCounts & { info: number };
  };
  filesScanned: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

// ------------ enrollment ----------------------------------------------------

export async function enrollRepo(repoId: string) {
  const { data } = await api.post("/security/enroll", { repoId });
  return data as {
    id: string;
    repoId: string;
    repoFullName: string;
    status: string;
    enabledAt: string;
    policyVersion: number;
  };
}

export async function unenrollRepo(repoId: string) {
  const { data } = await api.delete(`/security/repos/${repoId}`);
  return data as { ok: true };
}

export async function pauseRepo(repoId: string) {
  const { data } = await api.post(`/security/repos/${repoId}/pause`);
  return data;
}

export async function resumeRepo(repoId: string) {
  const { data } = await api.post(`/security/repos/${repoId}/resume`);
  return data;
}

// ------------ list / detail -------------------------------------------------

export async function listEnrolled() {
  const { data } = await api.get("/security/repos");
  return data.monitors as MonitorListItem[];
}

export async function getMonitor(repoId: string) {
  const { data } = await api.get(`/security/repos/${repoId}`);
  return data as MonitorDetail;
}

// ------------ policy --------------------------------------------------------

export async function updatePolicy(
  repoId: string,
  patch: Partial<MonitorDetail["policy"]>,
) {
  const { data } = await api.patch(`/security/repos/${repoId}/policy`, patch);
  return data;
}

// ------------ notification preferences -------------------------------------

export async function updateNotify(
  repoId: string,
  patch: Partial<MonitorDetail["notify"]>,
) {
  const { data } = await api.patch(`/security/repos/${repoId}/notify`, patch);
  return data as { ok: true; notify: MonitorDetail["notify"] };
}

// ------------ rule analytics ----------------------------------------------

export interface RuleStat {
  ruleId: string;
  total: number;
  open: number;
  fixed: number;
  falsePositive: number;
  muted: number;
  resolved: number;
  /** null when no resolutions yet — UI should render "—" rather than "0%". */
  fpRate: number | null;
  lastSeen: string;
}

export async function listRuleStats(repoId: string) {
  const { data } = await api.get(`/security/repos/${repoId}/rule-stats`);
  return data.rules as RuleStat[];
}

// ------------ scans ---------------------------------------------------------

export async function triggerScan(repoId: string) {
  const { data } = await api.post(`/security/repos/${repoId}/scan`);
  return data as { accepted: true };
}

/**
 * Re-trigger a security review for a single PR by number. Distinct from
 * triggerScan (default branch HEAD) — this scans the PR's head SHA.
 */
export async function rescanPr(repoId: string, prNumber: number) {
  const { data } = await api.post(
    `/security/repos/${repoId}/prs/${prNumber}/rescan`,
  );
  return data as { accepted: true; prId: string; prNumber: number };
}

export async function listScans(repoId: string, limit = 25) {
  const { data } = await api.get(`/security/repos/${repoId}/scans`, {
    params: { limit },
  });
  return data.scans as ScanRow[];
}

// ------------ audit log -----------------------------------------------------

export async function listAudit(
  repoId: string,
  filters: {
    severity?: Severity;
    ruleId?: string;
    source?: AuditSource;
    resolved?: "all" | "open" | "resolved";
    /** Free-text search across message / file / ruleId. */
    q?: string;
    /** PR number filter. Accepts plain number or strings like "#42". */
    prNumber?: string | number;
    limit?: number;
  } = {},
) {
  const { data } = await api.get(`/security/repos/${repoId}/audit`, {
    params: filters,
  });
  return data.entries as AuditEntry[];
}

export async function resolveAuditEntry(
  id: string,
  resolution: "fixed" | "muted" | "false-positive",
  note?: string,
) {
  const { data } = await api.patch(`/security/audit/${id}`, { resolution, note });
  return data;
}

// ------------ API tokens (for the runtime Action) -------------------------

export interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  prefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface CreatedApiToken extends ApiTokenRow {
  /** Plaintext, returned exactly once on create. */
  token: string;
  warning: string;
}

export async function listApiTokens() {
  const { data } = await api.get("/security/tokens");
  return data.tokens as ApiTokenRow[];
}

export async function createApiToken(input: {
  name: string;
  scopes: string[];
  expiresInDays?: number;
}) {
  const { data } = await api.post("/security/tokens", input);
  return data as CreatedApiToken;
}

export async function revokeApiToken(id: string) {
  const { data } = await api.delete(`/security/tokens/${id}`);
  return data as { ok: true; alreadyRevoked?: boolean };
}

// ------------ helper: list connected repos (for the enroll picker) ---------
// Reuses the existing /repos endpoint — security doesn't have its own
// "connected repos" concept.
export async function listConnectedRepos() {
  const { data } = await api.get("/repos");
  return (data.repos ?? data) as Array<{
    _id: string;
    fullName: string;
    owner: string;
    name: string;
    isActive: boolean;
  }>;
}
