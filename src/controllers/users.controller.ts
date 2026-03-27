/**
 * JanPramaan — Users controller
 */
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as userService from '../services/user.service';
import { getNearestWard } from '../services/adminUnit.service.js';
import { prisma } from '../prisma/client.js';
import { AppError } from '../middleware/error.middleware.js';
import { storeFile } from '../utils/storage.util.js';

export const profileUpload = multer({ storage: multer.memoryStorage() });

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.createUser({
      ...req.body,
      adminUnitId: req.body.adminUnitId || req.user!.adminUnitId,
    }, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createContractor(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.createContractor({
      ...req.body,
      adminUnitId: req.user!.adminUnitId,
    }, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.getUserProfile(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users?adminUnitId=&role=
 * List all users belonging to an admin unit (ward/city).
 * Optionally filter by role. ADMIN only.
 */
export async function listByUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const adminUnitId = req.query.adminUnitId as string | undefined;
    const role        = req.query.role        as string | undefined;

    const ALLOWED_ROLES = ['OFFICER', 'INSPECTOR', 'CONTRACTOR', 'ADMIN'];
    const roleFilter = role && ALLOWED_ROLES.includes(role)
      ? (role as any)
      : { in: ALLOWED_ROLES };

    let unitCondition: any = adminUnitId ? { adminUnitId } : {};

    // For contractors, fetch all contractors in the entire city (parent unit + all child wards)
    if (role === 'CONTRACTOR' && adminUnitId) {
      const unit = await prisma.adminUnit.findUnique({ where: { id: adminUnitId } });
      if (unit && unit.type === 'WARD' && unit.parentId) {
        unitCondition = {
          OR: [
            { adminUnitId: unit.parentId }, // City-level contractors
            { adminUnit: { parentId: unit.parentId } }, // Ward-level contractors in same city
          ],
        };
      }
    }

    const users = await prisma.user.findMany({
      where: {
        ...unitCondition,
        role: roleFilter,
      },
      select: {
        id: true, name: true, email: true, role: true,
        adminUnitId: true,
        adminUnit: { select: { id: true, name: true, type: true } },
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/me/ward
 * Update the citizen's ward — either by passing a wardId (manual)
 * or deviceLat/deviceLng (auto-detect nearest ward).
 */
export async function updateMyWard(req: Request, res: Response, next: NextFunction) {
  try {
    const { wardId, deviceLat, deviceLng } = req.body;

    let resolvedWardId: string;

    if (wardId) {
      // Manual selection from dropdown
      const ward = await prisma.adminUnit.findUnique({ where: { id: wardId } });
      if (!ward || ward.type !== 'WARD') {
        throw new AppError(400, 'INVALID_WARD', 'wardId must reference an existing WARD');
      }
      resolvedWardId = wardId;
    } else {
      const lat = parseFloat(deviceLat);
      const lng = parseFloat(deviceLng);
      if (isNaN(lat) || isNaN(lng)) {
        throw new AppError(400, 'LOCATION_REQUIRED', 'Provide wardId or deviceLat + deviceLng');
      }
      const nearest = await getNearestWard(lat, lng);
      resolvedWardId = nearest.wardId;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { adminUnitId: resolvedWardId },
      select: { id: true, name: true, email: true, role: true, adminUnitId: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'WARD_UPDATED',
        metadata: {
          newWardId: resolvedWardId,
          method: wardId ? 'MANUAL' : 'GPS',
        },
      },
    });

    res.json({ user, wardId: resolvedWardId });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const targetId = req.params.id as string;
    const result = await userService.deleteUser(targetId, req.user!.id, req.user!.adminUnitId ?? null);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const targetId = req.params.id as string;
    const { newPassword } = req.body;
    const result = await userService.changePassword(targetId, req.user!.id, req.user!.adminUnitId ?? null, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function uploadProfilePic(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE', message: 'No photo uploaded' });
      return;
    }

    const fileUrl = await storeFile(req.file.buffer, req.file.originalname, 'profile-pics');

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { profilePicUrl: fileUrl },
      select: { id: true, name: true, email: true, role: true, profilePicUrl: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'PROFILE_PIC_UPDATED',
        metadata: { fileUrl },
      },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function changeMyPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await userService.changeMyPassword(req.user!.id, currentPassword, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
