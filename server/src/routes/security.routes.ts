import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  securityApiLimiter,
  securityWriteLimiter,
} from "../middlewares/rateLimit";
import { tagSecurityScope } from "../middlewares/sentryTags";
import {
  enroll,
  unenroll,
  pause,
  resume,
  listEnrolled,
  getMonitor,
  updatePolicy,
  updateNotify,
  listAudit,
  resolveAuditEntry,
  triggerScan,
  listScans,
  ruleStats,
  rescanPr,
} from "../controllers/security.controller";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../controllers/apiToken.controller";

const router = Router();

// Auth first, then a generous per-user rate limit. Write endpoints get an
// extra tighter limit on top.
router.use(authMiddleware);
router.use(tagSecurityScope("lgtm-security"));
router.use(securityApiLimiter);

// Enrollment + repo-level state
router.post("/enroll", securityWriteLimiter, enroll);
router.get("/repos", listEnrolled);
router.get("/repos/:repoId", getMonitor);
router.delete("/repos/:repoId", securityWriteLimiter, unenroll);
router.post("/repos/:repoId/pause", securityWriteLimiter, pause);
router.post("/repos/:repoId/resume", securityWriteLimiter, resume);
router.patch("/repos/:repoId/policy", securityWriteLimiter, updatePolicy);
router.patch("/repos/:repoId/notify", securityWriteLimiter, updateNotify);

// Scans
router.post("/repos/:repoId/scan", securityWriteLimiter, triggerScan);
router.post(
  "/repos/:repoId/prs/:prNumber/rescan",
  securityWriteLimiter,
  rescanPr,
);
router.get("/repos/:repoId/scans", listScans);

// Audit log
router.get("/repos/:repoId/audit", listAudit);
router.patch("/audit/:id", securityWriteLimiter, resolveAuditEntry);

// Rule analytics — per-rule false-positive rate for the policy editor
router.get("/repos/:repoId/rule-stats", ruleStats);

// API tokens (machine-to-machine, used by lgtm-action)
router.get("/tokens", listApiTokens);
router.post("/tokens", securityWriteLimiter, createApiToken);
router.delete("/tokens/:id", securityWriteLimiter, revokeApiToken);

export default router;
