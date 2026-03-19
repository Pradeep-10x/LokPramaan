/**
 * WitnessLedger — Auth service
 * Handles user registration (CITIZEN) and login with JWT generation.
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';
import { config } from '../config';
import { AppError } from '../middleware/error.middleware';
import { Role } from '../generated/prisma/client.js';
import { isEmailVerified, cleanupUsedOtp } from "./otp.js";
import { getNearestWard } from "./adminUnit.service.js";
const SALT_ROUNDS = 12;

export interface RegisterInput {
  name: string;
  email?: string;
  password: string;
  wardId?: string;      // manual override from "Change ward" dropdown
  deviceLat?: number;
  deviceLng?: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Register a new CITIZEN user.
 */
export async function registerUser(input: RegisterInput) {
  if (!input.email) {
    throw Object.assign(new Error('Email is required for registration'), { statusCode: 400 });
  }

  // Resolve adminUnitId: manual wardId > device GPS auto-detect > null
  let resolvedWardId: string | undefined = undefined;

  if (input.wardId) {
    // Manual selection from frontend dropdown — validate it exists
    const ward = await prisma.adminUnit.findUnique({ where: { id: input.wardId } });
    if (!ward || ward.type !== 'WARD') {
      throw new AppError(400, 'INVALID_WARD', 'wardId must reference an existing WARD');
    }
    resolvedWardId = input.wardId;
  } else if (input.deviceLat !== undefined && input.deviceLng !== undefined) {
    // Auto-detect from device GPS
    const nearest = await getNearestWard(input.deviceLat, input.deviceLng);
    resolvedWardId = nearest.wardId;
  }

  // Check email uniqueness
  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      if (existing.isEmailVerified) {
         throw new AppError(409, 'EMAIL_EXISTS', 'A user with that email already exists');
      } else {
         // Overwrite unverified user
         await prisma.user.delete({ where: { email: input.email } });
      }
    }
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
   

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: Role.CITIZEN,
      adminUnitId: resolvedWardId ?? null,
      isEmailVerified: false,
    },
    select: { id: true, name: true, email: true, role: true, adminUnitId: true, createdAt: true },
  });

  // Audit log — user is the actor for their own registration
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_REGISTERED_UNVERIFIED',
      metadata: { email: user.email, wardId: resolvedWardId ?? null },
    },
  });

  return { user };
}

/**
 * Authenticate a user by email + password and return a JWT.
 */
export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (!user.isEmailVerified) {
    throw new AppError(403, 'UNVERIFIED_EMAIL', 'Please verify your email address to log in');
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, { expiresIn: '24h' });

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_LOGIN',
      metadata: { email: user.email },
    },
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminUnitId: user.adminUnitId,
    },
  };
}

/**
 * Marks user as verified and logs them in.
 */
export async function verifyAndLoginUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  
  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true }
  });

  const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, { expiresIn: '24h' });

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'USER_VERIFIED',
      metadata: { email: user.email },
    },
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      adminUnitId: user.adminUnitId,
    },
  };
}
