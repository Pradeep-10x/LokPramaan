/**
 * WitnessLedger — Issues routes
 */
import { Router } from 'express';
import * as issuesCtrl from '../controllers/issues.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.post('/', authMiddleware, issuesCtrl.create);
router.get('/', issuesCtrl.list);
router.get('/:id', issuesCtrl.getById);
router.patch('/:id/accept', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.accept);
router.patch('/:id/reject', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.reject);
router.post('/:id/assign', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.assign);
router.post('/:id/convert', authMiddleware, requireRole('OFFICER' , 'ADMIN'), issuesCtrl.convert);
router.post('/:id/toggle-duplicate', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.toggleDuplicate);
router.get('/:id/timeline', issuesCtrl.getTimeline);

export default router;
