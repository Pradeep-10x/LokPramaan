/**
 * JanPramaan — Auth routes
 */
import { Router } from 'express';
import * as authCtrl from '../controllers/auth.controller';
import { validateBody } from '../middleware/validation.middleware';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new citizen
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User successfully registered
 *       400:
 *         description: Invalid input or email already in use
 */
router.post(
  '/register',
  validateBody([
    { field: 'name', required: true, type: 'string' },
    { field: 'email', required: true, type: 'string' },
    { field: 'password', required: true, type: 'string' },
  ]),
  authCtrl.register,
);

/**
 * @openapi
 * /api/auth/verify-registration:
 *   post:
 *     summary: Verify OTP and complete registration
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registration complete, returns JWT
 */
router.post(
  '/verify-registration',
  validateBody([
    { field: 'email', required: true, type: 'string' },
    { field: 'otp', required: true, type: 'string' },
  ]),
  authCtrl.verifyRegistration,
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and receive JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/login',
  validateBody([
    { field: 'email', required: true, type: 'string' },
    { field: 'password', required: true, type: 'string' },
  ]),
  authCtrl.login,
);

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request OTP for password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent (if email exists)
 */
router.post(
  '/forgot-password',
  validateBody([{ field: 'email', required: true, type: 'string' }]),
  authCtrl.forgotPassword,
);

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post(
  '/reset-password',
  validateBody([
    { field: 'email', required: true, type: 'string' },
    { field: 'otp', required: true, type: 'string' },
    { field: 'newPassword', required: true, type: 'string' },
  ]),
  authCtrl.resetPassword,
);

export default router;
