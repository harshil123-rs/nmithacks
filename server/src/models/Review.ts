import mongoose, { Schema, Document, Types } from "mongoose";

// --- Agent Report (subdocument) ---

export type AgentType =
  | "security"
  | "bugs"
  | "performance"
  | "readability"
  | "best-practices"
  | "documentation"
  | "ci-security"
  | "synthesizer"
  // Legacy types (kept for backward compatibility)
  | "testcov"
  | "perf"
  | "docs"
  | "summary"
  | "changelog"
  | "reviewer";

export type AgentStatus = "pending" | "running" | "completed" | "failed";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface IFinding {
  file: string;
  line: number;
  severity: FindingSeverity;
  message: string;
  suggestion: string;
}

export interface IAgentReport {
  agentType: AgentType;
  status: AgentStatus;
  findings: IFinding[];
  rawOutput: string;
  durationMs: number;
}

const findingSchema = new Schema<IFinding>(
  {
    file: { type: String, required: true },
    line: { type: Number, required: true },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low", "info"],
      required: true,
    },
    message: { type: String, required: true },
    suggestion: { type: String, default: "" },
  },
  { _id: false },
);

const agentReportSchema = new Schema<IAgentReport>(
  {
    agentType: {
      type: String,
      enum: [
        "security",
        "bugs",
        "performance",
        "readability",
        "best-practices",
        "documentation",
        "ci-security",
        "synthesizer",
        // Legacy
        "testcov",
        "perf",
        "docs",
        "summary",
        "changelog",
        "reviewer",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    findings: { type: [findingSchema], default: [] },
    rawOutput: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true },
);

// --- Review (top-level document) ---

export type OverallVerdict = "approve" | "request_changes" | "block";

export interface IReview extends Document {
  prId: Types.ObjectId;
  repoId: Types.ObjectId;
  localTitle: string;
  agentReports: IAgentReport[];
  overallVerdict: OverallVerdict;
  finalSummary: string;
  confidenceScore: number;
  githubCommentId: number;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    prId: {
      type: Schema.Types.ObjectId,
      ref: "PR",
      required: false,
      default: null,
      index: true,
    },
    repoId: {
      type: Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      index: true,
    },
    agentReports: { type: [agentReportSchema], default: [] },
    overallVerdict: {
      type: String,
      enum: ["approve", "request_changes", "block"],
      default: "approve",
    },
    finalSummary: { type: String, default: "" },
    confidenceScore: { type: Number, default: 0, min: 0, max: 100 },
    githubCommentId: { type: Number, default: 0 },
    localTitle: { type: String, default: "" },
  },
  { timestamps: true },
);

// Find reviews for a specific PR
reviewSchema.index({ prId: 1, createdAt: -1 });
// Find all reviews for a repo
reviewSchema.index({ repoId: 1, createdAt: -1 });

export const Review = mongoose.model<IReview>("Review", reviewSchema);
