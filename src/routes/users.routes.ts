/**
 * WitnessLedger — Users routes
 */
import { Router } from 'express';
import * as usersCtrl from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

/**
 * @openapi
 * /api/users/create-user:
 *   post:
 *     summary: Create a user internally (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: User created. **Required Roles:** ADMIN
 */
router.post('/create-user', authMiddleware, requireRole('ADMIN'), usersCtrl.createUser);
/**
 * @openapi
 * /api/users/contractor:
 *   post:
 *     summary: Create a new contractor (Admin/Officer only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Contractor created. **Required Roles:** ADMIN, OFFICER
 */
router.post('/contractor', authMiddleware, requireRole('ADMIN', 'OFFICER'), usersCtrl.createContractor);
/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List all users by Admin unit
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of users. **Required Roles:** ADMIN, OFFICER
 */
router.get('/', authMiddleware, requireRole('ADMIN', 'OFFICER'), usersCtrl.listByUnit);
/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get logged-in user details
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/me', authMiddleware, usersCtrl.getMe);
/**
 * @openapi
 * /api/users/me/ward:
 *   patch:
 *     summary: Update current user's ward
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wardId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ward updated successfully
 */
router.patch('/me/ward', authMiddleware, usersCtrl.updateMyWard);

export default router;
