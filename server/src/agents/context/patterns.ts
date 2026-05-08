/**
 * Pattern Extractor Agent
 *
 * Samples representative files from the repo, sends them to the LLM,
 * and extracts coding conventions, patterns, and anti-patterns.
 * Stores results in RepoContext.conventions[].
 */
import { githubAppFetch } from "../../utils/github";
import { callLLM, type CallLLMOptions } from "../../services/ai.service";
import { RepoContext } from "../../models/RepoContext";
import type { Types } from "mongoose";

const MAX_SAMPLE_FILES = 20;
const MAX_FILE_CONTENT = 4000; // chars per file to send to LLM

// Prioritize files that reveal patterns
const PRIORITY_PATTERNS = [
  /\.ts$/,
  /\.tsx$/,
  /\.js$/,
  /\.jsx$/,
  /\.py$/,
  /\.go$/,
  /\.rs$/,
  /\.java$/,
  /\.rb$/,
];

// Files that often reveal project conventions
const HIGH_VALUE_PATTERNS = [
  /eslint/i,
  /prettier/i,
  /tsconfig/i,
  /jest\.config/i,
  /vitest\.config/i,
  /\.editorconfig/i,
  /Makefile$/,
  /Dockerfile$/,
  /docker-compose/i,
];

export interface PatternOptions {
  repoFullName: string;
  headSha: string;
  installationToken: string;
  repoId: Types.ObjectId;
  llmOptions: CallLLMOptions;
}

export interface PatternResult {
  conventions: string[];
  filesAnalyzed: number;
  durationMs: number;
}

export async function runPatternExtractor(
  opts: PatternOptions,
): Promise<PatternResult> {
  const start = Date.now();

  // 1. Fetch file tree
  const treeRes = await githubAppFetch(
    `/repos/${opts.repoFullName}/git/trees/${opts.headSha}?recursive=1`,
    opts.installationToken,
  );

  if (!treeRes.ok) {
    throw new Error(`Failed to fetch tree: ${treeRes.status}`);
  }

  const treeData = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; size?: number }>;
  };

  const blobs = treeData.tree.filter(
    (e) =>
      e.type === "blob" &&
      !e.path.includes("node_modules") &&
      !e.path.includes(".git/"),
  );

  // 2. Select representative sample
  // High-value config files first
  const highValue = blobs.filter((f) =>
    HIGH_VALUE_PATTERNS.some((p) => p.test(f.path)),
  );

  // Then source code files, sorted by size (prefer medium-sized files)
  const sourceFiles = blobs
    .filter((f) => PRIORITY_PATTERNS.some((p) => p.test(f.path)))
    .sort((a, b) => {
      // Prefer files between 500-5000 bytes (likely to have meaningful patterns)
      const scoreA = a.size ? Math.abs(a.size - 2000) : 10000;
      const scoreB = b.size ? Math.abs(b.size - 2000) : 10000;
      return scoreA - scoreB;
    });

  // Combine: config files + diverse source files
  const selected = [
    ...highValue.slice(0, 5),
    ...sourceFiles.slice(0, MAX_SAMPLE_FILES - Math.min(highValue.length, 5)),
  ].slice(0, MAX_SAMPLE_FILES);

  console.log(
    `[Patterns] ${opts.repoFullName}: sampling ${selected.length} files`,
  );

  // 3. Fetch content for selected files (with rate limiting)
  const fileContents: Array<{ path: string; content: string }> = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < selected.length; i++) {
    const file = selected[i];
    // Rate limit: small delay every 5 files
    if (i > 0 && i % 5 === 0) await sleep(200);
    try {
      const res = await githubAppFetch(
        `/repos/${opts.repoFullName}/contents/${encodeURIComponent(file.path)}?ref=${opts.headSha}`,
        opts.installationToken,
        { headers: { Accept: "application/vnd.github.raw+json" } },
      );
      if (res.ok) {
        const content = await res.text();
        fileContents.push({
          path: file.path,
          content: content.slice(0, MAX_FILE_CONTENT),
        });
      }
    } catch {
      // Skip files that fail to fetch
    }
  }

  // 4. Send to LLM for pattern extraction with structured output schema
  const filesBlock = fileContents
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const prompt = `Analyze these ${fileContents.length} files from a codebase. Extract exactly one convention per slot. Each convention must be a SEPARATE short string (under 30 words). Do NOT merge multiple observations.

Fill ALL 10 slots:
1. Variable/function naming convention
2. Component/class naming convention
3. File naming convention
4. Error handling approach
5. Test framework and test file organization
6. Primary UI framework/library and component structure
7. State management approach
8. Import style (named vs default, aliases, barrel exports)
9. Code organization pattern (folder structure, separation of concerns)
10. One anti-pattern or inconsistency noticed

If a category has no evidence, write "No evidence found" for that slot.

${filesBlock}`;

  // Build provider-specific response schema
  // Gemini: supports top-level array with minItems/maxItems
  // OpenAI: requires root object, no minItems/maxItems support
  const isOpenAI = opts.llmOptions.provider === "openai";

  const conventionItemSchema = {
    type: "string" as const,
    description:
      "A single coding convention observed in the codebase, under 30 words.",
  };

  const responseSchema = isOpenAI
    ? {
        type: "object" as const,
        properties: {
          conventions: {
            type: "array" as const,
            items: conventionItemSchema,
            description: "Exactly 10 coding conventions, one per category.",
          },
        },
        required: ["conventions"],
        additionalProperties: false,
      }
    : {
        // Gemini: top-level array with minItems/maxItems enforcement
        type: "array" as const,
        items: conventionItemSchema,
        minItems: 10,
        maxItems: 10,
        description: "Exactly 10 coding conventions, one per category.",
      };

  const res = await callLLM(prompt, {
    ...opts.llmOptions,
    systemPrompt:
      "You are a senior code reviewer. Return exactly 10 short convention strings. One per category. Do NOT combine multiple conventions into one string.",
    maxTokens: 2000,
    temperature: 0.2,
    responseSchema,
  });

  // 5. Parse conventions (structured output guarantees valid JSON)
  let conventions: string[] = [];
  try {
    const cleaned = res.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      // Gemini returns a top-level array
      conventions = parsed;
    } else if (parsed.conventions && Array.isArray(parsed.conventions)) {
      // OpenAI returns { conventions: [...] }
      conventions = parsed.conventions;
    } else {
      conventions = [String(parsed)];
    }
  } catch {
    // Fallback: split by newlines if JSON parse somehow fails
    conventions = res.content
      .split("\n")
      .map((l) => l.replace(/^[-*\d.]\s*/, "").trim())
      .filter((l) => l.length > 10);
  }

  // Filter out "No evidence found" placeholders
  conventions = conventions.filter(
    (c) => !c.toLowerCase().includes("no evidence found"),
  );

  // 6. Store in RepoContext
  let ctx = await RepoContext.findOne({ repoId: opts.repoId });
  if (!ctx) {
    ctx = new RepoContext({ repoId: opts.repoId });
  }
  ctx.conventions = conventions;
  await ctx.save();

  return {
    conventions,
    filesAnalyzed: fileContents.length,
    durationMs: Date.now() - start,
  };
}
