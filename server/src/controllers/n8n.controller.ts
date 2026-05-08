/**
 * n8n Controller
 *
 * POST /api/n8n/webhook/review-code
 *   — Accepts { code, language?, filename?, context? }
 *   — Runs the full multi-agent pipeline inline (same as local-review but simpler)
 *   — Streams SSE progress back to n8n / caller
 *   — Fires Discord/Slack notifications
 *
 * GET /api/n8n/review/:id
 *   — Returns the stored review result for polling / frontend display
 */
import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { runSecurityAgent } from "../agents/review/security";
import { runBugsAgent } from "../agents/review/bugs";
import { runPerformanceAgent } from "../agents/review/performance";
import { runReadabilityAgent } from "../agents/review/readability";
import { runBestPracticesAgent } from "../agents/review/best-practices";
import { runDocumentationAgent } from "../agents/review/documentation";
import { runSynthesizer } from "../agents/review/synthesizer";
import { parseDiff } from "../agents/review/diff-parser";
import type { AgentInput, AgentOutput } from "../agents/review/types";
import {
  calculateReviewScore,
  sendDiscordAlert,
  sendSlackAlert,
} from "../services/n8n.service";

// In-memory store for demo results (no DB dependency needed for quick demo)
const reviewStore: Map<string, any> = new Map();

function sse(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Build a minimal fake diff from raw code so existing agents can consume it
function codeToDiff(code: string, filename = "review.ts"): string {
  const lines = code.split("\n").map((l) => `+${l}`).join("\n");
  return `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n@@ -0,0 +1,${code.split("\n").length} @@\n${lines}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ── Main webhook handler ─────────────────────────────────────────────────────

export async function webhookReviewCode(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    code,
    language = "typescript",
    filename,
    context = "",
  } = req.body as {
    code?: string;
    language?: string;
    filename?: string;
    context?: string;
  };

  if (!code || code.trim().length === 0) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const reviewId = randomUUID();
  const resolvedFilename = filename || `review.${language}`;

  sse(res, "review:started", {
    reviewId,
    agents: [
      "security",
      "bugs",
      "performance",
      "readability",
      "best-practices",
      "documentation",
    ],
  });

  // Resolve LLM — use env defaults (demo: OpenAI first, fallback Gemini)
  const llmOptions = resolveDemoLLM();
  if (!llmOptions) {
    sse(res, "error", {
      message:
        "No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env",
    });
    res.end();
    return;
  }

  try {
    const rawDiff = codeToDiff(code, resolvedFilename);
    const parsedDiff = parseDiff(rawDiff);

    const agentInput: AgentInput = {
      diff: parsedDiff,
      rawDiff,
      changedFiles: [{ path: resolvedFilename, content: code }],
      relatedFiles: [],
      conventions: context ? [context] : [],
      recentHistory: [],
      repoMap: "",
      pr: {
        title: `n8n review: ${resolvedFilename}`,
        body: context || "",
        author: "n8n-webhook",
        baseBranch: "main",
        headBranch: "review",
        prNumber: 0,
      },
      repoFullName: "n8n/demo",
      llmOptions,
    };

    const agentRunners: { name: string; run: (i: AgentInput) => Promise<AgentOutput> }[] = [
      { name: "security", run: runSecurityAgent },
      { name: "bugs", run: runBugsAgent },
      { name: "performance", run: runPerformanceAgent },
      { name: "readability", run: runReadabilityAgent },
      { name: "best-practices", run: runBestPracticesAgent },
      { name: "documentation", run: runDocumentationAgent },
    ];

    // Run all agents in parallel
    sse(res, "agents:running", { count: agentRunners.length });

    const settled = await Promise.allSettled(
      agentRunners.map(async ({ name, run }) => {
        sse(res, "agent:started", { reviewId, agentType: name });
        const output = await withTimeout(run(agentInput), 120_000, name);
        sse(res, "agent:completed", {
          reviewId,
          agentType: name,
          findingsCount: output.findings.length,
          durationMs: output.durationMs,
        });
        return output;
      }),
    );

    const outputs: AgentOutput[] = settled
      .filter(
        (r): r is PromiseFulfilledResult<AgentOutput> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    // Synthesizer
    sse(res, "synthesizer:started", { reviewId });
    const synth = await runSynthesizer({
      agentOutputs: outputs,
      pr: agentInput.pr,
      repoFullName: "n8n/demo",
      llmOptions,
      diffStats: {
        totalFiles: parsedDiff.totalFiles,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
      },
    });

    const allFindings = outputs.flatMap((o) => o.findings);
    const score = calculateReviewScore(allFindings);

    // Build categorized result
    const byAgent = (type: string) =>
      outputs.find((o) => o.agentType === type)?.findings ?? [];

    const result = {
      reviewId,
      score,
      verdict: synth.verdict,
      summary: synth.summary,
      confidenceScore: synth.confidenceScore,
      severityCounts: synth.severityCounts,
      topActions: synth.topActions,
      security: byAgent("security"),
      bugs: byAgent("bugs"),
      performance: byAgent("performance"),
      readability: byAgent("readability"),
      bestPractices: byAgent("best-practices"),
      documentation: byAgent("documentation"),
      totalFindings: allFindings.length,
      createdAt: new Date().toISOString(),
    };

    // Store for GET /api/n8n/review/:id
    reviewStore.set(reviewId, result);

    // Fire notifications async (don't block SSE close)
    Promise.all([
      sendDiscordAlert(reviewId, allFindings, score, synth.verdict),
      sendSlackAlert(reviewId, allFindings, score, synth.verdict),
    ]).catch(() => {});

    sse(res, "review:completed", result);
  } catch (err: any) {
    console.error("[n8nController] Error:", err.message);
    sse(res, "error", { message: err.message });
  }

  res.end();
}

// ── Status endpoint ───────────────────────────────────────────────────────────

export function getN8nReview(req: Request, res: Response): void {
  const { id } = req.params;
  const review = reviewStore.get(id);
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  res.json(review);
}

// ── LLM resolver for demo ─────────────────────────────────────────────────────

function resolveDemoLLM(): {
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  apiKey: string;
} | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: "claude-haiku-4-20250414",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: process.env.GEMINI_API_KEY,
    };
  }
  return null;
}
