import { Router } from "express";
import {
  listAvailableRepos,
  connectRepo,
  listConnectedRepos,
  disconnectRepo,
  updateRepoSettings,
  syncRepoPRs,
  triggerContextIndex,
  getContextStatus,
  getContextDetail,
  getInstallationStatus,
} from "../controllers/repo.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

router.use(authMiddleware);

router.get("/available", listAvailableRepos);
router.get("/installation-status", getInstallationStatus);
router.get("/context-status", getContextStatus);
router.post("/connect", connectRepo);
router.get("/", listConnectedRepos);
router.delete("/:id", disconnectRepo);
router.patch("/:id/settings", updateRepoSettings);
router.post("/:id/sync", syncRepoPRs);
router.post("/:id/index", triggerContextIndex);
router.get("/:id/context-detail", getContextDetail);

export default router;
