/**
 * JanPramaan — Notifications controller
 */
import { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notification.service';
import * as pushService from '../services/push.service';
import { prisma } from '../prisma/client.js';

export async function notifyForIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const parsedRadius = req.query.radius ? parseInt(req.query.radius as string, 10) : 50;
    const radius = isNaN(parsedRadius) || parsedRadius <= 0 ? 50 : parsedRadius;
    const result = await notificationService.notifyNearbyResidents(
      id,
      req.user!.id,
      radius,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/me
 * Returns the current user's notifications (latest 50), plus unread count.
 */
export async function getMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await prisma.userNotification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        issue: { select: { id: true, title: true, status: true } },
        project: { select: { id: true, title: true } },
      },
    });
    const unreadCount = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read (must belong to the caller).
 */
export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.userNotification.updateMany({
      where: { id: req.params.id as string, userId: req.user!.id },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications for the caller as read.
 */
export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { count } = await prisma.userNotification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true, marked: count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notify/push-token
 * Register an FCM push token for the logged-in user.
 */
export async function registerPushToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, platform } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      res.status(400).json({ error: 'INVALID_TOKEN', message: 'token is required and must be a non-empty string' });
      return;
    }
    const result = await pushService.registerToken(req.user!.id, token.trim(), platform);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notify/push-token
 * Unregister an FCM push token (e.g. on logout).
 */
export async function removePushToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'INVALID_TOKEN', message: 'token is required' });
      return;
    }
    await pushService.removeToken(req.user!.id, token.trim());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notify/test-push
 * Send a notification to a specific token (no user required).
 * Protected to ADMIN only for safety.
 */
export async function testPush(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, title, body } = req.body;
    if (!token || !title || !body) {
      res.status(400).json({ error: 'MISSING_FIELDS', message: 'token, title, and body are required' });
      return;
    }

    const success = await pushService.sendToToken(token, title, body);
    if (success) {
      res.json({ ok: true, message: 'Test push sent' });
    } else {
      res.status(500).json({ error: 'PUSH_FAILED', message: 'FCM delivery failed or is not configured' });
    }
  } catch (err) {
    next(err);
  }
}
