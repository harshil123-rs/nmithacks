import { Request, Response } from "express";
import crypto from "crypto";
import { Repo } from "../models/Repo";
import { RepoContext } from "../models/RepoContext";
import { User } from "../models/User";
import { reviewQueue, contextQueue } from "../jobs/queue";
import { canReview, reserveReview } from "../controllers/billing.controller";
import {
  handleIssueComment,
  handleReviewComment,
} from "../services/chat.service";

function verifySignature(
  payload: Buffer,
  signature: string | undefined,
): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/github
 * Receives GitHub webhook events. Uses raw body for HMAC verification.
 */
export async function handleGitHubWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.headers["x-hub-signature-256"] as string | undefined;
  const event = req.headers["x-github-event"] as string | undefined;
  const deliveryId = req.headers["x-github-delivery"] as string | undefined;

  // Verify HMAC signature
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody || !verifySignature(rawBody, signature)) {
    console.warn(`[Webhook] Invalid signature for delivery ${deliveryId}`);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Respond immediately — process async
  res.status(200).json({ received: true });

  const body = JSON.parse(rawBody.toString("utf8"));

  console.log(
    `[Webhook] Received event: ${event} (delivery: ${deliveryId}) from ${body.repository?.full_name || "unknown"}`,
  );

  try {
    switch (event) {
      case "pull_request":
        await handlePullRequest(body);
        break;
      case "push":
        await handlePush(body);
        break;
      case "issue_comment":
        await handleIssueComment(body);
        break;
      case "pull_request_review_comment":
        await handleReviewComment(body);
        break;
      case "ping":
        console.log(
          `[Webhook] Ping received for ${body.repository?.full_name}`,
        );
        break;
      default:
        console.log(`[Webhook] Ignoring event: ${event}`);
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event}:`, err);
  }
}

async function handlePullRequest(body: any): Promise<void> {
  const action = body.action;
  const pr = body.pull_request;
  const repoFullName = body.repository?.full_name;

  // Only process opened, synchronize (new commits), reopened
  if (!["opened", "synchronize", "reopened"].includes(action)) return;

  const repo = await Repo.findOne({ fullName: repoFullName, isActive: true });
  if (!repo) {
    console.log(`[Webhook] PR event for untracked repo: ${repoFullName}`);
    return;
  }

  if (!repo.settings.autoReview) {
    console.log(`[Webhook] Auto-review disabled for ${repoFullName}, skipping`);
    return;
  }

  // Billing guard — auto-review is Pro-only
  const repoOwner = await User.findById(repo.connectedBy);
  if (repoOwner) {
    const isPro =
      repoOwner.billing?.plan === "pro" &&
      repoOwner.billing?.subscriptionStatus === "active";
    if (!isPro) {
      console.log(
        `[Webhook] Auto-review skipped for ${repoFullName} — user on free plan`,
      );
      return;
    }
    const billingCheck = await reserveReview(repoOwner._id.toString());
    if (!billingCheck.allowed) {
      console.log(`[Webhook] Auto-review skipped: ${billingCheck.reason}`);
      return;
    }
  }

  // Check if repo has been indexed
  const repoCtx = await RepoContext.findOne({ repoId: repo._id })
    .select("indexStatus")
    .lean();
  if (!repoCtx || repoCtx.indexStatus !== "ready") {
    console.log(
      `[Webhook] Repo ${repoFullName} not indexed yet, skipping auto-review`,
    );
    return;
  }

  console.log(
    `[Webhook] Enqueuing review for PR #${pr.number} on ${repoFullName} (${action})`,
  );

  if (reviewQueue) {
    await reviewQueue.add("pr-review", {
      repoId: repo._id.toString(),
      repoFullName,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body,
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      action,
      sender: body.sender?.login,
      senderAvatarUrl: body.sender?.avatar_url || "",
      githubCreatedAt: pr.created_at,
    });
  } else {
    console.warn("[Webhook] Review queue not available — skipping job");
  }
}

async function handlePush(body: any): Promise<void> {
  const repoFullName = body.repository?.full_name;
  const ref = body.ref; // e.g. "refs/heads/main"
  const defaultBranch = body.repository?.default_branch;

  console.log(`[Webhook] Push event received for ${repoFullName}`);
  console.log(`[Webhook] Ref: ${ref}, Default branch: refs/heads/${defaultBranch}`);

  // Only index pushes to the default branch
  if (ref !== `refs/heads/${defaultBranch}`) {
    console.log(`[Webhook] Skipping - not default branch`);
    return;
  }

  const repo = await Repo.findOne({ fullName: repoFullName, isActive: true });
  if (!repo) {
    console.log(`[Webhook] Skipping - repo not found or inactive`);
    return;
  }

  console.log(
    `[Webhook] Enqueuing context-index for ${repoFullName} (push to ${defaultBranch})`,
  );
  console.log(
    `[Webhook] Commits in payload:`,
    (body.commits || []).length,
  );
  if (body.commits && body.commits.length > 0) {
    console.log(
      `[Webhook] First commit sample:`,
      JSON.stringify(body.commits[0], null, 2),
    );
  }

  if (contextQueue) {
    // Extract changed files from commits for incremental indexing
    const changedFiles = new Set<string>();
    for (const commit of body.commits || []) {
      for (const f of commit.added || []) changedFiles.add(f);
      for (const f of commit.modified || []) changedFiles.add(f);
      // Don't include removed — they'll be cleaned up by the indexer
    }

    console.log(
      `[Webhook] Extracted ${changedFiles.size} changed files from ${(body.commits || []).length} commits`,
    );
    if (changedFiles.size > 0) {
      console.log(`[Webhook] Changed files:`, Array.from(changedFiles));
    } else if ((body.commits || []).length > 0) {
      console.log(
        `[Webhook] No files in webhook payload, will fetch from GitHub API`,
      );
    }

    try {
      console.log(`[Webhook] Adding job to context queue...`);
      const job = await contextQueue.add("context-index", {
        repoId: repo._id.toString(),
        repoFullName,
        branch: defaultBranch,
        headSha: body.after,
        pusher: body.pusher?.name,
        commits: (body.commits || []).length,
        changedFiles: Array.from(changedFiles), // Always pass array, even if empty
      }, {
        // Deduplicate jobs for the same repo
        jobId: `context-${repo._id.toString()}-${body.after}`,
        // Remove completed jobs after 1 hour
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        // Remove failed jobs after 24 hours
        removeOnFail: {
          age: 86400,
          count: 200,
        },
      });
      console.log(`[Webhook] Job enqueued successfully with ID: ${job.id}`);
    } catch (err) {
      console.error(`[Webhook] Failed to enqueue job:`, err);
    }
  } else {
    console.warn("[Webhook] Context queue not available — skipping job");
  }

  // LGTM Security: if this repo is enrolled and the push touched at least
  // one CI-relevant file, enqueue a scan. We re-walk the commits here
  // (cheap) instead of threading the changedFiles set through, because the
  // security path may need to run even when the context path is disabled.
  try {
    const { SecurityMonitor } = await import("../models/SecurityMonitor");
    const monitor = await SecurityMonitor.findOne({
      repoId: repo._id,
      status: "active",
    }).select("_id");
    if (monitor) {
      const ciTouched = pushTouchedCiFiles(body);
      if (ciTouched) {
        const { enqueueSecurityScan } = await import("../jobs/security.job");
        await enqueueSecurityScan(
          {
            monitorId: monitor._id.toString(),
            trigger: "push",
            headSha: body.after,
          },
          { jobId: `security-push-${monitor._id}-${body.after}` },
        );
        console.log(
          `[Webhook] LGTM Security scan enqueued for ${repoFullName} @ ${String(body.after).slice(0, 7)}`,
        );
      } else {
        console.log(
          `[Webhook] Push to ${repoFullName} did not touch CI files — skipping security scan`,
        );
      }
    }
  } catch (err: any) {
    console.error(`[Webhook] LGTM Security enqueue failed:`, err.message);
  }
}

/** Returns true if any commit in the push payload added/modified a CI-relevant file. */
function pushTouchedCiFiles(body: any): boolean {
  // Lazy import to avoid pulling the rule library when Security isn't used.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isCiRelevantPath } = require("../security/rules/types") as typeof import("../security/rules/types");
  for (const commit of body.commits || []) {
    for (const f of commit.added || []) if (isCiRelevantPath(f)) return true;
    for (const f of commit.modified || []) if (isCiRelevantPath(f)) return true;
  }
  return false;
}
