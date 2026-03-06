/**
 * WitnessLedger — AdminUnit service
 * CRUD operations for the administrative hierarchy (Global → City → Ward).
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { AdminUnitType } from '../generated/prisma/client.js';

export interface CreateAdminUnitInput {
  name: string;
  type: AdminUnitType;
  parentId?: string;
  centerLat?: number;
  centerLng?: number;
}

/**
 * List all admin units, optionally filtered by type and/or parentId.
 */
export async function listAdminUnits(type?: AdminUnitType, parentId?: string) {
  return prisma.adminUnit.findMany({
    where: {
      ...(type && { type }),
      ...(parentId && { parentId }),
    },
    include: { parent: { select: { id: true, name: true, type: true } } },
    orderBy: { name: 'asc' },
  });
}

/**
 * Create a new admin unit (ADMIN only).
 */
export async function createAdminUnit(input: CreateAdminUnitInput) {
  if (input.parentId) {
    const parent = await prisma.adminUnit.findUnique({ where: { id: input.parentId } });
    if (!parent) {
      throw new AppError(400, 'INVALID_PARENT', 'Parent admin unit not found');
    }
  }

  return prisma.adminUnit.create({
    data: {
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      centerLat: input.centerLat,
      centerLng: input.centerLng,
    },
  });
}

/**
 * Find the nearest ward to a given lat/lng using Haversine distance.
 */
export async function getNearestWard(lat: number, lng: number) {
  const wards = await prisma.adminUnit.findMany({
    where: {
      type: AdminUnitType.WARD,
      centerLat: { not: null },
      centerLng: { not: null },
    },
    select: {
      id: true,
      name: true,
      centerLat: true,
      centerLng: true,
      parent: { select: { id: true, name: true } },
    },
  });

  if (wards.length === 0) {
    throw new AppError(404, 'NO_WARDS', 'No wards with location data found');
  }

  let nearestWard = wards[0];
  let minDistance = haversine(lat, lng, wards[0].centerLat!, wards[0].centerLng!);

  for (const ward of wards.slice(1)) {
    const d = haversine(lat, lng, ward.centerLat!, ward.centerLng!);
    if (d < minDistance) {
      minDistance = d;
      nearestWard = ward;
    }
  }

  return {
    wardId: nearestWard.id,
    wardName: nearestWard.name,
    city: nearestWard.parent,
    distanceKm: parseFloat(minDistance.toFixed(2)),
  };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Get children of a given admin unit (e.g. wards for a city).
 */
export async function getChildren(unitId: string) {
  const unit = await prisma.adminUnit.findUnique({ where: { id: unitId } });
  if (!unit) {
    throw new AppError(404, 'NOT_FOUND', 'Admin unit not found');
  }

  return prisma.adminUnit.findMany({
    where: { parentId: unitId },
    orderBy: { name: 'asc' },
  });
}
