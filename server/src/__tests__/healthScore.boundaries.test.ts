import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose   from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RepoContext }    from '../models/RepoContext';
import { Review }         from '../models/Review';
import FilePushHistory   from '../models/FilePushHistory';
import RepoHealthSnapshot from '../models/RepoHealthSnapshot';
import { computeAndSaveHealthScore } from '../services/healthScore.service';

let mongo: MongoMemoryServer;
const repoId = new mongoose.Types.ObjectId();

beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterAll(async ()  => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([
    RepoContext.deleteMany({}), Review.deleteMany({}),
    FilePushHistory.deleteMany({}), RepoHealthSnapshot.deleteMany({}),
  ]);
});

it('score never goes below 0 under worst-case inputs', async () => {
  await RepoContext.create({
    repoId, repoMap: '', fileTree: [], indexStatus: 'ready', conventions: [], recentHistory: [],
    definitions: [
      { path: 'god.ts', name: 'god', line: 1, kind: 'def', pageRankScore: 1000 },
      ...Array.from({ length: 9 }, (_, i) => ({ path: `f${i}.ts`, name: `f${i}`, line: 1, kind: 'def', pageRankScore: 0.001 })),
    ],
  });
  for (let i = 0; i < 30; i++)
    await FilePushHistory.create({ repoId, files: ['god.ts'], commitSha: `s${i}`, pushedAt: new Date() });
  const prId = new mongoose.Types.ObjectId();
  for (let i = 0; i < 30; i++)
    await Review.create({
      prId, repoId, overallVerdict: 'request_changes', finalSummary: '', confidenceScore: 0,
      agentReports: [{ agentType: 'security', status: 'completed',
        findings: Array.from({ length: 50 }, () => ({ file: 'god.ts', line: 1, severity: 'critical', message: 'x', suggestion: '' })),
      }],
    });
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.score).toBeGreaterThanOrEqual(0);
});

it('score never exceeds 100 under best-case inputs', async () => {
  await RepoContext.create({
    repoId, repoMap: '', fileTree: [], indexStatus: 'ready', conventions: [], recentHistory: [],
    definitions: [
      { path: 'a.ts', name: 'a', line: 1, kind: 'def', pageRankScore: 1.0 },
      { path: 'b.ts', name: 'b', line: 1, kind: 'def', pageRankScore: 1.0 },
    ],
  });
  const prId = new mongoose.Types.ObjectId();
  for (let i = 0; i < 10; i++)
    await Review.create({
      prId, repoId, overallVerdict: 'approve', finalSummary: '', confidenceScore: 100,
      agentReports: [{ agentType: 'security', status: 'completed', findings: [] }],
    });
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.score).toBeLessThanOrEqual(100);
});

it('repo with exactly 1 definition does not throw', async () => {
  await RepoContext.create({
    repoId, repoMap: '', fileTree: ['solo.ts'], indexStatus: 'ready', conventions: [], recentHistory: [],
    definitions: [{ path: 'solo.ts', name: 'fn', line: 1, kind: 'def', pageRankScore: 0.5 }],
  });
  await expect(computeAndSaveHealthScore(repoId)).resolves.not.toThrow();
  expect(await RepoHealthSnapshot.findOne({ repoId })).toBeTruthy();
});

it('definitions with missing pageRankScore field do not throw', async () => {
  await RepoContext.create({
    repoId, repoMap: '', fileTree: [], indexStatus: 'ready', conventions: [], recentHistory: [],
    definitions: [{ path: 'a.ts', name: 'a', line: 1, kind: 'def' }],
  });
  await expect(computeAndSaveHealthScore(repoId)).resolves.not.toThrow();
});
