/**
 * ApiToken — long-lived bearer tokens for machine-to-machine auth.
 *
 * Used today by the LGTM Security runtime Action (lgtm-action). The Action
 * lives in customer CI runners, so it can't carry a user JWT. Customers
 * generate a token from the Settings UI and stuff it into a GitHub Secret.
 *
 * Storage: we store only a SHA-256 hash of the token. The plaintext is shown
 * exactly once when generated. If the user loses it, they revoke + create a
 * new one — same as GitHub PATs.
 *
 * Scopes (just one for now; structure for future growth):
 *   - "pipeline:read" — authorizes GET /pipeline/decision
 */
import mongoose, { Schema, Document, Types } from "mongoose";
import crypto from "crypto";

export type ApiTokenScope = "pipeline:read";

export interface IApiToken extends Document {
  userId: Types.ObjectId;
  /** Human-readable label set by the user, e.g. "lgtm-action prod". */
  name: string;
  /** Scopes this token is authorized for. */
  scopes: ApiTokenScope[];
  /** SHA-256 hex of the plaintext token. Plaintext never persists. */
  tokenHash: string;
  /** First 8 chars of the plaintext, shown in the UI for identification. */
  prefix: string;
  /** Last time the token was used (best-effort, updated on each request). */
  lastUsedAt?: Date;
  /** Optional expiry; null/undefined = never. */
  expiresAt?: Date;
  /** True if the user revoked this token. We keep the row for audit. */
  revoked: boolean;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const apiTokenSchema = new Schema<IApiToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    scopes: {
      type: [String],
      enum: ["pipeline:read"],
      required: true,
      validate: (v: string[]) => Array.isArray(v) && v.length > 0,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    prefix: { type: String, required: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revoked: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

apiTokenSchema.index({ userId: 1, revoked: 1, createdAt: -1 });

export const ApiToken = mongoose.model<IApiToken>("ApiToken", apiTokenSchema);

/** ---- helpers (kept here so the model owns the token format) ---------- */

const TOKEN_PREFIX = "lgtm_pat_";
const TOKEN_BYTES = 24; // 24 random bytes → 32 chars base64url

/**
 * Generate a fresh plaintext token + its hash. Plaintext should be returned
 * to the caller exactly once; only the hash is stored.
 */
export function generateApiToken(): { plaintext: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  const hash = hashApiToken(plaintext);
  // Prefix shown in the UI: "lgtm_pat_AbCdEf…" — the first 8 chars after the
  // family prefix. Distinguishable across a user's token list without
  // leaking enough material to brute-force.
  const prefix = plaintext.slice(0, TOKEN_PREFIX.length + 8);
  return { plaintext, hash, prefix };
}

export function hashApiToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Constant-time comparison helper to keep the token-lookup auth honest. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
