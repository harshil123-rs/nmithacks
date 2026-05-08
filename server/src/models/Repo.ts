import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRepoSettings {
  autoReview: boolean;
  focusAreas: string[];
  aiProvider?: string;
  aiModel?: string;
  prChat?: boolean;
  allowedCommands?: string[];
  dailyChatLimit?: number;
}

export interface IRepo extends Document {
  owner: string;
  name: string;
  fullName: string;
  githubRepoId: number;
  connectedBy: Types.ObjectId;
  webhookId: number;
  settings: IRepoSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const repoSettingsSchema = new Schema(
  {
    autoReview: { type: Boolean, default: true },
    focusAreas: {
      type: [String],
      default: [
        "bugs",
        "security",
        "performance",
        "readability",
        "best-practices",
        "documentation",
      ],
    },
    aiProvider: { type: String },
    aiModel: { type: String },
    prChat: { type: Boolean, default: false },
    allowedCommands: {
      type: [String],
      default: ["explain", "fix", "improve", "test"],
    },
    dailyChatLimit: { type: Number, default: 50 },
  },
  { _id: false },
);

const repoSchema = new Schema<IRepo>(
  {
    owner: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true, index: true },
    githubRepoId: { type: Number, required: true, unique: true },
    connectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    webhookId: { type: Number, required: true },
    settings: { type: repoSettingsSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Compound index for quick lookups
repoSchema.index({ connectedBy: 1, isActive: 1 });

export const Repo = mongoose.model<IRepo>("Repo", repoSchema);
