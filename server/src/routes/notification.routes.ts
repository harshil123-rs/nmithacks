import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listNotifications,
  markRead,
  markAllRead,
} from "../controllers/notification.controller";

const router = Router();

router.get("/", authMiddleware, listNotifications);
router.patch("/read-all", authMiddleware, markAllRead);
router.patch("/:id/read", authMiddleware, markRead);

export default router;
