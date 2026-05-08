/**
 * PR + Review API endpoints.
 *
 * GET  /prs           — list PRs across user's connected repos
 * GET  /prs/mine      — list PRs authored by the logged-in user
 * GET  /prs/:id/contributor — read-only PR detail for contributors (author only)
 * GET  /prs/:id       — single PR with full Review (maintainer)
 * POST /prs/:id/review — manually trigger review job
 * GET  /reviews/:id   — full review with all agent reports
 * GET  /reviews/:id/public — public review (limited data, no auth)
 */
import { Request, Response } from "express";
import { PR } from "../models/PR";
import { Review } from "../models/Review";
import { Repo } from "../models/Repo";
import { RepoContext } from "../models/RepoContext";
import { reviewQueue } from "../jobs/queue";
import { getInstallationToken, githubAppFetch } from "../utils/github";
import { User } from "../models/User";
import { reserveReview } from "./billing.controller";

/**
 * GET /prs
 * List all PRs across user's connected repos.
 * Query params: ?status=pending|reviewing|reviewed&repo=repoId&page=1&limit=20
 */
export async function listPRs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { status, repo, page = "1", limit = "20" } = req.query;

    // Find user's connected repos
    const repos = await Repo.find({
      connectedBy: userId,
      isActive: true,
    }).select("_id");
    const repoIds = repos.map((r) => r._id);

    if (repoIds.length === 0) {
      res.json({ prs: [], total: 0, page: 1, totalPages: 0 });
      return;
    }

    const filter: Record<string, any> = { repoId: { $in: repoIds } };
    if (
      status &&
      ["pending", "reviewing", "reviewed"].includes(status as string)
    ) {
      filter.status = status;
    }
    if (repo) {
      // repo can be a MongoDB ObjectId or a fullName string (owner/name)
      if ((repo as string).includes("/")) {
        const repoDoc = await Repo.findOne({
          fullName: repo,
          connectedBy: userId,
        }).select("_id");
        if (!repoDoc) {
          res.json({ prs: [], total: 0, page: 1, totalPages: 0 });
          return;
        }
        filter.repoId = repoDoc._id;
      } else {
        filter.repoId = repo;
      }
    }
    if (req.query.prNumber) {
      filter.prNumber = parseInt(req.query.prNumber as string, 10);
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      50,
      Math.max(1, parseInt(limit as string, 10) || 20),
    );
    const skip = (pageNum - 1) * limitNum;

    // Sort: for reviewing/reviewed, sort by updatedAt (most recently reviewed first)
    // For pending or all, sort by githubCreatedAt (newest PRs first)
    const sortField =
      status === "reviewing" || status === "reviewed"
        ? { updatedAt: -1 as const }
        : { githubCreatedAt: -1 as const, createdAt: -1 as const };

    const [prs, total] = await Promise.all([
      PR.find(filter)
        .sort(sortField)
        .skip(skip)
        .limit(limitNum)
        .populate("repoId", "fullName owner name")
        .lean(),
      PR.countDocuments(filter),
    ]);

    // Attach latest review verdict to each PR (only completed reviews with a verdict)
    const prIds = prs.map((p) => p._id);
    const reviews = await Review.find({
      prId: { $in: prIds },
      overallVerdict: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .select("prId overallVerdict confidenceScore finalSummary")
      .lean();

    const reviewMap = new Map<string, any>();
    for (const r of reviews) {
      const key = r.prId.toString();
      if (!reviewMap.has(key)) reviewMap.set(key, r);
    }

    // Normalize status: if a completed review exists, treat as "reviewed"
    // regardless of what the DB status field says (guards against stuck "pending")
    const enriched = prs.map((pr) => {
      const latestReview = reviewMap.get(pr._id.toString()) || null;
      const effectiveStatus =
        latestReview && pr.status === "pending" ? "reviewed" : pr.status;
      return { ...pr, status: effectiveStatus, latestReview };
    });

    // If filtering by status, apply post-enrichment so normalized status is used
    const filtered =
      status && ["pending", "reviewing", "reviewed"].includes(status as string)
        ? enriched.filter((pr) => pr.status === status)
        : enriched;

    res.json({
      prs: filtered,
      total: filtered.length,
      page: pageNum,
      totalPages: Math.ceil(filtered.length / limitNum),
    });
  } catch (err: any) {
    console.error("[PR] listPRs error:", err.message);
    res.status(500).json({ error: "Failed to fetch PRs" });
  }
}

/**
 * GET /prs/mine
 * List PRs authored by the logged-in user that LGTM has reviewed.
 * Query params: ?verdict=approve|request_changes&repo=repoFullName&q=search&page=1&limit=20
 */
export async function listMyPRs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId).select("username");
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const { verdict, repo, q, page = "1", limit = "20" } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      50,
      Math.max(1, parseInt(limit as string, 10) || 20),
    );
    const skip = (pageNum - 1) * limitNum;

    // Find all PRs authored by this user (any status — not just "reviewed")
    const prFilter: Record<string, any> = {
      "author.login": { $regex: new RegExp(`^${user.username}$`, "i") },
    };

    const [allPRs, total] = await Promise.all([
      PR.find(prFilter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("repoId", "fullName owner name")
        .lean(),
      PR.countDocuments(prFilter),
    ]);

    // Attach latest review to each PR
    const prIds = allPRs.map((p) => p._id);
    const reviews = await Review.find({
      prId: { $in: prIds },
      overallVerdict: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .select(
        "prId overallVerdict confidenceScore finalSummary agentReports createdAt",
      )
      .lean();

    const reviewMap = new Map<string, any>();
    for (const r of reviews) {
      const key = r.prId.toString();
      if (!reviewMap.has(key)) {
        // Compute findings count
        const totalFindings = (r.agentReports || []).reduce(
          (sum: number, report: any) =>
            sum +
            (report.agentType === "reviewer" ||
            report.agentType === "synthesizer"
              ? 0
              : report.findings?.length || 0),
          0,
        );
        const severityCounts: Record<string, number> = {};
        for (const report of r.agentReports || []) {
          if (
            report.agentType === "reviewer" ||
            report.agentType === "synthesizer"
          )
            continue;
          for (const f of report.findings || []) {
            severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
          }
        }
        reviewMap.set(key, { ...r, totalFindings, severityCounts });
      }
    }

    let enriched = allPRs.map((pr) => ({
      ...pr,
      latestReview: reviewMap.get(pr._id.toString()) || null,
    }));

    // Client-side filters
    if (verdict) {
      enriched = enriched.filter(
        (pr) => pr.latestReview?.overallVerdict === verdict,
      );
    }
    if (repo) {
      enriched = enriched.filter((pr) => (pr.repoId as any)?.fullName === repo);
    }
    if (q) {
      const query = (q as string).toLowerCase();
      enriched = enriched.filter(
        (pr) =>
          pr.title?.toLowerCase().includes(query) ||
          (pr.repoId as any)?.fullName?.toLowerCase().includes(query),
      );
    }

    // Get distinct repos for filter dropdown
    const repoSet = new Set<string>();
    allPRs.forEach((pr) => {
      const repoName = (pr.repoId as any)?.fullName;
      if (repoName) repoSet.add(repoName);
    });

    res.json({
      prs: enriched,
      total: enriched.length,
      page: pageNum,
      totalPages: Math.ceil(enriched.length / limitNum),
      repos: Array.from(repoSet).sort(),
    });
  } catch (err: any) {
    console.error("[PR] listMyPRs error:", err.message);
    res.status(500).json({ error: "Failed to fetch your PRs" });
  }
}

/**
 * GET /prs/:id/contributor
 * Read-only PR detail for contributors — only if the logged-in user is the PR author.
 */
export async function getContributorPR(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const user = await User.findById(userId).select("username");
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const pr = await PR.findById(id)
      .populate("repoId", "fullName owner name")
      .lean();
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }

    // Verify the logged-in user is the PR author
    if (pr.author?.login?.toLowerCase() !== user.username?.toLowerCase()) {
      res
        .status(403)
        .json({ error: "Access denied — you are not the author of this PR" });
      return;
    }

    // Get all reviews for this PR (most recent first)
    const reviews = await Review.find({ prId: pr._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ pr, reviews });
  } catch (err: any) {
    console.error("[PR] getContributorPR error:", err.message);
    res.status(500).json({ error: "Failed to fetch PR" });
  }
}

/**
 * GET /prs/:id
 * Single PR with full Review populated.
 */
export async function getPR(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const pr = await PR.findById(id)
      .populate("repoId", "fullName owner name settings")
      .lean();
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }

    // Verify user owns this repo
    const repo = await Repo.findOne({
      _id: pr.repoId,
      connectedBy: userId,
      isActive: true,
    });
    if (!repo) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Get all reviews for this PR (most recent first)
    const reviews = await Review.find({ prId: pr._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ pr, reviews });
  } catch (err: any) {
    console.error("[PR] getPR error:", err.message);
    res.status(500).json({ error: "Failed to fetch PR" });
  }
}

/**
 * POST /prs/:id/review
 * Manually trigger a review job for a PR.
 */
export async function triggerReview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const pr = await PR.findById(id);
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }

    const repo = await Repo.findOne({
      _id: pr.repoId,
      connectedBy: userId,
      isActive: true,
    });
    if (!repo) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (pr.status === "reviewing") {
      res.status(409).json({ error: "Review already in progress" });
      return;
    }

    if (!reviewQueue) {
      res.status(503).json({ error: "Review queue not available" });
      return;
    }

    // Ensure repo has been indexed before allowing review
    const repoCtx = await RepoContext.findOne({ repoId: repo._id })
      .select("indexStatus")
      .lean();
    if (!repoCtx || repoCtx.indexStatus !== "ready") {
      res.status(400).json({
        error:
          'Codebase must be indexed before running a review. Go to Repos and click "Index Codebase" first.',
        code: "NOT_INDEXED",
      });
      return;
    }

    // Billing guard — atomically reserve a review slot
    const billingCheck = await reserveReview(userId!);
    if (!billingCheck.allowed) {
      res.status(402).json({ error: billingCheck.reason });
      return;
    }

    // Update PR status
    pr.status = "reviewing";
    await pr.save();

    // Enqueue review job
    await reviewQueue.add("pr-review", {
      repoId: repo._id.toString(),
      repoFullName: repo.fullName,
      prNumber: pr.prNumber,
      prTitle: pr.title,
      prBody: pr.body,
      headSha: pr.headSha,
      baseBranch: pr.baseBranch,
      headBranch: pr.headBranch,
      action: "manual",
      sender: pr.author.login,
      senderAvatarUrl: pr.author.avatarUrl,
      githubCreatedAt: pr.githubCreatedAt?.toISOString(),
    });

    res.json({ message: "Review triggered", prId: pr._id });
  } catch (err: any) {
    console.error("[PR] triggerReview error:", err.message);
    res.status(500).json({ error: "Failed to trigger review" });
  }
}

/**
 * GET /reviews/:id
 * Full review with all agent reports (auth required).
 */
export async function getReview(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const review = await Review.findById(id).lean();
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    // Allow access if user owns the repo OR is the PR author
    const repo = await Repo.findOne({
      _id: review.repoId,
      connectedBy: userId,
      isActive: true,
    });

    if (!repo) {
      // Check if user is the PR author
      const user = await User.findById(userId).select("username");
      const pr = await PR.findById(review.prId).select("author").lean();
      if (
        !user ||
        !pr ||
        pr.author?.login?.toLowerCase() !== user.username?.toLowerCase()
      ) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const pr = await PR.findById(review.prId)
      .populate("repoId", "fullName owner name")
      .lean();

    res.json({ review, pr });
  } catch (err: any) {
    console.error("[PR] getReview error:", err.message);
    res.status(500).json({ error: "Failed to fetch review" });
  }
}

/**
 * GET /reviews
 * Review feed — all completed reviews across user's repos, paginated.
 * Query params: ?repo=repoId&page=1&limit=20&q=search
 */
export async function listReviewFeed(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { repo, page = "1", limit = "20", q } = req.query;

    const repos = await Repo.find({
      connectedBy: userId,
      isActive: true,
    }).select("_id");
    const repoIds = repos.map((r) => r._id);

    if (repoIds.length === 0) {
      res.json({ reviews: [], total: 0, page: 1, totalPages: 0 });
      return;
    }

    const filter: Record<string, any> = {
      repoId: repo ? repo : { $in: repoIds },
      overallVerdict: { $exists: true, $ne: null },
    };

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(
      50,
      Math.max(1, parseInt(limit as string, 10) || 20),
    );
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate(
          "prId",
          "prNumber title author headBranch baseBranch githubCreatedAt",
        )
        .populate("repoId", "fullName owner name")
        .select("+localTitle")
        .lean(),
      Review.countDocuments(filter),
    ]);

    // Client-side search filter (by PR title or author)
    let filtered = reviews;
    if (q) {
      const query = (q as string).toLowerCase();
      filtered = reviews.filter((r: any) => {
        const pr = r.prId;
        if (!pr) return false;
        return (
          pr.title?.toLowerCase().includes(query) ||
          pr.author?.login?.toLowerCase().includes(query) ||
          (r.repoId as any)?.fullName?.toLowerCase().includes(query)
        );
      });
    }

    // Compute findings count per review
    const enriched = filtered.map((r: any) => {
      const totalFindings = (r.agentReports || []).reduce(
        (sum: number, report: any) =>
          sum +
          (report.agentType === "reviewer" || report.agentType === "synthesizer"
            ? 0
            : report.findings?.length || 0),
        0,
      );
      const severityCounts: Record<string, number> = {};
      for (const report of r.agentReports || []) {
        if (
          report.agentType === "reviewer" ||
          report.agentType === "synthesizer"
        )
          continue;
        for (const f of report.findings || []) {
          severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
        }
      }
      return {
        _id: r._id,
        overallVerdict: r.overallVerdict,
        finalSummary: r.finalSummary,
        confidenceScore: r.confidenceScore,
        createdAt: r.createdAt,
        localTitle: r.localTitle || null,
        totalFindings,
        severityCounts,
        pr: r.prId,
        repo: r.repoId,
      };
    });

    res.json({
      reviews: enriched,
      total: q ? enriched.length : total,
      page: pageNum,
      totalPages: q
        ? Math.ceil(enriched.length / limitNum)
        : Math.ceil(total / limitNum),
    });
  } catch (err: any) {
    console.error("[PR] listReviewFeed error:", err.message);
    res.status(500).json({ error: "Failed to fetch review feed" });
  }
}

/**
 * GET /reviews/:id/public
 * Public review — limited data, no auth required.
 */
export async function getPublicReview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;

    const review = await Review.findById(id).lean();
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const pr = await PR.findById(review.prId)
      .populate("repoId", "fullName owner name")
      .lean();

    // Public view: verdict, summary, top 3 findings only
    const topFindings: any[] = [];
    for (const report of review.agentReports) {
      for (const finding of report.findings || []) {
        topFindings.push({
          ...finding,
          agentType: report.agentType,
        });
      }
    }

    // Sort by severity and take top 3
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    topFindings.sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
    );

    res.json({
      review: {
        _id: review._id,
        overallVerdict: review.overallVerdict,
        finalSummary: review.finalSummary,
        confidenceScore: review.confidenceScore,
        createdAt: review.createdAt,
        localTitle: review.localTitle || null,
        agentCount: review.agentReports.length,
        topFindings: topFindings.slice(0, 3),
      },
      pr: pr
        ? {
            _id: pr._id,
            title: pr.title,
            prNumber: pr.prNumber,
            author: pr.author,
            headBranch: pr.headBranch,
            baseBranch: pr.baseBranch,
            repoId: pr.repoId,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[PR] getPublicReview error:", err.message);
    res.status(500).json({ error: "Failed to fetch review" });
  }
}
