/**
 * Documentation Agent
 *
 * Analyzes PR diff for documentation gaps:
 * - Missing JSDoc/docstrings on new public functions/classes
 * - Undocumented API endpoints
 * - Outdated README references
 * - Missing inline comments on complex logic
 * - Missing type documentation
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";

export async function runDocumentationAgent(
  input: AgentInput,
): Promise<AgentOutput> {
  const start = Date.now();

  const diffBlock = input.diff.files
    .map((f) => formatFileChanges(f))
    .join("\n\n");

  const changedFilesBlock = input.changedFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const prompt = `You are a senior technical writer reviewing a pull request for documentation completeness.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for missing or outdated documentation. Focus ONLY on added/modified code.

Check for:
1. Missing function/method docs — new or modified exported functions without JSDoc/docstring. Include: description, @param types and descriptions, @returns, @throws
2. Missing class/interface docs — new classes, interfaces, or type aliases without documentation explaining their purpose
3. Undocumented API endpoints — new route handlers without documenting: HTTP method, path, request body schema, response schema, auth requirements, error responses
4. Complex logic without comments — algorithms, business rules, regex patterns, or non-obvious code that needs inline explanation
5. Outdated references — if the PR changes function signatures, check if existing JSDoc @param names still match
6. Missing README updates — if the PR adds new features, commands, or configuration, check if README or docs should be updated
7. Missing error documentation — new error types or error codes that aren't documented

## Severity Guidelines
- high: Public API or exported function with no documentation at all
- medium: Missing parameter descriptions or incomplete documentation
- low: Missing inline comment on complex logic
- info: Documentation improvement suggestion

## Rules
- ONLY report issues with specific file and line references
- Do NOT invent line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines
- Focus on PUBLIC/EXPORTED functions — private helper functions don't always need full JSDoc
- Don't flag simple getters/setters or obvious one-liners
- Be thorough — new code almost always has missing JSDoc, undocumented parameters, or missing inline comments on complex logic

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
          "e.g. missing-jsdoc, undocumented-endpoint, missing-comment, outdated-docs",
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
  let summary = "Documentation looks complete.";

  try {
    const systemPrompt =
      "You are a senior technical writer reviewing code documentation. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "DocumentationAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[DocumentationAgent] Raw LLM response (${res.content.length} chars):`,
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
          "DocumentationAgent",
          prompt,
          input.llmOptions,
          "You are a senior technical writer reviewing code documentation. Be thorough — new code almost always has missing JSDoc, undocumented parameters, or missing inline comments. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          findings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[DocumentationAgent] LLM error:", err.message);
    throw err;
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  return {
    agentType: "documentation",
    findings,
    summary,
    durationMs: Date.now() - start,
  };
}
