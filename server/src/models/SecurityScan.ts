/**
 * SecurityScan — one document per security scan execution.
 *
 * Why we persist this instead of relying on BullMQ history: BullMQ trims
 * completed jobs (defaultJobOptions.removeOnComplete=100), but customers
 * need a permanent record of "when did we last scan this repo, what did
 * we find, was it clean?". The Security tab's "Recent scans" table reads
 * from this collection.
 *
 * One row per scan execution, regardless of trigger (push, schedule,
 * manual, workflow_run). Findings discovered are written to
 * SecurityAuditLog with `scanId` set to this doc's `_id`.
 */
import mongoose, { Schema, Document, Types } from "mongoose";

export type ScanTrigger =
  | "push"
  | "schedule"
  | "manual"
  | "workflow_run"
  | "enrollment"
  | "pr-review";
export type ScanState = "queued" | "running" | "complete" | "failed";

export interface ISecurityScan extends Document {
  monitorId: Types.ObjectId;
  repoId: Types.ObjectId;
  trigger: ScanTrigger;
  /** Commit SHA the scan was run against. */
  headSha: string;
  state: ScanState;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  /** Whether this scan computed a `halt: true` decision (any block-action finding). */
  halt: boolean;
  /** Counts produced by the scan, for the dashboard list view. */
  counts: {
    total: number;
    block: number;
    warn: number;
    info: number;
    new: number; // findings that didn't exist in the previous scan
    resolved: number; // findings from previous scan that didn't reappear
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  };
  /** How many CI-relevant files were scanned. */
  filesScanned: number;
  /** Truncated error message if state === "failed". */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const securityScanSchema = new Schema<ISecurityScan>(
  {
    monitorId: {
      type: Schema.Types.ObjectId,
      ref: "SecurityMonitor",
      required: true,
      index: true,
    },
    repoId: {
      type: Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ["push", "schedule", "manual", "workflow_run", "enrollment", "pr-review"],
      required: true,
    },
    headSha: { type: String, required: true, index: true },
    state: {
      type: String,
      enum: ["queued", "running", "complete", "failed"],
      default: "queued",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationMs: { type: Number },
    halt: { type: Boolean, default: false },
    counts: {
      total: { type: Number, default: 0 },
      block: { type: Number, default: 0 },
      warn: { type: Number, default: 0 },
      info: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      bySeverity: {
        critical: { type: Number, default: 0 },
        high: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        low: { type: Number, default: 0 },
        info: { type: Number, default: 0 },
      },
    },
    filesScanned: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true },
);

// Compound: list scans for a repo, newest first
securityScanSchema.index({ repoId: 1, startedAt: -1 });

export const SecurityScan = mongoose.model<ISecurityScan>(
  "SecurityScan",
  securityScanSchema,
);
