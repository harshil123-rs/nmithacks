/**
 * Synthesizer Agent (7th agent)
 *
 * Takes all 6 specialist agent outputs and produces:
 * - Overall verdict (approve / request_changes / comment)
 * - Confidence score (0-100)
 * - Executive summary (TL;DR)
 * - Severity counts
 * - Top priority action items
 * - Inline comments for GitHub PR review
 * - Changelog entry
 */
import { callLLM } from "../../services/ai.service";
import type { CallLLMOptions } from "../../services/ai.service";
import type {
  AgentOutput,
  AgentFinding,
  SynthesizerOutput,
  FindingSeverity,
} from "./types";

export interface SynthesizerInput {
  agentOutputs: AgentOutput[];
  pr: {
    title: string;
    body: string;
    author: string;
    baseBranch: string;
    headBranch: string;
    prNumber: number;
  };
  repoFullName: string;
  llmOptions: CallLLMOptions;
  diffStats: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}

export async function runSynthesizer(
  input: SynthesizerInput,
): Promise<SynthesizerOutput> {
  const start = Date.now();

  // 1. Aggregate all findings across agents
  const allFindings: (AgentFinding & { agentSource: string })[] = [];
  for (const output of input.agentOutputs) {
    for (const finding of output.findings) {
      allFindings.push({ ...finding, agentSource: output.agentType });
    }
  }

  // 2. Count severities
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of allFindings) {
    if (f.severity in severityCounts) {
      severityCounts[f.severity as FindingSeverity]++;
    }
  }

  // 3. Determine verdict based on findings (pre-LLM heuristic)
  let heuristicVerdict: "approve" | "request_changes" | "comment" = "approve";
  if (severityCounts.critical > 0) {
    heuristicVerdict = "request_changes";
  } else if (severityCounts.high >= 3) {
    heuristicVerdict = "request_changes";
  } else if (severityCounts.high > 0 || severityCounts.medium >= 5) {
    heuristicVerdict = "comment";
  }

  // 4. Build inline comments from top findings (max 25 — GitHub limit is 30)
  const inlineComments = allFindings
    .filter((f) => f.line && f.line > 0 && f.severity !== "info")
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    })
    .slice(0, 25)
    .map((f) => {
      // Build conversational inline comment — like a real reviewer, not a linter
      const severityTag =
        f.severity === "critical"
          ? ":rotating_light: **Critical**"
          : f.severity === "high"
            ? ":warning: **High**"
            : f.severity === "medium"
              ? ":mag: **Medium**"
              : ":bulb: **Suggestion**";

      let commentBody = `${severityTag} — ${f.message}`;
      if (f.suggestion) {
        commentBody += `\n\n${f.suggestion}`;
      }
      commentBody += `\n\n<sub>${f.agentSource}</sub>`;

      return {
        file: f.file,
        line: f.line!,
        body: commentBody,
        agentSource: f.agentSource,
      };
    });

  // 5. Ask LLM for final summary, verdict confirmation, and changelog
  const agentSummaries = input.agentOutputs
    .map(
      (o) =>
        `### ${o.agentType} (${o.findings.length} findings, ${o.durationMs}ms)\n${o.summary}`,
    )
    .join("\n\n");

  const topFindings = allFindings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 10)
    .map(
      (f) =>
        `- [${f.severity.toUpperCase()}] ${f.file}:${f.line || "?"} — ${f.message} (${f.agentSource})`,
    )
    .join("\n");

  const prompt = `You are a senior engineering lead making the final review decision on a pull request.

## PR
- Repository: ${input.repoFullName}
- PR #${input.pr.prNumber}: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}
- Stats: ${input.diffStats.totalFiles} files changed, +${input.diffStats.totalAdditions} -${input.diffStats.totalDeletions}
${input.pr.body ? `- Description: ${input.pr.body.slice(0, 500)}` : ""}

## Agent Reports
${agentSummaries}

## Finding Counts
- Critical: ${severityCounts.critical}
- High: ${severityCounts.high}
- Medium: ${severityCounts.medium}
- Low: ${severityCounts.low}
- Info: ${severityCounts.info}

${topFindings ? `## Top Critical/High Findings\n${topFindings}` : "## No critical or high severity findings."}

## Heuristic Verdict: ${heuristicVerdict}

## Your Task
1. Write a concise 2-3 line TL;DR summary of this PR and the review findings
2. Confirm or override the heuristic verdict (approve/request_changes/comment). Override only if the heuristic missed important context
3. List the top 3 most important action items for the PR author, ranked by priority
4. Assign a confidence score (0-100) for your verdict. Higher = more confident
5. Generate a changelog entry for this PR in Keep a Changelog format

## Verdict Guidelines
- approve: No critical issues, high issues are minor or debatable
- request_changes: Critical issues found, or multiple high-severity issues that must be fixed
- comment: Some concerns worth discussing, but not blocking`;

  const isOpenAI = input.llmOptions.provider === "openai";

  const responseSchema = isOpenAI
    ? {
        type: "object" as const,
        properties: {
          summary: { type: "string" as const, description: "2-3 line TL;DR" },
          verdict: {
            type: "string" as const,
            enum: ["approve", "request_changes", "comment"],
          },
          confidenceScore: {
            type: "integer" as const,
            description: "0-100 confidence in verdict",
          },
          topActions: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Top 3 action items",
          },
          changelogType: {
            type: "string" as const,
            enum: ["feat", "fix", "perf", "docs", "chore", "breaking"],
          },
          changelogEntry: {
            type: "string" as const,
            description: "One-line changelog entry",
          },
          isBreaking: { type: "boolean" as const },
        },
        required: [
          "summary",
          "verdict",
          "confidenceScore",
          "topActions",
          "changelogType",
          "changelogEntry",
          "isBreaking",
        ],
        additionalProperties: false,
      }
    : {
        type: "object" as const,
        properties: {
          summary: { type: "string" as const, description: "2-3 line TL;DR" },
          verdict: {
            type: "string" as const,
            enum: ["approve", "request_changes", "comment"],
          },
          confidenceScore: {
            type: "integer" as const,
            description: "0-100 confidence in verdict",
          },
          topActions: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          changelogType: {
            type: "string" as const,
            enum: ["feat", "fix", "perf", "docs", "chore", "breaking"],
          },
          changelogEntry: { type: "string" as const },
          isBreaking: { type: "boolean" as const },
        },
        required: [
          "summary",
          "verdict",
          "confidenceScore",
          "topActions",
          "changelogType",
          "changelogEntry",
          "isBreaking",
        ],
      };

  const isLocalReview = input.pr.prNumber === 0;
  let summary = isLocalReview
    ? `Local review: ${severityCounts.critical} critical, ${severityCounts.high} high, ${severityCounts.medium} medium findings.`
    : `PR reviewed: ${severityCounts.critical} critical, ${severityCounts.high} high, ${severityCounts.medium} medium findings.`;
  let verdict = heuristicVerdict;
  let confidenceScore = 70;
  let topActions: string[] = [];
  let changelog = {
    type: "feat" as "feat" | "fix" | "perf" | "docs" | "chore" | "breaking",
    entry: input.pr.title,
    isBreaking: false,
  };

  try {
    const res = await callLLM(prompt, {
      ...input.llmOptions,
      systemPrompt:
        "You are a senior engineering lead synthesizing code review results. Be decisive and concise. Return structured JSON only.",
      maxTokens: 2000,
      temperature: 0.2,
      responseSchema,
    });

    const parsed = JSON.parse(
      res.content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim(),
    );

    if (parsed.summary) summary = parsed.summary;
    if (
      parsed.verdict &&
      ["approve", "request_changes", "comment"].includes(parsed.verdict)
    ) {
      verdict = parsed.verdict;
    }
    if (typeof parsed.confidenceScore === "number") {
      confidenceScore = Math.max(0, Math.min(100, parsed.confidenceScore));
    }
    if (Array.isArray(parsed.topActions)) {
      topActions = parsed.topActions.slice(0, 5);
    }
    if (parsed.changelogType) changelog.type = parsed.changelogType;
    if (parsed.changelogEntry) changelog.entry = parsed.changelogEntry;
    if (typeof parsed.isBreaking === "boolean")
      changelog.isBreaking = parsed.isBreaking;
  } catch (err: any) {
    console.error("[Synthesizer] LLM error:", err.message);
    // Fall back to heuristic verdict
    topActions = allFindings
      .filter((f) => f.severity === "critical" || f.severity === "high")
      .slice(0, 3)
      .map((f) => `[${f.agentSource}] ${f.message}`);
  }

  // Guarantee ci-security block-action findings make it into topActions.
  // The LLM is free to write its own, but block-actions are policy-driven
  // and must surface in the "before merging" section of the PR review.
  const ciSecurityBlocks = input.agentOutputs
    .filter((o) => o.agentType === "ci-security")
    .flatMap((o) => o.findings)
    .filter((f) => f.policyAction === "block");
  if (ciSecurityBlocks.length > 0) {
    const ciActions = ciSecurityBlocks
      .slice(0, 3)
      .map((f) => `[ci-security] ${f.message}`);
    // Prepend without duplicating if the LLM happened to mention them.
    const seen = new Set(topActions);
    topActions = [...ciActions.filter((a) => !seen.has(a)), ...topActions].slice(0, 5);
    // Force verdict to request_changes when there's a block-action ci finding.
    if (verdict === "approve" || verdict === "comment") {
      verdict = "request_changes";
    }
  }

  return {
    verdict,
    confidenceScore,
    summary,
    severityCounts,
    topActions,
    inlineComments,
    changelog,
    durationMs: Date.now() - start,
  };
}
