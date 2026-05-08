/**
 * Shared types for the review agent pipeline.
 *
 * Flow: webhook → review.job.ts → diff-parser → context-builder →
 *       6 specialist agents (parallel) → synthesizer → GitHub PR review
 */
import type { CallLLMOptions } from "../../services/ai.service";

// ── Diff types ──

export type DiffLineType = "add" | "delete" | "context";
export type DiffFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string; // for renames
  status: DiffFileStatus;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

// ── Context types ──

export interface FileContext {
  path: string;
  content: string;
  summary?: string;
}

// ── Agent I/O ──

export interface AgentInput {
  diff: ParsedDiff;
  rawDiff: string;
  changedFiles: FileContext[];
  relatedFiles: FileContext[];
  conventions: string[];
  recentHistory: string[];
  repoMap: string;
  pr: {
    title: string;
    body: string;
    author: string;
    baseBranch: string;
    headBranch: string;
    prNumber: number;
  };
  repoFullName: string;
  llmOptions: CallLLMOptions;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AgentFinding {
  file: string;
  line?: number;
  severity: FindingSeverity;
  category: string;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
  /**
   * Stable rule identifier from the security rule library
   * (e.g. "workflow.unpinned-action-checkout"). Only set on findings produced
   * by the `ci-security` agent. Powers per-rule policy overrides + audit log.
   */
  ruleId?: string;
  /**
   * Policy decision attached to this finding. Only set on `ci-security`
   * findings. Determines whether the finding fails the GitHub Check Run
   * (block) or is reported but doesn't gate the merge (warn / info).
   */
  policyAction?: "block" | "warn" | "info";
}

export interface AgentOutput {
  agentType: string;
  findings: AgentFinding[];
  summary: string;
  durationMs: number;
  metadata?: Record<string, any>;
}

// ── Synthesizer output ──

export interface SynthesizerOutput {
  verdict: "approve" | "request_changes" | "comment";
  confidenceScore: number;
  summary: string;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  topActions: string[];
  inlineComments: Array<{
    file: string;
    line: number;
    body: string;
    agentSource: string;
  }>;
  changelog: {
    type: "feat" | "fix" | "perf" | "docs" | "chore" | "breaking";
    entry: string;
    isBreaking: boolean;
  };
  durationMs: number;
}

// ── Agent registry ──

export const AGENT_TYPES = [
  "security",
  "bugs",
  "performance",
  "readability",
  "best-practices",
  "documentation",
  "ci-security",
] as const;

export type ReviewAgentType = (typeof AGENT_TYPES)[number];

// Maps focus area names (from Repo.settings.focusAreas) to agent types
export const FOCUS_AREA_TO_AGENT: Record<string, ReviewAgentType> = {
  security: "security",
  bugs: "bugs",
  performance: "performance",
  readability: "readability",
  "best-practices": "best-practices",
  documentation: "documentation",
  "ci-security": "ci-security",
};

export const AGENT_TIMEOUT_MS = 180_000; // 3 minutes per agent
export const MAX_DIFF_SIZE = 50 * 1024; // 50KB diff limit before truncation
export const MAX_CONTEXT_FILES = 10; // max related files from repo map
