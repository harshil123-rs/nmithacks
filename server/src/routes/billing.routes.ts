import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getBillingStatus,
  createCheckout,
} from "../controllers/billing.controller";

const router = Router();

router.get("/status", authMiddleware, getBillingStatus);
router.post("/checkout", authMiddleware, createCheckout);

export default router;
