/**
 * Pipeline decision endpoint tests — used by the LGTM Security runtime
 * Action. Mocks Redis since the production cache lives there.
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
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

// Mock Redis BEFORE importing app. vi.mock is hoisted, so the factory
// can't close over local variables — we create the mock inside and access
// it via the imported binding below.
vi.mock("../config/redis", () => ({
  redis: {
    get: vi.fn<(key: string) => Promise<string | null>>(),
  },
}));

import app from "../app";
import { redis } from "../config/redis";
const redisMock = redis as unknown as {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
};
import { User } from "../models/User";
import { Repo } from "../models/Repo";
import { SecurityMonitor } from "../models/SecurityMonitor";
import { ApiToken, generateApiToken } from "../models/ApiToken";

let mongo: MongoMemoryServer;
let userId: mongoose.Types.ObjectId;
let otherUserId: mongoose.Types.ObjectId;
let repoId: mongoose.Types.ObjectId;
let apiTokenPlain: string;
let otherUserTokenPlain: string;
let revokedTokenPlain: string;

beforeAll(async () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-secret";
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const user = await User.create({
    githubId: "p1",
    username: "owner",
    githubAccessToken: "enc",
    aiConfig: { providers: [] },
    billing: { plan: "pro", subscriptionStatus: "active" },
  });
  userId = user._id;

  const other = await User.create({
    githubId: "p2",
    username: "other",
    githubAccessToken: "enc",
    aiConfig: { providers: [] },
    billing: { plan: "free" },
  });
  otherUserId = other._id;

  const repo = await Repo.create({
    owner: "alice",
    name: "pipeline-repo",
    fullName: "alice/pipeline-repo",
    githubRepoId: 7001,
    connectedBy: userId,
    webhookId: 1,
    settings: {},
    isActive: true,
  });
  repoId = repo._id;

  await SecurityMonitor.create({ repoId, enabledBy: userId });

  // Token for the repo owner
  const tk = generateApiToken();
  await ApiToken.create({
    userId,
    name: "ci-token",
    scopes: ["pipeline:read"],
    tokenHash: tk.hash,
    prefix: tk.prefix,
  });
  apiTokenPlain = tk.plaintext;

  // Token for a different user (shouldn't see this repo)
  const tk2 = generateApiToken();
  await ApiToken.create({
    userId: otherUserId,
    name: "stranger-token",
    scopes: ["pipeline:read"],
    tokenHash: tk2.hash,
    prefix: tk2.prefix,
  });
  otherUserTokenPlain = tk2.plaintext;

  // Revoked token
  const tk3 = generateApiToken();
  await ApiToken.create({
    userId,
    name: "revoked",
    scopes: ["pipeline:read"],
    tokenHash: tk3.hash,
    prefix: tk3.prefix,
    revoked: true,
    revokedAt: new Date(),
  });
  revokedTokenPlain = tk3.plaintext;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  redisMock.get.mockReset();
});

const SHA = "abcdef0123456789abcdef0123456789abcdef01";

describe("GET /pipeline/decision auth", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get(
      `/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`,
    );
    expect(res.status).toBe(401);
  });

  it("rejects bogus tokens", async () => {
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", "Bearer lgtm_pat_notarealtoken");
    expect(res.status).toBe(401);
  });

  it("rejects revoked tokens", async () => {
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${revokedTokenPlain}`);
    expect(res.status).toBe(401);
  });

  it("rejects tokens whose owner doesn't own the repo", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify({ halt: true, reasons: ["x"] }),
    );
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${otherUserTokenPlain}`);
    // Per the controller: 404 to avoid leaking repo existence.
    expect(res.status).toBe(404);
  });
});

describe("GET /pipeline/decision behavior", () => {
  it("rejects malformed query params", async () => {
    const res = await request(app)
      .get(`/pipeline/decision?repo=just-one-segment&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 when no decision is cached for this commit", async () => {
    redisMock.get.mockResolvedValue(null);
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(404);
    expect(res.body.halt).toBe(false);
    expect(res.body.reason).toBe("decision-not-found");
  });

  it("returns halt:true when the cache says so", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify({
        halt: true,
        reasons: ["[secrets.hardcoded] AWS key in workflow"],
        computedAt: new Date().toISOString(),
      }),
    );
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(200);
    expect(res.body.halt).toBe(true);
    expect(res.body.reasons).toContain("[secrets.hardcoded] AWS key in workflow");
  });

  it("returns halt:false on clean scans", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify({ halt: false, reasons: [] }),
    );
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(200);
    expect(res.body.halt).toBe(false);
  });

  it("returns 200/halt:false when monitor is paused (regardless of cache)", async () => {
    await SecurityMonitor.updateOne(
      { repoId },
      { $set: { status: "paused" } },
    );
    redisMock.get.mockResolvedValue(
      JSON.stringify({ halt: true, reasons: ["x"] }),
    );
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(200);
    expect(res.body.halt).toBe(false);
    expect(res.body.reason).toBe("monitor-paused");
    // restore
    await SecurityMonitor.updateOne(
      { repoId },
      { $set: { status: "active" } },
    );
  });

  it("soft-fails (200/halt:false) when Redis errors", async () => {
    redisMock.get.mockRejectedValue(new Error("redis exploded"));
    const res = await request(app)
      .get(`/pipeline/decision?repo=alice/pipeline-repo&sha=${SHA}`)
      .set("Authorization", `Bearer ${apiTokenPlain}`);
    expect(res.status).toBe(503);
    expect(res.body.halt).toBe(false);
  });
});
