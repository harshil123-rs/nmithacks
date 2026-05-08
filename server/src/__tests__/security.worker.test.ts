/**
 * LGTM Security worker — end-to-end test against an in-memory Mongo.
 *
 * `getInstallationToken` and `githubAppFetch` are mocked so the worker
 * thinks it's hitting GitHub but actually serves canned responses. This
 * lets us exercise the entire scan path: fetch CI files → run rules →
 * persist findings → diff against previous scan → resolve stale findings.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { Repo } from "../models/Repo";
import { User } from "../models/User";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { SecurityAuditLog } from "../models/SecurityAuditLog";
import { SecurityScan } from "../models/SecurityScan";
import { DEFAULT_POLICY } from "../security/default-policy";

// Mock GitHub helpers BEFORE importing the worker.
const ghState: { files: Record<string, string>; defaultBranch: string; headSha: string } = {
  files: {},
  defaultBranch: "main",
  headSha: "abc1234",
};

vi.mock("../utils/github", () => ({
  getInstallationToken: vi.fn(async () => "fake-token"),
  githubAppFetch: vi.fn(async (path: string) => {
    // /repos/{owner/repo}/contents/{path}?ref=...
    const m = /\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)/.exec(path);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      // Directory listing — return [{type, path, name}]
      const dirEntries = Object.keys(ghState.files)
        .filter((p) => p.startsWith(decoded + "/"))
        .filter((p) => p !== decoded);
      // Detect "list directory" vs "raw file" by Accept header indirectly:
      // we know our worker uses the raw accept for files. The mock branches
      // on whether the path matches a known file vs is a known dir prefix.
      if (decoded in ghState.files) {
        return mockResponse(ghState.files[decoded], "text/plain");
      }
      if (dirEntries.length > 0) {
        const items = Array.from(
          new Set(
            dirEntries.map((p) => {
              const after = p.slice(decoded.length + 1);
              const slash = after.indexOf("/");
              const name = slash === -1 ? after : after.slice(0, slash);
              const fullPath = decoded + "/" + name;
              const isFile = slash === -1;
              return JSON.stringify({
                name,
                path: fullPath,
                type: isFile ? "file" : "dir",
              });
            }),
          ),
        ).map((s) => JSON.parse(s));
        return mockResponse(JSON.stringify(items), "application/json");
      }
      return mockResponse("Not found", "text/plain", 404);
    }
    // /repos/{owner}/{repo}
    if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) {
      return mockResponse(JSON.stringify({ default_branch: ghState.defaultBranch }), "application/json");
    }
    // /repos/{owner}/{repo}/branches/{branch}
    if (/\/branches\//.test(path)) {
      return mockResponse(
        JSON.stringify({ commit: { sha: ghState.headSha } }),
        "application/json",
      );
    }
    return mockResponse("Not found", "text/plain", 404);
  }),
}));

function mockResponse(body: string, contentType: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Map([["content-type", contentType]]),
  } as any;
}

// Import the worker AFTER the mock is registered.
import { processSecurityJobForTest } from "./helpers/security-worker-test-helper";

let mongo: MongoMemoryServer;
let userId: mongoose.Types.ObjectId;
let repoId: mongoose.Types.ObjectId;
let monitorId: mongoose.Types.ObjectId;

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const user = await User.create({
    githubId: "501",
    username: "scanner-user",
    githubAccessToken: "enc",
    githubInstallationId: 999,
    aiConfig: { providers: [] },
    billing: { plan: "pro", subscriptionStatus: "active" },
  });
  userId = user._id;

  const repo = await Repo.create({
    owner: "test",
    name: "scan-repo",
    fullName: "test/scan-repo",
    githubRepoId: 5001,
    connectedBy: userId,
    webhookId: 1,
    settings: {},
    isActive: true,
  });
  repoId = repo._id;

  const monitor = await SecurityMonitor.create({
    repoId,
    enabledBy: userId,
    policy: { ...DEFAULT_POLICY },
  });
  monitorId = monitor._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await SecurityAuditLog.deleteMany({});
  await SecurityScan.deleteMany({});
  ghState.files = {};
});

describe("security worker", () => {
  it("scans a repo with a bad workflow file and produces block findings", async () => {
    ghState.files = {
      ".github/workflows/ci.yml": `on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${"a".repeat(40)}
        with:
          ref: \${{ github.event.pull_request.head.sha }}`,
    };

    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "abc123",
    });

    const scans = await SecurityScan.find({ monitorId });
    expect(scans).toHaveLength(1);
    const scan = scans[0];
    expect(scan.state).toBe("complete");
    expect(scan.halt).toBe(true);
    expect(scan.counts.block).toBeGreaterThan(0);

    const audit = await SecurityAuditLog.find({ monitorId, source: "monitor" });
    expect(audit.length).toBeGreaterThan(0);
    const blocking = audit.find(
      (a) => a.ruleId === "workflow.pull-request-target-with-head-checkout",
    );
    expect(blocking).toBeDefined();
    expect(blocking!.policyAction).toBe("block");
    expect(blocking!.scanId?.toString()).toBe(scan._id.toString());
  });

  it("clean scan resolves previously-open monitor findings", async () => {
    // First scan: bad workflow
    ghState.files = {
      ".github/workflows/ci.yml": `permissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi`,
    };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "before",
    });
    const before = await SecurityAuditLog.find({ monitorId, resolvedAt: { $exists: false } });
    expect(before.length).toBeGreaterThan(0);

    // Second scan: workflow has been fixed
    ghState.files = {
      ".github/workflows/ci.yml": `permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi`,
    };
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "after",
    });

    const stillOpen = await SecurityAuditLog.find({
      monitorId,
      source: "monitor",
      resolvedAt: { $exists: false },
    });
    // The write-all finding from the first scan should now be resolved
    expect(
      stillOpen.find((e) => e.ruleId === "workflow.permissions-write-all"),
    ).toBeUndefined();
  });

  it("respects the monitor allowlist for unpinned third-party actions", async () => {
    // Override the monitor's allowlist
    await SecurityMonitor.updateOne(
      { _id: monitorId },
      { $set: { "policy.allowlist.actions": ["docker/*"] } },
    );

    ghState.files = {
      ".github/workflows/ci.yml": `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5`,
    };

    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "allowlist-test",
    });

    const audit = await SecurityAuditLog.find({ monitorId, source: "monitor" });
    expect(
      audit.find((a) => a.ruleId === "workflow.unpinned-third-party-action"),
    ).toBeUndefined();
  });

  it("handles the empty-CI-files case as a clean scan", async () => {
    ghState.files = {}; // nothing to scan
    await processSecurityJobForTest({
      monitorId: monitorId.toString(),
      trigger: "manual",
      headSha: "empty",
    });
    const scans = await SecurityScan.find({ monitorId, headSha: "empty" });
    expect(scans).toHaveLength(1);
    expect(scans[0].state).toBe("complete");
    expect(scans[0].halt).toBe(false);
    expect(scans[0].counts.total).toBe(0);
  });
});
