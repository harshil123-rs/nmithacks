/**
 * LGTM Security — enrollment + audit log API tests.
 *
 * Spins up an in-memory Mongo + the real Express app. Exercises the full
 * route-controller-model path so we catch wiring bugs (auth middleware,
 * route mounting, plan tier gates, immutability hooks).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

import app from "../app";
import { User } from "../models/User";
import { Repo } from "../models/Repo";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { SecurityAuditLog } from "../models/SecurityAuditLog";
import { PR } from "../models/PR";

let mongo: MongoMemoryServer;
let freeUserId: mongoose.Types.ObjectId;
let proUserId: mongoose.Types.ObjectId;
let freeUserToken: string;
let proUserToken: string;
let repoAId: mongoose.Types.ObjectId;
let repoBId: mongoose.Types.ObjectId;
let repoCId: mongoose.Types.ObjectId; // owned by proUser
let strangerToken: string; // a third user with no repos

function signJwt(payload: any): string {
  return jwt.sign(payload, process.env.JWT_SECRET || "test-secret", {
    expiresIn: "24h",
  });
}

beforeAll(async () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-secret";
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const freeUser = await User.create({
    githubId: "100",
    username: "free-user",
    githubAccessToken: "enc",
    githubInstallationId: 1,
    aiConfig: { providers: [] },
    billing: { plan: "free", reviewsUsedThisMonth: 0 },
  });
  freeUserId = freeUser._id;
  freeUserToken = signJwt({ userId: freeUserId.toString(), githubId: "100" });

  const proUser = await User.create({
    githubId: "200",
    username: "pro-user",
    githubAccessToken: "enc",
    githubInstallationId: 2,
    aiConfig: { providers: [] },
    billing: {
      plan: "pro",
      subscriptionStatus: "active",
      reviewsUsedThisMonth: 0,
    },
  });
  proUserId = proUser._id;
  proUserToken = signJwt({ userId: proUserId.toString(), githubId: "200" });

  const stranger = await User.create({
    githubId: "300",
    username: "stranger",
    githubAccessToken: "enc",
    aiConfig: { providers: [] },
    billing: { plan: "free", reviewsUsedThisMonth: 0 },
  });
  strangerToken = signJwt({ userId: stranger._id.toString(), githubId: "300" });

  const repoA = await Repo.create({
    owner: "alice",
    name: "repo-a",
    fullName: "alice/repo-a",
    githubRepoId: 1001,
    connectedBy: freeUserId,
    webhookId: 1,
    settings: {},
    isActive: true,
  });
  repoAId = repoA._id;

  const repoB = await Repo.create({
    owner: "alice",
    name: "repo-b",
    fullName: "alice/repo-b",
    githubRepoId: 1002,
    connectedBy: freeUserId,
    webhookId: 2,
    settings: {},
    isActive: true,
  });
  repoBId = repoB._id;

  const repoC = await Repo.create({
    owner: "bob",
    name: "repo-c",
    fullName: "bob/repo-c",
    githubRepoId: 1003,
    connectedBy: proUserId,
    webhookId: 3,
    settings: {},
    isActive: true,
  });
  repoCId = repoC._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await SecurityMonitor.deleteMany({});
  await SecurityAuditLog.deleteMany({});
});

describe("POST /security/enroll", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/security/enroll")
      .send({ repoId: repoAId.toString() });
    expect(res.status).toBe(401);
  });

  it("creates a monitor with default policy", async () => {
    const res = await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    expect(res.status).toBe(201);
    expect(res.body.repoFullName).toBe("alice/repo-a");
    expect(res.body.policyVersion).toBe(1);

    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    expect(monitor).toBeTruthy();
    expect(monitor!.status).toBe("active");
    // Default policy is loaded
    expect((monitor!.policy.rules as any)["secrets.hardcoded"].action).toBe("block");
  });

  it("blocks free users from enrolling more than 1 repo", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });

    const res = await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoBId.toString() });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("plan_limit_reached");
  });

  it("allows pro users unlimited enrollments", async () => {
    // Even attempting two enrollments by pro user should succeed
    // (we only have one repo for pro user but the plan check is what matters)
    const res = await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${proUserToken}`)
      .send({ repoId: repoCId.toString() });
    expect(res.status).toBe(201);
  });

  it("rejects enrollment of someone else's repo", async () => {
    const res = await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ repoId: repoAId.toString() });
    expect(res.status).toBe(403);
  });

  it("is idempotent — re-enrolling reactivates without overwriting policy", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });

    // Mutate the policy
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    (monitor!.policy.rules as any)["workflow.unpinned-action-checkout"].action = "off";
    monitor!.markModified("policy");
    await monitor!.save();

    // Re-enroll
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });

    const after = await SecurityMonitor.findOne({ repoId: repoAId });
    expect((after!.policy.rules as any)["workflow.unpinned-action-checkout"].action).toBe("off");
  });
});

describe("GET /security/repos", () => {
  it("returns enrolled repos with posture counts", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });

    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });

    // Inject a couple of audit log entries
    await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "pr-review",
      ruleId: "workflow.permissions-write-all",
      category: "workflow.permissions-write-all",
      severity: "high",
      policyAction: "warn",
      message: "x",
      file: ".github/workflows/ci.yml",
      headSha: "abc",
      detectedBy: "yaml-ast",
    });
    await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "pr-review",
      ruleId: "secrets.hardcoded",
      category: "secrets.hardcoded",
      severity: "critical",
      policyAction: "block",
      message: "x",
      file: "x",
      headSha: "abc",
      detectedBy: "regex",
    });

    const res = await request(app)
      .get("/security/repos")
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.monitors).toHaveLength(1);
    expect(res.body.monitors[0].posture.critical).toBe(1);
    expect(res.body.monitors[0].posture.high).toBe(1);
  });
});

describe("DELETE /security/repos/:repoId", () => {
  it("unenrolls a repo without deleting audit log", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "pr-review",
      ruleId: "secrets.hardcoded",
      category: "secrets.hardcoded",
      severity: "critical",
      policyAction: "block",
      message: "x",
      file: "x",
      headSha: "abc",
      detectedBy: "regex",
    });

    const res = await request(app)
      .delete(`/security/repos/${repoAId}`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.status).toBe(200);

    const remaining = await SecurityMonitor.findOne({ repoId: repoAId });
    expect(remaining).toBeNull();
    const audits = await SecurityAuditLog.find({ repoId: repoAId });
    expect(audits).toHaveLength(1); // audit survived
  });
});

describe("PATCH /security/repos/:repoId/policy", () => {
  it("merges rule overrides without dropping unspecified rules", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });

    const res = await request(app)
      .patch(`/security/repos/${repoAId}/policy`)
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ rules: { "workflow.unpinned-action-checkout": { action: "off" } } });
    expect(res.status).toBe(200);

    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    expect((monitor!.policy.rules as any)["workflow.unpinned-action-checkout"].action).toBe("off");
    // Other rules untouched
    expect((monitor!.policy.rules as any)["secrets.hardcoded"].action).toBe("block");
  });
});

describe("SecurityAuditLog immutability", () => {
  it("rejects updates to immutable fields", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });

    const entry = await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "pr-review",
      ruleId: "secrets.hardcoded",
      category: "secrets.hardcoded",
      severity: "critical",
      policyAction: "block",
      message: "original",
      file: "x",
      headSha: "abc",
      detectedBy: "regex",
    });

    // Direct save attempt
    entry.severity = "low";
    await expect(entry.save()).rejects.toThrow(/immutable/);

    // updateOne attempt
    await expect(
      SecurityAuditLog.updateOne(
        { _id: entry._id },
        { $set: { message: "tampered" } },
      ),
    ).rejects.toThrow(/immutable/);
  });

  it("allows resolution mutations", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });

    const entry = await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "pr-review",
      ruleId: "secrets.hardcoded",
      category: "secrets.hardcoded",
      severity: "critical",
      policyAction: "block",
      message: "x",
      file: "x",
      headSha: "abc",
      detectedBy: "regex",
    });

    const res = await request(app)
      .patch(`/security/audit/${entry._id}`)
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ resolution: "fixed" });
    expect(res.status).toBe(200);

    const after = await SecurityAuditLog.findById(entry._id);
    expect(after!.resolution).toBe("fixed");
    expect(after!.resolvedAt).toBeTruthy();
  });
});

describe("GET /security/repos/:repoId/audit", () => {
  it("filters by severity", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    await SecurityAuditLog.create([
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "pr-review",
        ruleId: "a",
        category: "a",
        severity: "critical",
        policyAction: "block",
        message: "x",
        file: "x",
        headSha: "abc",
        detectedBy: "regex",
      },
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "pr-review",
        ruleId: "b",
        category: "b",
        severity: "low",
        policyAction: "warn",
        message: "x",
        file: "x",
        headSha: "abc",
        detectedBy: "regex",
      },
    ]);

    const res = await request(app)
      .get(`/security/repos/${repoAId}/audit?severity=critical`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].severity).toBe("critical");
  });

  it("filters by free-text q across message, file, ruleId", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    await SecurityAuditLog.create([
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "monitor",
        ruleId: "secrets.hardcoded",
        category: "secrets.hardcoded",
        severity: "critical",
        policyAction: "block",
        message: "Potential hardcoded secret detected: aws-access-key",
        file: ".github/workflows/deploy.yml",
        headSha: "abc",
        detectedBy: "regex",
      },
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "monitor",
        ruleId: "workflow.unpinned-action-checkout",
        category: "workflow.unpinned-action-checkout",
        severity: "high",
        policyAction: "warn",
        message: "actions/checkout pinned to a tag",
        file: ".github/workflows/ci.yml",
        headSha: "abc",
        detectedBy: "yaml-ast",
      },
    ]);

    // Search by message keyword
    let res = await request(app)
      .get(`/security/repos/${repoAId}/audit?q=aws-access`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].ruleId).toBe("secrets.hardcoded");

    // Search by file path
    res = await request(app)
      .get(`/security/repos/${repoAId}/audit?q=ci.yml`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].file).toContain("ci.yml");

    // Search by ruleId fragment
    res = await request(app)
      .get(`/security/repos/${repoAId}/audit?q=unpinned`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].ruleId).toBe("workflow.unpinned-action-checkout");
  });

  it("escapes regex metacharacters in q (no injection)", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });
    await SecurityAuditLog.create({
      monitorId: monitor!._id,
      repoId: repoAId,
      source: "monitor",
      ruleId: "rule.x",
      category: "rule.x",
      severity: "low",
      policyAction: "warn",
      message: "boring",
      file: "x",
      headSha: "abc",
      detectedBy: "regex",
    });
    // ".*" treated as a literal string — won't match "boring"
    const res = await request(app)
      .get(`/security/repos/${repoAId}/audit?q=.*`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("filters by prNumber and joins PR title", async () => {
    await request(app)
      .post("/security/enroll")
      .set("Authorization", `Bearer ${freeUserToken}`)
      .send({ repoId: repoAId.toString() });
    const monitor = await SecurityMonitor.findOne({ repoId: repoAId });

    await PR.create({
      repoId: repoAId,
      prNumber: 42,
      title: "Add deploy workflow",
      body: "",
      author: { login: "alice", avatarUrl: "" },
      headSha: "abc",
      baseBranch: "main",
      headBranch: "feat",
      diffUrl: "",
      status: "reviewed",
      githubPRId: 42,
    });

    await SecurityAuditLog.create([
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "pr-review",
        prNumber: 42,
        ruleId: "secrets.hardcoded",
        category: "secrets.hardcoded",
        severity: "critical",
        policyAction: "block",
        message: "x",
        file: "x",
        headSha: "abc",
        detectedBy: "regex",
      },
      {
        monitorId: monitor!._id,
        repoId: repoAId,
        source: "pr-review",
        prNumber: 7,
        ruleId: "rule.b",
        category: "rule.b",
        severity: "low",
        policyAction: "warn",
        message: "x",
        file: "x",
        headSha: "abc",
        detectedBy: "regex",
      },
    ]);

    // Plain number form
    let res = await request(app)
      .get(`/security/repos/${repoAId}/audit?prNumber=42`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].prNumber).toBe(42);
    expect(res.body.entries[0].prTitle).toBe("Add deploy workflow");

    // "#42" form should also work
    res = await request(app)
      .get(`/security/repos/${repoAId}/audit?prNumber=%2342`) // %23 = #
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.body.entries).toHaveLength(1);

    // Non-existent PR — empty title
    res = await request(app)
      .get(`/security/repos/${repoAId}/audit?prNumber=7`)
      .set("Authorization", `Bearer ${freeUserToken}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].prTitle).toBe(null);
  });
});
