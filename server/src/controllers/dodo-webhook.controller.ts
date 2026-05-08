/**
 * Dodo Payments webhook handler
 *
 * POST /webhooks/dodo
 * Verifies HMAC signature, processes subscription lifecycle events.
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { User } from "../models/User";

const WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || "";

/**
 * Verify Dodo/Svix webhook signature.
 * Dodo uses Svix under the hood — signed content is `${msgId}.${timestamp}.${body}`
 * and the secret must be base64-decoded (the part after "whsec_").
 */
function verifyDodoSignature(
  payload: string,
  msgId: string,
  signature: string,
  timestamp: string,
): boolean {
  if (!WEBHOOK_SECRET || !signature || !timestamp || !msgId) return false;

  // Svix signed content: msgId.timestamp.body
  const signedContent = `${msgId}.${timestamp}.${payload}`;

  // Base64-decode the secret (strip "whsec_" prefix)
  const secretPart = WEBHOOK_SECRET.startsWith("whsec_")
    ? WEBHOOK_SECRET.slice(6)
    : WEBHOOK_SECRET;
  const secretBytes = Buffer.from(secretPart, "base64");

  const expectedSig = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // Signature header can have multiple space-delimited sigs like "v1,abc v1,def"
  const signatures = signature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts.length < 2) continue;
    const providedSig = parts.slice(1).join(","); // rejoin in case base64 has commas
    try {
      if (
        crypto.timingSafeEqual(
          Buffer.from(expectedSig),
          Buffer.from(providedSig),
        )
      ) {
        return true;
      }
    } catch {
      // Length mismatch — continue to next sig
    }
  }

  return false;
}

export async function handleDodoWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  // Svix sends headers with either "svix-" or "webhook-" prefix
  const signature =
    (req.headers["webhook-signature"] as string) ||
    (req.headers["svix-signature"] as string) ||
    "";
  const timestamp =
    (req.headers["webhook-timestamp"] as string) ||
    (req.headers["svix-timestamp"] as string) ||
    "";
  const webhookId =
    (req.headers["webhook-id"] as string) ||
    (req.headers["svix-id"] as string) ||
    "";

  // Get raw body
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) {
    console.warn("[DodoWebhook] No raw body available");
    res.status(400).json({ error: "No body" });
    return;
  }

  const payload = rawBody.toString("utf8");

  // Verify signature
  if (!verifyDodoSignature(payload, webhookId, signature, timestamp)) {
    console.warn(`[DodoWebhook] Invalid signature for webhook ${webhookId}`);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Check timestamp freshness (5 min tolerance)
  if (timestamp) {
    const eventTime = parseInt(timestamp) * 1000;
    if (Math.abs(Date.now() - eventTime) > 300000) {
      console.warn(`[DodoWebhook] Timestamp too old: ${timestamp}`);
      res.status(401).json({ error: "Timestamp too old" });
      return;
    }
  }

  // Respond immediately
  res.status(200).json({ received: true });

  const event = JSON.parse(payload);
  const eventType = event.type;

  console.log(`[DodoWebhook] Received: ${eventType} (${webhookId})`);

  try {
    switch (eventType) {
      case "subscription.active":
        await handleSubscriptionActive(event.data);
        break;
      case "subscription.renewed":
        await handleSubscriptionRenewed(event.data);
        break;
      case "subscription.on_hold":
        await handleSubscriptionOnHold(event.data);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancelled(event.data);
        break;
      case "subscription.failed":
        await handleSubscriptionFailed(event.data);
        break;
      case "payment.succeeded":
        console.log(
          `[DodoWebhook] Payment succeeded: ${event.data?.payment_id}`,
        );
        break;
      case "payment.failed":
        console.log(`[DodoWebhook] Payment failed: ${event.data?.payment_id}`);
        break;
      default:
        console.log(`[DodoWebhook] Unhandled event: ${eventType}`);
    }
  } catch (err: any) {
    console.error(`[DodoWebhook] Error processing ${eventType}:`, err.message);
  }
}

async function findUserByMetadata(data: any): Promise<any> {
  // Try metadata.userId first
  const userId = data?.metadata?.userId;
  if (userId) {
    const user = await User.findById(userId);
    if (user) return user;
  }

  // Fallback: find by dodoCustomerId
  const customerId = data?.customer?.customer_id || data?.customer_id;
  if (customerId) {
    const user = await User.findOne({ "billing.dodoCustomerId": customerId });
    if (user) return user;
  }

  // Fallback: find by dodoSubscriptionId
  const subId = data?.subscription_id;
  if (subId) {
    const user = await User.findOne({ "billing.dodoSubscriptionId": subId });
    if (user) return user;
  }

  // Fallback: find by email
  const email = data?.customer?.email;
  if (email) {
    const user = await User.findOne({ email });
    if (user) return user;
  }

  return null;
}

async function handleSubscriptionActive(data: any): Promise<void> {
  const user = await findUserByMetadata(data);
  if (!user) {
    console.error(
      "[DodoWebhook] subscription.active: user not found",
      data?.metadata,
    );
    return;
  }

  user.billing.plan = "pro";
  user.billing.subscriptionStatus = "active";
  user.billing.dodoSubscriptionId =
    data.subscription_id || user.billing.dodoSubscriptionId;
  user.billing.dodoCustomerId =
    data.customer?.customer_id || user.billing.dodoCustomerId;
  await user.save();

  console.log(`[DodoWebhook] User ${user.username} upgraded to Pro`);
}

async function handleSubscriptionRenewed(data: any): Promise<void> {
  const user = await findUserByMetadata(data);
  if (!user) {
    console.error("[DodoWebhook] subscription.renewed: user not found");
    return;
  }

  user.billing.subscriptionStatus = "active";
  // Reset monthly review count on renewal
  const now = new Date();
  user.billing.reviewsUsedThisMonth = 0;
  user.billing.reviewResetDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  );
  await user.save();

  console.log(`[DodoWebhook] User ${user.username} subscription renewed`);
}

async function handleSubscriptionOnHold(data: any): Promise<void> {
  const user = await findUserByMetadata(data);
  if (!user) {
    console.error("[DodoWebhook] subscription.on_hold: user not found");
    return;
  }

  user.billing.subscriptionStatus = "on_hold";
  await user.save();

  console.log(`[DodoWebhook] User ${user.username} subscription on hold`);
}

async function handleSubscriptionCancelled(data: any): Promise<void> {
  const user = await findUserByMetadata(data);
  if (!user) {
    console.error("[DodoWebhook] subscription.cancelled: user not found");
    return;
  }

  user.billing.plan = "free";
  user.billing.subscriptionStatus = "cancelled";
  await user.save();

  console.log(`[DodoWebhook] User ${user.username} downgraded to Free`);
}

async function handleSubscriptionFailed(data: any): Promise<void> {
  const user = await findUserByMetadata(data);
  if (!user) {
    console.error("[DodoWebhook] subscription.failed: user not found");
    return;
  }

  user.billing.subscriptionStatus = "failed";
  await user.save();

  console.log(`[DodoWebhook] User ${user.username} subscription failed`);
}
