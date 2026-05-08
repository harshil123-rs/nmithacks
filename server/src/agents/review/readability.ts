/**
 * Readability Agent
 *
 * Analyzes PR diff for code readability and maintainability:
 * - Overly complex functions (high cyclomatic complexity)
 * - Poor naming (single-letter variables, misleading names)
 * - Dead code, unreachable code
 * - Functions that are too long
 * - Deeply nested conditionals
 * - Magic numbers/strings
 * - Inconsistent code style
 * - Missing or misleading comments
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";

export async function runReadabilityAgent(
  input: AgentInput,
): Promise<AgentOutput> {
  const start = Date.now();

  const diffBlock = input.diff.files
    .map((f) => formatFileChanges(f))
    .join("\n\n");

  const changedFilesBlock = input.changedFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const prompt = `You are a senior software engineer reviewing a pull request for code readability and maintainability.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for readability issues. Focus ONLY on added/modified lines.

Check for:
1. Complex functions — functions with high cyclomatic complexity (many branches/conditions), functions longer than ~50 lines
2. Poor naming — single-letter variables (except loop counters), misleading names, abbreviations that aren't obvious, inconsistent naming within the PR
3. Dead code — unreachable code after return/throw, unused variables, commented-out code blocks
4. Deep nesting — more than 3 levels of nested if/for/while. Suggest early returns or guard clauses
5. Magic numbers/strings — hardcoded values that should be named constants
6. Code duplication — repeated logic within the PR that should be extracted into a function
7. Unclear logic — complex expressions that need comments, ternaries that are hard to read, boolean logic that could be simplified
8. Missing type safety — any types in TypeScript, missing return types on public functions, loose type assertions

## Severity Guidelines
- high: Significantly harms readability, will cause confusion for future maintainers
- medium: Noticeable readability issue that should be addressed
- low: Minor improvement that would make the code cleaner
- info: Style suggestion or best practice

## Rules
- ONLY report issues with specific file and line references
- Do NOT invent line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines
- Be constructive: explain WHY it hurts readability and suggest a specific improvement
- Be thorough — real code almost always has readability improvements like naming, complexity, or missing comments
- Respect the project's existing conventions — don't suggest changes that conflict with them

## Diff
${diffBlock}

## Full File Content
${changedFilesBlock}

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
        enum: ["high", "medium", "low", "info"],
      },
      category: {
        type: "string" as const,
        description:
          "e.g. complex-function, poor-naming, dead-code, deep-nesting, magic-number",
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
  let summary = "Code readability looks good.";

  try {
    const systemPrompt =
      "You are a senior software engineer focused on code readability and clean code principles. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "ReadabilityAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[ReadabilityAgent] Raw LLM response (${res.content.length} chars):`,
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
          "ReadabilityAgent",
          prompt,
          input.llmOptions,
          "You are a senior software engineer focused on code readability. Be thorough — real code always has readability improvements like naming, complexity, or missing comments. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          findings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[ReadabilityAgent] LLM error:", err.message);
    throw err;
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  return {
    agentType: "readability",
    findings,
    summary,
    durationMs: Date.now() - start,
  };
}
