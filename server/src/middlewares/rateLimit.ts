/**
 * Rate-limit middlewares for the LGTM Security surface.
 *
 * Two distinct surfaces with different traffic profiles:
 *
 *   - `/security/*`   — interactive dashboard. Per-user (JWT) keying.
 *                       Generous: a logged-in user clicking around shouldn't
 *                       hit the cap. Tight enough to stop a script that's
 *                       hammering the policy editor.
 *
 *   - `/pipeline/*`   — machine-to-machine. Per-token keying. The runtime
 *                       Action polls every ~5s with jitter for up to ~90s,
 *                       so a single-job legitimate burst is ~20 hits. We
 *                       allow plenty of headroom; cap stops a runaway loop
 *                       or a leaked token getting abused.
 *
 * Memory-backed in dev (default). For multi-instance prod the right move
 * is the `rate-limit-redis` store keyed off the same Redis we already use
 * for BullMQ — but for now memory is fine since LGTM runs single-instance.
 */
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";

/** Library-recommended IP normalizer that handles IPv6 prefix collapsing. */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

/** Standard JSON 429 body so the CLI/Action can parse it. */
const handler: Options["handler"] = (_req, res) => {
  res.status(429).json({
    error: "Too many requests. Try again shortly.",
    code: "rate_limit_exceeded",
  });
};

/**
 * Per-authenticated-user rate limit for /security/*. Falls back to IP if
 * the request isn't authenticated yet (which would only happen if someone
 * bypasses authMiddleware — defensive).
 */
export const securityApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  limit: 120, // 120 req/min/user — 2/sec sustained
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId ?? ipKey(req),
  handler,
});

/**
 * Per-token rate limit for /pipeline/*. The runtime Action's worst case is
 * ~20 hits per CI run; 60/min/token leaves room for parallel jobs in the
 * same workflow without false-tripping.
 */
export const pipelineApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.apiToken?.id ?? ipKey(req),
  handler,
});

/**
 * Tighter limit for write-heavy endpoints in /security/* — token creation,
 * scan triggers, policy edits. These are user-driven so legitimate bursts
 * are tiny, but they're also the most expensive endpoints.
 */
export const securityWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId ?? ipKey(req),
  handler,
});
