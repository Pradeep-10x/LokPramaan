/**
 * WitnessLedger — AdminUnit routes
 */
import { Router } from 'express';
import * as adminUnitCtrl from '../controllers/adminUnit.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/nearest-ward', adminUnitCtrl.nearestWard);       // must be before /:id
router.get('/', adminUnitCtrl.listUnits);
router.post('/', authMiddleware, requireRole('ADMIN'), adminUnitCtrl.createUnit);
router.get('/:id/children', adminUnitCtrl.getChildren);

export default router;
