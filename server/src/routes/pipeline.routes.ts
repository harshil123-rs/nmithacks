import { Router } from "express";
import { getPipelineDecision } from "../controllers/pipeline.controller";
import { requireApiToken } from "../middlewares/apiToken";
import { pipelineApiLimiter } from "../middlewares/rateLimit";
import { tagSecurityScope } from "../middlewares/sentryTags";

const router = Router();

// Authed by long-lived API token, not user JWT — see middlewares/apiToken.ts.
// Rate limited per-token so a leaked or runaway token can't DoS us.
router.get(
  "/decision",
  requireApiToken("pipeline:read"),
  tagSecurityScope("lgtm-security-pipeline"),
  pipelineApiLimiter,
  getPipelineDecision,
);

export default router;
