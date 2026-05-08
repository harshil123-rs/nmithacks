/**
 * Tag the active Sentry scope so any error captured during this request is
 * associated with the LGTM Security feature surface.
 *
 * Lets ops filter Sentry by `feature:lgtm-security` and see worker errors
 * (already tagged via Sentry.captureException(... { tags })) alongside HTTP
 * errors in the same query.
 */
import * as Sentry from "@sentry/node";
import type { Request, Response, NextFunction } from "express";

export function tagSecurityScope(
  feature: "lgtm-security" | "lgtm-security-pipeline",
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    Sentry.getCurrentScope().setTag("feature", feature);
    if (req.user?.userId) {
      Sentry.getCurrentScope().setUser({ id: req.user.userId });
    } else if (req.apiToken?.userId) {
      Sentry.getCurrentScope().setUser({ id: req.apiToken.userId });
      Sentry.getCurrentScope().setTag("auth_kind", "api-token");
    }
    const repoIdParam = req.params?.repoId;
    if (typeof repoIdParam === "string") {
      Sentry.getCurrentScope().setTag("repo_id", repoIdParam);
    }
    next();
  };
}
