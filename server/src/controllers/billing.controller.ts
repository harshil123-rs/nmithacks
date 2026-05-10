/**
 * Billing controller — Dodo Payments integration
 *
 * Handles:
 * - GET  /billing/status     — current plan + usage
 * - POST /billing/checkout    — create Dodo checkout session
 * - POST /billing/portal      — (future) manage subscription
 */
import { Request, Response } from "express";
import DodoPayments from "dodopayments";
import { User } from "../models/User";

const DODO_PRODUCT_ID = process.env.DODO_PRODUCT_ID || "";
const CLIENT_URL = process.env.CLIENT_URL || "https://nmithacks.vercel.app";

const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY || "",
  environment: process.env.DODO_ENV === "live" ? "live_mode" : "test_mode",
});

const FREE_REVIEW_LIMIT = 50;

/**
 * GET /billing/status
 * Returns the user's current plan, usage, and limits.
 */
export async function getBillingStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await User.findById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Reset monthly counter if past reset date
  await maybeResetMonthlyUsage(user);

  const isPro =
    user.billing.plan === "pro" && user.billing.subscriptionStatus === "active";

  res.json({
    plan: user.billing.plan,
    subscriptionStatus: user.billing.subscriptionStatus || null,
    reviewsUsed: user.billing.reviewsUsedThisMonth,
    reviewLimit: isPro ? null : FREE_REVIEW_LIMIT,
    reviewsRemaining: isPro
      ? null
      : Math.max(0, FREE_REVIEW_LIMIT - user.billing.reviewsUsedThisMonth),
    resetDate: user.billing.reviewResetDate,
    dodoSubscriptionId: user.billing.dodoSubscriptionId || null,
  });
}

/**
 * POST /billing/checkout
 * Creates a Dodo Payments checkout session for the Pro plan.
 */
export async function createCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await User.findById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (
    user.billing.plan === "pro" &&
    user.billing.subscriptionStatus === "active"
  ) {
    res.status(400).json({ error: "Already on Pro plan" });
    return;
  }

  try {
    const session = await dodoClient.checkoutSessions.create({
      product_cart: [{ product_id: DODO_PRODUCT_ID, quantity: 1 }],
      customer: {
        email: user.email || `${user.username}@github.com`,
        name: user.username,
      },
      return_url: `${CLIENT_URL}/dashboard/settings?billing=success`,
      metadata: {
        userId: user._id.toString(),
        githubId: user.githubId,
      },
    });

    res.json({
      checkoutUrl: session.checkout_url,
      sessionId: session.session_id,
    });
  } catch (err: any) {
    console.error("[Billing] Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
}

/**
 * Check if user can perform a review (billing guard).
 * Returns { allowed: boolean, reason?: string }
 */
export async function canReview(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await User.findById(userId);
  if (!user) return { allowed: false, reason: "User not found" };

  await maybeResetMonthlyUsage(user);

  const isPro =
    user.billing.plan === "pro" && user.billing.subscriptionStatus === "active";
  if (isPro) return { allowed: true };

  if (user.billing.reviewsUsedThisMonth >= FREE_REVIEW_LIMIT) {
    return {
      allowed: false,
      reason: `Free plan limit reached (${FREE_REVIEW_LIMIT} reviews/month). Upgrade to Pro for unlimited reviews.`,
    };
  }

  return { allowed: true };
}

/**
 * Atomically check billing limit AND increment the count in one operation.
 * Prevents race conditions where multiple reviews are triggered simultaneously.
 * Returns { allowed: boolean, reason?: string }
 */
export async function reserveReview(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await User.findById(userId);
  if (!user) return { allowed: false, reason: "User not found" };

  await maybeResetMonthlyUsage(user);

  const isPro =
    user.billing.plan === "pro" && user.billing.subscriptionStatus === "active";
  if (isPro) return { allowed: true };

  // Atomic: only increment if under the limit
  const result = await User.findOneAndUpdate(
    {
      _id: userId,
      "billing.reviewsUsedThisMonth": { $lt: FREE_REVIEW_LIMIT },
    },
    { $inc: { "billing.reviewsUsedThisMonth": 1 } },
    { new: true },
  );

  if (!result) {
    return {
      allowed: false,
      reason: `Free plan limit reached (${FREE_REVIEW_LIMIT} reviews/month). Upgrade to Pro for unlimited reviews.`,
    };
  }

  return { allowed: true };
}

/**
 * Increment the user's monthly review count.
 */
export async function incrementReviewCount(userId: string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    { $inc: { "billing.reviewsUsedThisMonth": 1 } },
  );
}

/**
 * Reset monthly usage if past the reset date.
 */
async function maybeResetMonthlyUsage(user: any): Promise<void> {
  if (
    !user.billing.reviewResetDate ||
    new Date() >= new Date(user.billing.reviewResetDate)
  ) {
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    user.billing.reviewsUsedThisMonth = 0;
    user.billing.reviewResetDate = nextReset;
    await user.save();
  }
}
