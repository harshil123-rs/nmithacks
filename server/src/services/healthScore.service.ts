import { RepoContext }    from '../models/RepoContext';
import { Review }         from '../models/Review';
import FilePushHistory   from '../models/FilePushHistory';
import RepoHealthSnapshot from '../models/RepoHealthSnapshot';
import mongoose          from 'mongoose';

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 10, high: 5, medium: 2, low: 1, info: 0,
};

export function computeGini(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const weighted = sorted.reduce((acc, v, i) => acc + v * (i + 1), 0);
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

export function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function computeAndSaveHealthScore(
  repoId: mongoose.Types.ObjectId,
): Promise<void> {
  const [ctx, pushHistory, reviews] = await Promise.all([
    RepoContext.findOne({ repoId }),
    FilePushHistory.find({ repoId }).sort({ pushedAt: -1 }).limit(30),
    Review.find({ repoId }).sort({ createdAt: -1 }).limit(30),
  ]);

  if (!ctx) return;

  // Signal 1: Coupling (Gini of PageRank scores)
  const pageRankScores = ctx.definitions
    .map((d: any) => d.pageRankScore as number ?? 0)
    .filter((s: number) => s > 0)
    .sort((a: number, b: number) => a - b);

  const gini = computeGini(pageRankScores);
  const s1   = gini;

  // Signal 2: Churn × centrality
  const topThreshold   = percentile(pageRankScores, 90);
  const highCentralSet = new Set<string>(
    ctx.definitions
      .filter((d: any) => (d.pageRankScore ?? 0) >= topThreshold)
      .map((d: any) => d.path as string),
  );

  const totalPushes = pushHistory.length || 1;
  const churnCount  = new Map<string, number>();
  for (const push of pushHistory)
    for (const f of push.files)
      churnCount.set(f, (churnCount.get(f) ?? 0) + 1);

  const hotFiles = [...highCentralSet].filter(
    f => (churnCount.get(f) ?? 0) / totalPushes > 0.30,
  );
  const s2 = Math.min(hotFiles.length / 10, 1);

  // Signal 3: Findings debt
  let totalDebt = 0;
  for (const review of reviews)
    for (const agent of review.agentReports)
      for (const finding of (agent.findings ?? []))
        totalDebt += SEVERITY_WEIGHTS[finding.severity] ?? 0;

  const avgDebt = totalDebt / Math.max(reviews.length, 1);
  const s3 = Math.min(avgDebt / 50, 1);

  // Signal 4: Confidence trend
  const avgConf = reviews.length > 0
    ? reviews.reduce((s, r) => s + (r.confidenceScore ?? 70), 0) / reviews.length
    : 70;
  const s4 = avgConf / 100;

  // Composite score
  const raw   = 100 - (s1 * 30) - (s2 * 30) - (s3 * 25) + (s4 * 15);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  await RepoHealthSnapshot.create({
    repoId, score,
    signals: {
      coupling:   { gini: s1, normalized: s1 },
      churnRisk:  { hotFileCount: hotFiles.length, normalized: s2 },
      debt:       { weightedTotal: totalDebt, avgPerPR: avgDebt, normalized: s3 },
      confidence: { rollingAvg: avgConf, normalized: s4 },
    },
    hotFiles: hotFiles.slice(0, 10),
    totalDefinitions: ctx.definitions.length,
    totalFiles: ctx.fileTree?.length ?? 0,
    prCount: reviews.length,
    computedAt: new Date(),
  });
}
