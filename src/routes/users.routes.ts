/**
 * JanPramaan — Users routes
 */
import { Router } from 'express';
import * as usersCtrl from '../controllers/users.controller';
import { profileUpload } from '../controllers/users.controller';
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

/**
 * @openapi
 * /api/users/me/profile-pic:
 *   post:
 *     summary: Upload or update profile photo
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile photo updated
 */
router.post('/me/profile-pic', authMiddleware, profileUpload.single('photo'), usersCtrl.uploadProfilePic);

import { validateBody } from '../middleware/validation.middleware';

/**
 * @openapi
 * /api/users/me/password:
 *   patch:
 *     summary: Change own password (any authenticated user)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.patch(
  '/me/password',
  authMiddleware,
  validateBody([
    { field: 'currentPassword', required: true, type: 'string' },
    { field: 'newPassword', required: true, type: 'string' },
  ]),
  usersCtrl.changeMyPassword,
);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Delete an official (Admin only)
 *     tags: [Users]
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
 *         description: User deleted
 */
router.delete('/:id', authMiddleware, requireRole('ADMIN'), usersCtrl.deleteUser);

/**
 * @openapi
 * /api/users/{id}/password:
 *   patch:
 *     summary: Change official's password (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated
 */
router.patch('/:id/password', authMiddleware, requireRole('ADMIN'), validateBody([{ field: 'newPassword', required: true, type: 'string' }]), usersCtrl.changePassword);

export default router;
