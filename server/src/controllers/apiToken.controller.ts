/**
 * API Token CRUD — `/security/tokens/*`.
 *
 * Authed by the standard user JWT (these endpoints are how a user *creates*
 * a machine token; the machine token itself is used elsewhere).
 *
 * The plaintext token is returned exactly once on create and never again —
 * same as GitHub PATs. We store only the SHA-256 hash.
 */
import type { Request, Response } from "express";
import { ApiToken, generateApiToken, type ApiTokenScope } from "../models/ApiToken";

const ALLOWED_SCOPES: ApiTokenScope[] = ["pipeline:read"];

export async function createApiToken(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { name, scopes, expiresInDays } = req.body as {
    name?: string;
    scopes?: string[];
    expiresInDays?: number;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    res.status(400).json({ error: "scopes is required (at least one)" });
    return;
  }
  for (const s of scopes) {
    if (!ALLOWED_SCOPES.includes(s as ApiTokenScope)) {
      res.status(400).json({ error: `Unknown scope: ${s}` });
      return;
    }
  }

  const { plaintext, hash, prefix } = generateApiToken();
  const doc = await ApiToken.create({
    userId,
    name: name.trim(),
    scopes: scopes as ApiTokenScope[],
    tokenHash: hash,
    prefix,
    expiresAt:
      typeof expiresInDays === "number" && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
  });

  // Return the plaintext exactly once. After this response the user has no
  // way to retrieve it from the server — they must save it now.
  res.status(201).json({
    id: doc._id,
    name: doc.name,
    scopes: doc.scopes,
    prefix: doc.prefix,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    token: plaintext,
    warning:
      "This is the only time the full token will be shown. Save it in your GitHub Secrets now.",
  });
}

export async function listApiTokens(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const tokens = await ApiToken.find({ userId, revoked: false })
    .select("-tokenHash")
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    tokens: tokens.map((t) => ({
      id: t._id,
      name: t.name,
      scopes: t.scopes,
      prefix: t.prefix,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt,
    })),
  });
}

export async function revokeApiToken(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
  const token = await ApiToken.findOne({ _id: id, userId });
  if (!token) {
    res.status(404).json({ error: "Token not found" });
    return;
  }
  if (token.revoked) {
    res.json({ ok: true, alreadyRevoked: true });
    return;
  }
  token.revoked = true;
  token.revokedAt = new Date();
  await token.save();
  res.json({ ok: true });
}
