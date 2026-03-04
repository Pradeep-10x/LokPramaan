/**
 * WitnessLedger — Users routes
 */
import { Router } from 'express';
import * as usersCtrl from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.post('/create-user', authMiddleware, requireRole('ADMIN'), usersCtrl.createUser);
router.post('/contractor', authMiddleware, requireRole('ADMIN', 'OFFICER'), usersCtrl.createContractor);
router.get('/me', authMiddleware, usersCtrl.getMe);

export default router;
