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

    // 1. Create the unverified user in the database
    const { user } = await authService.registerUser(req.body);

    // 2. Send OTP
    try {
      await sendOtp(email);
    } catch (e: any) {
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
      message: "Registration accepted. OTP sent to your email. Please verify using POST /api/otp/verify to complete the process.",
      user
    });
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