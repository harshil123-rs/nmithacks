import { Request, Response } from "express";
import { Notification } from "../models/Notification";

/**
 * GET /notifications
 * User's notifications (most recent first, max 50).
 * Query: ?unread=true for unread only
 */
export async function listNotifications(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { unread } = req.query;

    const filter: Record<string, any> = { userId };
    if (unread === "true") filter.isRead = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (err: any) {
    console.error("[Notification] list error:", err.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
}

/**
 * PATCH /notifications/:id/read
 * Mark a notification as read.
 */
export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const notif = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true },
    );

    if (!notif) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ notification: notif });
  } catch (err: any) {
    console.error("[Notification] markRead error:", err.message);
    res.status(500).json({ error: "Failed to update notification" });
  }
}

/**
 * PATCH /notifications/read-all
 * Mark all notifications as read.
 */
export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    res.json({ message: "All notifications marked as read" });
  } catch (err: any) {
    console.error("[Notification] markAllRead error:", err.message);
    res.status(500).json({ error: "Failed to update notifications" });
  }
}
