/**
 * Smoke tests for the ci-security review agent — the wrapper around the
 * rule library that the PR pipeline invokes. The rule library itself is
 * tested in security.rules.test.ts; here we only assert the wiring.
 */
import { describe, it, expect } from "vitest";
import { runCiSecurityAgent } from "../agents/review/ci-security";
import type { AgentInput } from "../agents/review/types";

function input(files: Array<{ path: string; content: string }>): AgentInput {
  // Most fields aren't read by ci-security — fill in conservative defaults.
  return {
    diff: { files: [], totalAdditions: 0, totalDeletions: 0, totalFiles: 0 },
    rawDiff: "",
    changedFiles: files,
    relatedFiles: [],
    conventions: [],
    recentHistory: [],
    repoMap: "",
    pr: { title: "", body: "", author: "", baseBranch: "main", headBranch: "feat", prNumber: 1 },
    repoFullName: "test/repo",
    llmOptions: { provider: "openai" as const, model: "gpt-4o", apiKey: "x" },
  };
}

describe("ci-security agent", () => {
  it("short-circuits when the PR touches no CI files", async () => {
    const out = await runCiSecurityAgent(
      input([
        { path: "src/index.ts", content: "export const x = 1;" },
        { path: "README.md", content: "# hello" },
      ]),
    );
    expect(out.agentType).toBe("ci-security");
    expect(out.findings).toHaveLength(0);
    expect(out.metadata?.scanType).toBe("skipped-no-ci-files");
  });

  it("flags a critical block finding for pull_request_target + head checkout", async () => {
    const wf = `on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}
        with:
          ref: \${{ github.event.pull_request.head.sha }}`;
    const out = await runCiSecurityAgent(
      input([{ path: ".github/workflows/ci.yml", content: wf }]),
    );
    const blocking = out.findings.find(
      (f) => f.ruleId === "workflow.pull-request-target-with-head-checkout",
    );
    expect(blocking).toBeDefined();
    expect(blocking!.severity).toBe("critical");
    expect(blocking!.policyAction).toBe("block");
    expect(out.metadata?.blockCount).toBeGreaterThan(0);
  });

  it("returns warn-action findings for unpinned actions but no block", async () => {
    const wf = `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4`;
    const out = await runCiSecurityAgent(
      input([{ path: ".github/workflows/ci.yml", content: wf }]),
    );
    expect(out.findings.length).toBeGreaterThan(0);
    expect(out.findings.every((f) => f.policyAction !== "block")).toBe(true);
    expect(out.metadata?.blockCount).toBe(0);
    expect(out.metadata?.warnCount).toBeGreaterThan(0);
  });

  it("sorts findings: block before warn, then by severity", async () => {
    const wf = `on: pull_request_target
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}`;
    const out = await runCiSecurityAgent(
      input([{ path: ".github/workflows/ci.yml", content: wf }]),
    );
    // First finding must be a block-action (the prt+checkout pattern)
    expect(out.findings[0].policyAction).toBe("block");
    // After all blocks, all warns
    let seenWarn = false;
    for (const f of out.findings) {
      if (f.policyAction === "warn") seenWarn = true;
      if (seenWarn) expect(f.policyAction).not.toBe("block");
    }
  });
});
