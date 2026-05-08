/**
 * History Summarizer Agent
 *
 * Fetches recent closed/merged PRs from the repo,
 * summarizes them with the LLM, and stores as
 * RepoContext.recentHistory[] strings.
 */
import { githubAppFetch } from "../../utils/github";
import { callLLM, type CallLLMOptions } from "../../services/ai.service";
import { RepoContext } from "../../models/RepoContext";
import type { Types } from "mongoose";

const MAX_PRS = 20;

interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  user: { login: string };
  labels: Array<{ name: string }>;
}

export interface HistoryOptions {
  repoFullName: string;
  installationToken: string;
  repoId: Types.ObjectId;
  llmOptions: CallLLMOptions;
}

export interface HistoryResult {
  summaries: string[];
  prsAnalyzed: number;
  durationMs: number;
}

export async function runHistorySummarizer(
  opts: HistoryOptions,
): Promise<HistoryResult> {
  const start = Date.now();

  // 1. Fetch recent closed PRs
  const prRes = await githubAppFetch(
    `/repos/${opts.repoFullName}/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_PRS}`,
    opts.installationToken,
  );

  if (!prRes.ok) {
    throw new Error(`Failed to fetch PRs: ${prRes.status}`);
  }

  const prs = (await prRes.json()) as GitHubPR[];

  // Filter to merged PRs only (closed but not merged = abandoned)
  const mergedPRs = prs.filter((pr) => pr.merged_at);

  if (mergedPRs.length === 0) {
    // No merged PRs — store empty history
    let ctx = await RepoContext.findOne({ repoId: opts.repoId });
    if (!ctx) ctx = new RepoContext({ repoId: opts.repoId });
    ctx.recentHistory = ["No recently merged pull requests found."];
    await ctx.save();
    return { summaries: [], prsAnalyzed: 0, durationMs: Date.now() - start };
  }

  console.log(
    `[History] ${opts.repoFullName}: summarizing ${mergedPRs.length} merged PRs`,
  );

  // 2. Build PR summaries for the LLM
  const prBlock = mergedPRs
    .map((pr) => {
      const labels = pr.labels.map((l) => l.name).join(", ");
      const body = pr.body ? pr.body.slice(0, 500) : "(no description)";
      return `PR #${pr.number}: "${pr.title}" by @${pr.user.login}${labels ? ` [${labels}]` : ""}\nMerged: ${pr.merged_at}\n${body}`;
    })
    .join("\n\n---\n\n");

  // 3. Ask LLM to summarize with structured output
  const prompt = `Here are the ${mergedPRs.length} most recently merged pull requests for this repository.

Summarize what has changed recently and why. Group related changes together.
Return 5-10 summary strings, each describing a theme or area of recent work.
Each string should be 1-2 sentences, clear and specific.

${prBlock}`;

  // Build provider-specific response schema
  const isOpenAI = opts.llmOptions.provider === "openai";
  const summaryItemSchema = {
    type: "string" as const,
    description: "A 1-2 sentence summary of a theme or area of recent work.",
  };

  const responseSchema = isOpenAI
    ? {
        type: "object" as const,
        properties: {
          summaries: {
            type: "array" as const,
            items: summaryItemSchema,
            description: "5-10 summaries of recent development themes.",
          },
        },
        required: ["summaries"],
        additionalProperties: false,
      }
    : {
        type: "array" as const,
        items: summaryItemSchema,
        minItems: 3,
        maxItems: 10,
        description: "5-10 summaries of recent development themes.",
      };

  const res = await callLLM(prompt, {
    ...opts.llmOptions,
    systemPrompt:
      "You are a technical project analyst. Summarize recent development activity concisely into separate themes.",
    maxTokens: 1500,
    temperature: 0.2,
    responseSchema,
  });

  // 4. Parse summaries (structured output guarantees valid JSON)
  let summaries: string[] = [];
  try {
    const cleaned = res.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      summaries = parsed;
    } else if (parsed.summaries && Array.isArray(parsed.summaries)) {
      summaries = parsed.summaries;
    } else {
      summaries = [String(parsed)];
    }
  } catch {
    summaries = res.content
      .split("\n")
      .map((l) => l.replace(/^[-*\d.]\s*/, "").trim())
      .filter((l) => l.length > 10);
  }

  // 5. Store in RepoContext
  let ctx = await RepoContext.findOne({ repoId: opts.repoId });
  if (!ctx) ctx = new RepoContext({ repoId: opts.repoId });
  ctx.recentHistory = summaries;
  await ctx.save();

  return {
    summaries,
    prsAnalyzed: mergedPRs.length,
    durationMs: Date.now() - start,
  };
}
