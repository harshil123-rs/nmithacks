/**
 * Dockerfile rules.
 *
 * Tokenizes line-by-line. We don't need a real Dockerfile parser for the
 * rules we care about — every directive starts at column 0 and instructions
 * are case-insensitive.
 */
import type { Finding, Rule, RuleInput } from "./types";

interface ParsedLine {
  raw: string;
  /** Uppercase instruction (e.g. "FROM", "RUN", "USER"), or null for comments/blanks. */
  instruction: string | null;
  /** Everything after the instruction. */
  args: string;
  /** 1-based line number. */
  line: number;
}

function tokenize(content: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = content.split(/\r?\n/);
  // Folded-line continuation handling (`\` at EOL) — collapse into the
  // logical line that contains the instruction.
  let buffer = "";
  let bufferLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const trimmed = ln.replace(/\s+$/, "");
    const continues = /\\$/.test(trimmed);
    if (buffer === "") bufferLine = i + 1;
    buffer += continues ? trimmed.slice(0, -1) + " " : trimmed;
    if (continues) continue;

    const text = buffer;
    buffer = "";
    const stripped = text.trim();
    if (stripped === "" || stripped.startsWith("#")) {
      out.push({ raw: text, instruction: null, args: "", line: bufferLine });
      continue;
    }
    const m = /^(\w+)\s+([\s\S]*)$/.exec(stripped);
    if (!m) {
      out.push({ raw: text, instruction: null, args: "", line: bufferLine });
      continue;
    }
    out.push({
      raw: text,
      instruction: m[1].toUpperCase(),
      args: m[2],
      line: bufferLine,
    });
  }
  return out;
}

function isDockerfile(path: string): boolean {
  // Matches "Dockerfile", "Dockerfile.foo", and any subdir variant.
  return /(^|\/)Dockerfile($|\.[^/]+$)/i.test(path);
}

export const dockerfilePrivilegedFlag: Rule = {
  id: "dockerfile.privileged-flag",
  description: "Detects '--privileged' inside RUN/CMD/ENTRYPOINT shell strings.",
  defaultSeverity: "high",
  defaultAction: "warn",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];
    for (const file of input.files) {
      if (!isDockerfile(file.path)) continue;
      const lines = tokenize(file.content);
      for (const ln of lines) {
        if (!ln.instruction) continue;
        if (!["RUN", "CMD", "ENTRYPOINT"].includes(ln.instruction)) continue;
        if (/(^|\s)--privileged(\s|$)/.test(ln.args)) {
          findings.push({
            ruleId: "dockerfile.privileged-flag",
            severity: "high",
            file: file.path,
            line: ln.line,
            message: `${ln.instruction} invokes a command with '--privileged'. Inside CI this typically launches a sub-container with full host access.`,
            suggestion: "Remove '--privileged'. If a specific capability is needed, pass '--cap-add=<CAP>' instead.",
            codeSnippet: ln.raw.trim().slice(0, 120),
            detectedBy: "dockerfile",
            references: ["CWE-250"],
          });
        }
      }
    }
    return findings;
  },
};

export const dockerfileUserRootFinal: Rule = {
  id: "dockerfile.user-root-final",
  description: "Detects images that end with USER root (or no USER directive at all in the final stage).",
  defaultSeverity: "high",
  defaultAction: "warn",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];
    for (const file of input.files) {
      if (!isDockerfile(file.path)) continue;
      const lines = tokenize(file.content);
      // Track stage boundaries: each FROM starts a new stage.
      // For each stage, find the *last* USER directive.
      let stageStart = -1;
      const stages: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].instruction === "FROM") {
          if (stageStart >= 0) stages.push({ start: stageStart, end: i - 1 });
          stageStart = i;
        }
      }
      if (stageStart >= 0) stages.push({ start: stageStart, end: lines.length - 1 });

      // Only the last stage matters — that's the runtime image.
      const last = stages[stages.length - 1];
      if (!last) continue;
      let lastUser: ParsedLine | null = null;
      for (let i = last.start; i <= last.end; i++) {
        if (lines[i].instruction === "USER") lastUser = lines[i];
      }
      const isRoot = !lastUser || /^(\s*)(root|0)(\s|$|:)/.test(lastUser.args);
      if (isRoot) {
        findings.push({
          ruleId: "dockerfile.user-root-final",
          severity: "high",
          file: file.path,
          line: lastUser ? lastUser.line : lines[last.start].line,
          message: lastUser
            ? "Final stage explicitly ends as USER root. Container processes will run with root privileges, which inflates the blast radius of any RCE."
            : "Final stage has no USER directive, so the image runs as root by default.",
          suggestion: "Add a non-root user before the final CMD/ENTRYPOINT, e.g. 'RUN adduser --system --no-create-home appuser' followed by 'USER appuser'.",
          codeSnippet: lastUser ? lastUser.raw.trim().slice(0, 120) : "(no USER directive)",
          detectedBy: "dockerfile",
          references: ["CWE-250"],
        });
      }
    }
    return findings;
  },
};

export const dockerfileAddFromUrl: Rule = {
  id: "dockerfile.add-from-url",
  description: "Detects ADD <url> which fetches over HTTP without integrity verification.",
  defaultSeverity: "medium",
  defaultAction: "warn",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];
    for (const file of input.files) {
      if (!isDockerfile(file.path)) continue;
      const lines = tokenize(file.content);
      for (const ln of lines) {
        if (ln.instruction !== "ADD") continue;
        // ADD supports tar auto-extraction and remote URLs. The URL form is
        // the security concern.
        if (/^\s*https?:\/\//i.test(ln.args)) {
          findings.push({
            ruleId: "dockerfile.add-from-url",
            severity: "medium",
            file: file.path,
            line: ln.line,
            message: "ADD <url> fetches the file over HTTP(S) without verifying its hash. A compromised upstream serves arbitrary content into your image.",
            suggestion: "Replace with 'RUN curl -fsSL <url> -o /tmp/foo && echo \"<sha256> /tmp/foo\" | sha256sum -c -' to lock the artifact to a known hash. Or use a package manager.",
            codeSnippet: ln.raw.trim().slice(0, 120),
            detectedBy: "dockerfile",
            references: ["CWE-494"],
          });
        }
      }
    }
    return findings;
  },
};

export const dockerfileRules: Rule[] = [
  dockerfilePrivilegedFlag,
  dockerfileUserRootFinal,
  dockerfileAddFromUrl,
];
