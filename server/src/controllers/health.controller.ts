import { Request, Response } from "express";
import RepoHealthSnapshot from "../models/RepoHealthSnapshot";
import FilePushHistory from "../models/FilePushHistory";
import { Repo } from "../models/Repo";
import mongoose from "mongoose";

export async function getHealthSnapshot(req: Request, res: Response) {
  const repoId = String(req.params.repoId);

  if (!mongoose.Types.ObjectId.isValid(repoId))
    return res.status(400).json({ error: "Invalid repoId" });

  const repo = await Repo.findOne({
    _id: repoId,
    connectedBy: req.user!.userId,
    isActive: true,
  });
  if (!repo) return res.status(404).json({ error: "Repo not found" });

  const snapshot = await RepoHealthSnapshot.findOne({ repoId }).sort({
    computedAt: -1,
  });

  if (!snapshot) return res.status(404).json({ error: "No health data yet" });

  // Get recent push history for commit timeline
  const recentPushes = await FilePushHistory.find({ repoId })
    .sort({ pushedAt: -1 })
    .limit(10)
    .select("commitSha files pushedAt fileDiffs");

  // Calculate additional metrics
  const totalSnapshots = await RepoHealthSnapshot.countDocuments({ repoId });
  const firstSnapshot = await RepoHealthSnapshot.findOne({ repoId }).sort({
    computedAt: 1,
  });

  const scoreChange =
    firstSnapshot && totalSnapshots > 1
      ? snapshot.score - firstSnapshot.score
      : 0;

  return res.json({
    repoId,
    repoFullName: repo.fullName,
    score: snapshot.score,
    signals: snapshot.signals,
    hotFiles: snapshot.hotFiles,
    totalFiles: snapshot.totalFiles,
    totalDefs: snapshot.totalDefinitions,
    prCount: snapshot.prCount,
    computedAt: snapshot.computedAt,
    recentPushes: recentPushes.map((p) => ({
      commitSha: p.commitSha,
      files: p.files,
      pushedAt: p.pushedAt,
      fileDiffs: p.fileDiffs || [],
    })),
    metrics: {
      totalSnapshots,
      scoreChange,
      daysTracked: firstSnapshot
        ? Math.floor(
            (Date.now() - firstSnapshot.computedAt.getTime()) / 86400000,
          )
        : 0,
    },
  });
}

export async function getHealthHistory(req: Request, res: Response) {
  const repoId = String(req.params.repoId);
  const days = Math.min(parseInt(req.query.days as string) || 90, 365);

  if (!mongoose.Types.ObjectId.isValid(repoId))
    return res.status(400).json({ error: "Invalid repoId" });

  const repo = await Repo.findOne({
    _id: repoId,
    connectedBy: req.user!.userId,
    isActive: true,
  });
  if (!repo) return res.status(404).json({ error: "Repo not found" });

  const since = new Date(Date.now() - days * 86400000);
  const snapshots = await RepoHealthSnapshot.find({
    repoId,
    computedAt: { $gte: since },
  })
    .sort({ computedAt: 1 })
    .select("score computedAt signals totalFiles totalDefinitions");

  return res.json({
    repoId,
    repoFullName: repo.fullName,
    days,
    history: snapshots.map((s) => ({
      score: s.score,
      computedAt: s.computedAt,
      gini: s.signals.coupling.gini,
      hotFileCount: s.signals.churnRisk.hotFileCount,
      coupling: s.signals.coupling.normalized,
      churnRisk: s.signals.churnRisk.normalized,
      debt: s.signals.debt.normalized,
      confidence: s.signals.confidence.normalized,
      totalFiles: s.totalFiles,
      totalDefs: s.totalDefinitions,
    })),
  });
}

export async function getCommitData(req: Request, res: Response) {
  const repoId = String(req.params.repoId);
  const commitSha = String(req.params.commitSha);

  if (!mongoose.Types.ObjectId.isValid(repoId))
    return res.status(400).json({ error: "Invalid repoId" });

  if (!commitSha || !/^[a-f0-9]{7,40}$/i.test(commitSha))
    return res.status(400).json({ error: "Invalid commitSha" });

  const repo = await Repo.findOne({
    _id: repoId,
    connectedBy: req.user!.userId,
    isActive: true,
  });
  if (!repo) return res.status(404).json({ error: "Repo not found" });

  const push = await FilePushHistory.findOne({ repoId, commitSha });
  if (!push) return res.status(404).json({ error: "Commit not found" });

  return res.json({
    commit: {
      commitSha: push.commitSha,
      files: push.files,
      pushedAt: push.pushedAt,
      fileDiffs: push.fileDiffs || [],
    },
  });
}
