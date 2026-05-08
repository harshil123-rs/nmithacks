/**
 * Network outbound rules.
 *
 * Looks for `curl`/`wget` to non-allowlisted domains inside any kind of
 * shell-like script: workflow `run:` blocks, Dockerfile RUN, shell scripts.
 *
 * The list of "always-allowed" domains is short on purpose — anything that's
 * a standard package registry or is trivially auditable. Customers extend
 * via `RuleInput.allowlist.domains`.
 */
import { parseDocument, isMap, isSeq, isScalar, type Node } from "yaml";
import type { Finding, Rule, RuleInput } from "./types";

const DEFAULT_ALLOWED_DOMAINS = [
  // Package registries / language ecosystems
  "registry.npmjs.org",
  "pypi.org",
  "files.pythonhosted.org",
  "rubygems.org",
  "crates.io",
  "static.crates.io",
  "proxy.golang.org",
  "sum.golang.org",
  "repo.maven.apache.org",
  "repo1.maven.org",
  "search.maven.org",
  "deb.debian.org",
  "security.debian.org",
  "archive.ubuntu.com",
  "security.ubuntu.com",
  "packages.microsoft.com",
  "dl-cdn.alpinelinux.org",
  // GitHub itself
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
  "api.github.com",
  // Cloud and CI defaults
  "ghcr.io",
  "registry-1.docker.io",
];

function extractRunBlocks(content: string, file: string): Array<{ line: number; body: string }> {
  // Try YAML first; fall back to "treat the whole file as one shell block"
  // for Dockerfiles.
  if (/\.ya?ml$/i.test(file)) {
    try {
      const doc = parseDocument(content);
      if (doc.errors.length === 0 && doc.contents) {
        const blocks: Array<{ line: number; body: string }> = [];
        const lineStarts = buildLineStarts(content);
        walk(doc.contents as Node, (node) => {
          if (!isMap(node)) return;
          for (const p of node.items) {
            if (isScalar(p.key) && p.key.value === "run") {
              const v = p.value as Node | undefined;
              if (v && isScalar(v) && typeof v.value === "string") {
                const off = (v as { range?: [number, number, number] }).range?.[0] ?? 0;
                blocks.push({ line: offsetToLine(off, lineStarts), body: v.value });
              }
            }
          }
        });
        return blocks;
      }
    } catch {
      // fall through
    }
  }
  if (/(^|\/)Dockerfile($|\.[^/]+$)/i.test(file)) {
    // Treat each `RUN` line (with continuations) as its own block. We don't
    // bother extracting line numbers here because the Dockerfile rule already
    // owns those — this file just looks for the network signal.
    const blocks: Array<{ line: number; body: string }> = [];
    const lines = content.split(/\r?\n/);
    let buf = "";
    let bufLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.replace(/\s+$/, "");
      const continues = /\\$/.test(trimmed);
      const next = continues ? trimmed.slice(0, -1) + " " : trimmed;
      if (buf === "") bufLine = i + 1;
      if (/^\s*RUN\s/i.test(buf || next)) {
        buf += next;
      } else if (buf !== "") {
        buf += next;
      } else {
        continue;
      }
      if (!continues) {
        if (/^\s*RUN\s/i.test(buf)) blocks.push({ line: bufLine, body: buf });
        buf = "";
      }
    }
    return blocks;
  }
  return [];
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  if (isMap(node)) {
    for (const p of node.items) if (p.value) walk(p.value as unknown as Node, visit);
  } else if (isSeq(node)) {
    for (const c of node.items) walk(c as unknown as Node, visit);
  }
}

function offsetToLine(offset: number, lineStarts: number[]): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") starts.push(i + 1);
  return starts;
}

export const networkOutboundRule: Rule = {
  id: "network.unallowlisted-outbound",
  description: "Detects curl/wget to non-allowlisted domains inside CI shell blocks.",
  defaultSeverity: "medium",
  defaultAction: "warn",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];
    const allowed = new Set([...DEFAULT_ALLOWED_DOMAINS, ...input.allowlist.domains]);
    for (const file of input.files) {
      const blocks = extractRunBlocks(file.content, file.path);
      for (const block of blocks) {
        // Naive URL extractor — good enough; we're greping shell scripts.
        const urls = block.body.match(/https?:\/\/[^\s"'`)|>;]+/g);
        if (!urls) continue;
        for (const url of urls) {
          let host: string;
          try {
            host = new URL(url).hostname.toLowerCase();
          } catch {
            continue;
          }
          if (isAllowed(host, allowed)) continue;
          // Only flag when the URL is in a "fetch + execute" or "fetch + write" position.
          const isPipeBash = new RegExp(`(curl|wget)[^|]*${escapeRegex(url)}[^|]*\\|\\s*(bash|sh|zsh)`, "i").test(block.body);
          const isFetch = new RegExp(`(curl|wget)\\b[^\\n]*\\b${escapeRegex(url)}`).test(block.body);
          if (!isFetch && !isPipeBash) continue;
          findings.push({
            ruleId: "network.unallowlisted-outbound",
            severity: isPipeBash ? "high" : "medium",
            file: file.path,
            line: block.line,
            message: isPipeBash
              ? `Build script pipes a fetched URL directly into a shell ('curl ${host} | bash'). A compromised host runs arbitrary code in your CI.`
              : `Build script reaches out to '${host}', which is not on the allowlist. Untracked outbound calls during builds are a supply-chain risk.`,
            suggestion: isPipeBash
              ? "Don't pipe-to-shell. Download to a file, verify a known-good SHA-256, then execute. Or use a package manager."
              : `Add '${host}' to the LGTM Security domain allowlist if this call is intentional. Otherwise vendor the dependency or pin it via a checksummed download.`,
            codeSnippet: url.slice(0, 120),
            detectedBy: "regex",
            references: ["CWE-494"],
          });
        }
      }
    }
    return findings;
  },
};

function isAllowed(host: string, allowed: Set<string>): boolean {
  if (allowed.has(host)) return true;
  // Allow direct subdomain matches — e.g. allowlist `github.com` accepts `objects.github.com`.
  for (const a of allowed) {
    if (host === a) return true;
    if (host.endsWith("." + a)) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const networkRules: Rule[] = [networkOutboundRule];
