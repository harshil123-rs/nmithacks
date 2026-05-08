/**
 * n8n Integration Service
 *
 * Handles:
 * - Dispatching payloads to n8n cloud webhook
 * - Sending Discord alerts for critical/high findings
 * - Sending Slack alerts for medium findings
 * - Calculating a numeric review health score
 */
import type { AgentFinding, SynthesizerOutput } from "../agents/review/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface N8nReviewPayload {
  reviewId: string;
  code: string;
  language?: string;
  filename?: string;
  context?: string;
  timestamp: string;
}

export interface N8nResultPayload {
  reviewId: string;
  security: AgentFinding[];
  bugs: AgentFinding[];
  performance: AgentFinding[];
  readability: AgentFinding[];
  bestPractices: AgentFinding[];
  documentation: AgentFinding[];
  synthesis: Partial<SynthesizerOutput>;
  score: number;
  verdict: string;
}

// ── Score Calculation ────────────────────────────────────────────────────────

export function calculateReviewScore(findings: AgentFinding[]): number {
  const penalties = { critical: 25, high: 10, medium: 5, low: 2, info: 0 };
  const totalPenalty = findings.reduce(
    (sum, f) => sum + (penalties[f.severity] ?? 0),
    0,
  );
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

// ── n8n Cloud Dispatch ───────────────────────────────────────────────────────

export async function dispatchToN8n(payload: N8nReviewPayload): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[n8n] N8N_WEBHOOK_URL not set — skipping dispatch");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[n8n] Webhook dispatch failed: ${res.status}`);
    } else {
      console.log(`[n8n] Dispatched review ${payload.reviewId} to n8n cloud`);
    }
  } catch (err: any) {
    console.error("[n8n] Dispatch error:", err.message);
  }
}

// ── Discord Notification ─────────────────────────────────────────────────────

export async function sendDiscordAlert(
  reviewId: string,
  findings: AgentFinding[],
  score: number,
  verdict: string,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");

  if (critical.length === 0 && high.length === 0) return;

  const color = critical.length > 0 ? 0xff0000 : 0xff8800; // red or orange
  const title =
    critical.length > 0
      ? "🚨 Critical Issues Found"
      : "⚠️ High Severity Issues Found";

  const fieldValue = [...critical, ...high]
    .slice(0, 5)
    .map((f) => `**[${f.severity.toUpperCase()}]** ${f.message}`)
    .join("\n");

  const payload = {
    embeds: [
      {
        title,
        color,
        fields: [
          { name: "Review ID", value: `\`${reviewId}\``, inline: true },
          { name: "Score", value: `${score}/100`, inline: true },
          { name: "Verdict", value: verdict.replace("_", " "), inline: true },
          {
            name: `Top Issues (${critical.length} critical, ${high.length} high)`,
            value: fieldValue || "None",
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Problem Solvers — AI Code Review" },
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[n8n] Discord alert sent for review ${reviewId}`);
  } catch (err: any) {
    console.error("[n8n] Discord error:", err.message);
  }
}

// ── Slack Notification ───────────────────────────────────────────────────────

export async function sendSlackAlert(
  reviewId: string,
  findings: AgentFinding[],
  score: number,
  verdict: string,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const medium = findings.filter((f) => f.severity === "medium");
  if (medium.length === 0) return;

  const topIssues = medium
    .slice(0, 3)
    .map((f) => `• *[${f.severity}]* ${f.message}`)
    .join("\n");

  const payload = {
    text: `🔍 *Code Review Complete* — Score: ${score}/100 | Verdict: ${verdict.replace("_", " ")}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔍 *Code Review Complete*\n*Review ID:* \`${reviewId}\`\n*Score:* ${score}/100\n*Verdict:* ${verdict.replace("_", " ")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Medium Issues (${medium.length}):*\n${topIssues}`,
        },
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[n8n] Slack alert sent for review ${reviewId}`);
  } catch (err: any) {
    console.error("[n8n] Slack error:", err.message);
  }
}
