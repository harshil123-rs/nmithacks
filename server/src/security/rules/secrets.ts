/**
 * Hardcoded secret detection.
 *
 * The patterns here are the single source of truth — `agents/review/security.ts`
 * imports `SECRET_PATTERNS` from this file rather than maintaining its own
 * copy. Adding a pattern here automatically lights up both the PR-side
 * security agent's pre-scan and the monitor's full-file scan.
 */
import type { Finding, Rule, RuleInput } from "./types";

export interface SecretPattern {
  /** Lowercase, hyphenated. Surfaces as the `category` in legacy callers. */
  category: string;
  pattern: RegExp;
}

/**
 * High-confidence secret regexes. Order matters only for performance — keep
 * the cheap ones first.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    category: "hardcoded-api-key",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi,
  },
  {
    category: "hardcoded-secret",
    pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  },
  {
    category: "stripe-key",
    pattern: /(?:sk-|pk_live_|pk_test_|sk_live_|sk_test_)[A-Za-z0-9]{20,}/g,
  },
  {
    category: "github-token",
    pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36,}/g,
  },
  {
    category: "aws-access-key",
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  },
  {
    category: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  },
  {
    category: "jwt-token",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

/**
 * Scan an arbitrary string (e.g. one diff line, or one file's contents) for
 * any pattern hit. Used by both the legacy PR-side pre-scanner (line-by-line)
 * and the monitor full-file scanner.
 */
export function scanStringForSecrets(
  content: string,
): Array<{ category: string; match: string; index: number }> {
  const hits: Array<{ category: string; match: string; index: number }> = [];
  for (const { pattern, category } of SECRET_PATTERNS) {
    pattern.lastIndex = 0; // regexes are stateful with /g
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      hits.push({ category, match: m[0], index: m.index });
      // Avoid infinite loop on zero-width matches.
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }
  return hits;
}

export const secretsRule: Rule = {
  id: "secrets.hardcoded",
  description: "Detects hardcoded API keys, tokens, and credentials in source files.",
  defaultSeverity: "critical",
  defaultAction: "block",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];
    for (const file of input.files) {
      const lines = file.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hits = scanStringForSecrets(line);
        if (hits.length === 0) continue;
        // De-dup multiple pattern hits on the same line into one finding.
        const categories = Array.from(new Set(hits.map((h) => h.category)));
        findings.push({
          ruleId: "secrets.hardcoded",
          severity: "critical",
          file: file.path,
          line: i + 1,
          message: `Potential hardcoded secret detected: ${categories.join(", ")}`,
          suggestion:
            "Move this value to environment variables or a secrets manager (GitHub Actions secrets, AWS Secrets Manager, HashiCorp Vault). Never commit secrets to source control. If this secret was committed, rotate it immediately.",
          codeSnippet: line.trim().slice(0, 120),
          detectedBy: "regex",
          references: ["CWE-798", "OWASP-A02:2021"],
        });
      }
    }
    return findings;
  },
};
