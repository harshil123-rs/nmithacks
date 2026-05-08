/**
 * SecurityMonitor — per-repo enrollment in LGTM Security.
 *
 * Enrollment is independent of `Repo` review-connection state. A repo can be
 * connected for review without being enrolled in Security, and vice versa.
 * The two surfaces share the `Repo` document but not enrollment state.
 *
 * Plan tier gating: free = 1 enrolled repo, pro = unlimited. Enforced at the
 * enroll endpoint (see `security.controller.ts`).
 */
import mongoose, { Schema, Document, Types } from "mongoose";
import {
  DEFAULT_POLICY,
  POLICY_VERSION,
  type SecurityPolicy,
  type PolicyAllowlist,
  type PolicyRule,
} from "../security/default-policy";

export type MonitorStatus = "active" | "paused";

export interface ISecurityMonitor extends Document {
  repoId: Types.ObjectId;
  enabledBy: Types.ObjectId; // User who enrolled the repo
  enabledAt: Date;
  status: MonitorStatus;
  policy: SecurityPolicy;
  /** Last time a scan completed for this monitor (any trigger). */
  lastScanAt?: Date;
  /** Last time a scan completed cleanly (no findings). */
  lastCleanAt?: Date;
  /**
   * Reserved for v1.1: per-repo audit log retention override (days).
   * Not currently exposed in the UI.
   */
  retentionDays?: number;
  /** Notification preferences. Email/in-app on by default; webhooks come later. */
  notify: {
    onBlock: boolean;
    onWarn: boolean;
    inApp: boolean;
    email: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const policyRuleSchema = new Schema<PolicyRule>(
  {
    action: {
      type: String,
      enum: ["block", "warn", "off"],
      required: true,
    },
    severityOverride: {
      type: String,
      enum: ["critical", "high", "medium", "low", "info"],
    },
  },
  { _id: false },
);

const policyAllowlistSchema = new Schema<PolicyAllowlist>(
  {
    actions: { type: [String], default: [] },
    domains: { type: [String], default: [] },
    runners: { type: [String], default: [] },
  },
  { _id: false },
);

const securityPolicySchema = new Schema<SecurityPolicy>(
  {
    policyVersion: { type: Number, default: POLICY_VERSION },
    // `rules` is a Record<RuleId, PolicyRule>; Mongoose Mixed lets us store
    // it as a free-form map without enumerating every key here. The
    // resolveRuleAction helper validates lookups at runtime.
    rules: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_POLICY.rules }) },
    allowlist: { type: policyAllowlistSchema, default: () => ({ ...DEFAULT_POLICY.allowlist }) },
  },
  { _id: false },
);

const securityMonitorSchema = new Schema<ISecurityMonitor>(
  {
    repoId: {
      type: Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      unique: true, // one monitor per repo
      index: true,
    },
    enabledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enabledAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
      index: true,
    },
    policy: { type: securityPolicySchema, default: () => ({ ...DEFAULT_POLICY }) },
    lastScanAt: { type: Date },
    lastCleanAt: { type: Date },
    retentionDays: { type: Number },
    notify: {
      onBlock: { type: Boolean, default: true },
      onWarn: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

// Compound index for the dashboard query "all my enrolled repos"
securityMonitorSchema.index({ enabledBy: 1, status: 1 });

export const SecurityMonitor = mongoose.model<ISecurityMonitor>(
  "SecurityMonitor",
  securityMonitorSchema,
);
