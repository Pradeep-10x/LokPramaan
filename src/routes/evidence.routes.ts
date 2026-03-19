/**
 * WitnessLedger — Evidence routes
 */
import { Router } from 'express';
import multer from 'multer';
import * as evidenceCtrl from '../controllers/evidence.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// BEFORE/AFTER: INSPECTOR only. DOCUMENT: OFFICER/ADMIN/INSPECTOR.
// Fine-grained role + assignment check is enforced inside the service.
/**
 * @openapi
 * /api/issues/{id}/evidence:
 *   post:
 *     summary: Upload physical evidence file
 *     tags: [Evidence]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: File uploaded successfully. **Required Roles:** INSPECTOR, OFFICER, ADMIN
 */
router.post('/:id/evidence', authMiddleware, requireRole('INSPECTOR', 'OFFICER', 'ADMIN'), upload.single('file'), evidenceCtrl.upload);

/**
 * @openapi
 * /api/issues/{id}/evidence:
 *   get:
 *     summary: List evidence files for an issue
 *     tags: [Evidence]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of evidence files
 */
router.get('/:id/evidence', evidenceCtrl.list);

export default router;
