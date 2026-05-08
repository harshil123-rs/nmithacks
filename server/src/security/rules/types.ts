/**
 * Shared types for the LGTM Security rule library.
 *
 * The rule library is a pure-function module. No I/O, no DB, no LLM.
 * Both the PR-side ci-security agent and the monitor worker consume
 * `runAllRules(input)` — they own all the side effects.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type PolicyAction = "block" | "warn" | "off";
export type Detector = "regex" | "yaml-ast" | "dockerfile" | "lockfile" | "llm";

/**
 * Stable identifier for a rule. Used as the key for policy overrides and as
 * the primary index in the audit log. Format: `<domain>.<short-name>`,
 * lowercase, hyphen-separated.
 */
export type RuleId =
  | "secrets.hardcoded"
  | "workflow.privileged-container"
  | "workflow.untrusted-input-shell-injection"
  | "workflow.pull-request-target-with-head-checkout"
  | "workflow.self-hosted-runner-on-public-repo"
  | "workflow.unpinned-action-checkout"
  | "workflow.unpinned-third-party-action"
  | "workflow.permissions-write-all"
  | "workflow.missing-job-permissions"
  | "workflow.trigger-weakening"
  | "workflow.external-reusable-workflow"
  | "dockerfile.privileged-flag"
  | "dockerfile.user-root-final"
  | "dockerfile.add-from-url"
  | "deps.lockfile-hash-mismatch"
  | "network.unallowlisted-outbound";

export interface RuleFile {
  /** Repo-relative path. */
  path: string;
  /** Full file contents. */
  content: string;
  /**
   * Optional content of the previous version (e.g. base branch on a PR).
   * Required for diff-aware rules like `deps.lockfile-hash-mismatch`.
   */
  previousContent?: string;
}

/**
 * Everything a rule function needs to run. Explicit and small on purpose —
 * we want rules to be trivially testable from a fixture set with no mocks.
 */
export interface RuleInput {
  files: RuleFile[];
  /** Whether the underlying repo is public on GitHub. Affects some rules. */
  repoIsPublic: boolean;
  /** Allowlists drawn from `SecurityMonitor.policy.allowlist`. */
  allowlist: {
    /** e.g. `["actions/*", "myorg/*"]` — patterns matched against `uses:` ref. */
    actions: string[];
    /** Outbound domains permitted in `run:` blocks. */
    domains: string[];
    /** Allowed `runs-on:` labels. */
    runners: string[];
  };
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** Repo-relative file path. */
  file: string;
  /** 1-based line number, when known. */
  line?: number;
  /** Short human-readable summary. */
  message: string;
  /** Concrete remediation. Required — empty fixes hurt more than help. */
  suggestion: string;
  /** Up to ~120 chars of the offending source line. */
  codeSnippet?: string;
  /** Which detector found it. Used for analytics + audit log. */
  detectedBy: Detector;
  /** Optional CWE / OWASP / CVE references for the audit log. */
  references?: string[];
}

export interface Rule {
  id: RuleId;
  /** One-line description. Surfaced in the policy editor. */
  description: string;
  /** Default severity if no policy override. */
  defaultSeverity: Severity;
  /** Default action from STEP-0-DECISIONS.md. */
  defaultAction: PolicyAction;
  /** Pure function. No I/O. Returns 0+ findings. */
  run(input: RuleInput): Finding[];
}

/**
 * A path matches a CI-config-relevant glob if any of these prefixes apply.
 * Used by the agent to decide whether to invoke the library at all.
 */
export const CI_FILE_PATTERNS = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/i,
  /^\.github\/actions\/[^/]+\/action\.ya?ml$/i,
  /(^|\/)Dockerfile($|\.[^/]+$)/i,
  /^Jenkinsfile$/,
  /^\.gitlab-ci\.ya?ml$/i,
  /^azure-pipelines\.ya?ml$/i,
  /^\.circleci\/config\.ya?ml$/i,
  /^bitbucket-pipelines\.ya?ml$/i,
  // Lockfiles — for the dependency-hash rule
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)requirements\.txt$/i,
  /(^|\/)poetry\.lock$/i,
  /(^|\/)Pipfile\.lock$/i,
  /(^|\/)Gemfile\.lock$/i,
  /(^|\/)go\.sum$/i,
  /(^|\/)Cargo\.lock$/i,
];

export function isCiRelevantPath(path: string): boolean {
  return CI_FILE_PATTERNS.some((re) => re.test(path));
}
