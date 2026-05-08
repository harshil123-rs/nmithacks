/**
 * Analytics API endpoints.
 *
 * GET /analytics/overview  — totals, verdict distribution, avg review time
 * GET /analytics/trends    — time-series: severity/week, review time, PRs/week
 * GET /analytics/top-issues — most common findings across all reviews
 *
 * All endpoints filter by ?repo=repoId&range=7d|30d|90d|all
 */
import { Request, Response } from "express";
import mongoose from "mongoose";
import { Review } from "../models/Review";
import { PR } from "../models/PR";
import { Repo } from "../models/Repo";

function getDateFilter(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

async function getUserRepoIds(
  userId: string,
  repoFilter?: string,
): Promise<mongoose.Types.ObjectId[]> {
  if (repoFilter) {
    const repo = await Repo.findOne({
      _id: repoFilter,
      connectedBy: userId,
      isActive: true,
    }).select("_id");
    return repo ? [repo._id] : [];
  }
  const repos = await Repo.find({ connectedBy: userId, isActive: true }).select(
    "_id",
  );
  return repos.map((r) => r._id);
}

/**
 * GET /analytics/overview
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { repo, range = "30d" } = req.query;
    const repoIds = await getUserRepoIds(userId!, repo as string);

    if (repoIds.length === 0) {
      res.json({
        totalReviews: 0,
        totalPRs: 0,
        verdictDistribution: { approve: 0, request_changes: 0, block: 0 },
        avgReviewTimeMs: 0,
        avgConfidence: 0,
        totalFindings: 0,
        severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      });
      return;
    }

    const match: Record<string, any> = { repoId: { $in: repoIds } };
    const since = getDateFilter(range as string);
    if (since) match.createdAt = { $gte: since };

    const [overviewAgg, prCount] = await Promise.all([
      Review.aggregate([
        { $match: match },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  avgConfidence: { $avg: "$confidenceScore" },
                },
              },
            ],
            verdicts: [
              { $group: { _id: "$overallVerdict", count: { $sum: 1 } } },
            ],
            reviewTime: [
              { $unwind: "$agentReports" },
              {
                $match: {
                  "agentReports.status": "completed",
                  "agentReports.durationMs": { $gt: 0 },
                },
              },
              {
                $group: {
                  _id: "$_id",
                  totalDuration: { $sum: "$agentReports.durationMs" },
                },
              },
              { $group: { _id: null, avgMs: { $avg: "$totalDuration" } } },
            ],
            findings: [
              { $unwind: "$agentReports" },
              { $unwind: "$agentReports.findings" },
              {
                $group: {
                  _id: "$agentReports.findings.severity",
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),
      PR.countDocuments({ repoId: { $in: repoIds } }),
    ]);

    const facets = overviewAgg[0];
    const totalReviews = facets.totals[0]?.count || 0;
    const avgConfidence = Math.round(facets.totals[0]?.avgConfidence || 0);
    const avgReviewTimeMs = Math.round(facets.reviewTime[0]?.avgMs || 0);

    const verdictDistribution: Record<string, number> = {
      approve: 0,
      request_changes: 0,
      block: 0,
    };
    for (const v of facets.verdicts) {
      if (v._id in verdictDistribution) verdictDistribution[v._id] = v.count;
    }

    const severityBreakdown: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    let totalFindings = 0;
    for (const f of facets.findings) {
      if (f._id in severityBreakdown) {
        severityBreakdown[f._id] = f.count;
        totalFindings += f.count;
      }
    }

    res.json({
      totalReviews,
      totalPRs: prCount,
      verdictDistribution,
      avgReviewTimeMs,
      avgConfidence,
      totalFindings,
      severityBreakdown,
    });
  } catch (err: any) {
    console.error("[Analytics] overview error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
}

/**
 * GET /analytics/trends
 */
export async function getTrends(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { repo, range = "30d" } = req.query;
    const repoIds = await getUserRepoIds(userId!, repo as string);

    if (repoIds.length === 0) {
      res.json({
        severityByWeek: [],
        reviewTimeByWeek: [],
        prsByWeek: [],
        agentFindings: [],
      });
      return;
    }

    const match: Record<string, any> = { repoId: { $in: repoIds } };
    const since = getDateFilter(range as string);
    if (since) match.createdAt = { $gte: since };

    const [severityByWeek, reviewTimeByWeek, prsByWeek, agentFindings] =
      await Promise.all([
        // Issues by severity per week
        Review.aggregate([
          { $match: match },
          { $unwind: "$agentReports" },
          { $unwind: "$agentReports.findings" },
          {
            $group: {
              _id: {
                week: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: {
                      $dateTrunc: { date: "$createdAt", unit: "week" },
                    },
                  },
                },
                severity: "$agentReports.findings.severity",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.week": 1 } },
        ]),

        // Average review time per week
        Review.aggregate([
          { $match: match },
          { $unwind: "$agentReports" },
          {
            $match: {
              "agentReports.status": "completed",
              "agentReports.durationMs": { $gt: 0 },
            },
          },
          {
            $group: {
              _id: {
                reviewId: "$_id",
                week: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: {
                      $dateTrunc: { date: "$createdAt", unit: "week" },
                    },
                  },
                },
              },
              totalMs: { $sum: "$agentReports.durationMs" },
            },
          },
          {
            $group: {
              _id: "$_id.week",
              avgMs: { $avg: "$totalMs" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // PRs reviewed per week
        Review.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: { $dateTrunc: { date: "$createdAt", unit: "week" } },
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Findings by agent type
        Review.aggregate([
          { $match: match },
          { $unwind: "$agentReports" },
          {
            $match: {
              "agentReports.agentType": {
                $nin: ["reviewer", "synthesizer"],
              },
            },
          },
          {
            $group: {
              _id: "$agentReports.agentType",
              findings: {
                $sum: { $size: { $ifNull: ["$agentReports.findings", []] } },
              },
            },
          },
          { $sort: { findings: -1 } },
        ]),
      ]);

    // Reshape severity by week into { week, critical, high, medium, low, info }
    const weekMap = new Map<string, Record<string, number>>();
    for (const row of severityByWeek) {
      const week = row._id.week;
      if (!weekMap.has(week))
        weekMap.set(week, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
      const entry = weekMap.get(week)!;
      if (row._id.severity in entry) entry[row._id.severity] = row.count;
    }
    const severityTrend = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, counts]) => ({ week, ...counts }));

    res.json({
      severityByWeek: severityTrend,
      reviewTimeByWeek: reviewTimeByWeek.map((r) => ({
        week: r._id,
        avgMs: Math.round(r.avgMs),
        reviews: r.count,
      })),
      prsByWeek: prsByWeek.map((r) => ({ week: r._id, count: r.count })),
      agentFindings: agentFindings.map((r) => ({
        agent: r._id,
        findings: r.findings,
      })),
    });
  } catch (err: any) {
    console.error("[Analytics] trends error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics trends" });
  }
}

/**
 * GET /analytics/top-issues
 */
export async function getTopIssues(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { repo, range = "30d" } = req.query;
    const repoIds = await getUserRepoIds(userId!, repo as string);

    if (repoIds.length === 0) {
      res.json({ topIssues: [] });
      return;
    }

    const match: Record<string, any> = { repoId: { $in: repoIds } };
    const since = getDateFilter(range as string);
    if (since) match.createdAt = { $gte: since };

    const topIssues = await Review.aggregate([
      { $match: match },
      { $unwind: "$agentReports" },
      {
        $match: {
          "agentReports.agentType": { $nin: ["reviewer", "synthesizer"] },
        },
      },
      { $unwind: "$agentReports.findings" },
      {
        $group: {
          _id: {
            // $substrCP counts Unicode code points instead of raw bytes, so
            // multi-byte UTF-8 characters (em-dashes, smart quotes, emoji)
            // can't get sliced in half mid-character. $substrBytes blew up
            // on findings whose messages contain `—` or similar.
            message: {
              $substrCP: ["$agentReports.findings.message", 0, 120],
            },
            severity: "$agentReports.findings.severity",
            agent: "$agentReports.agentType",
          },
          count: { $sum: 1 },
          files: { $addToSet: "$agentReports.findings.file" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          message: "$_id.message",
          severity: "$_id.severity",
          agent: "$_id.agent",
          count: 1,
          fileCount: { $size: "$files" },
        },
      },
    ]);

    res.json({ topIssues });
  } catch (err: any) {
    console.error("[Analytics] top-issues error:", err.message);
    res.status(500).json({ error: "Failed to fetch top issues" });
  }
}
