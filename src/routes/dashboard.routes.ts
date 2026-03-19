/**
 * WitnessLedger — Dashboard routes
 */
import { Router } from 'express';
import * as dashboardCtrl from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

// Secure officer dashboard endpoint
/**
 * @openapi
 * /api/dashboard/officer:
 *   get:
 *     summary: Retrieve aggregate data metrics for the officer dashboard
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics returned successfully. **Required Roles:** OFFICER, ADMIN
 */
router.get('/officer', authMiddleware, requireRole('OFFICER', 'ADMIN'), dashboardCtrl.getOfficerDashboard);

export default router;
