/**
 * JanPramaan — Issues routes
 */
import { Router } from 'express';
import * as issuesCtrl from '../controllers/issues.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { upload } from '../controllers/issues.controller';

const router = Router();

/**
 * @openapi
 * /api/issues:
 *   post:
 *     summary: Create a new issue
 *     tags: [Issues]
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
 *               title:
 *                 type: string
 *               department:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Issue created
 */
router.post('/', authMiddleware, upload.single('photo'), issuesCtrl.create);

/**
 * @openapi
 * /api/issues:
 *   get:
 *     summary: List all issues
 *     tags: [Issues]
 *     responses:
 *       200:
 *         description: Array of issues
 */
router.get('/', issuesCtrl.list);

/**
 * @openapi
 * /api/issues/classify:
 *   get:
 *     summary: Preview auto-classified department before submission
 *     tags: [Issues]
 *     parameters:
 *       - in: query
 *         name: title
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: description
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Classification result with department, confidence, and scores
 */
router.get('/classify', issuesCtrl.classify);

/**
 * @openapi
 * /api/issues/mine:
 *   get:
 *     summary: List citizen's own issues
 *     tags: [Issues]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of issues
 */
router.get('/mine',    authMiddleware, issuesCtrl.mine);      // citizen's own issues

/**
 * @openapi
 * /api/issues/my-ward:
 *   get:
 *     summary: List all issues in the citizen's ward
 *     tags: [Issues]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of issues
 */
router.get('/my-ward', authMiddleware, issuesCtrl.myWard);   // all issues in citizen's ward

/**
 * @openapi
 * /api/issues/{id}:
 *   get:
 *     summary: Get issue details
 *     tags: [Issues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Issue details
 */
router.get('/:id', issuesCtrl.getById);

/**
 * @openapi
 * /api/issues/{id}/accept:
 *   patch:
 *     summary: Accept an issue (Officer/Admin)
 *     tags: [Issues]
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
 *         description: Issue accepted. **Required Roles:** OFFICER, ADMIN
 */
router.patch('/:id/accept', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.accept);

/**
 * @openapi
 * /api/issues/{id}/reject:
 *   patch:
 *     summary: Reject an issue (Officer/Admin)
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Issue rejected. **Required Roles:** OFFICER, ADMIN
 */
router.patch('/:id/reject', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.reject);

/**
 * @openapi
 * /api/issues/{id}/assign:
 *   post:
 *     summary: Assign an issue to an officer
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               officerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Issue assigned. **Required Roles:** OFFICER, ADMIN
 */
router.post('/:id/assign', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.assign);

/**
 * @openapi
 * /api/issues/{id}/assign-inspector:
 *   post:
 *     summary: Assign an inspector
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inspectorId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inspector assigned. **Required Roles:** OFFICER, ADMIN
 */
router.post('/:id/assign-inspector', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.assignInspector);

/**
 * @openapi
 * /api/issues/{id}/hire-contractor:
 *   post:
 *     summary: Hire a contractor
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contractorId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contractor hired. **Required Roles:** OFFICER, ADMIN
 */
router.post('/:id/hire-contractor', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.hireContractor);

/**
 * @openapi
 * /api/issues/{id}/work-done:
 *   patch:
 *     summary: Mark work as done (Contractor)
 *     tags: [Issues]
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
 *         description: Work marked done. **Required Roles:** CONTRACTOR
 */
router.patch('/:id/work-done', authMiddleware, requireRole('CONTRACTOR'), issuesCtrl.markWorkDone);

/**
 * @openapi
 * /api/issues/{id}/convert:
 *   post:
 *     summary: Convert issue to project
 *     tags: [Issues]
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
 *         description: Issue converted. **Required Roles:** OFFICER, ADMIN
 */
router.post('/:id/convert', authMiddleware, requireRole('OFFICER' , 'ADMIN'), issuesCtrl.convert);

/**
 * @openapi
 * /api/issues/{id}/toggle-duplicate:
 *   post:
 *     summary: Mark or unmark as duplicate
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               duplicateOfId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Duplicate status toggled. **Required Roles:** OFFICER, ADMIN
 */
router.post('/:id/toggle-duplicate', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.toggleDuplicate);

/**
 * @openapi
 * /api/issues/{id}/evidence:
 *   post:
 *     summary: Upload evidence for issue
 *     tags: [Issues, Evidence]
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
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Evidence uploaded
 */
router.post('/:id/evidence', authMiddleware, upload.single('photo'), issuesCtrl.uploadEvidence);

/**
 * @openapi
 * /api/issues/{id}/timeline:
 *   get:
 *     summary: Get timeline for issue
 *     tags: [Issues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of audit logs
 */
router.get('/:id/timeline', issuesCtrl.getTimeline);

/**
 * @openapi
 * /api/issues/{id}/priority:
 *   patch:
 *     summary: Set or update issue priority (Officer/Admin)
 *     tags: [Issues]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [priority]
 *             properties:
 *               priority:
 *                 type: string
 *                 enum: [HIGH, MEDIUM, LOW]
 *     responses:
 *       200:
 *         description: Priority updated. **Required Roles:** OFFICER, ADMIN
 */
router.patch('/:id/priority', authMiddleware, requireRole('OFFICER', 'ADMIN'), issuesCtrl.setPriority);

export default router;
