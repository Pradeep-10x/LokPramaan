import { Request, Response, NextFunction } from "express";
import { sendOtp, verifyOtp } from "../services/otp.js";
import { verifyAndLoginUser } from "../services/auth.service.js";

export async function requestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    const result = await sendOtp(email);
    res.json(result);
  } catch (err: any) {
    if (err.statusCode === 429) {
      res.status(429).json({ error: err.message });
      return;
    }
    if (err.statusCode === 500 && err.message?.includes('Failed to send OTP')) {
      res.status(500).json({ error: 'Could not send verification email. Please check SMTP configuration.' });
      return;
    }
    next(err);
  }
}

export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: "Email and OTP are required" });
      return;
    }
    const valid = await verifyOtp(email, otp);
    if (!valid) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }
    // Mark the user as verified and get their login token
    const result = await verifyAndLoginUser(email);
    
    res.json({ message: "Email verified successfully", verified: true, ...result });
  } catch (err) {
    next(err);
  }
}