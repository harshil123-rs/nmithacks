/**
 * API Token CRUD tests.
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
import { ApiToken } from "../models/ApiToken";

let mongo: MongoMemoryServer;
let userId: mongoose.Types.ObjectId;
let userToken: string;

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
    githubId: "tk1",
    username: "tk-owner",
    githubAccessToken: "enc",
    aiConfig: { providers: [] },
    billing: { plan: "pro", subscriptionStatus: "active" },
  });
  userId = u._id;
  userToken = signJwt({ userId: userId.toString(), githubId: "tk1" });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ApiToken.deleteMany({});
});

describe("POST /security/tokens", () => {
  it("returns the plaintext token exactly once", async () => {
    const res = await request(app)
      .post("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "ci-prod", scopes: ["pipeline:read"] });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^lgtm_pat_[A-Za-z0-9_-]+$/);
    expect(res.body.prefix).toMatch(/^lgtm_pat_[A-Za-z0-9_-]{8}$/);

    // Listing the token must NOT return the plaintext.
    const listRes = await request(app)
      .get("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.tokens).toHaveLength(1);
    expect(listRes.body.tokens[0]).not.toHaveProperty("token");
    expect(listRes.body.tokens[0]).not.toHaveProperty("tokenHash");
    expect(listRes.body.tokens[0].prefix).toBe(res.body.prefix);
  });

  it("rejects unknown scopes", async () => {
    const res = await request(app)
      .post("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "x", scopes: ["super:admin"] });
    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    const res = await request(app)
      .post("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ scopes: ["pipeline:read"] });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /security/tokens/:id", () => {
  it("revokes a token (kept in DB for audit)", async () => {
    const create = await request(app)
      .post("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "to-revoke", scopes: ["pipeline:read"] });
    const id = create.body.id;

    const del = await request(app)
      .delete(`/security/tokens/${id}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(del.status).toBe(200);

    const remaining = await ApiToken.findById(id);
    expect(remaining).toBeTruthy();
    expect(remaining!.revoked).toBe(true);

    // List endpoint hides revoked tokens
    const list = await request(app)
      .get("/security/tokens")
      .set("Authorization", `Bearer ${userToken}`);
    expect(list.body.tokens).toHaveLength(0);
  });
});
