/**
 * Context Builder
 *
 * Assembles the AgentInput for review agents by:
 * 1. Fetching full content of changed files
 * 2. Re-ranking repo map with PR-specific personalization (PageRank)
 * 3. Loading conventions + recent history from RepoContext
 *
 * No embeddings, no vector search — uses the dependency graph directly.
 */
import { githubAppFetch } from "../../utils/github";
import { RepoContext } from "../../models/RepoContext";
import { runPageRank, generateRepoMap } from "../context/indexer";
import type { Types } from "mongoose";
import type { ParsedDiff, FileContext } from "./types";

const MAX_FILE_CONTENT = 15_000; // chars per file
const MAX_RELATED_FILES = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ContextBuilderOptions {
  repoId: Types.ObjectId;
  repoFullName: string;
  headSha: string;
  installationToken: string;
}

export interface BuiltContext {
  changedFiles: FileContext[];
  relatedFiles: FileContext[];
  conventions: string[];
  recentHistory: string[];
  personalizedRepoMap: string;
}

export async function buildReviewContext(
  diff: ParsedDiff,
  opts: ContextBuilderOptions,
): Promise<BuiltContext> {
  // 1. Load RepoContext
  const repoCtx = await RepoContext.findOne({ repoId: opts.repoId });
  const conventions = repoCtx?.conventions || [];
  const recentHistory = repoCtx?.recentHistory || [];

  // 2. Fetch full content of changed files
  const changedFiles = await fetchChangedFiles(diff, opts);

  // 3. Generate personalized repo map + find related files
  let personalizedRepoMap = repoCtx?.repoMap || "";
  let relatedFiles: FileContext[] = [];

  if (repoCtx && repoCtx.graphEdges.length > 0) {
    const changedPaths = diff.files.map((f) => f.path);

    // Re-run PageRank with changed files as personalization
    const ranks = runPageRank(
      repoCtx.graphEdges,
      repoCtx.fileTree,
      changedPaths,
    );

    // Sort by personalized rank
    const rankedFiles = [...repoCtx.fileTree].sort((a, b) => {
      return (ranks.get(b) || 0) - (ranks.get(a) || 0);
    });

    // Generate personalized map
    personalizedRepoMap = generateRepoMap(
      rankedFiles,
      repoCtx.definitions,
      4096,
    );

    // Find top related files (not in the diff) for fetching full content
    const changedSet = new Set(changedPaths);
    const topRelated = rankedFiles
      .filter((f) => !changedSet.has(f))
      .slice(0, MAX_RELATED_FILES);

    // Fetch content for related files
    relatedFiles = await fetchRelatedFiles(topRelated, opts);
  }

  return {
    changedFiles,
    relatedFiles,
    conventions,
    recentHistory,
    personalizedRepoMap,
  };
}

/**
 * Fetch the full content of each changed file from GitHub.
 */
async function fetchChangedFiles(
  diff: ParsedDiff,
  opts: ContextBuilderOptions,
): Promise<FileContext[]> {
  const files: FileContext[] = [];
  const filesToFetch = diff.files.filter((f) => f.status !== "deleted");

  const BATCH_SIZE = 5;
  for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(200);
    const batch = filesToFetch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const res = await githubAppFetch(
          `/repos/${opts.repoFullName}/contents/${encodeURIComponent(file.path)}?ref=${opts.headSha}`,
          opts.installationToken,
          { headers: { Accept: "application/vnd.github.raw+json" } },
        );
        if (!res.ok) return null;
        const content = await res.text();
        return {
          path: file.path,
          content: content.slice(0, MAX_FILE_CONTENT),
        } as FileContext;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        files.push(r.value);
      }
    }
  }

  return files;
}

/**
 * Fetch content for related files identified by PageRank.
 */
async function fetchRelatedFiles(
  filePaths: string[],
  opts: ContextBuilderOptions,
): Promise<FileContext[]> {
  if (filePaths.length === 0) return [];

  const relatedFiles: FileContext[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    if (i > 0 && i % 5 === 0) await sleep(200);
    try {
      const res = await githubAppFetch(
        `/repos/${opts.repoFullName}/contents/${encodeURIComponent(filePaths[i])}?ref=${opts.headSha}`,
        opts.installationToken,
        { headers: { Accept: "application/vnd.github.raw+json" } },
      );
      if (res.ok) {
        const content = await res.text();
        relatedFiles.push({
          path: filePaths[i],
          content: content.slice(0, MAX_FILE_CONTENT),
        });
      }
    } catch {
      // Skip failed fetches
    }
  }

  return relatedFiles;
}
