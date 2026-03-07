/**
 * WitnessLedger — Auth controller
 */
import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { isEmailVerified } from '../services/otp.js';
import { sendOtp } from '../services/otp.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    // Auto-check: if email isn't verified yet, send OTP and ask user to verify first
    const verified = await isEmailVerified(email);
    if (!verified) {
      try {
        await sendOtp(email);
      } catch (e: any) {
        // If rate-limited, still tell them to verify
        if (e.statusCode === 429) {
          res.status(429).json({
            error: e.message,
            step: "verify_email",
            message: "OTP already sent. Please verify your email using POST /api/otp/verify",
          });
          return;
        }
        throw e;
      }
      res.status(202).json({
        step: "verify_email",
        message: "OTP sent to your email. Verify it first using POST /api/otp/verify, then call register again.",
      });
      return;
    }

    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
  } catch (err: any) {
    if (err.statusCode === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err.statusCode === 500 && err.message?.includes('Failed to send OTP')) {
      res.status(500).json({ error: 'Could not send verification email. Please try again later.' });
      return;
    }
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.loginUser(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}