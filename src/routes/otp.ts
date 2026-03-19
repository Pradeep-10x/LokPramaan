import { Router } from "express";
import { requestOtp, verifyOtpHandler } from "../controllers/otp.js";

const router = Router();

/**
 * @openapi
 * /api/otp/send:
 *   post:
 *     summary: Send OTP email for verification
 *     tags: [OTP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent
 */
router.post("/send", requestOtp);
/**
 * @openapi
 * /api/otp/verify:
 *   post:
 *     summary: Verify received OTP code
 *     tags: [OTP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP is valid
 *       400:
 *         description: Invalid OTP
 */
router.post("/verify", verifyOtpHandler);

export default router;