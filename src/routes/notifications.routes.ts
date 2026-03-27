/**
 * JanPramaan — Notifications routes
 */
import { Router } from 'express';
import * as notificationsCtrl from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

// Nearby-residents SMS/system notification (ADMIN/OFFICER only)
/**
 * @openapi
 * /api/notify/issue/{id}:
 *   get:
 *     summary: Send notification for an issue to nearby residents
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notifications sent successfully. **Required Roles:** ADMIN, OFFICER
 */
router.get('/issue/:id', authMiddleware, requireRole('ADMIN', 'OFFICER'), notificationsCtrl.notifyForIssue);

// In-app notifications for the logged-in user
/**
 * @openapi
 * /api/notify/me:
 *   get:
 *     summary: Get notifications for the logged-in user
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user notifications
 */
router.get('/me',           authMiddleware, notificationsCtrl.getMyNotifications);

/**
 * @openapi
 * /api/notify/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/read-all',   authMiddleware, notificationsCtrl.markAllRead);

/**
 * @openapi
 * /api/notify/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch('/:id/read',   authMiddleware, notificationsCtrl.markRead);

/**
 * @openapi
 * /api/notify/push-token:
 *   post:
 *     summary: Register an FCM push token for the current user
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: FCM device token
 *               platform:
 *                 type: string
 *                 enum: [web, android, ios]
 *                 default: web
 *     responses:
 *       201:
 *         description: Push token registered
 */
router.post('/push-token',    authMiddleware, notificationsCtrl.registerPushToken);

/**
 * @openapi
 * /api/notify/push-token:
 *   delete:
 *     summary: Unregister an FCM push token (e.g. on logout)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Push token removed
 */
router.delete('/push-token',  authMiddleware, notificationsCtrl.removePushToken);

/**
 * @openapi
 * /api/notify/test-push:
 *   post:
 *     summary: Send a test notification to a specific token (Debug only)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, title, body]
 *             properties:
 *               token:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test push sent
 */
router.post('/test-push',     authMiddleware, requireRole('ADMIN', 'OFFICER'), notificationsCtrl.testPush);

export default router;
