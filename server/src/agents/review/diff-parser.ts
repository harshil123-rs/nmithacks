/**
 * Unified diff parser.
 *
 * Parses GitHub's unified diff format into structured objects.
 * No npm dependencies — we own the parser for full control.
 */
import type {
  ParsedDiff,
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffFileStatus,
} from "./types";

const FILE_HEADER_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const OLD_FILE_RE = /^--- (?:a\/(.+)|\/dev\/null)$/;
const NEW_FILE_RE = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const RENAME_FROM_RE = /^rename from (.+)$/;
const RENAME_TO_RE = /^rename to (.+)$/;
const NEW_FILE_MODE_RE = /^new file mode/;
const DELETED_FILE_MODE_RE = /^deleted file mode/;
const SIMILARITY_RE = /^similarity index/;
const INDEX_RE = /^index /;
const BINARY_RE = /^Binary files/;

export function parseDiff(rawDiff: string): ParsedDiff {
  const lines = rawDiff.split("\n");
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let isNewFile = false;
  let isDeletedFile = false;
  let renameFrom: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff header
    const fileMatch = FILE_HEADER_RE.exec(line);
    if (fileMatch) {
      // Save previous file
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }

      currentFile = {
        path: fileMatch[2],
        status: "modified",
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      isNewFile = false;
      isDeletedFile = false;
      renameFrom = undefined;
      continue;
    }

    if (!currentFile) continue;

    // File metadata lines
    if (NEW_FILE_MODE_RE.test(line)) {
      isNewFile = true;
      currentFile.status = "added";
      continue;
    }
    if (DELETED_FILE_MODE_RE.test(line)) {
      isDeletedFile = true;
      currentFile.status = "deleted";
      continue;
    }
    if (
      SIMILARITY_RE.test(line) ||
      INDEX_RE.test(line) ||
      BINARY_RE.test(line)
    ) {
      continue;
    }

    const renameFromMatch = RENAME_FROM_RE.exec(line);
    if (renameFromMatch) {
      renameFrom = renameFromMatch[1];
      continue;
    }
    const renameToMatch = RENAME_TO_RE.exec(line);
    if (renameToMatch) {
      currentFile.status = "renamed";
      currentFile.oldPath = renameFrom;
      currentFile.path = renameToMatch[1];
      continue;
    }

    // Old/new file headers
    const oldMatch = OLD_FILE_RE.exec(line);
    if (oldMatch) {
      if (!oldMatch[1] && !isNewFile) {
        currentFile.status = "added";
      }
      continue;
    }
    const newMatch = NEW_FILE_RE.exec(line);
    if (newMatch) {
      if (!newMatch[1] && !isDeletedFile) {
        currentFile.status = "deleted";
      }
      if (newMatch[1]) currentFile.path = newMatch[1];
      continue;
    }

    // Hunk header
    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      if (currentHunk) currentFile.hunks.push(currentHunk);

      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);

      currentHunk = {
        header: line,
        oldStart: oldLine,
        oldCount: parseInt(hunkMatch[2] || "1", 10),
        newStart: newLine,
        newCount: parseInt(hunkMatch[4] || "1", 10),
        lines: [],
      };
      continue;
    }

    // Diff content lines
    if (currentHunk) {
      if (line.startsWith("+")) {
        const diffLine: DiffLine = {
          type: "add",
          content: line.slice(1),
          newLine: newLine++,
        };
        currentHunk.lines.push(diffLine);
        currentFile.additions++;
      } else if (line.startsWith("-")) {
        const diffLine: DiffLine = {
          type: "delete",
          content: line.slice(1),
          oldLine: oldLine++,
        };
        currentHunk.lines.push(diffLine);
        currentFile.deletions++;
      } else if (line.startsWith(" ")) {
        const diffLine: DiffLine = {
          type: "context",
          content: line.slice(1),
          oldLine: oldLine++,
          newLine: newLine++,
        };
        currentHunk.lines.push(diffLine);
      } else if (line === "\\ No newline at end of file") {
        // Ignore
      }
    }
  }

  // Push last file
  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return {
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
    totalFiles: files.length,
  };
}

/**
 * Build a compact diff string for a single file (for agent prompts).
 * Shows only added/deleted lines with line numbers.
 */
export function formatFileChanges(file: DiffFile): string {
  const lines: string[] = [`## ${file.path} (${file.status})`];
  for (const hunk of file.hunks) {
    lines.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix =
        line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
      const lineNum =
        line.type === "add"
          ? `L${line.newLine}`
          : line.type === "delete"
            ? `L${line.oldLine}`
            : "";
      lines.push(`${prefix}${lineNum ? `[${lineNum}]` : ""} ${line.content}`);
    }
  }
  return lines.join("\n");
}

/**
 * Truncate diff to fit within size limits.
 * Prioritizes source code files over config/docs.
 */
const SOURCE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|py|go|rs|java|rb|c|cpp|cs|php|swift|kt)$/;

export function truncateDiff(diff: ParsedDiff, maxSize: number): ParsedDiff {
  // Sort: source files first, then by number of changes (most changes first)
  const sorted = [...diff.files].sort((a, b) => {
    const aSource = SOURCE_EXTENSIONS.test(a.path) ? 0 : 1;
    const bSource = SOURCE_EXTENSIONS.test(b.path) ? 0 : 1;
    if (aSource !== bSource) return aSource - bSource;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });

  const kept: DiffFile[] = [];
  let size = 0;

  for (const file of sorted) {
    const fileSize = file.hunks.reduce(
      (s, h) => s + h.lines.reduce((ls, l) => ls + l.content.length + 5, 0),
      0,
    );
    if (size + fileSize > maxSize && kept.length > 0) break;
    kept.push(file);
    size += fileSize;
  }

  return {
    files: kept,
    totalAdditions: kept.reduce((s, f) => s + f.additions, 0),
    totalDeletions: kept.reduce((s, f) => s + f.deletions, 0),
    totalFiles: kept.length,
  };
}
