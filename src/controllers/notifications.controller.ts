/**
 * WitnessLedger — Notifications controller
 */
import { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notification.service';
import { prisma } from '../prisma/client.js';

export async function notifyForIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const radius = req.query.radius ? parseInt(req.query.radius as string, 10) : 50;
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
      where: { id: req.params.id, userId: req.user!.id },
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
