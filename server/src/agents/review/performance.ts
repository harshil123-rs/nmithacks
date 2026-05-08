/**
 * Performance Agent
 *
 * Analyzes PR diff for performance issues:
 * - N+1 query patterns (loops with DB calls)
 * - O(n^2) or worse algorithmic complexity
 * - Missing pagination on list endpoints
 * - React: missing useMemo/useCallback, unnecessary re-renders
 * - Large synchronous operations blocking the event loop
 * - Unbounded data fetching
 * - Memory leaks (growing arrays, uncleaned intervals)
 * - Inefficient regex, string concatenation in loops
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";

export async function runPerformanceAgent(
  input: AgentInput,
): Promise<AgentOutput> {
  const start = Date.now();

  const diffBlock = input.diff.files
    .map((f) => formatFileChanges(f))
    .join("\n\n");

  const changedFilesBlock = input.changedFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const relatedBlock =
    input.relatedFiles.length > 0
      ? input.relatedFiles
          .map((f) => `--- ${f.path} (related) ---\n${f.content}`)
          .join("\n\n")
      : "";

  const prompt = `You are a senior performance engineer reviewing a pull request for performance issues.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for performance problems. Focus ONLY on added/modified lines.

Check for:
1. N+1 queries — database/API calls inside loops. Look for await inside for/forEach/map loops that hit a DB or external service
2. Algorithmic complexity — nested loops over the same collection, O(n^2) or worse operations
3. Missing pagination — endpoints that return unbounded lists, find() without limit()
4. React performance — missing useMemo/useCallback on expensive computations or callbacks passed as props, unnecessary re-renders from inline object/array creation in JSX
5. Blocking operations — synchronous file I/O, CPU-intensive operations on the main thread, missing async/await
6. Memory issues — growing arrays without bounds, event listeners not cleaned up, setInterval without clearInterval
7. Inefficient patterns — string concatenation in loops (use join), regex compilation in loops, redundant API calls
8. Missing caching — repeated expensive computations that could be memoized, missing HTTP cache headers
9. Bundle size — importing entire libraries when only a submodule is needed (e.g. import _ from 'lodash' vs import get from 'lodash/get')
10. Database — missing indexes for new query patterns, unindexed sorts, fetching more fields than needed

## Severity Guidelines
- critical: Will cause noticeable degradation in production (N+1 on hot path, unbounded queries)
- high: Significant performance issue under normal load
- medium: Performance issue under high load or with large datasets
- low: Minor optimization opportunity
- info: Performance best practice suggestion

## Rules
- ONLY report issues with specific file and line references
- Do NOT invent line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines
- Be thorough — real code almost always has performance considerations like missing pagination, unbounded queries, or inefficient patterns
- Be specific: explain the performance impact and provide a concrete fix

## Diff
${diffBlock}

## Full File Content
${changedFilesBlock}

${relatedBlock ? `## Related Files\n${relatedBlock}` : ""}

${input.repoMap ? `## Repository Structure (ranked by relevance)\n${input.repoMap}` : ""}`;

  const isOpenAI = input.llmOptions.provider === "openai";

  const findingSchemaBase = {
    type: "object" as const,
    properties: {
      file: { type: "string" as const },
      line: { type: "integer" as const },
      severity: {
        type: "string" as const,
        enum: ["critical", "high", "medium", "low", "info"],
      },
      category: {
        type: "string" as const,
        description:
          "e.g. n-plus-one, missing-pagination, react-rerender, blocking-io",
      },
      message: { type: "string" as const },
      suggestion: { type: "string" as const },
    },
    required: ["file", "line", "severity", "category", "message", "suggestion"],
  };

  const findingSchema = isOpenAI
    ? { ...findingSchemaBase, additionalProperties: false }
    : findingSchemaBase;

  const responseSchema = isOpenAI
    ? {
        type: "object" as const,
        properties: {
          findings: { type: "array" as const, items: findingSchema },
          summary: { type: "string" as const },
        },
        required: ["findings", "summary"],
        additionalProperties: false,
      }
    : {
        type: "object" as const,
        properties: {
          findings: { type: "array" as const, items: findingSchema },
          summary: { type: "string" as const },
        },
        required: ["findings", "summary"],
      };

  let findings: AgentFinding[] = [];
  let summary = "No performance issues detected.";

  try {
    const systemPrompt =
      "You are a senior performance engineer. Identify performance bottlenecks and optimization opportunities. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "PerformanceAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[PerformanceAgent] Raw LLM response (${res.content.length} chars):`,
        res.content.slice(0, 500),
      );

      const parsed = JSON.parse(
        res.content
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim(),
      );

      if (parsed.findings && Array.isArray(parsed.findings)) {
        findings = parsed.findings;
      }
      if (parsed.summary) summary = parsed.summary;

      if (findings.length === 0) {
        const retryResult = await retryWithoutSchema(
          "PerformanceAgent",
          prompt,
          input.llmOptions,
          "You are a senior performance engineer. Be thorough — real code always has performance considerations like missing pagination, N+1 queries, or inefficient patterns. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          findings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[PerformanceAgent] LLM error:", err.message);
    throw err;
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  return {
    agentType: "performance",
    findings,
    summary,
    durationMs: Date.now() - start,
  };
}
