import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose   from 'mongoose';
import request    from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app                from '../app';
import { User }           from '../models/User';
import { Repo }           from '../models/Repo';
import RepoHealthSnapshot from '../models/RepoHealthSnapshot';
import jwt from 'jsonwebtoken';

let mongo: MongoMemoryServer;
let authToken: string;
let userId: mongoose.Types.ObjectId;
let repoId: mongoose.Types.ObjectId;

const baseSignals = {
  coupling:   { gini: 0, normalized: 0 },
  churnRisk:  { hotFileCount: 0, normalized: 0 },
  debt:       { weightedTotal: 0, avgPerPR: 0, normalized: 0 },
  confidence: { rollingAvg: 70, normalized: 0.7 },
};

// Helper to sign JWT
function signJwt(payload: any): string {
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', { expiresIn: '24h' });
}

beforeAll(async () => {
  // Set JWT_SECRET for tests
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-secret';
  }
  
  // Disconnect from any existing connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const user = await User.create({
    githubId: '123456', username: 'testuser',
    avatarUrl: 'https://example.com/a.png', email: 'test@test.com',
    githubAccessToken: 'enc', githubInstallationId: 1,
    aiConfig: { providers: [], defaultProvider: 'openai', defaultModel: 'gpt-4o' },
    refreshTokens: [],
  });
  userId    = user._id;
  authToken = signJwt({ userId: userId.toString(), githubId: '123456' });
  const repo = await Repo.create({
    owner: 'acme', name: 'backend', fullName: 'acme/backend',
    githubRepoId: 9999, connectedBy: userId, webhookId: 1,
    settings: { autoReview: true, focusAreas: [] }, isActive: true,
  });
  repoId = repo._id;
});

afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await RepoHealthSnapshot.deleteMany({}); });

describe('GET /health/:repoId/latest', () => {
  it('returns 401 with no token', async () => {
    expect((await request(app).get(`/health/${repoId}/latest`)).status).toBe(401);
  });

  it('returns 400 for malformed repoId', async () => {
    const res = await request(app)
      .get('/health/bad-id/latest')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid repoId');
  });

  it('returns 404 when repo does not belong to user', async () => {
    const res = await request(app)
      .get(`/health/${new mongoose.Types.ObjectId()}/latest`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when no snapshots exist', async () => {
    const res = await request(app)
      .get(`/health/${repoId}/latest`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No health data yet');
  });

  it('returns 200 with correct shape when snapshot exists', async () => {
    await RepoHealthSnapshot.create({
      repoId, score: 74, signals: baseSignals,
      hotFiles: ['src/a.ts'], totalFiles: 100, totalDefinitions: 500, prCount: 20,
    });
    const res = await request(app)
      .get(`/health/${repoId}/latest`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(74);
    expect(res.body.repoFullName).toBe('acme/backend');
    expect(res.body.hotFiles).toEqual(['src/a.ts']);
    expect(res.body.signals).toBeDefined();
    expect(res.body.computedAt).toBeDefined();
  });

  it('returns the most recent snapshot when multiple exist', async () => {
    await RepoHealthSnapshot.create([
      { repoId, score: 60, signals: baseSignals, hotFiles: [], totalFiles: 10, totalDefinitions: 50, prCount: 5, computedAt: new Date('2026-01-01') },
      { repoId, score: 80, signals: baseSignals, hotFiles: [], totalFiles: 10, totalDefinitions: 50, prCount: 5, computedAt: new Date('2026-03-01') },
    ]);
    const res = await request(app)
      .get(`/health/${repoId}/latest`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.score).toBe(80);
  });
});

describe('GET /health/:repoId/history', () => {
  it('returns 401 with no token', async () => {
    expect((await request(app).get(`/health/${repoId}/history`)).status).toBe(401);
  });

  it('returns empty history array when no snapshots exist', async () => {
    const res = await request(app)
      .get(`/health/${repoId}/history`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it('filters to requested day window only', async () => {
    await RepoHealthSnapshot.create([
      { repoId, score: 70, signals: baseSignals, hotFiles: [], totalFiles: 10, totalDefinitions: 50, prCount: 0, computedAt: new Date(Date.now() - 200 * 86400000) },
      { repoId, score: 80, signals: baseSignals, hotFiles: [], totalFiles: 10, totalDefinitions: 50, prCount: 0, computedAt: new Date(Date.now() - 10 * 86400000) },
    ]);
    const res = await request(app)
      .get(`/health/${repoId}/history?days=90`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.history.length).toBe(1);
    expect(res.body.history[0].score).toBe(80);
  });

  it('clamps days param to 365 maximum', async () => {
    const res = await request(app)
      .get(`/health/${repoId}/history?days=9999`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.days).toBe(365);
  });

  it('returns history sorted chronologically ascending', async () => {
    const base = { repoId, score: 70, signals: baseSignals, hotFiles: [], totalFiles: 10, totalDefinitions: 50, prCount: 0 };
    await RepoHealthSnapshot.create([
      { ...base, computedAt: new Date('2026-03-10') },
      { ...base, computedAt: new Date('2026-02-01') },
      { ...base, computedAt: new Date('2026-03-01') },
    ]);
    const res = await request(app)
      .get(`/health/${repoId}/history?days=365`)
      .set('Authorization', `Bearer ${authToken}`);
    const dates = res.body.history.map((h: any) => new Date(h.computedAt).getTime());
    expect(dates[0]).toBeLessThan(dates[1]);
    expect(dates[1]).toBeLessThan(dates[2]);
  });
});
