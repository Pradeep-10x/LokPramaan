/**
 * WitnessLedger — Metrics routes
 */
import { Router } from 'express';
import * as metricsCtrl from '../controllers/metrics.controller';

const router = Router();

/**
 * @openapi
 * /api/metrics:
 *   get:
 *     summary: Retrieve advanced system metrics
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Advanced metrics object
 */
router.get('/', metricsCtrl.getAdvancedMetrics);

export default router;
