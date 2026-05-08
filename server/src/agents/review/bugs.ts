/**
 * Bugs Agent
 *
 * Analyzes PR diff for logic errors, potential bugs, and test coverage gaps:
 * - Null/undefined reference errors
 * - Off-by-one errors, boundary conditions
 * - Race conditions, async/await misuse
 * - Unhandled promise rejections
 * - Type coercion bugs
 * - Missing error handling
 * - Edge cases not covered
 * - Test coverage gaps for changed functions
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";

export async function runBugsAgent(input: AgentInput): Promise<AgentOutput> {
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

  const prompt = `You are a senior software engineer performing a thorough bug review of a pull request.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for bugs, logic errors, and test coverage gaps. Focus ONLY on added/modified lines.

Check for:
1. Null/undefined dereferences — accessing properties on potentially null values
2. Off-by-one errors — incorrect loop bounds, array indexing, string slicing
3. Race conditions — concurrent access without synchronization, async/await misuse
4. Unhandled errors — missing try/catch, unhandled promise rejections, missing error propagation
5. Type coercion bugs — loose equality, implicit type conversions, parseInt without radix
6. Logic errors — incorrect boolean logic, wrong operator, inverted conditions, unreachable code
7. Edge cases — empty arrays, empty strings, zero values, negative numbers, very large inputs
8. Resource leaks — unclosed connections, streams, file handles, event listeners not removed
9. State management bugs — stale closures, missing dependency arrays in React hooks, mutation of shared state
10. Test coverage — identify changed/added functions that lack corresponding test changes in the PR

## Severity Guidelines
- critical: Will cause crashes, data corruption, or incorrect behavior in production
- high: Likely to cause bugs under common conditions
- medium: Could cause bugs under specific conditions or edge cases
- low: Minor issue, defensive coding improvement
- info: Test coverage suggestion or code quality note

## Rules
- ONLY report issues you can point to specific files and line numbers for
- Do NOT invent line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines
- For test coverage: identify NEW functions/methods that have no test changes in this PR
- Be thorough — real code almost always has potential bugs, edge cases, or missing error handling
- Be specific: explain WHAT the bug is, WHEN it would trigger, and HOW to fix it

## Diff
${diffBlock}

## Full File Content
${changedFilesBlock}

${relatedBlock ? `## Related Files\n${relatedBlock}` : ""}

${input.conventions.length > 0 ? `## Project Conventions\n${input.conventions.join("\n")}` : ""}

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
          "Bug category e.g. null-reference, race-condition, missing-test",
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
  let summary = "No bugs or logic errors detected.";

  try {
    const systemPrompt =
      "You are a senior software engineer specializing in bug detection and code correctness. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "BugsAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[BugsAgent] Raw LLM response (${res.content.length} chars):`,
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
          "BugsAgent",
          prompt,
          input.llmOptions,
          "You are a senior software engineer specializing in bug detection. Be thorough — real code always has potential bugs, edge cases, or missing error handling. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          findings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[BugsAgent] LLM error:", err.message);
    throw err;
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  return {
    agentType: "bugs",
    findings,
    summary,
    durationMs: Date.now() - start,
  };
}
