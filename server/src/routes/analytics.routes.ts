import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getOverview,
  getTrends,
  getTopIssues,
} from "../controllers/analytics.controller";

const router = Router();

router.use(authMiddleware);

router.get("/overview", getOverview);
router.get("/trends", getTrends);
router.get("/top-issues", getTopIssues);

export default router;
