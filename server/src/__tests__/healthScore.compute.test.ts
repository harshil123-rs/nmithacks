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

const seedCtx = (overrides: any = {}) => RepoContext.create({
  repoId, repoMap: '', fileTree: ['src/a.ts', 'src/b.ts'],
  definitions: [
    { path: 'src/a.ts', name: 'funcA', line: 1, kind: 'def', pageRankScore: 1.0 },
    { path: 'src/b.ts', name: 'funcB', line: 1, kind: 'def', pageRankScore: 0.2 },
    { path: 'src/c.ts', name: 'funcC', line: 1, kind: 'def', pageRankScore: 0.1 },
  ],
  graphEdges: [], conventions: [], recentHistory: [], indexStatus: 'ready',
  ...overrides,
});

const seedReviews = (count: number, findings: any[], confidenceScore = 80) => {
  const prId = new mongoose.Types.ObjectId();
  return Promise.all(Array.from({ length: count }, () => Review.create({
    prId, repoId,
    agentReports: [{ agentType: 'security', status: 'completed', findings }],
    overallVerdict: 'request_changes', finalSummary: '', confidenceScore,
  })));
};

it('skips silently when RepoContext does not exist', async () => {
  await computeAndSaveHealthScore(repoId);
  expect(await RepoHealthSnapshot.countDocuments({ repoId })).toBe(0);
});

it('creates a snapshot with score in [0, 100]', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.score).toBeGreaterThanOrEqual(0);
  expect(snap!.score).toBeLessThanOrEqual(100);
});

it('score is a rounded integer — never a decimal', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(Number.isInteger(snap!.score)).toBe(true);
});

it('equal PageRank scores produce zero coupling penalty', async () => {
  await seedCtx({ definitions: [
    { path: 'a.ts', name: 'a', line: 1, kind: 'def', pageRankScore: 1.0 },
    { path: 'b.ts', name: 'b', line: 1, kind: 'def', pageRankScore: 1.0 },
    { path: 'c.ts', name: 'c', line: 1, kind: 'def', pageRankScore: 1.0 },
  ]});
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.signals.coupling.normalized).toBeCloseTo(0, 2);
});

it('no hot files when push history is empty', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.hotFiles.length).toBe(0);
  expect(snap!.signals.churnRisk.normalized).toBe(0);
});

it('detects hot file when high-centrality file changes more than 30% of pushes', async () => {
  await seedCtx();
  await Promise.all(Array.from({ length: 10 }, (_, i) =>
    FilePushHistory.create({ repoId, files: ['src/a.ts'], commitSha: `sha${i}`, pushedAt: new Date() })
  ));
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.hotFiles).toContain('src/a.ts');
  expect(snap!.signals.churnRisk.normalized).toBeGreaterThan(0);
});

it('debt is zero when there are no reviews', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.signals.debt.normalized).toBe(0);
});

it('critical findings increase the debt penalty', async () => {
  await seedCtx();
  await seedReviews(5, [{ file: 'a.ts', line: 1, severity: 'critical', message: 'x', suggestion: '' }]);
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.signals.debt.weightedTotal).toBeGreaterThan(0);
});

it('info findings contribute zero to debt', async () => {
  await seedCtx();
  await seedReviews(5, [{ file: 'a.ts', line: 1, severity: 'info', message: 'x', suggestion: '' }]);
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.signals.debt.weightedTotal).toBe(0);
});

it('confidence defaults to 70 when no reviews exist', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.signals.confidence.rollingAvg).toBe(70);
});

it('each push creates a new snapshot — never upserts', async () => {
  await seedCtx();
  await computeAndSaveHealthScore(repoId);
  await computeAndSaveHealthScore(repoId);
  expect(await RepoHealthSnapshot.countDocuments({ repoId })).toBe(2);
});

it('hotFiles list is capped at 10 entries', async () => {
  const defs = Array.from({ length: 20 }, (_, i) => ({
    path: `src/file${i}.ts`, name: `fn${i}`, line: 1, kind: 'def', pageRankScore: 1.0,
  }));
  await seedCtx({ definitions: defs });
  for (const d of defs)
    for (let i = 0; i < 10; i++)
      await FilePushHistory.create({ repoId, files: [d.path], commitSha: `s${i}`, pushedAt: new Date() });
  await computeAndSaveHealthScore(repoId);
  const snap = await RepoHealthSnapshot.findOne({ repoId });
  expect(snap!.hotFiles.length).toBeLessThanOrEqual(10);
});
