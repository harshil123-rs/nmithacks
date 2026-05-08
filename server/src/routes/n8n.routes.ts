/**
 * n8n Integration Routes
 *
 * POST /api/n8n/webhook/review-code  — n8n (or any caller) sends code for review
 * GET  /api/n8n/review/:id           — poll/fetch review result by ID
 *
 * No JWT auth — secured by shared N8N_API_KEY header (optional for demo).
 */
import { Router } from "express";
import { webhookReviewCode, getN8nReview } from "../controllers/n8n.controller";

const router = Router();

// Main entry point — n8n cloud sends code here via HTTP Request node
router.post("/webhook/review-code", webhookReviewCode);

// Status / result fetch — frontend polls this after triggering review
router.get("/review/:id", getN8nReview);

export default router;
