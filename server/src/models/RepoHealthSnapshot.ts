import mongoose, { Schema, Document } from 'mongoose';

export interface IRepoHealthSnapshot extends Document {
  repoId:            mongoose.Types.ObjectId;
  score:             number;
  signals: {
    coupling:   { gini: number; normalized: number };
    churnRisk:  { hotFileCount: number; normalized: number };
    debt:       { weightedTotal: number; avgPerPR: number; normalized: number };
    confidence: { rollingAvg: number; normalized: number };
  };
  hotFiles:          string[];
  totalDefinitions:  number;
  totalFiles:        number;
  prCount:           number;
  computedAt:        Date;
}

const RepoHealthSnapshotSchema = new Schema<IRepoHealthSnapshot>({
  repoId:           { type: Schema.Types.ObjectId, ref: 'Repo', required: true },
  score:            { type: Number, required: true, min: 0, max: 100 },
  signals: {
    coupling:   { gini: Number, normalized: Number },
    churnRisk:  { hotFileCount: Number, normalized: Number },
    debt:       { weightedTotal: Number, avgPerPR: Number, normalized: Number },
    confidence: { rollingAvg: Number, normalized: Number },
  },
  hotFiles:         [{ type: String }],
  totalDefinitions: { type: Number, default: 0 },
  totalFiles:       { type: Number, default: 0 },
  prCount:          { type: Number, default: 0 },
  computedAt:       { type: Date, default: Date.now },
}, { timestamps: false });

RepoHealthSnapshotSchema.index({ repoId: 1, computedAt: -1 });

export default mongoose.model<IRepoHealthSnapshot>(
  'RepoHealthSnapshot', RepoHealthSnapshotSchema
);
