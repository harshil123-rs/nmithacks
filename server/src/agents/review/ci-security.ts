/**
 * CI/CD Security Agent.
 *
 * Wraps the shared rule library (server/src/security/rules) for the PR
 * review pipeline. Runs only when the PR touches CI-relevant files
 * (workflows, action metadata, Dockerfiles, lockfiles). For everything else
 * it short-circuits to a 0-finding result so the synthesizer doesn't spend
 * time on it.
 *
 * No LLM call here — Phase 1 of the watchdog plan is deterministic-only.
 * Phase 2 (LLM disambiguation of suspicious-but-uncertain findings) lives
 * in the monitor worker (Step 4), where we control the cadence and can
 * cache verdicts by file-content hash.
 */
import { runAllRules } from "../../security/rules";
import { isCiRelevantPath } from "../../security/rules/types";
import type {
  Finding as RuleFinding,
  RuleFile,
  RuleId,
  PolicyAction,
} from "../../security/rules/types";
import type { AgentFinding, AgentInput, AgentOutput } from "./types";

/**
 * Default per-rule policy. Mirrors `security/STEP-0-DECISIONS.md`. The
 * monitor side will read overrides from `SecurityMonitor.policy` once that
 * model lands in Step 3; until then this is the only source of truth and
 * `ci-security` always uses defaults.
 */
const DEFAULT_POLICY: Record<RuleId, PolicyAction> = {
  "secrets.hardcoded": "block",
  "workflow.privileged-container": "block",
  "workflow.untrusted-input-shell-injection": "block",
  "workflow.pull-request-target-with-head-checkout": "block",
  "workflow.self-hosted-runner-on-public-repo": "block",
  "workflow.unpinned-action-checkout": "warn",
  "workflow.unpinned-third-party-action": "warn",
  "workflow.permissions-write-all": "warn",
  "workflow.missing-job-permissions": "warn",
  "workflow.trigger-weakening": "warn",
  "workflow.external-reusable-workflow": "warn",
  "dockerfile.privileged-flag": "warn",
  "dockerfile.user-root-final": "warn",
  "dockerfile.add-from-url": "warn",
  "deps.lockfile-hash-mismatch": "warn",
  "network.unallowlisted-outbound": "warn",
};

function policyActionFor(ruleId: RuleId): "block" | "warn" | "info" {
  // The rule library's PolicyAction includes "off" for disabled rules, but
  // disabled rules don't emit findings — by the time we reach this function,
  // we know the action is "block" or "warn". Map any unexpected "off" value
  // to "warn" defensively rather than crashing.
  const a: PolicyAction = DEFAULT_POLICY[ruleId] ?? "warn";
  if (a === "off") return "warn";
  return a;
}

function toAgentFinding(f: RuleFinding): AgentFinding {
  return {
    file: f.file,
    line: f.line,
    severity: f.severity,
    category: f.ruleId,
    message: f.message,
    suggestion: f.suggestion,
    codeSnippet: f.codeSnippet,
    ruleId: f.ruleId,
    policyAction: policyActionFor(f.ruleId),
  };
}

export async function runCiSecurityAgent(
  input: AgentInput,
): Promise<AgentOutput> {
  const start = Date.now();

  // Only operate on files we know how to scan. Lockfiles + workflow YAML +
  // Dockerfile + action.yml. Everything else short-circuits.
  const relevant = input.changedFiles.filter((f) => isCiRelevantPath(f.path));

  if (relevant.length === 0) {
    return {
      agentType: "ci-security",
      findings: [],
      summary: "No CI/CD configuration files were changed in this PR.",
      durationMs: Date.now() - start,
      metadata: { scanned: 0, scanType: "skipped-no-ci-files" },
    };
  }

  // Build the rule input. previousContent is left undefined for v1 — to
  // populate it we'd need to fetch the base-branch version of each file,
  // which adds GitHub API calls. The diff-aware rules (lockfile-hash-mismatch,
  // trigger-weakening's branch-loosening case) just won't trigger on PRs
  // until we wire that in. They still work on the monitor side which has
  // both versions naturally.
  const files: RuleFile[] = relevant.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  const ruleFindings = runAllRules({
    files,
    repoIsPublic: true, // conservative default; monitor side will pass the real value
    allowlist: { actions: [], domains: [], runners: [] },
  });

  const agentFindings = ruleFindings.map(toAgentFinding);

  // Sort by (policyAction = block first, then warn), then by severity
  const ACTION_ORDER: Record<NonNullable<AgentFinding["policyAction"]>, number> = {
    block: 0,
    warn: 1,
    info: 2,
  };
  const SEV_ORDER: Record<AgentFinding["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  agentFindings.sort((a, b) => {
    const aa = ACTION_ORDER[a.policyAction ?? "warn"];
    const bb = ACTION_ORDER[b.policyAction ?? "warn"];
    if (aa !== bb) return aa - bb;
    return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
  });

  // One-line summary: tailor based on whether anything is block-worthy.
  const blockCount = agentFindings.filter(
    (f) => f.policyAction === "block",
  ).length;
  const warnCount = agentFindings.filter(
    (f) => f.policyAction === "warn",
  ).length;

  let summary: string;
  if (blockCount === 0 && warnCount === 0) {
    summary = `Scanned ${relevant.length} CI/CD config file(s). No issues found.`;
  } else if (blockCount === 0) {
    summary = `Scanned ${relevant.length} CI/CD config file(s). ${warnCount} warning(s) — review before merge.`;
  } else {
    summary = `Scanned ${relevant.length} CI/CD config file(s). ${blockCount} blocking issue(s) and ${warnCount} warning(s). Merge should be blocked until the blocking issues are fixed.`;
  }

  return {
    agentType: "ci-security",
    findings: agentFindings,
    summary,
    durationMs: Date.now() - start,
    metadata: {
      scanned: relevant.length,
      scanType: "rules-only",
      blockCount,
      warnCount,
    },
  };
}
