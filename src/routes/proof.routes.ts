/**
 * WitnessLedger — Proof routes
 */
import { Router } from 'express';
import * as proofCtrl from '../controllers/proof.controller';

const router = Router();

// Public endpoints
/**
 * @openapi
 * /api/issues/{id}/proof:
 *   get:
 *     summary: Get cryptographic proof for an issue
 *     tags: [Proof]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cryptographic proof
 */
router.get('/:id/proof', proofCtrl.getProof);

/**
 * @openapi
 * /api/issues/{id}/qr:
 *   get:
 *     summary: Generate QR code for the issue proof
 *     tags: [Proof]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: QR Code representation
 */
router.get('/:id/qr', proofCtrl.getQR);

export default router;
