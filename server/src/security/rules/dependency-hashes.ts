/**
 * Dependency hash rules.
 *
 * Goal: catch the "lockfile changed but the version manifest didn't" pattern,
 * which usually means somebody hand-edited a lockfile or merged a malicious
 * lockfile-only PR. We can only detect this when we have the previous version
 * of the file (i.e. PR diffs).
 *
 * For v1 we focus on the npm and Python ecosystems because those are the
 * highest-value targets and have the simplest lockfile structures.
 */
import type { Finding, Rule, RuleInput } from "./types";

interface PairedFiles {
  manifest: { path: string; content: string; previous?: string };
  lockfile: { path: string; content: string; previous?: string };
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function findPair(input: RuleInput, manifestName: string, lockfileName: string): PairedFiles[] {
  const manifests = input.files.filter((f) => f.path.endsWith(manifestName));
  const lockfiles = input.files.filter((f) => f.path.endsWith(lockfileName));
  const out: PairedFiles[] = [];
  for (const lock of lockfiles) {
    const lockDir = dirOf(lock.path);
    const manifest = manifests.find((m) => dirOf(m.path) === lockDir);
    if (!manifest) continue;
    out.push({
      manifest: { path: manifest.path, content: manifest.content, previous: manifest.previousContent },
      lockfile: { path: lock.path, content: lock.content, previous: lock.previousContent },
    });
  }
  return out;
}

function changed(file: { content: string; previous?: string }): boolean {
  return file.previous !== undefined && file.previous !== file.content;
}

export const lockfileHashMismatch: Rule = {
  id: "deps.lockfile-hash-mismatch",
  description: "Detects lockfile edits that aren't accompanied by a manifest change — usually a hand-edit or a malicious lockfile-only PR.",
  defaultSeverity: "high",
  defaultAction: "warn",
  run(input: RuleInput): Finding[] {
    const findings: Finding[] = [];

    // npm: package-lock.json changed without package.json changed.
    for (const pair of findPair(input, "package.json", "package-lock.json")) {
      if (changed(pair.lockfile) && !changed(pair.manifest)) {
        findings.push({
          ruleId: "deps.lockfile-hash-mismatch",
          severity: "high",
          file: pair.lockfile.path,
          message: `${pair.lockfile.path} was modified but ${pair.manifest.path} was not. Lockfile-only edits frequently indicate hand-tampering or a malicious dependency swap.`,
          suggestion: "Regenerate the lockfile from a clean install ('rm -rf node_modules package-lock.json && npm install') and commit both files together. If the change was intentional (e.g. resolving a known vulnerability), document it in the PR description.",
          detectedBy: "lockfile",
          references: ["CWE-829"],
        });
      }
    }

    // Python: requirements.txt with hashes changed but versions didn't.
    const reqs = input.files.filter((f) => /(^|\/)requirements\.txt$/i.test(f.path));
    for (const f of reqs) {
      if (!changed({ content: f.content, previous: f.previousContent })) continue;
      const oldVersions = extractPinnedVersions(f.previousContent ?? "");
      const newVersions = extractPinnedVersions(f.content);
      // If the set of (name, version) pairs is unchanged but the file changed,
      // the only thing that changed is hashes/comments — flag it.
      const sameVersions = mapsEqual(oldVersions, newVersions);
      const hasHashes = /--hash=sha256:/i.test(f.content);
      if (sameVersions && hasHashes) {
        findings.push({
          ruleId: "deps.lockfile-hash-mismatch",
          severity: "high",
          file: f.path,
          message: `${f.path} version pins are unchanged but pinned hashes were edited. This is the signature of hash-substitution attacks.`,
          suggestion: "Verify the new hashes match the official PyPI release artifacts. Regenerate with 'pip-compile --generate-hashes' from a clean checkout.",
          detectedBy: "lockfile",
          references: ["CWE-829"],
        });
      }
    }

    return findings;
  },
};

function extractPinnedVersions(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    // pkg==1.2.3
    const m = /^([A-Za-z0-9_.\-]+)==([^\s;\\]+)/.exec(line);
    if (m) out.set(m[1].toLowerCase(), m[2]);
  }
  return out;
}

function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export const dependencyRules: Rule[] = [lockfileHashMismatch];
