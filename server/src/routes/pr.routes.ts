import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listPRs,
  listMyPRs,
  getContributorPR,
  getPR,
  triggerReview,
  getReview,
  getPublicReview,
  listReviewFeed,
} from "../controllers/pr.controller";
import { localReview } from "../controllers/local-review.controller";

const router = Router();

// Public route (no auth)
router.get("/reviews/:id/public", getPublicReview);

// Protected routes
router.get("/prs", authMiddleware, listPRs);
router.get("/prs/mine", authMiddleware, listMyPRs);
// Static paths MUST come before /:id wildcard routes
router.post("/prs/local-review", authMiddleware, localReview);
router.get("/prs/:id/contributor", authMiddleware, getContributorPR);
router.get("/prs/:id", authMiddleware, getPR);
router.post("/prs/:id/review", authMiddleware, triggerReview);
router.get("/reviews", authMiddleware, listReviewFeed);
router.get("/reviews/:id", authMiddleware, getReview);

export default router;
