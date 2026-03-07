/**
 * WitnessLedger — Users controller
 */
import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service';
import { getNearestWard } from '../services/adminUnit.service.js';
import { prisma } from '../prisma/client.js';
import { AppError } from '../middleware/error.middleware.js';

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.createUser({
      ...req.body,
      adminUnitId: req.user!.adminUnitId,
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

    const users = await prisma.user.findMany({
      where: {
        ...(adminUnitId && { adminUnitId }),
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
