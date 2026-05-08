import mongoose, { Schema, Document, Types } from "mongoose";

export type NotificationType =
  | "review_complete"
  | "ai_approved"
  | "critical_security"
  | "review_failed";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  message: string;
  reviewId?: Types.ObjectId;
  prId?: Types.ObjectId;
  prNumber?: number;
  repoFullName?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "review_complete",
        "ai_approved",
        "critical_security",
        "review_failed",
      ],
      required: true,
    },
    message: { type: String, required: true },
    reviewId: { type: Schema.Types.ObjectId, ref: "Review" },
    prId: { type: Schema.Types.ObjectId, ref: "PR" },
    prNumber: { type: Number },
    repoFullName: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);
