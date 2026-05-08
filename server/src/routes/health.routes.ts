import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getHealthSnapshot,
  getHealthHistory,
  getCommitData,
} from "../controllers/health.controller";

const router = Router();
router.use(authMiddleware);
router.get("/:repoId/latest", getHealthSnapshot);
router.get("/:repoId/history", getHealthHistory);
router.get("/:repoId/commit/:commitSha", getCommitData);
export default router;
