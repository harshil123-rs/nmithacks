/**
 * GitHub Actions workflow YAML rules.
 *
 * Parses `.github/workflows/*.yml` and `.github/actions/<name>/action.yml`
 * with the `yaml` library, then walks the AST to apply each rule.
 *
 * Why YAML AST instead of regex? Because workflow YAML supports arbitrary
 * indentation, anchors, and multi-line strings. Regex misses things like
 * `permissions:` written as a flow-style mapping. The AST approach also
 * gives us line numbers for free.
 */
import { parseDocument, isMap, isSeq, isScalar, type Pair, type Node } from "yaml";
import type { Finding, Rule, RuleInput, RuleId, Severity } from "./types";

// ---------- file matchers ---------------------------------------------------

function isWorkflowFile(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path);
}

function isActionMetadataFile(path: string): boolean {
  return /^\.github\/actions\/[^/]+\/action\.ya?ml$/i.test(path);
}

// ---------- AST helpers -----------------------------------------------------

interface WalkCtx {
  file: string;
  lineCounter: { lineStarts: number[] };
}

/** Convert a yaml `range` (offset) to a 1-based line number. */
function offsetToLine(offset: number, lineStarts: number[]): number {
  // Binary search the line-start array.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function nodeLine(node: Node | Pair | undefined, ctx: WalkCtx): number | undefined {
  if (!node) return undefined;
  // yaml v2 nodes expose a `range: [start, valueEnd, nodeEnd]` triple.
  const r = (node as { range?: [number, number, number] }).range;
  if (!r) return undefined;
  return offsetToLine(r[0], ctx.lineCounter.lineStarts);
}

function getMapValue(map: unknown, key: string): Node | undefined {
  if (!isMap(map)) return undefined;
  for (const item of map.items) {
    if (isScalar(item.key) && item.key.value === key) {
      return item.value as Node | undefined;
    }
  }
  return undefined;
}

function getMapPair(map: unknown, key: string): Pair | undefined {
  if (!isMap(map)) return undefined;
  for (const item of map.items) {
    if (isScalar(item.key) && item.key.value === key) {
      return item;
    }
  }
  return undefined;
}

function scalarString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (isScalar(node) && typeof node.value === "string") return node.value;
  return undefined;
}

// ---------- shared finding helpers -----------------------------------------

function pushFinding(
  findings: Finding[],
  partial: Omit<Finding, "detectedBy"> & { detectedBy?: Finding["detectedBy"] },
): void {
  findings.push({ detectedBy: "yaml-ast", ...partial });
}

// ---------- individual detectors --------------------------------------------

const FORTY_HEX = /^[0-9a-f]{40}$/i;

/**
 * Yields each `uses:` step it finds, with file path and line number.
 * Used by the unpinned-action rules and the external-reusable-workflow rule.
 */
function* iterUsesSteps(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
): Generator<{ uses: string; line: number | undefined; ownerKey: "step" | "reusable-workflow" }> {
  const root = doc.contents;
  if (!isMap(root)) return;

  // 1. Reusable workflow calls: `jobs.<id>.uses: org/repo/.github/workflows/x.yml@ref`
  const jobs = getMapValue(root, "jobs");
  if (isMap(jobs)) {
    for (const jobItem of jobs.items) {
      const jobBody = jobItem.value;
      if (!isMap(jobBody)) continue;
      const usesNode = getMapValue(jobBody, "uses");
      const uses = scalarString(usesNode);
      if (uses) {
        yield { uses, line: nodeLine(usesNode, ctx), ownerKey: "reusable-workflow" };
      }
      // 2. Step-level `uses:` inside `steps: [...]`
      const stepsNode = getMapValue(jobBody, "steps");
      if (isSeq(stepsNode)) {
        for (const step of stepsNode.items) {
          if (!isMap(step)) continue;
          const stepUsesNode = getMapValue(step, "uses");
          const stepUses = scalarString(stepUsesNode);
          if (stepUses) {
            yield { uses: stepUses, line: nodeLine(stepUsesNode, ctx), ownerKey: "step" };
          }
        }
      }
    }
  }
}

function isAllowlisted(uses: string, allowlist: string[]): boolean {
  // Match against the action ref before `@`, e.g. "actions/checkout".
  const refOnly = uses.split("@")[0];
  return allowlist.some((pattern) => globMatch(pattern, refOnly));
}

/** Tiny glob: supports `*` only, no character classes. */
function globMatch(pattern: string, value: string): boolean {
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return re.test(value);
}

function checkUnpinnedActions(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  input: RuleInput,
  findings: Finding[],
): void {
  for (const { uses, line } of iterUsesSteps(doc, ctx)) {
    // Local actions like `./actions/foo` and Docker images `docker://...` are out of scope.
    if (uses.startsWith("./") || uses.startsWith("docker://")) continue;
    const [refOnly, version] = uses.split("@");
    if (!version) continue; // malformed; skip
    if (FORTY_HEX.test(version)) continue; // already pinned to a SHA
    if (isAllowlisted(uses, input.allowlist.actions)) continue;

    const isCheckout = refOnly === "actions/checkout";
    const ruleId: RuleId = isCheckout
      ? "workflow.unpinned-action-checkout"
      : "workflow.unpinned-third-party-action";
    pushFinding(findings, {
      ruleId,
      severity: "high",
      file: ctx.file,
      line,
      message: isCheckout
        ? `actions/checkout is pinned to '${version}' instead of a 40-char commit SHA. A compromised tag would let an attacker run arbitrary code in your CI.`
        : `Third-party action '${refOnly}' is pinned to '${version}' instead of a 40-char commit SHA. Compromised tag → arbitrary code execution in your CI.`,
      suggestion: `Replace '@${version}' with the commit SHA of the release. Example: 'uses: ${refOnly}@${"a".repeat(40)}'. You can find the SHA at https://github.com/${refOnly}/releases or via 'git ls-remote'.`,
      codeSnippet: `uses: ${uses}`,
      references: ["CWE-829", "https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions"],
    });
  }
}

function checkPermissions(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  findings: Finding[],
): void {
  const root = doc.contents;
  if (!isMap(root)) return;

  // Top-level `permissions: write-all`
  const topPerms = getMapPair(root, "permissions");
  if (topPerms) {
    const v = scalarString(topPerms.value as Node);
    if (v === "write-all") {
      pushFinding(findings, {
        ruleId: "workflow.permissions-write-all",
        severity: "high",
        file: ctx.file,
        line: nodeLine(topPerms.value as Node, ctx),
        message: "Workflow grants 'permissions: write-all' to GITHUB_TOKEN. A compromised step or action gets full write access to the repo.",
        suggestion: "Replace 'write-all' with a least-privilege block listing only the scopes your workflow actually needs, e.g. 'permissions:\\n  contents: read\\n  pull-requests: write'.",
        codeSnippet: "permissions: write-all",
        references: ["CWE-732"],
      });
    }
  }

  // Job-level missing `permissions:` on jobs that touch GITHUB_TOKEN
  const jobs = getMapValue(root, "jobs");
  if (!isMap(jobs)) return;
  for (const jobItem of jobs.items) {
    const jobBody = jobItem.value;
    if (!isMap(jobBody)) continue;
    const hasJobPerms = !!getMapValue(jobBody, "permissions");
    const usesGithubToken = jobMentions(jobBody as Node, "GITHUB_TOKEN") || jobMentions(jobBody as Node, "github.token");
    if (!hasJobPerms && usesGithubToken && !topPerms) {
      pushFinding(findings, {
        ruleId: "workflow.missing-job-permissions",
        severity: "medium",
        file: ctx.file,
        line: nodeLine(jobItem.key as Node, ctx),
        message: `Job '${scalarString(jobItem.key as Node) ?? "<unknown>"}' references GITHUB_TOKEN but has no 'permissions:' block. It will inherit the broad default.`,
        suggestion: "Add a 'permissions:' block at the job level scoping access to only what's needed (e.g. 'contents: read'). Defining it at workflow level is also acceptable.",
        codeSnippet: `${scalarString(jobItem.key as Node) ?? "<job>"}:`,
        references: ["CWE-732"],
      });
    }
  }
}

/** Recursively check whether a yaml subtree mentions a literal string anywhere. */
function jobMentions(node: Node, needle: string): boolean {
  if (isScalar(node)) {
    return typeof node.value === "string" && node.value.includes(needle);
  }
  if (isMap(node)) {
    return node.items.some((p) => {
      if (isScalar(p.key) && typeof p.key.value === "string" && p.key.value.includes(needle)) return true;
      return p.value ? jobMentions(p.value as Node, needle) : false;
    });
  }
  if (isSeq(node)) {
    return node.items.some((c) => jobMentions(c as Node, needle));
  }
  return false;
}

const UNTRUSTED_INPUTS = [
  "github.event.pull_request.title",
  "github.event.pull_request.body",
  "github.event.pull_request.head.ref",
  "github.event.pull_request.head.label",
  "github.event.issue.title",
  "github.event.issue.body",
  "github.event.comment.body",
  "github.event.review.body",
  "github.event.review_comment.body",
  "github.event.discussion.title",
  "github.event.discussion.body",
  "github.head_ref",
];

function checkShellInjection(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  findings: Finding[],
): void {
  const root = doc.contents;
  if (!isMap(root)) return;
  const jobs = getMapValue(root, "jobs");
  if (!isMap(jobs)) return;

  for (const jobItem of jobs.items) {
    const jobBody = jobItem.value;
    if (!isMap(jobBody)) continue;
    const stepsNode = getMapValue(jobBody, "steps");
    if (!isSeq(stepsNode)) continue;
    for (const step of stepsNode.items) {
      if (!isMap(step)) continue;
      const runNode = getMapValue(step, "run");
      const run = scalarString(runNode);
      if (!run) continue;
      const interpolations = run.match(/\$\{\{[^}]+\}\}/g);
      if (!interpolations) continue;
      for (const expr of interpolations) {
        const inner = expr.slice(3, -2).trim();
        const matchedInput = UNTRUSTED_INPUTS.find((input) =>
          new RegExp(`(^|[^.])${input.replace(/\./g, "\\.")}(\\b|$)`).test(inner),
        );
        if (matchedInput) {
          pushFinding(findings, {
            ruleId: "workflow.untrusted-input-shell-injection",
            severity: "critical",
            file: ctx.file,
            line: nodeLine(runNode, ctx),
            message: `Shell injection: untrusted input '${matchedInput}' is interpolated into a 'run:' block. Attacker-controlled text becomes executable shell.`,
            suggestion: `Pass the value through an environment variable instead of GitHub Actions interpolation:\\n  env:\\n    PR_TITLE: \${{ ${matchedInput} }}\\n  run: |\\n    echo "$PR_TITLE"`,
            codeSnippet: expr,
            references: ["CWE-78", "https://securitylab.github.com/research/github-actions-untrusted-input/"],
          });
        }
      }
    }
  }
}

function checkPullRequestTargetWithCheckout(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  findings: Finding[],
): void {
  const root = doc.contents;
  if (!isMap(root)) return;

  // `on:` may be a scalar (single event), a sequence, or a mapping.
  const onNode = getMapValue(root, "on");
  let usesPRT = false;
  if (isScalar(onNode) && onNode.value === "pull_request_target") usesPRT = true;
  if (isSeq(onNode)) {
    usesPRT = onNode.items.some((i) => isScalar(i) && i.value === "pull_request_target");
  }
  if (isMap(onNode)) {
    usesPRT = onNode.items.some((p) => isScalar(p.key) && p.key.value === "pull_request_target");
  }
  if (!usesPRT) return;

  // Find any `actions/checkout@*` step that pulls the PR head ref.
  const jobs = getMapValue(root, "jobs");
  if (!isMap(jobs)) return;
  for (const jobItem of jobs.items) {
    const jobBody = jobItem.value;
    if (!isMap(jobBody)) continue;
    const stepsNode = getMapValue(jobBody, "steps");
    if (!isSeq(stepsNode)) continue;
    for (const step of stepsNode.items) {
      if (!isMap(step)) continue;
      const usesNode = getMapValue(step, "uses");
      const uses = scalarString(usesNode);
      if (!uses || !uses.startsWith("actions/checkout")) continue;
      const withNode = getMapValue(step, "with");
      const ref = scalarString(getMapValue(withNode, "ref"));
      const repository = scalarString(getMapValue(withNode, "repository"));
      const looksLikePrHead =
        (ref && /github\.event\.pull_request\.head/.test(ref)) ||
        (repository && /github\.event\.pull_request\.head\.repo/.test(repository));
      if (looksLikePrHead) {
        // Show the actual `ref:` (or `repository:`) the user wrote so the
        // finding criticises THEIR code, not a generic example. Falls back
        // to a safe placeholder when neither is set (shouldn't happen
        // given the looksLikePrHead check, but defensive).
        const offendingValue =
          (ref && /github\.event\.pull_request\.head/.test(ref) && ref) ||
          (repository &&
            /github\.event\.pull_request\.head\.repo/.test(repository) &&
            repository) ||
          "${{ github.event.pull_request.head.sha }}";

        const suggestion = buildPullRequestTargetFix(offendingValue);

        pushFinding(findings, {
          ruleId: "workflow.pull-request-target-with-head-checkout",
          severity: "critical",
          file: ctx.file,
          line: nodeLine(usesNode, ctx),
          message: `pull_request_target + checkout of PR head (\`${offendingValue}\`) is the classic supply-chain RCE pattern. The forked PR's code runs with secrets from your repo.`,
          suggestion,
          codeSnippet: `uses: ${uses}\n  with:\n    ref: ${offendingValue}`,
          references: ["https://securitylab.github.com/research/github-actions-preventing-pwn-requests/"],
        });
      }
    }
  }
}

function checkSelfHostedRunner(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  input: RuleInput,
  findings: Finding[],
): void {
  if (!input.repoIsPublic) return; // rule only applies on public repos
  const root = doc.contents;
  if (!isMap(root)) return;
  const jobs = getMapValue(root, "jobs");
  if (!isMap(jobs)) return;
  for (const jobItem of jobs.items) {
    const jobBody = jobItem.value;
    if (!isMap(jobBody)) continue;
    const runsOnNode = getMapValue(jobBody, "runs-on");
    const labels: string[] = [];
    if (isScalar(runsOnNode) && typeof runsOnNode.value === "string") {
      labels.push(runsOnNode.value);
    } else if (isSeq(runsOnNode)) {
      for (const item of runsOnNode.items) {
        if (isScalar(item) && typeof item.value === "string") labels.push(item.value);
      }
    }
    const hasSelfHosted = labels.some((l) => l === "self-hosted" || l.startsWith("self-hosted-"));
    const allowlisted = labels.some((l) => input.allowlist.runners.includes(l));
    if (hasSelfHosted && !allowlisted) {
      pushFinding(findings, {
        ruleId: "workflow.self-hosted-runner-on-public-repo",
        severity: "high",
        file: ctx.file,
        line: nodeLine(runsOnNode, ctx),
        message: `Job '${scalarString(jobItem.key as Node) ?? "<unknown>"}' uses a self-hosted runner on a public repo. A malicious fork PR could execute code on your infrastructure.`,
        suggestion: "Restrict self-hosted runners to private repos, OR require explicit approval for fork PRs via 'Require approval for first-time contributors' in repo settings, OR add the runner labels to the LGTM Security allowlist if this is intentional.",
        codeSnippet: `runs-on: ${labels.join(", ")}`,
        references: ["https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#self-hosted-runner-security"],
      });
    }
  }
}

function checkPrivilegedContainer(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  findings: Finding[],
): void {
  // Walk every map node, looking for `options: --privileged` or similar.
  const root = doc.contents;
  if (!isMap(root)) return;
  walkMaps(root as Node, (node, line) => {
    if (!isMap(node)) return;
    for (const pair of node.items) {
      if (!isScalar(pair.key)) continue;
      const key = pair.key.value;
      if (key === "options") {
        const opts = scalarString(pair.value as Node);
        if (opts && /(^|\s)--privileged(\s|$)/.test(opts)) {
          pushFinding(findings, {
            ruleId: "workflow.privileged-container",
            severity: "critical",
            file: ctx.file,
            line: nodeLine(pair.value as Node, ctx) ?? line,
            message: "Container is launched with '--privileged', granting access to all host devices. A compromised container becomes a host compromise.",
            suggestion: "Remove '--privileged'. If you need a specific capability (e.g. mounting an FS), use targeted '--cap-add' flags instead. Privileged is almost never the right answer in CI.",
            codeSnippet: `options: ${opts}`,
            references: ["CWE-250"],
          });
        }
      }
      if (key === "privileged") {
        const v = pair.value as Node;
        if (isScalar(v) && (v.value === true || v.value === "true")) {
          pushFinding(findings, {
            ruleId: "workflow.privileged-container",
            severity: "critical",
            file: ctx.file,
            line: nodeLine(v, ctx) ?? line,
            message: "Container declares 'privileged: true'. Equivalent to '--privileged' — host compromise on container escape.",
            suggestion: "Remove 'privileged: true'. Use targeted Linux capabilities only if absolutely required.",
            codeSnippet: "privileged: true",
            references: ["CWE-250"],
          });
        }
      }
    }
  }, ctx);
}

/** Recursive map-walker that also passes a starting line to the visitor. */
function walkMaps(
  node: Node,
  visit: (n: Node, line: number | undefined) => void,
  ctx: WalkCtx,
): void {
  visit(node, nodeLine(node, ctx));
  if (isMap(node)) {
    for (const p of node.items) {
      if (p.value) walkMaps(p.value as Node, visit, ctx);
    }
  } else if (isSeq(node)) {
    for (const c of node.items) {
      walkMaps(c as Node, visit, ctx);
    }
  }
}

function checkExternalReusableWorkflow(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  input: RuleInput,
  findings: Finding[],
): void {
  for (const step of iterUsesSteps(doc, ctx)) {
    if (step.ownerKey !== "reusable-workflow") continue;
    // Reusable workflow refs look like "owner/repo/.github/workflows/x.yml@ref"
    const m = /^([^/]+)\/[^/]+\/\.github\/workflows\/[^@]+@/.exec(step.uses);
    if (!m) continue;
    const owner = m[1];
    if (isAllowlisted(step.uses, input.allowlist.actions)) continue;
    // Heuristic: warn on any external owner. The allowlist is how customers
    // mark trusted orgs (their own + any vendor they audit).
    pushFinding(findings, {
      ruleId: "workflow.external-reusable-workflow",
      severity: "medium",
      file: ctx.file,
      line: step.line,
      message: `Reusable workflow from external org '${owner}' is being called. Its code runs with this repo's secrets.`,
      suggestion: `Audit the workflow at ${step.uses.split("@")[0]} and pin to a 40-char SHA. Add '${owner}/*' to the LGTM Security allowlist if you trust this org.`,
      codeSnippet: `uses: ${step.uses}`,
      references: ["CWE-829"],
    });
  }
}

function checkTriggerWeakening(
  doc: ReturnType<typeof parseDocument>,
  ctx: WalkCtx,
  findings: Finding[],
): void {
  // We can only detect "weakening" with a base-version comparison. For now,
  // flag the ambient pattern: workflow_dispatch with no input validation.
  const root = doc.contents;
  if (!isMap(root)) return;
  const onNode = getMapValue(root, "on");
  if (!isMap(onNode)) return;
  const wdPair = getMapPair(onNode, "workflow_dispatch");
  if (!wdPair) return;
  const wdBody = wdPair.value as Node | undefined;
  if (!wdBody || !isMap(wdBody)) return; // no inputs declared, fine
  const inputs = getMapValue(wdBody, "inputs");
  if (!isMap(inputs)) return;
  for (const inp of inputs.items) {
    const body = inp.value;
    if (!isMap(body)) continue;
    const hasType = !!getMapValue(body, "type");
    const hasOptions = !!getMapValue(body, "options");
    if (!hasType && !hasOptions) {
      pushFinding(findings, {
        ruleId: "workflow.trigger-weakening",
        severity: "medium",
        file: ctx.file,
        line: nodeLine(inp.key as Node, ctx),
        message: `workflow_dispatch input '${scalarString(inp.key as Node) ?? "<unknown>"}' has no 'type' or 'options' constraint. Anyone with workflow:write can pass arbitrary strings.`,
        suggestion: "Add a 'type:' (string|boolean|choice|environment) and, where applicable, 'options:' to constrain the value. For free-form strings, validate inside the job before using them.",
        codeSnippet: `${scalarString(inp.key as Node) ?? "<input>"}:`,
        references: ["CWE-20"],
      });
    }
  }
}

// ---------- top-level run() -------------------------------------------------

export const workflowYamlRules: Rule[] = [
  ruleStub("workflow.unpinned-action-checkout", "Detects 'actions/checkout' that's pinned to a tag instead of a 40-char commit SHA.", "high", "warn"),
  ruleStub("workflow.unpinned-third-party-action", "Detects third-party `uses:` entries pinned to a tag instead of a 40-char commit SHA.", "high", "warn"),
  ruleStub("workflow.permissions-write-all", "Detects 'permissions: write-all' which gives GITHUB_TOKEN unrestricted scope.", "high", "warn"),
  ruleStub("workflow.missing-job-permissions", "Detects jobs that reference GITHUB_TOKEN without a 'permissions:' block.", "medium", "warn"),
  ruleStub("workflow.untrusted-input-shell-injection", "Detects untrusted GitHub event fields interpolated into 'run:' shell scripts.", "critical", "block"),
  ruleStub("workflow.pull-request-target-with-head-checkout", "Detects pull_request_target combined with checkout of the PR head — supply-chain RCE pattern.", "critical", "block"),
  ruleStub("workflow.self-hosted-runner-on-public-repo", "Detects self-hosted runners on public repos where fork PRs can execute on the runner.", "high", "block"),
  ruleStub("workflow.privileged-container", "Detects containers launched with --privileged or 'privileged: true'.", "critical", "block"),
  ruleStub("workflow.external-reusable-workflow", "Detects reusable workflow calls into external orgs.", "medium", "warn"),
  ruleStub("workflow.trigger-weakening", "Detects workflow_dispatch inputs without type/options constraints.", "medium", "warn"),
];

/**
 * The above are stubs because each detector is implemented as a function in
 * this file rather than as its own Rule object. The single `runWorkflowYaml`
 * fan-out is what the registry actually uses.
 */
function ruleStub(id: RuleId, description: string, sev: Severity, action: "block" | "warn"): Rule {
  return {
    id,
    description,
    defaultSeverity: sev,
    defaultAction: action,
    run: () => [], // never called directly; runWorkflowYaml is the entry point
  };
}

/**
 * Runs every workflow-YAML detector against every YAML file in the input.
 * Files that aren't workflow/action metadata are silently skipped.
 */
export function runWorkflowYaml(input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  for (const file of input.files) {
    if (!isWorkflowFile(file.path) && !isActionMetadataFile(file.path)) continue;
    let doc: ReturnType<typeof parseDocument>;
    try {
      doc = parseDocument(file.content, { keepSourceTokens: false });
      if (doc.errors.length > 0) {
        // Malformed YAML — skip silently. The PR review will flag it via
        // other channels (CI itself fails on bad YAML).
        continue;
      }
    } catch {
      continue;
    }
    const ctx: WalkCtx = {
      file: file.path,
      lineCounter: { lineStarts: buildLineStarts(file.content) },
    };
    checkUnpinnedActions(doc, ctx, input, findings);
    checkPermissions(doc, ctx, findings);
    checkShellInjection(doc, ctx, findings);
    checkPullRequestTargetWithCheckout(doc, ctx, findings);
    checkSelfHostedRunner(doc, ctx, input, findings);
    checkPrivilegedContainer(doc, ctx, findings);
    checkExternalReusableWorkflow(doc, ctx, input, findings);
    checkTriggerWeakening(doc, ctx, findings);
  }
  return findings;
}

/**
 * Build the inline refactor advice for `pull_request_target` + PR-head
 * checkout. Two paths:
 *
 *   Option A — switch to `pull_request`. Right answer 80% of the time;
 *              the workflow loses access to repo secrets but that's exactly
 *              the property we want when running fork code.
 *
 *   Option B — keep `pull_request_target` but drop the checkout-of-head.
 *              Right answer when the workflow needs the privileged context
 *              (e.g. labelling/commenting on PRs) but doesn't actually
 *              need to *run* the PR's code.
 *
 * Embeds the user's actual `ref:` value (`offendingValue`) in Option B so
 * they see exactly which line to delete, not a generic example.
 *
 * Markdown-formatted: the dashboard's audit log card and the GitHub Check
 * Run summary both render markdown.
 */
function buildPullRequestTargetFix(offendingValue: string): string {
  return [
    "**Option A — switch to `pull_request` (recommended for most cases)**",
    "",
    "```yaml",
    "on:",
    "  pull_request:        # was: pull_request_target",
    "    types: [opened, synchronize]",
    "```",
    "",
    "The workflow runs without access to your repo's secrets, so even malicious code in the PR can't exfiltrate them.",
    "",
    "**Option B — keep `pull_request_target` but stop checking out PR code**",
    "",
    "```yaml",
    "- uses: actions/checkout@<sha>",
    `  # remove:  ref: ${offendingValue}`,
    "  # (defaults to the base branch — no PR code is fetched)",
    "```",
    "",
    "Use this when you need the privileged context (labels, comments, status checks) but only the base ref's code is enough.",
    "",
    "**If you genuinely need both** — fork code AND secrets — gate the workflow on a GitHub Environment with required reviewers, so a maintainer must approve each fork PR run before any of its code executes.",
  ].join("\n");
}
