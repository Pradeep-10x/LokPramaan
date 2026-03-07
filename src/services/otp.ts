import crypto from "crypto";
import { prisma } from '../prisma/client';
import { sendOtpEmail } from "./email.js";

const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendOtp(email: string): Promise<{ message: string }> {
  // Rate limit: 1 OTP per 60 seconds per email
  const recent = await prisma.emailOtp.findFirst({
    where: {
      email,
      createdAt: {
        gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recent) {
    const waitSeconds = Math.ceil(
      (recent.createdAt.getTime() + OTP_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000
    );
    throw Object.assign(new Error(`Please wait ${waitSeconds}s before requesting another OTP`), {
      statusCode: 429,
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Delete old OTPs for this email
  await prisma.emailOtp.deleteMany({ where: { email } });

  // Create new OTP
  await prisma.emailOtp.create({
    data: { email, otp, expiresAt },
  });

  // Send email
  try {
    await sendOtpEmail(email, otp);
  } catch (err: any) {
    // Clean up OTP if email fails
    await prisma.emailOtp.deleteMany({ where: { email } });
    throw Object.assign(
      new Error(`Failed to send OTP email: ${err.message}`),
      { statusCode: 500 },
    );
  }

  return { message: "OTP sent to your email" };
}

export async function verifyOtp(email: string, otp: string): Promise<boolean> {
  const record = await prisma.emailOtp.findFirst({
    where: {
      email,
      otp,
      verified: false,
      expiresAt: { gte: new Date() },
    },
  });

  if (!record) {
    return false;
  }

  // Mark as verified
  await prisma.emailOtp.update({
    where: { id: record.id },
    data: { verified: true },
  });

  return true;
}

export async function isEmailVerified(email: string): Promise<boolean> {
  if (!email) return false;
  const record = await prisma.emailOtp.findFirst({
    where: {
      email,
      verified: true,
      expiresAt: { gte: new Date() },
    },
  });

  return !!record;
}

export async function cleanupUsedOtp(email: string): Promise<void> {
  await prisma.emailOtp.deleteMany({ where: { email } });
}