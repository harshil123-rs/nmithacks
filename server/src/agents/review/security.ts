/**
 * Security Agent
 *
 * Analyzes PR diff for security vulnerabilities:
 * - OWASP Top 10 issues
 * - Hardcoded secrets / API keys (regex pre-scan + LLM confirmation)
 * - SQL/NoSQL injection
 * - XSS vulnerabilities
 * - Insecure direct object references
 * - Missing authentication/authorization checks
 * - Path traversal, SSRF, insecure deserialization
 */
import { formatFileChanges } from "./diff-parser";
import { retryWithoutSchema, callLLMWithTPMRetry } from "./retry-helper";
import type { AgentInput, AgentOutput, AgentFinding } from "./types";
// Single source of truth — see server/src/security/rules/secrets.ts.
import { SECRET_PATTERNS } from "../../security/rules/secrets";

function preScannSecrets(input: AgentInput): AgentFinding[] {
  const findings: AgentFinding[] = [];

  for (const file of input.diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "add") continue;
        for (const { pattern, category } of SECRET_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(line.content)) {
            findings.push({
              file: file.path,
              line: line.newLine,
              severity: "critical",
              category,
              message: `Potential hardcoded secret detected: ${category}`,
              suggestion:
                "Move this to environment variables or a secrets manager. Never commit secrets to source control.",
              codeSnippet: line.content.trim().slice(0, 100),
            });
          }
        }
      }
    }
  }

  return findings;
}

export async function runSecurityAgent(
  input: AgentInput,
): Promise<AgentOutput> {
  const start = Date.now();

  // Phase 1: Regex pre-scan for secrets
  const secretFindings = preScannSecrets(input);

  // Phase 2: LLM deep analysis
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

  const prompt = `You are a senior application security engineer performing a security review of a pull request.

## PR Context
- Repository: ${input.repoFullName}
- PR: "${input.pr.title}" by @${input.pr.author}
- Branch: ${input.pr.headBranch} → ${input.pr.baseBranch}

## Your Task
Analyze the code changes for security vulnerabilities. Focus ONLY on the added/modified lines (lines starting with +).

Check for:
1. OWASP Top 10: injection (SQL, NoSQL, command, LDAP), broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulnerable components, insufficient logging
2. Hardcoded secrets, API keys, tokens, passwords in code
3. Missing input validation or sanitization
4. Missing authentication or authorization checks on new endpoints
5. Insecure cryptographic practices (weak algorithms, hardcoded IVs)
6. Path traversal, SSRF, open redirects
7. Race conditions in security-critical code
8. Insecure direct object references (IDOR)

## Severity Guidelines
- critical: Exploitable vulnerability that could lead to data breach, RCE, or full system compromise
- high: Significant vulnerability that requires specific conditions to exploit
- medium: Security weakness that should be fixed but has limited impact
- low: Minor security improvement or hardening suggestion
- info: Security best practice recommendation

## Rules
- ONLY report issues you can point to specific files and line numbers for
- Do NOT invent or guess line numbers — use the [L###] markers from the diff
- Do NOT report issues in deleted lines (lines starting with -)
- Be thorough — real production code almost always has security considerations. Look harder.
- Even minor issues like missing input validation, missing rate limiting, or missing CSRF protection count
- Be precise: explain the vulnerability AND how to fix it

## Diff (changed code)
${diffBlock}

## Full File Content (for context)
${changedFilesBlock}

${relatedBlock ? `## Related Files (codebase context)\n${relatedBlock}` : ""}

${input.conventions.length > 0 ? `## Project Conventions\n${input.conventions.join("\n")}` : ""}

${input.repoMap ? `## Repository Structure (ranked by relevance)\n${input.repoMap}` : ""}`;

  const isOpenAI = input.llmOptions.provider === "openai";

  const findingSchemaBase = {
    type: "object" as const,
    properties: {
      file: { type: "string" as const, description: "File path" },
      line: {
        type: "integer" as const,
        description: "Line number in the new file",
      },
      severity: {
        type: "string" as const,
        enum: ["critical", "high", "medium", "low", "info"],
      },
      category: {
        type: "string" as const,
        description:
          "Vulnerability category e.g. sql-injection, xss, hardcoded-secret",
      },
      message: {
        type: "string" as const,
        description: "Clear description of the vulnerability",
      },
      suggestion: {
        type: "string" as const,
        description: "Concrete fix suggestion",
      },
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
          summary: {
            type: "string" as const,
            description: "2-3 sentence security assessment",
          },
        },
        required: ["findings", "summary"],
        additionalProperties: false,
      }
    : {
        type: "object" as const,
        properties: {
          findings: { type: "array" as const, items: findingSchema },
          summary: {
            type: "string" as const,
            description: "2-3 sentence security assessment",
          },
        },
        required: ["findings", "summary"],
      };

  let llmFindings: AgentFinding[] = [];
  let summary = "No security issues detected.";

  try {
    const systemPrompt =
      "You are a senior application security engineer. Analyze code for vulnerabilities. You MUST find and report real issues — be thorough and critical. Return structured JSON with a non-empty findings array.";

    const res = await callLLMWithTPMRetry(
      "SecurityAgent",
      prompt,
      input.llmOptions,
      systemPrompt,
      responseSchema,
    );

    if (res) {
      console.log(
        `[SecurityAgent] Raw LLM response (${res.content.length} chars):`,
        res.content.slice(0, 500),
      );

      const parsed = JSON.parse(
        res.content
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim(),
      );

      if (parsed.findings && Array.isArray(parsed.findings)) {
        llmFindings = parsed.findings.map((f: any) => ({
          file: f.file,
          line: f.line,
          severity: f.severity,
          category: f.category,
          message: f.message,
          suggestion: f.suggestion,
        }));
      }
      if (parsed.summary) summary = parsed.summary;

      // If structured output returned empty, retry without schema constraint
      if (llmFindings.length === 0) {
        const retryResult = await retryWithoutSchema(
          "SecurityAgent",
          prompt,
          input.llmOptions,
          "You are a senior application security engineer. Analyze code for vulnerabilities. Be thorough — real code always has security considerations. Return ONLY valid JSON, no markdown.",
        );
        if (retryResult) {
          llmFindings = retryResult.findings;
          if (retryResult.summary) summary = retryResult.summary;
        }
      }
    }
  } catch (err: any) {
    console.error("[SecurityAgent] LLM error:", err.message);
    // Re-throw so the review job marks this agent as failed
    throw err;
  }

  // Merge regex findings with LLM findings, deduplicate by file+line
  const allFindings = [...secretFindings];
  const existingKeys = new Set(
    secretFindings.map((f) => `${f.file}:${f.line}`),
  );
  for (const f of llmFindings) {
    const key = `${f.file}:${f.line}`;
    if (!existingKeys.has(key)) {
      allFindings.push(f);
      existingKeys.add(key);
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allFindings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  return {
    agentType: "security",
    findings: allFindings,
    summary,
    durationMs: Date.now() - start,
    metadata: {
      regexSecretFindings: secretFindings.length,
      llmFindings: llmFindings.length,
    },
  };
}
