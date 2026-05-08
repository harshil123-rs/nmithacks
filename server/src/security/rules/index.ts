/**
 * LGTM Security — rule registry + orchestrator.
 *
 * Public API: `runAllRules(input)` and `RULE_REGISTRY`. Both the PR-side
 * `ci-security` agent and the monitor worker consume these.
 *
 * The registry exists so the policy editor can enumerate rules by id and
 * the audit log can resolve `ruleId → defaultSeverity` without reaching into
 * the per-domain modules.
 */
import type { Finding, Rule, RuleId, RuleInput } from "./types";
import { secretsRule } from "./secrets";
import { workflowYamlRules, runWorkflowYaml } from "./workflow-yaml";
import { dockerfileRules } from "./dockerfile";
import { dependencyRules } from "./dependency-hashes";
import { networkRules } from "./network";

/**
 * Every rule the product knows about. Keep in lockstep with
 * `RuleId` in `./types.ts`.
 */
export const RULE_REGISTRY: Rule[] = [
  secretsRule,
  ...workflowYamlRules, // descriptive entries; runWorkflowYaml is the actual runner
  ...dockerfileRules,
  ...dependencyRules,
  ...networkRules,
];

const RULE_BY_ID = new Map<RuleId, Rule>(RULE_REGISTRY.map((r) => [r.id, r]));

export function getRule(id: RuleId): Rule | undefined {
  return RULE_BY_ID.get(id);
}

/**
 * Default empty input — convenient for tests and for early scans where
 * we haven't loaded a policy yet.
 */
export function emptyInput(files: RuleInput["files"]): RuleInput {
  return {
    files,
    repoIsPublic: true,
    allowlist: { actions: [], domains: [], runners: [] },
  };
}

/**
 * The fan-out runner. Order is fixed but not load-bearing — findings carry
 * their own `ruleId` and dedup happens in the agent layer.
 */
export function runAllRules(input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  // Atomic rules (one Rule object → one entry point)
  findings.push(...secretsRule.run(input));
  for (const r of dockerfileRules) findings.push(...r.run(input));
  for (const r of dependencyRules) findings.push(...r.run(input));
  for (const r of networkRules) findings.push(...r.run(input));
  // Workflow YAML uses a single entry point that fans out across detectors.
  findings.push(...runWorkflowYaml(input));
  return findings;
}

export type { Finding, Rule, RuleId, RuleInput, PolicyAction, Severity, Detector, RuleFile } from "./types";
export { isCiRelevantPath, CI_FILE_PATTERNS } from "./types";
export { SECRET_PATTERNS, scanStringForSecrets } from "./secrets";
