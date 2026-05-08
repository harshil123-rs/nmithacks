import { Request, Response } from "express";
import { User } from "../models/User";
import { Repo } from "../models/Repo";
import { PR } from "../models/PR";
import { RepoContext } from "../models/RepoContext";
import {
  getInstallationToken,
  findUserInstallation,
  githubAppFetch,
} from "../utils/github";

/**
 * GET /repos/available
 * Fetch repos accessible via the user's GitHub App installation.
 */
export async function listAvailableRepos(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = await User.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Find or resolve installation ID
    let installationId = user.githubInstallationId;
    if (!installationId) {
      const found = await findUserInstallation(user.username);
      if (!found) {
        res.status(404).json({
          error: "GitHub App is not installed on your account.",
          needsInstall: true,
          installUrl: `https://github.com/apps/${process.env.GITHUB_APP_SLUG || "tarin-lgtm"}/installations/new`,
        });
        return;
      }
      // Cache it on the user
      installationId = found;
      user.githubInstallationId = found;
      await user.save();
    }

    let token: string;
    try {
      token = await getInstallationToken(installationId);
    } catch (err: any) {
      // Installation might have been removed
      console.error("[Repo] Installation token error:", err.message);
      user.githubInstallationId = undefined;
      await user.save();
      res.status(403).json({
        error: "GitHub App installation is invalid. Please reinstall the app.",
        needsInstall: true,
        installUrl: `https://github.com/apps/${process.env.GITHUB_APP_SLUG || "tarin-lgtm"}/installations/new`,
      });
      return;
    }

    // Fetch repos accessible to this installation (includes private repos)
    const repos: Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      updated_at: string;
      permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    }> = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const ghRes = await githubAppFetch(
        `/installation/repositories?per_page=${perPage}&page=${page}`,
        token,
      );
      if (!ghRes.ok) {
        const body = await ghRes.json().catch(() => ({}));
        res.status(ghRes.status).json({
          error: (body as { message?: string }).message || "GitHub API error",
        });
        return;
      }
      const data = (await ghRes.json()) as {
        repositories: typeof repos;
        total_count: number;
      };
      repos.push(...data.repositories);
      console.log(
        `[Repo] Page ${page}: got ${data.repositories.length} repos (total_count: ${data.total_count})`,
      );
      if (
        repos.length >= data.total_count ||
        data.repositories.length < perPage
      )
        break;
      page++;
    }

    console.log(`[Repo] Total repos from installation: ${repos.length}`);

    // With GitHub Apps, webhooks are at the app level — no admin filter needed.
    // Sort by most recently updated first
    repos.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    // Get already connected repo IDs
    const connectedIds = new Set(
      (
        await Repo.find({
          connectedBy: req.user!.userId,
          isActive: true,
        }).select("githubRepoId")
      ).map((r) => r.githubRepoId),
    );

    const available = repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      isPrivate: r.private,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
      connected: connectedIds.has(r.id),
    }));

    res.json({ repos: available });
  } catch (err) {
    console.error("[Repo] listAvailable error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * POST /repos/connect
 * Connect a repo — save to DB.
 * Webhooks are handled at the App level (configured in GitHub App settings),
 * so no need to create per-repo webhooks.
 */
export async function connectRepo(req: Request, res: Response): Promise<void> {
  try {
    let { owner, name, fullName, githubRepoId } = req.body;

    // CLI sends only fullName — resolve the rest from GitHub API
    if (fullName && (!owner || !name || !githubRepoId)) {
      const parts = fullName.split("/");
      if (parts.length !== 2) {
        res.status(400).json({ error: "fullName must be owner/repo format" });
        return;
      }
      owner = owner || parts[0];
      name = name || parts[1];

      if (!githubRepoId) {
        // Look up the repo via GitHub API to get the numeric ID
        const user = await User.findById(req.user!.userId);
        if (!user?.githubInstallationId) {
          res.status(400).json({
            error: "GitHub App not installed. Install it first.",
          });
          return;
        }
        try {
          const token = await getInstallationToken(user.githubInstallationId);
          const ghRes = await githubAppFetch(`/repos/${fullName}`, token);
          if (!ghRes.ok) {
            res.status(404).json({
              error: `Repository ${fullName} not found or not accessible via GitHub App`,
            });
            return;
          }
          const ghRepo = (await ghRes.json()) as { id: number };
          githubRepoId = ghRepo.id;
        } catch (err: any) {
          res.status(502).json({
            error: `Failed to resolve repo from GitHub: ${err.message}`,
          });
          return;
        }
      }
    }

    if (!owner || !name || !fullName || !githubRepoId) {
      res.status(400).json({
        error: "owner, name, fullName, and githubRepoId are required",
      });
      return;
    }

    // Check if already connected
    const existing = await Repo.findOne({ githubRepoId, isActive: true });
    if (existing) {
      res.status(409).json({ error: "Repository is already connected" });
      return;
    }

    const user = await User.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check for previously disconnected repo and reactivate
    const deactivated = await Repo.findOne({ githubRepoId, isActive: false });
    let repo;
    if (deactivated) {
      deactivated.isActive = true;
      deactivated.webhookId = 0; // App-level webhooks, no per-repo hook
      deactivated.connectedBy = user._id as any;
      deactivated.settings = {
        autoReview: true,
        focusAreas: [
          "bugs",
          "security",
          "performance",
          "readability",
          "best-practices",
          "documentation",
        ],
        prChat: false,
        allowedCommands: ["explain", "fix", "improve", "test"],
        dailyChatLimit: 50,
      };
      await deactivated.save();
      repo = deactivated;
    } else {
      repo = await Repo.create({
        owner,
        name,
        fullName,
        githubRepoId,
        connectedBy: user._id,
        webhookId: 0, // App-level webhooks
      });
    }

    res.status(201).json({ repo });

    // Async: sync existing PRs from GitHub (don't block the response)
    if (user.githubInstallationId) {
      getInstallationToken(user.githubInstallationId)
        .then((token) =>
          syncPRsFromGitHub(repo._id.toString(), fullName, token),
        )
        .catch((err) =>
          console.error("[Repo] Background PR sync failed:", err.message),
        );
    }
  } catch (err) {
    console.error("[Repo] connect error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * GET /repos
 * List connected repos for the current user
 */
export async function listConnectedRepos(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repos = await Repo.find({
      connectedBy: req.user!.userId,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ repos });
  } catch (err) {
    console.error("[Repo] list error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * DELETE /repos/:id
 * Disconnect a repo — deactivate locally.
 * Webhook stays at App level (user can manage via GitHub App settings).
 */
export async function disconnectRepo(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repo = await Repo.findOne({
      _id: req.params.id,
      connectedBy: req.user!.userId,
      isActive: true,
    });
    if (!repo) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    repo.isActive = false;
    await repo.save();

    res.json({ message: `${repo.fullName} disconnected` });
  } catch (err) {
    console.error("[Repo] disconnect error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * PATCH /repos/:id/settings
 * Update repo settings (autoReview, focusAreas, AI overrides)
 */
export async function updateRepoSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repo = await Repo.findOne({
      _id: req.params.id,
      connectedBy: req.user!.userId,
      isActive: true,
    });
    if (!repo) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    const {
      autoReview,
      focusAreas,
      aiProvider,
      aiModel,
      prChat,
      allowedCommands,
      dailyChatLimit,
    } = req.body;

    if (autoReview !== undefined) repo.settings.autoReview = autoReview;
    if (focusAreas !== undefined) repo.settings.focusAreas = focusAreas;
    if (aiProvider !== undefined)
      repo.settings.aiProvider = aiProvider || undefined;
    if (aiModel !== undefined) repo.settings.aiModel = aiModel || undefined;
    if (prChat !== undefined) repo.settings.prChat = prChat;
    if (allowedCommands !== undefined)
      repo.settings.allowedCommands = allowedCommands;
    if (dailyChatLimit !== undefined)
      repo.settings.dailyChatLimit = dailyChatLimit;

    await repo.save();
    res.json({ repo });
  } catch (err) {
    console.error("[Repo] updateSettings error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Sync PRs from GitHub for a given repo.
 * Fetches open PRs + recently closed/merged PRs and upserts them into the DB.
 * Called automatically on repo connect, and available as a manual endpoint.
 */
async function syncPRsFromGitHub(
  repoId: string,
  repoFullName: string,
  installationToken: string,
): Promise<number> {
  let synced = 0;

  // Fetch open PRs (all pages)
  const openPRs = await fetchGitHubPRs(
    repoFullName,
    installationToken,
    "open",
    100,
  );
  // Fetch recently closed PRs (last 30)
  const closedPRs = await fetchGitHubPRs(
    repoFullName,
    installationToken,
    "closed",
    30,
  );

  const allPRs = [...openPRs, ...closedPRs];

  for (const ghPR of allPRs) {
    try {
      await PR.findOneAndUpdate(
        { repoId, prNumber: ghPR.number },
        {
          repoId,
          prNumber: ghPR.number,
          title: ghPR.title,
          body: ghPR.body || "",
          author: {
            login: ghPR.user?.login || "unknown",
            avatarUrl: ghPR.user?.avatar_url || "",
          },
          headSha: ghPR.head?.sha || "",
          baseBranch: ghPR.base?.ref || "main",
          headBranch: ghPR.head?.ref || "",
          diffUrl: ghPR.diff_url || "",
          status: ghPR.state === "open" ? "pending" : "reviewed",
          githubPRId: ghPR.number,
          githubCreatedAt: ghPR.created_at
            ? new Date(ghPR.created_at)
            : undefined,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      synced++;
    } catch (err: any) {
      console.error(`[Repo] Failed to sync PR #${ghPR.number}:`, err.message);
    }
  }

  console.log(`[Repo] Synced ${synced} PRs for ${repoFullName}`);
  return synced;
}

async function fetchGitHubPRs(
  repoFullName: string,
  token: string,
  state: "open" | "closed",
  maxCount: number,
): Promise<any[]> {
  const prs: any[] = [];
  let page = 1;
  const perPage = Math.min(maxCount, 100);

  while (prs.length < maxCount) {
    const res = await githubAppFetch(
      `/repos/${repoFullName}/pulls?state=${state}&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      token,
    );
    if (!res.ok) break;

    const batch = (await res.json()) as any[];
    if (!batch || batch.length === 0) break;

    prs.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return prs.slice(0, maxCount);
}

/**
 * POST /repos/:id/sync
 * Manually trigger PR sync for a connected repo.
 */
export async function syncRepoPRs(req: Request, res: Response): Promise<void> {
  try {
    const repo = await Repo.findOne({
      _id: req.params.id,
      connectedBy: req.user!.userId,
      isActive: true,
    });
    if (!repo) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    const user = await User.findById(req.user!.userId);
    if (!user?.githubInstallationId) {
      res.status(400).json({ error: "No GitHub App installation found" });
      return;
    }

    // Respond immediately — sync runs in background
    res.json({ message: "PR sync started" });

    const token = await getInstallationToken(user.githubInstallationId);
    const synced = await syncPRsFromGitHub(
      repo._id.toString(),
      repo.fullName,
      token,
    );
    console.log(`[Repo] Sync completed: ${synced} PRs for ${repo.fullName}`);
  } catch (err: any) {
    console.error("[Repo] sync error:", err.message);
    // Response already sent, just log
  }
}

/**
 * POST /repos/:id/index
 * Manually trigger context indexing for a connected repo.
 */
export async function triggerContextIndex(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repo = await Repo.findOne({
      _id: req.params.id,
      connectedBy: req.user!.userId,
      isActive: true,
    });
    if (!repo) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    const user = await User.findById(req.user!.userId);
    if (!user?.githubInstallationId) {
      res.status(400).json({ error: "No GitHub App installation found" });
      return;
    }

    const { contextQueue } = await import("../jobs/queue");
    if (!contextQueue) {
      res
        .status(503)
        .json({ error: "Context queue not available (Redis not connected)" });
      return;
    }

    // Set status to indexing immediately so UI can reflect it
    await RepoContext.findOneAndUpdate(
      { repoId: repo._id },
      { indexStatus: "indexing" },
      { upsert: true },
    );

    // Get the default branch HEAD sha
    const token = await getInstallationToken(user.githubInstallationId);
    const branchRes = await githubAppFetch(`/repos/${repo.fullName}`, token);
    if (!branchRes.ok) {
      res.status(502).json({ error: "Failed to fetch repo info from GitHub" });
      return;
    }
    const repoInfo = (await branchRes.json()) as { default_branch: string };

    const refRes = await githubAppFetch(
      `/repos/${repo.fullName}/git/ref/heads/${repoInfo.default_branch}`,
      token,
    );
    if (!refRes.ok) {
      res.status(502).json({ error: "Failed to fetch HEAD sha from GitHub" });
      return;
    }
    const refData = (await refRes.json()) as { object: { sha: string } };

    await contextQueue.add("context-index", {
      repoId: repo._id.toString(),
      repoFullName: repo.fullName,
      branch: repoInfo.default_branch,
      headSha: refData.object.sha,
      pusher: user.username,
      commits: 0,
    });

    res.json({
      message: "Context indexing triggered",
      repoFullName: repo.fullName,
    });
  } catch (err: any) {
    console.error("[Repo] triggerContextIndex error:", err.message);
    res.status(500).json({ error: "Failed to trigger indexing" });
  }
}

/**
 * GET /repos/context-status
 * Returns embedding/indexing status for all connected repos.
 */
export async function getContextStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repos = await Repo.find({
      connectedBy: req.user!.userId,
      isActive: true,
    }).select("_id");

    const repoIds = repos.map((r) => r._id);

    const contexts = await RepoContext.find({ repoId: { $in: repoIds } })
      .select(
        "repoId indexStatus lastIndexedAt fileTree conventions recentHistory",
      )
      .lean();

    const statusMap: Record<string, any> = {};
    for (const ctx of contexts) {
      statusMap[ctx.repoId.toString()] = {
        indexStatus: ctx.indexStatus,
        lastIndexedAt: ctx.lastIndexedAt,
        fileCount: ctx.fileTree?.length || 0,
        conventionCount: ctx.conventions?.length || 0,
        historyCount: ctx.recentHistory?.length || 0,
      };
    }

    // Fill in repos with no context yet
    for (const repo of repos) {
      const id = repo._id.toString();
      if (!statusMap[id]) {
        statusMap[id] = {
          indexStatus: "idle",
          lastIndexedAt: null,
          fileCount: 0,
          conventionCount: 0,
          historyCount: 0,
        };
      }
    }

    res.json({ contexts: statusMap });
  } catch (err: any) {
    console.error("[Repo] getContextStatus error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * GET /repos/installation-status?repo=owner/reponame
 * Check if GitHub App is installed for the repo owner + if repo is connected.
 * Used by the CLI to determine what steps are needed.
 */
export async function getInstallationStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const repoParam = req.query.repo as string | undefined;
  if (!repoParam || !repoParam.includes("/")) {
    res.status(400).json({ error: "repo param required (format: owner/repo)" });
    return;
  }

  const [owner] = repoParam.split("/");

  try {
    // Check if GitHub App is installed for this owner
    let appInstalled = false;
    try {
      const { findUserInstallation } = await import("../utils/github");
      const installationId = await findUserInstallation(owner);
      appInstalled = installationId !== null;
    } catch {
      appInstalled = false;
    }

    // Check if repo is connected in MongoDB
    const repo = await Repo.findOne({
      fullName: repoParam,
      connectedBy: req.user!.userId,
      isActive: true,
    }).lean();

    let indexStatus = "idle";
    let lastIndexedAt: Date | null = null;

    if (repo) {
      const ctx = await RepoContext.findOne({ repoId: repo._id })
        .select("indexStatus lastIndexedAt")
        .lean();
      indexStatus = ctx?.indexStatus || "idle";
      lastIndexedAt = ctx?.lastIndexedAt || null;
    }

    // Resolve provider/model for status display
    const user = await User.findById(req.user!.userId)
      .select("aiConfig")
      .lean();
    const defaultProvider = user?.aiConfig?.defaultProvider || null;
    const defaultModel = user?.aiConfig?.defaultModel || null;

    res.json({
      appInstalled,
      repoConnected: !!repo,
      repoId: repo?._id?.toString() || null,
      indexStatus,
      lastIndexedAt,
      autoReview: repo?.settings?.autoReview ?? null,
      provider: repo?.settings?.aiProvider || defaultProvider,
      model: repo?.settings?.aiModel || defaultModel,
    });
  } catch (err: any) {
    console.error("[Repo] getInstallationStatus error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

export async function getContextDetail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const repo = await Repo.findOne({
      _id: req.params.id,
      connectedBy: req.user!.userId,
      isActive: true,
    });

    if (!repo) {
      res.status(404).json({ error: "Repo not found" });
      return;
    }

    const ctx = await RepoContext.findOne({ repoId: repo._id })
      .select("fileTree conventions recentHistory indexStatus lastIndexedAt")
      .lean();

    if (!ctx) {
      res.json({
        indexStatus: "idle",
        files: [],
        conventions: [],
        prSummaries: [],
        lastIndexedAt: null,
      });
      return;
    }

    res.json({
      indexStatus: ctx.indexStatus,
      files: ctx.fileTree || [],
      conventions: ctx.conventions || [],
      prSummaries: ctx.recentHistory || [],
      lastIndexedAt: ctx.lastIndexedAt,
    });
  } catch (err: any) {
    console.error("[Repo] getContextDetail error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}
