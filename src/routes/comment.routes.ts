/**
 * JanPramaan — Comment Routes
 * Nested under /api/issues/:issueId/comments
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import * as commentCtrl from '../controllers/comment.controller';

const router = Router({ mergeParams: true }); // mergeParams to access :issueId

/**
 * @openapi
 * /api/issues/{issueId}/comments:
 *   get:
 *     summary: List comments for an issue (paginated)
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: issueId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated comments with author and mentions
 */
router.get('/', authMiddleware, commentCtrl.list);

/**
 * @openapi
 * /api/issues/{issueId}/comments:
 *   post:
 *     summary: Post a comment (supports @mentions)
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *                 example: "The pothole is getting worse @rajesh.kumar please check"
 *     responses:
 *       201:
 *         description: Created comment with resolved mentions
 */
router.post('/', authMiddleware, commentCtrl.create);

/**
 * @openapi
 * /api/issues/{issueId}/comments/mentionable:
 *   get:
 *     summary: List users who can be @mentioned on this issue
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of mentionable users with their mention keys
 */
router.get('/mentionable', authMiddleware, commentCtrl.mentionable);

/**
 * @openapi
 * /api/issues/{issueId}/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment (author or admin only)
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion confirmation
 */
router.delete('/:commentId', authMiddleware, commentCtrl.remove);

export default router;
