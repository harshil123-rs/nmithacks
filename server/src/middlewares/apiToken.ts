/**
 * Auth middleware for long-lived API tokens (machine-to-machine).
 *
 * Distinct from `authMiddleware` (user JWT) because:
 *   - Tokens never expire on a clock — only on explicit revoke.
 *   - The principal isn't a user session; it's a service identity owned by
 *     the user.
 *   - We attach the resolved User model to req for downstream handlers
 *     because most consumers need it (we don't want every endpoint to
 *     re-load the User).
 *
 * Wire under `/pipeline/*` and any future M2M endpoints.
 */
import type { Request, Response, NextFunction } from "express";
import { ApiToken, hashApiToken, type ApiTokenScope } from "../models/ApiToken";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireApiToken when the request is authenticated by an API token. */
      apiToken?: {
        id: string;
        userId: string;
        scopes: ApiTokenScope[];
      };
    }
  }
}

export function requireApiToken(scope: ApiTokenScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing API token" });
      return;
    }
    const plaintext = header.slice("Bearer ".length).trim();
    if (!plaintext.startsWith("lgtm_pat_")) {
      res.status(401).json({ error: "Invalid token format" });
      return;
    }
    const hash = hashApiToken(plaintext);
    const token = await ApiToken.findOne({ tokenHash: hash });
    if (!token || token.revoked) {
      res.status(401).json({ error: "Invalid or revoked token" });
      return;
    }
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ error: "Token expired" });
      return;
    }
    if (!token.scopes.includes(scope)) {
      res.status(403).json({ error: `Token lacks required scope: ${scope}` });
      return;
    }

    // Best-effort lastUsedAt update — don't block the request if it fails.
    void ApiToken.updateOne(
      { _id: token._id },
      { $set: { lastUsedAt: new Date() } },
    ).catch(() => {});

    req.apiToken = {
      id: token._id.toString(),
      userId: token.userId.toString(),
      scopes: token.scopes,
    };
    next();
  };
}
