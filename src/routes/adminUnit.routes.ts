/**
 * WitnessLedger — AdminUnit routes
 */
import { Router } from 'express';
import * as adminUnitCtrl from '../controllers/adminUnit.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { upload } from '../controllers/adminUnit.controller';

const router = Router();

/**
 * @openapi
 * /api/admin-units/nearest-ward:
 *   get:
 *     summary: Find nearest ward based on coordinates
 *     tags: [AdminUnit]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Nearest ward details
 */
router.get('/nearest-ward', adminUnitCtrl.nearestWard);

/**
 * @openapi
 * /api/admin-units/location-from-photo:
 *   post:
 *     summary: Extract location from a photo
 *     tags: [AdminUnit]
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
 *         description: Location coordinates extracted
 */
router.post('/location-from-photo', upload.single('photo'), adminUnitCtrl.locationFromPhoto);

/**
 * @openapi
 * /api/admin-units:
 *   get:
 *     summary: List all admin units
 *     tags: [AdminUnit]
 *     responses:
 *       200:
 *         description: Array of administrative units
 */
router.get('/', adminUnitCtrl.listUnits);

/**
 * @openapi
 * /api/admin-units:
 *   post:
 *     summary: Create an admin unit
 *     tags: [AdminUnit]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               parentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin unit created. **Required Roles:** ADMIN
 */
router.post('/', authMiddleware, requireRole('ADMIN'), adminUnitCtrl.createUnit);

/**
 * @openapi
 * /api/admin-units/{id}/children:
 *   get:
 *     summary: Get children of an admin unit
 *     tags: [AdminUnit]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of child units
 */
router.get('/:id/children', adminUnitCtrl.getChildren);

export default router;
