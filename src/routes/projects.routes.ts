/**
 * WitnessLedger — Projects routes
 */
import { Router } from 'express';
import * as projectsCtrl from '../controllers/projects.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import * as issuesCtrl from '../controllers/issues.controller';
import { upload } from '../controllers/issues.controller';
const router = Router();

/**
 * @openapi
 * /api/projects:
 *   post:
 *     summary: Create a new project (Admin only)
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, adminUnitId]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string. **Required Roles:** ADMIN
 *               adminUnitId:
 *                 type: string
 *               budget:
 *                 type: number
 *     responses:
 *       201:
 *         description: Project created
 */
router.post('/', authMiddleware, requireRole('ADMIN'), projectsCtrl.create);
/**
 * @openapi
 * /api/projects:
 *   get:
 *     summary: List all projects
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: Array of projects
 */
router.get('/', projectsCtrl.list);
/**
 * @openapi
 * /api/projects/my-ward:
 *   get:
 *     summary: List all projects in the citizen's ward
 *     tags: [Projects]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of projects for user's ward
 */
router.get('/my-ward', authMiddleware, projectsCtrl.myWard);  // all projects in citizen's ward
/**
 * @openapi
 * /api/projects/{projectId}/issues:
 *   post:
 *     summary: Create an issue linked to this project
 *     tags: [Projects, Issues]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
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
 *               title:
 *                 type: string
 *               description:
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
router.post('/:projectId/issues', authMiddleware, upload.single('photo'), issuesCtrl.create);
/**
 * @openapi
 * /api/projects/{projectId}/issues:
 *   get:
 *     summary: List all issues under this project
 *     tags: [Projects, Issues]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of issues
 */
router.get('/:projectId/issues', issuesCtrl.list);

/**
 * @openapi
 * /api/projects/{id}:
 *   get:
 *     summary: Get project details
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 */
router.get('/:id', projectsCtrl.getById);
/**
 * @openapi
 * /api/projects/{id}/approve:
 *   post:
 *     summary: Approve a proposed project (Admin only)
 *     tags: [Projects]
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
 *         description: Project approved and active. **Required Roles:** ADMIN
 */
router.post('/:id/approve', authMiddleware, requireRole('ADMIN'), projectsCtrl.approve);
/**
 * @openapi
 * /api/projects/{id}/timeline:
 *   get:
 *     summary: Get timeline for a project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of audit logs
 */
router.get('/:id/timeline', projectsCtrl.getTimeline);

export default router;
    