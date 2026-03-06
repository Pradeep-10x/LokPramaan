/**
 * WitnessLedger — Notifications routes
 */
import { Router } from 'express';
import * as notificationsCtrl from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

// Nearby-residents SMS/system notification (ADMIN/OFFICER only)
router.get('/issue/:id', authMiddleware, requireRole('ADMIN', 'OFFICER'), notificationsCtrl.notifyForIssue);

// In-app notifications for the logged-in user
router.get('/me',           authMiddleware, notificationsCtrl.getMyNotifications);
router.patch('/read-all',   authMiddleware, notificationsCtrl.markAllRead);
router.patch('/:id/read',   authMiddleware, notificationsCtrl.markRead);

export default router;
