import mongoose, { Schema, Document, Types } from "mongoose";

export type IndexStatus = "idle" | "indexing" | "ready" | "failed";

export interface IStoredDefinition {
  path: string;
  name: string;
  line: number;
  kind: string;
  pageRankScore: number;
}

export interface IStoredEdge {
  source: string;
  target: string;
  weight: number;
}

export interface IRepoContext extends Document {
  repoId: Types.ObjectId;
  repoMap: string;
  fileTree: string[];
  definitions: IStoredDefinition[];
  graphEdges: IStoredEdge[];
  conventions: string[];
  recentHistory: string[];
  recentChangedFiles: string[];
  lastIndexedAt: Date | null;
  indexStatus: IndexStatus;
  createdAt: Date;
  updatedAt: Date;
}

const storedDefinitionSchema = new Schema<IStoredDefinition>(
  {
    path: { type: String, required: true },
    name: { type: String, required: true },
    line: { type: Number, required: true },
    kind: { type: String, required: true },
    pageRankScore: { type: Number, default: 0 },
  },
  { _id: false },
);

const storedEdgeSchema = new Schema<IStoredEdge>(
  {
    source: { type: String, required: true },
    target: { type: String, required: true },
    weight: { type: Number, required: true },
  },
  { _id: false },
);

const repoContextSchema = new Schema<IRepoContext>(
  {
    repoId: {
      type: Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      unique: true,
      index: true,
    },
    repoMap: { type: String, default: "" },
    fileTree: { type: [String], default: [] },
    definitions: { type: [storedDefinitionSchema], default: [] },
    graphEdges: { type: [storedEdgeSchema], default: [] },
    conventions: { type: [String], default: [] },
    recentHistory: { type: [String], default: [] },
    recentChangedFiles: { type: [String], default: [] },
    lastIndexedAt: { type: Date, default: null },
    indexStatus: {
      type: String,
      enum: ["idle", "indexing", "ready", "failed"],
      default: "idle",
    },
  },
  { timestamps: true },
);

export const RepoContext = mongoose.model<IRepoContext>(
  "RepoContext",
  repoContextSchema,
);
