/**
 * Per-rule analytics endpoint — drives the FP-rate badges in the policy editor.
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

let mongo: MongoMemoryServer;
let userId: mongoose.Types.ObjectId;
let token: string;
let repoId: mongoose.Types.ObjectId;
let monitorId: mongoose.Types.ObjectId;

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

  const u = await User.create({
    githubId: "rs1",
    username: "rs-owner",
    githubAccessToken: "enc",
    aiConfig: { providers: [] },
    billing: { plan: "pro", subscriptionStatus: "active" },
  });
  userId = u._id;
  token = signJwt({ userId: userId.toString(), githubId: "rs1" });

  const repo = await Repo.create({
    owner: "x",
    name: "rs-repo",
    fullName: "x/rs-repo",
    githubRepoId: 9001,
    connectedBy: userId,
    webhookId: 1,
    settings: {},
    isActive: true,
  });
  repoId = repo._id;

  const monitor = await SecurityMonitor.create({
    repoId,
    enabledBy: userId,
  });
  monitorId = monitor._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await SecurityAuditLog.deleteMany({});
});

async function seed(
  ruleId: string,
  resolution?: "fixed" | "false-positive" | "muted",
) {
  await SecurityAuditLog.create({
    monitorId,
    repoId,
    source: "monitor",
    ruleId,
    category: ruleId,
    severity: "high",
    policyAction: "warn",
    message: "x",
    file: "f.yml",
    headSha: "abc",
    detectedBy: "yaml-ast",
    ...(resolution
      ? { resolvedAt: new Date(), resolution }
      : {}),
  });
}

describe("GET /security/repos/:repoId/rule-stats", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get(`/security/repos/${repoId}/rule-stats`);
    expect(res.status).toBe(401);
  });

  it("returns empty rules array when no audit log entries", async () => {
    const res = await request(app)
      .get(`/security/repos/${repoId}/rule-stats`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(0);
  });

  it("computes total / open / resolved per rule", async () => {
    await seed("r1");
    await seed("r1");
    await seed("r1", "fixed");
    await seed("r2", "false-positive");

    const res = await request(app)
      .get(`/security/repos/${repoId}/rule-stats`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const r1 = res.body.rules.find((r: any) => r.ruleId === "r1");
    const r2 = res.body.rules.find((r: any) => r.ruleId === "r2");
    expect(r1).toEqual(expect.objectContaining({
      total: 3,
      open: 2,
      fixed: 1,
      falsePositive: 0,
    }));
    expect(r2).toEqual(expect.objectContaining({
      total: 1,
      open: 0,
      fixed: 0,
      falsePositive: 1,
    }));
  });

  it("returns null fpRate when no resolutions yet", async () => {
    await seed("r3");
    await seed("r3");
    const res = await request(app)
      .get(`/security/repos/${repoId}/rule-stats`)
      .set("Authorization", `Bearer ${token}`);
    const r3 = res.body.rules.find((r: any) => r.ruleId === "r3");
    expect(r3.fpRate).toBe(null);
  });

  it("computes fpRate as falsePositive / resolved", async () => {
    // 2 fixed, 3 false-positive, 1 muted → resolved=6, fpRate=0.5
    await seed("r4", "fixed");
    await seed("r4", "fixed");
    await seed("r4", "false-positive");
    await seed("r4", "false-positive");
    await seed("r4", "false-positive");
    await seed("r4", "muted");
    const res = await request(app)
      .get(`/security/repos/${repoId}/rule-stats`)
      .set("Authorization", `Bearer ${token}`);
    const r4 = res.body.rules.find((r: any) => r.ruleId === "r4");
    expect(r4.resolved).toBe(6);
    expect(r4.fpRate).toBeCloseTo(0.5, 5);
  });

  it("rejects requests from a user who doesn't own the monitor", async () => {
    const stranger = await User.create({
      githubId: "rs-stranger",
      username: "stranger",
      githubAccessToken: "enc",
      aiConfig: { providers: [] },
      billing: { plan: "free" },
    });
    const strangerToken = signJwt({
      userId: stranger._id.toString(),
      githubId: "rs-stranger",
    });
    const res = await request(app)
      .get(`/security/repos/${repoId}/rule-stats`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });
});
