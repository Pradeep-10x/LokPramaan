/**
 * JanPramaan — User service
 * Admin-only user creation (officers, inspectors, admins, contractors).
 */
import bcrypt from 'bcrypt';
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { Role } from '../generated/prisma/client.js';

const SALT_ROUNDS = 12;

export interface CreateUserInput {
  name: string;
  email?: string;
  password: string;
  role: Role;
  adminUnitId?: string;
}

/**
 * Create a user with any role (ADMIN-only action).
 */
export async function createUser(input: CreateUserInput, actorId: string) {
  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'A user with that email already exists');
    }
  }

  if (input.adminUnitId) {
    const unit = await prisma.adminUnit.findUnique({ where: { id: input.adminUnitId } });
    if (!unit) {
      throw new AppError(400, 'INVALID_UNIT', 'Admin unit not found');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      adminUnitId: input.adminUnitId,
    },
    select: { id: true, name: true, email: true, role: true, adminUnitId: true, createdAt: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'USER_CREATED',
      metadata: { createdUserId: user.id, role: input.role, adminUnitId: input.adminUnitId ?? null },
    },
  });

  return user;
}

export async function createContractor(input: CreateUserInput, actorId: string) {

  if(input.role !== "CONTRACTOR"){
    throw new AppError(400, 'INVALID_ROLE', 'Role must be CONTRACTOR');
  }

  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'A user with that email already exists');
    }
  }

  if (input.adminUnitId) {
    const unit = await prisma.adminUnit.findUnique({ where: { id: input.adminUnitId } });
    if (!unit) {
      throw new AppError(400, 'INVALID_UNIT', 'Admin unit not found');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: "CONTRACTOR",
      adminUnitId: input.adminUnitId,
    },
    select: { id: true, name: true, email: true, role: true, adminUnitId: true, createdAt: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'CONTRACTOR_CREATED',
      metadata: { createdUserId: user.id, adminUnitId: input.adminUnitId ?? null },
    },
  });

  return user;
}

/**
 * Get user profile by ID.
 */
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, adminUnitId: true,
      profilePicUrl: true,
      adminUnit: { select: { id: true, name: true, type: true } },
      createdAt: true, updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  return user;
}

/**
 * Validates that the calling admin has jurisdiction over the target user.
 * - Ward Admin can manage users in their own ward.
 * - City Admin can manage users in their city or any ward under their city.
 * - Cannot manage CITIZEN accounts or self.
 */
async function validateAdminJurisdiction(
  targetId: string,
  actorId: string,
  actorAdminUnitId: string | null,
) {
  if (targetId === actorId) {
    throw new AppError(400, 'SELF_ACTION', 'You cannot perform this action on your own account');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { adminUnit: true },
  });
  if (!target) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
  if (target.role === Role.CITIZEN) {
    throw new AppError(400, 'INVALID_TARGET', 'Admins cannot manage citizen accounts');
  }

  if (!actorAdminUnitId) {
    throw new AppError(403, 'FORBIDDEN', 'Your account has no admin unit assigned');
  }

  const actorUnit = await prisma.adminUnit.findUnique({ where: { id: actorAdminUnitId } });
  if (!actorUnit) {
    throw new AppError(403, 'FORBIDDEN', 'Your admin unit was not found');
  }

  // Same ward — always allowed
  if (target.adminUnitId === actorAdminUnitId) {
    return target;
  }

  // City admin: target's ward must be a child of the actor's city
  if (actorUnit.type === 'CITY') {
    if (target.adminUnit?.parentId === actorAdminUnitId) {
      return target;
    }
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have jurisdiction over this user');
}

/**
 * Delete an official (ADMIN-only).
 * Validates jurisdiction before deletion.
 */
export async function deleteUser(targetId: string, actorId: string, actorAdminUnitId: string | null) {
  const target = await validateAdminJurisdiction(targetId, actorId, actorAdminUnitId);

  await prisma.$transaction([
    prisma.user.delete({ where: { id: targetId } }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'USER_DELETED',
        metadata: {
          deletedUserId: targetId,
          deletedUserName: target.name,
          deletedUserRole: target.role,
          deletedUserEmail: target.email,
        },
      },
    }),
  ]);

  return { message: `User "${target.name}" (${target.role}) has been deleted` };
}

/**
 * Change an official's password (ADMIN-only).
 * Validates jurisdiction before changing.
 */
export async function changePassword(
  targetId: string,
  actorId: string,
  actorAdminUnitId: string | null,
  newPassword: string,
) {
  const target = await validateAdminJurisdiction(targetId, actorId, actorAdminUnitId);

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { passwordHash },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'PASSWORD_CHANGED_BY_ADMIN',
        metadata: {
          targetUserId: targetId,
          targetUserName: target.name,
          targetUserRole: target.role,
        },
      },
    }),
  ]);

  return { message: `Password updated for "${target.name}" (${target.role})` };
}

/**
 * Self-service password change (any authenticated user, including citizens).
 * Requires the current password for verification.
 */
export async function changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError(401, 'WRONG_PASSWORD', 'Current password is incorrect');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'PASSWORD_SELF_CHANGED',
      metadata: { email: user.email },
    },
  });

  return { message: 'Password changed successfully' };
}
