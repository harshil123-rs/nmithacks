/**
 * Default LGTM Security policy.
 *
 * Snapshotted into `SecurityMonitor.policy` at enrollment time. Customers
 * tune it from there — this file is the *immutable seed*. Bumping
 * `policyVersion` is how we ship rule changes to existing repos.
 *
 * Source of truth: `security/STEP-0-DECISIONS.md`. Keep them in sync.
 */
import type { PolicyAction, RuleId } from "./rules/types";

export const POLICY_VERSION = 1 as const;

export interface PolicyRule {
  /** Action the policy takes when this rule fires. */
  action: PolicyAction;
  /**
   * Optional severity override. Most customers should leave this unset and
   * use the rule's `defaultSeverity`; we expose it for the rare case where
   * a customer wants to escalate or de-escalate without changing the action.
   */
  severityOverride?: "critical" | "high" | "medium" | "low" | "info";
}

export interface PolicyAllowlist {
  /** Action `uses:` patterns to permit (e.g. `["actions/*", "myorg/*"]`). */
  actions: string[];
  /** Outbound domains permitted in `run:` blocks. */
  domains: string[];
  /** Allowed `runs-on:` labels. */
  runners: string[];
}

export interface SecurityPolicy {
  policyVersion: number;
  rules: Record<RuleId, PolicyRule>;
  allowlist: PolicyAllowlist;
}

export const DEFAULT_POLICY: SecurityPolicy = {
  policyVersion: POLICY_VERSION,
  rules: {
    // Block-by-default — the five rules with low FP rates and high blast radius
    "secrets.hardcoded": { action: "block" },
    "workflow.privileged-container": { action: "block" },
    "workflow.untrusted-input-shell-injection": { action: "block" },
    "workflow.pull-request-target-with-head-checkout": { action: "block" },
    "workflow.self-hosted-runner-on-public-repo": { action: "block" },

    // Warn-by-default — real risks but legitimate uses exist
    "workflow.unpinned-action-checkout": { action: "warn" },
    "workflow.unpinned-third-party-action": { action: "warn" },
    "workflow.permissions-write-all": { action: "warn" },
    "workflow.missing-job-permissions": { action: "warn" },
    "workflow.trigger-weakening": { action: "warn" },
    "workflow.external-reusable-workflow": { action: "warn" },
    "dockerfile.privileged-flag": { action: "warn" },
    "dockerfile.user-root-final": { action: "warn" },
    "dockerfile.add-from-url": { action: "warn" },
    "deps.lockfile-hash-mismatch": { action: "warn" },
    "network.unallowlisted-outbound": { action: "warn" },
  },
  allowlist: {
    actions: [],
    domains: [],
    runners: [],
  },
};

/**
 * Resolve the action for a rule given a (possibly partial) policy.
 * Defaults to the seed policy's value if the rule isn't in the override map.
 */
export function resolveRuleAction(
  policy: Pick<SecurityPolicy, "rules">,
  ruleId: RuleId,
): PolicyAction {
  return policy.rules[ruleId]?.action ?? DEFAULT_POLICY.rules[ruleId]?.action ?? "warn";
}
