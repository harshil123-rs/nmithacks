/**
 * Shared retry helper for review agents.
 *
 * When Gemini's structured output (responseSchema) returns empty findings,
 * this retries without the schema constraint and parses JSON manually.
 * Gemini 2.5 Flash is known to take the "easy path" with structured output
 * and return empty arrays when the schema is too strict.
 *
 * Also handles TPM (tokens-per-minute) exceeded errors by truncating context.
 */
import { callLLM } from "../../services/ai.service";
import type { CallLLMOptions } from "../../services/ai.service";
import type { AgentFinding } from "./types";

export interface RetryResult {
  findings: AgentFinding[];
  summary: string;
}

/**
 * Check if an error is a TPM "request too large" error.
 * OpenAI: "Request too large" / "tokens per min"
 * Gemini: "Quota exceeded for quota metric" / "resource exhausted"
 */
export function isTPMExceededError(err: any): boolean {
  return !!(
    err?.isTPMExceeded ||
    (err?.message &&
      (err.message.toLowerCase().includes("request too large") ||
        (err.message.includes("429") &&
          err.message.toLowerCase().includes("tokens per min")) ||
        (err.message.includes("429") &&
          err.message.toLowerCase().includes("tpm"))))
  );
}

/**
 * Truncate a prompt to roughly fit within a token limit.
 * Rough heuristic: 1 token ≈ 4 chars. We target ~60% of the original size
 * to leave headroom for the system prompt + output tokens.
 */
export function truncatePromptForTPM(
  prompt: string,
  requestedTokens: number,
  limitTokens: number,
): string {
  // Calculate how much we need to cut
  const ratio = limitTokens / requestedTokens;
  const targetChars = Math.floor(prompt.length * ratio * 0.85); // 85% of the proportional cut for safety

  if (targetChars >= prompt.length) return prompt;

  // Find section markers and truncate the largest sections
  const sections = [
    { marker: "## Full File Content", priority: 2 },
    { marker: "## Related Files", priority: 1 },
    { marker: "## Repository Structure", priority: 3 },
  ];

  let result = prompt;

  // First pass: remove related files entirely (lowest priority context)
  for (const { marker } of sections.sort((a, b) => a.priority - b.priority)) {
    if (result.length <= targetChars) break;

    const idx = result.indexOf(marker);
    if (idx === -1) continue;

    // Find the next section marker after this one
    const nextSectionIdx = findNextSection(result, idx + marker.length);
    if (nextSectionIdx > idx) {
      const sectionContent = result.slice(idx, nextSectionIdx);
      // Truncate this section to 30% of its size
      const truncatedSection =
        sectionContent.slice(0, Math.floor(sectionContent.length * 0.3)) +
        "\n\n[... truncated due to token limits ...]\n\n";
      result =
        result.slice(0, idx) + truncatedSection + result.slice(nextSectionIdx);
    }
  }

  // If still too long, hard truncate
  if (result.length > targetChars) {
    result =
      result.slice(0, targetChars) +
      "\n\n[... truncated due to token limits ...]";
  }

  return result;
}

function findNextSection(text: string, startFrom: number): number {
  const sectionRe = /\n## /g;
  sectionRe.lastIndex = startFrom;
  const match = sectionRe.exec(text);
  return match ? match.index : text.length;
}

/**
 * Parse TPM limit and requested tokens from error message.
 * Example: "Limit 30000, Requested 39806"
 */
export function parseTPMFromError(
  message: string,
): { limit: number; requested: number } | null {
  const limitMatch = message.match(/Limit\s+(\d+)/i);
  const requestedMatch = message.match(/Requested\s+(\d+)/i);
  if (limitMatch && requestedMatch) {
    return {
      limit: parseInt(limitMatch[1], 10),
      requested: parseInt(requestedMatch[1], 10),
    };
  }
  return null;
}

/**
 * Retry an agent's LLM call without responseSchema if the first call returned empty findings.
 * Returns null if retry also fails or returns empty.
 */
export async function retryWithoutSchema(
  agentName: string,
  prompt: string,
  llmOptions: CallLLMOptions,
  systemPrompt: string,
): Promise<RetryResult | null> {
  console.log(
    `[${agentName}] Structured output returned 0 findings, retrying without schema...`,
  );

  try {
    const retry = await callLLM(
      prompt +
        '\n\nIMPORTANT: You MUST respond with valid JSON matching this exact format:\n{"findings": [{"file": "path/to/file.ts", "line": 42, "severity": "medium", "category": "category-name", "message": "Description of the issue", "suggestion": "How to fix it"}], "summary": "Overall assessment"}\n\nDo NOT return an empty findings array unless the code is genuinely flawless. Be thorough and critical.',
      {
        provider: llmOptions.provider,
        model: llmOptions.model,
        apiKey: llmOptions.apiKey,
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.3,
      },
    );

    console.log(
      `[${agentName}] Retry response (${retry.content.length} chars):`,
      retry.content.slice(0, 500),
    );

    const parsed = JSON.parse(
      retry.content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim(),
    );

    if (
      parsed.findings &&
      Array.isArray(parsed.findings) &&
      parsed.findings.length > 0
    ) {
      return {
        findings: parsed.findings.map((f: any) => ({
          file: f.file,
          line: f.line,
          severity: f.severity,
          category: f.category,
          message: f.message,
          suggestion: f.suggestion || "",
          codeSnippet: f.codeSnippet,
        })),
        summary: parsed.summary || "",
      };
    }

    return null;
  } catch (err: any) {
    console.error(`[${agentName}] Retry error:`, err.message);
    return null;
  }
}

/**
 * Run an LLM call with automatic TPM truncation retry.
 * If the first call fails with TPM exceeded, truncates the prompt and retries once.
 * Returns null if both attempts fail.
 */
export async function callLLMWithTPMRetry(
  agentName: string,
  prompt: string,
  llmOptions: CallLLMOptions,
  systemPrompt: string,
  responseSchema?: Record<string, any>,
  maxTokens = 4096,
): Promise<{ content: string } | null> {
  try {
    const res = await callLLM(prompt, {
      ...llmOptions,
      systemPrompt,
      maxTokens,
      temperature: 0.2,
      responseSchema,
    });
    return res;
  } catch (err: any) {
    if (isTPMExceededError(err)) {
      const tpmInfo = parseTPMFromError(err.message);
      if (tpmInfo) {
        console.log(
          `[${agentName}] TPM exceeded (${tpmInfo.requested}/${tpmInfo.limit}), truncating context and retrying...`,
        );
        const truncatedPrompt = truncatePromptForTPM(
          prompt,
          tpmInfo.requested,
          tpmInfo.limit,
        );
        try {
          const retryRes = await callLLM(truncatedPrompt, {
            ...llmOptions,
            systemPrompt,
            maxTokens,
            temperature: 0.2,
            responseSchema,
          });
          return retryRes;
        } catch (retryErr: any) {
          console.error(
            `[${agentName}] TPM retry also failed:`,
            retryErr.message,
          );
          // Re-throw so the agent marks as failed
          throw retryErr;
        }
      } else {
        // TPM exceeded but no parseable token counts (e.g. Gemini quota errors)
        // Truncate to ~50% as a best-effort fallback
        console.log(
          `[${agentName}] TPM/quota exceeded (no token counts in error), truncating to 50% and retrying...`,
        );
        const truncatedPrompt = truncatePromptForTPM(
          prompt,
          200, // fake "requested" to trigger ~50% cut
          100, // fake "limit"
        );
        try {
          const retryRes = await callLLM(truncatedPrompt, {
            ...llmOptions,
            systemPrompt,
            maxTokens,
            temperature: 0.2,
            responseSchema,
          });
          return retryRes;
        } catch (retryErr: any) {
          console.error(
            `[${agentName}] TPM/quota retry also failed:`,
            retryErr.message,
          );
          throw retryErr;
        }
      }
    }
    // Re-throw non-TPM errors
    throw err;
  }
}
