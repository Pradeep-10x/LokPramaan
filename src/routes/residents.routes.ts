/**
 * WitnessLedger — Residents routes
 */
import { Router } from 'express';
import multer from 'multer';
import * as residentsCtrl from '../controllers/residents.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

/**
 * @openapi
 * /api/residents/import:
 *   post:
 *     summary: Import residents from a CSV file
 *     tags: [Residents]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import succeeded. **Required Roles:** ADMIN
 */
router.post('/import', authMiddleware, requireRole('ADMIN'), upload.single('file'), residentsCtrl.importResidents);

export default router;
