import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPRAuthor {
  login: string;
  avatarUrl: string;
}

export type PRStatus = "pending" | "reviewing" | "reviewed";

export interface IPR extends Document {
  repoId: Types.ObjectId;
  prNumber: number;
  title: string;
  body: string;
  author: IPRAuthor;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  diffUrl: string;
  status: PRStatus;
  githubPRId: number;
  githubCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const prAuthorSchema = new Schema<IPRAuthor>(
  {
    login: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
  },
  { _id: false },
);

const prSchema = new Schema<IPR>(
  {
    repoId: {
      type: Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      index: true,
    },
    prNumber: { type: Number, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    author: { type: prAuthorSchema, required: true },
    headSha: { type: String, required: true },
    baseBranch: { type: String, required: true },
    headBranch: { type: String, required: true },
    diffUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "reviewing", "reviewed"],
      default: "pending",
      index: true,
    },
    githubPRId: { type: Number, required: true },
    githubCreatedAt: { type: Date },
  },
  { timestamps: true },
);

// Compound index: quickly find PRs for a repo, or a specific PR by repo + number
prSchema.index({ repoId: 1, prNumber: 1 }, { unique: true });
// Find pending PRs across all repos — sort by GitHub creation date
prSchema.index({ status: 1, githubCreatedAt: -1 });

export const PR = mongoose.model<IPR>("PR", prSchema);
