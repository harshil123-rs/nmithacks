/**
 * SecurityAuditLog — immutable record of every security finding.
 *
 * Three ingest paths share this collection (per STEP-0 decisions):
 *   - source: "pr-review"  ← PR-side ci-security agent (review.job.ts)
 *   - source: "monitor"    ← scheduled / push-triggered scans (Step 4)
 *   - source: "runtime"    ← runtime halt Action (Step 6)
 *
 * Schema-level immutability: pre-update hooks reject any `$set` touching
 * the security-relevant fields. Resolution fields (`resolvedAt`,
 * `resolution`, `resolvedBy`) remain mutable so users can mark findings
 * as fixed or false-positive.
 */
import mongoose, { Schema, Document, Types } from "mongoose";

export type AuditSource = "pr-review" | "monitor" | "runtime";
export type AuditDetector = "regex" | "yaml-ast" | "dockerfile" | "lockfile" | "llm";
export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AuditPolicyAction = "block" | "warn" | "info";
export type AuditResolution = "fixed" | "muted" | "false-positive";

export interface ISecurityAuditLog extends Document {
  monitorId: Types.ObjectId;
  repoId: Types.ObjectId;
  source: AuditSource;
  /** Reference to a SecurityScan doc when source === "monitor". */
  scanId?: Types.ObjectId;
  /** Reference to a Review doc when source === "pr-review". */
  reviewId?: Types.ObjectId;
  /** PR number when source === "pr-review". */
  prNumber?: number;
  ruleId: string;
  category: string;
  severity: AuditSeverity;
  policyAction: AuditPolicyAction;
  message: string;
  suggestion: string;
  file: string;
  line?: number;
  codeSnippet?: string;
  headSha: string;
  detectedBy: AuditDetector;
  detectedAt: Date;
  // Mutable resolution fields
  resolvedAt?: Date;
  resolution?: AuditResolution;
  resolvedBy?: Types.ObjectId;
  resolvedNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields that must never change after insert. */
const IMMUTABLE_FIELDS = [
  "monitorId",
  "repoId",
  "source",
  "scanId",
  "reviewId",
  "prNumber",
  "ruleId",
  "category",
  "severity",
  "policyAction",
  "message",
  "suggestion",
  "file",
  "line",
  "codeSnippet",
  "headSha",
  "detectedBy",
  "detectedAt",
] as const;

const securityAuditLogSchema = new Schema<ISecurityAuditLog>(
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
    source: {
      type: String,
      enum: ["pr-review", "monitor", "runtime"],
      required: true,
      index: true,
    },
    scanId: { type: Schema.Types.ObjectId, ref: "SecurityScan" },
    reviewId: { type: Schema.Types.ObjectId, ref: "Review" },
    prNumber: { type: Number },
    ruleId: { type: String, required: true, index: true },
    category: { type: String, required: true },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low", "info"],
      required: true,
      index: true,
    },
    policyAction: {
      type: String,
      enum: ["block", "warn", "info"],
      required: true,
    },
    message: { type: String, required: true },
    suggestion: { type: String, default: "" },
    file: { type: String, required: true },
    line: { type: Number },
    codeSnippet: { type: String },
    headSha: { type: String, required: true, index: true },
    detectedBy: {
      type: String,
      enum: ["regex", "yaml-ast", "dockerfile", "lockfile", "llm"],
      required: true,
    },
    detectedAt: { type: Date, default: Date.now, required: true, index: true },
    resolvedAt: { type: Date },
    resolution: {
      type: String,
      enum: ["fixed", "muted", "false-positive"],
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedNote: { type: String },
  },
  { timestamps: true },
);

// Compound indexes for common queries
securityAuditLogSchema.index({ repoId: 1, detectedAt: -1 });
securityAuditLogSchema.index({ monitorId: 1, severity: 1, resolvedAt: 1 });
securityAuditLogSchema.index({ ruleId: 1, repoId: 1 });

// ---- immutability enforcement --------------------------------------------

function rejectImmutableUpdate(update: any): Error | null {
  if (!update || typeof update !== "object") return null;
  // Inspect both top-level fields and $set fields.
  const setBlock = update.$set ?? update;
  for (const field of IMMUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(setBlock, field)) {
      return new Error(
        `SecurityAuditLog: field '${field}' is immutable and cannot be modified`,
      );
    }
  }
  // Also reject explicit $unset of immutable fields.
  if (update.$unset) {
    for (const field of IMMUTABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(update.$unset, field)) {
        return new Error(
          `SecurityAuditLog: field '${field}' is immutable and cannot be unset`,
        );
      }
    }
  }
  return null;
}

securityAuditLogSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function (next) {
  const update = this.getUpdate();
  const err = rejectImmutableUpdate(update);
  if (err) return next(err);
  next();
});

securityAuditLogSchema.pre("save", function (next) {
  // Only allow modifications to the resolution fields after the first save.
  if (this.isNew) return next();
  const allowedMutable = new Set([
    "resolvedAt",
    "resolution",
    "resolvedBy",
    "resolvedNote",
    "updatedAt",
  ]);
  const modified = this.modifiedPaths();
  for (const path of modified) {
    if (!allowedMutable.has(path)) {
      return next(
        new Error(
          `SecurityAuditLog: field '${path}' is immutable and cannot be modified`,
        ),
      );
    }
  }
  next();
});

export const SecurityAuditLog = mongoose.model<ISecurityAuditLog>(
  "SecurityAuditLog",
  securityAuditLogSchema,
);
