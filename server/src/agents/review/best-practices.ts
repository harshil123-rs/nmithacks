/**
 * Best Practices Agent
 *
 * Analyzes PR diff for adherence to coding best practices:
 * - Error handling patterns
 * - Input validation
 * - Convention violations (using repo conventions from context)
 * - Anti-patterns specific to the framework/language
 * - Missing logging/monitoring
 * - Improper use of language features
 * - Dependency management issues
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";

export async function runBestPracticesAgent(
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

  // Detect likely tech stack from file extensions
  const extensions = new Set(
    input.diff.files.map((f) => f.path.split(".").pop()?.toLowerCase()),
  );
  const isReact = extensions.has("tsx") || extensions.has("jsx");
  const isNode = extensions.has("ts") || extensions.has("js");
  const isPython = extensions.has("py");

  let frameworkGuidance = "";
  if (isReact) {
    frameworkGuidance = `
- React: proper hook usage (rules of hooks), key props on lists, controlled vs uncontrolled components, proper cleanup in useEffect
- React: avoid prop drilling when context or state management is more appropriate
- React: proper error boundaries for component trees`;
  }
  if (isNode) {
    frameworkGuidance += `
- Node.js: proper async error handling, avoid callback hell, use structured logging
- Express: proper middleware ordering, input validation with schemas, proper HTTP status codes
- TypeScript: avoid 'any', use proper generics, leverage discriminated unions`;
  }
  if (isPython) {
    frameworkGuidance += `
- Python: use type hints, proper exception hierarchy, context managers for resources
- Follow PEP 8 conventions, use dataclasses or Pydantic for data structures`;
  }

  const prompt = `You are a senior software engineer reviewing a pull request for adherence to coding best practices.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for best practice violations. Focus ONLY on added/modified lines.

Check for:
1. Error handling — missing try/catch on async operations, swallowed errors (empty catch blocks), missing error propagation, generic error messages that don't help debugging
2. Input validation — missing validation on API endpoints, user inputs not sanitized, missing type guards
3. Convention violations — code that doesn't follow the project's established patterns (see conventions below)
4. Anti-patterns — god functions, tight coupling, violation of single responsibility, premature optimization
5. Missing logging — new error paths without logging, missing request/response logging on new endpoints
6. Improper language features — using var instead of const/let, not using optional chaining where appropriate, missing nullish coalescing
7. API design — inconsistent response shapes, missing error responses, wrong HTTP methods/status codes
8. Configuration — hardcoded values that should be configurable, missing environment variable validation
${frameworkGuidance}

## Severity Guidelines
- high: Clear violation of established best practices that will cause maintenance issues
- medium: Best practice violation that should be addressed
- low: Minor improvement opportunity
- info: Suggestion for better practice

## Rules
- ONLY report issues with specific file and line references
- Do NOT invent line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines
- Respect the project's conventions — flag violations of THEIR patterns, not generic preferences
- Be thorough — real code almost always has room for improvement in error handling, validation, or architecture
- Be actionable: every finding should have a clear fix

## Diff
${diffBlock}

## Full File Content
${changedFilesBlock}

${relatedBlock ? `## Related Files\n${relatedBlock}` : ""}

${input.conventions.length > 0 ? `## Project Conventions (violations of these are higher severity)\n${input.conventions.join("\n")}` : ""}

${input.recentHistory.length > 0 ? `## Recent Project History\n${input.recentHistory.join("\n")}` : ""}

${input.repoMap ? `## Repository Structure (ranked by relevance)\n${input.repoMap}` : ""}`;

  const isOpenAI = input.llmOptions.provider === "openai";

  const findingSchemaBase = {
    type: "object" as const,
    properties: {
      file: { type: "string" as const },
      line: { type: "integer" as const },
      severity: {
        type: "string" as const,
        enum: ["high", "medium", "low", "info"],
      },
      category: {
        type: "string" as const,
        description:
          "e.g. error-handling, input-validation, convention-violation, anti-pattern",
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
  let summary = "Code follows best practices well.";

  try {
    const systemPrompt =
      "You are a senior software engineer focused on coding best practices and clean architecture. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "BestPracticesAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[BestPracticesAgent] Raw LLM response (${res.content.length} chars):`,
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
          "BestPracticesAgent",
          prompt,
          input.llmOptions,
          "You are a senior software engineer focused on coding best practices. Be thorough — real code always has room for improvement in error handling, validation, or architecture. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          findings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[BestPracticesAgent] LLM error:", err.message);
    throw err;
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  return {
    agentType: "best-practices",
    findings,
    summary,
    durationMs: Date.now() - start,
  };
}
