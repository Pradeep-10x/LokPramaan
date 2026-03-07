/**
 * WitnessLedger — Notification service
 * Finds nearby residents for an issue and creates notification log entries.
 * Optionally sends via Twilio if configured.
 */
import crypto from 'crypto';
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { NotificationChannel, Role } from '../generated/prisma/client.js';
import { haversineDistance } from '../utils/geo.util';
import { parseResidentsCsv, ResidentRow } from '../utils/csv.util';
import { config } from '../config';

/**
 * Import residents from a CSV buffer. Phone numbers are hashed for privacy.
 */
export async function importResidents(buffer: Buffer) {
  const rows = parseResidentsCsv(buffer);

  const created = [];
  for (const row of rows) {
    const phoneHash = crypto
      .createHash('sha256')
      .update(row.phone + config.residentPhoneSalt)
      .digest('hex');

    const latitude = parseFloat(row.latitude);
    const longitude = parseFloat(row.longitude);
    if (isNaN(latitude) || isNaN(longitude)) {
      throw new AppError(
        400,
        'INVALID_COORDS',
        `Invalid lat/lng for resident "${row.name || 'unknown'}": lat=${row.latitude}, lng=${row.longitude}`,
      );
    }
    const resident = await prisma.resident.create({
      data: {
        name: row.name || null,
        phoneHash,
        latitude,
        longitude,
      },
    });
    created.push(resident);
  }

  return { imported: created.length, residents: created };
}

/**
 * Find residents within radius of an issue and create notification logs.
 * Uses in-memory haversine filtering (for PostGIS, use SQL ST_DWithin).
 */
export async function notifyNearbyResidents(
  issueId: string,
  actorId: string,
  radiusMetres: number = 50,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  // Fetch all residents (in production, use PostGIS ST_DWithin for efficiency)
  const allResidents = await prisma.resident.findMany();

  const nearby = allResidents.filter((r) => {
    const distance = haversineDistance(issue.latitude, issue.longitude, r.latitude, r.longitude);
    return distance <= radiusMetres;
  });

  const message = `Issue "${issue.title}" reported near your location. Status: ${issue.status}`;

  const logs = [];
  for (const resident of nearby) {
    const log = await prisma.notificationLog.create({
      data: {
        issueId,
        recipientHash: resident.phoneHash,
        message,
        channel: NotificationChannel.SYSTEM,
        status: config.twilio.sid ? 'PENDING' : 'SIMULATED',
      },
    });
    logs.push(log);

    // TODO: If Twilio is configured, send actual SMS here
    // if (config.twilio.sid && config.twilio.token) {
    //   await twilioClient.messages.create({ ... });
    //   await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'SENT' } });
    // }
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      issueId,
      actorId,
      action: 'RESIDENTS_NOTIFIED',
      metadata: { nearbyCount: nearby.length, radiusMetres },
    },
  });

  return { notified: logs.length, logs };
}

// ─── In-app user notifications ────────────────────────────────────────────────

/**
 * Create a single in-app notification for a user.
 */
export async function notify(
  userId: string,
  title: string,
  body: string,
  meta?: { issueId?: string; projectId?: string },
) {
  return prisma.userNotification.create({
    data: {
      userId,
      title,
      body,
      issueId: meta?.issueId,
      projectId: meta?.projectId,
    },
  });
}

/**
 * Notify all OFFICER + ADMIN users assigned to a ward.
 */
export async function notifyWardOfficers(
  wardId: string,
  title: string,
  body: string,
  meta?: { issueId?: string; projectId?: string },
) {
  const staff = await prisma.user.findMany({
    where: { adminUnitId: wardId, role: { in: [Role.OFFICER, Role.ADMIN] } },
    select: { id: true },
  });
  await Promise.all(staff.map((u) => notify(u.id, title, body, meta)));
}

/**
 * Notify all ADMIN + OFFICER + INSPECTOR users assigned to a ward.
 * Used for escalation alerts where inspectors also need to be in the loop.
 */
export async function notifyWardStaff(
  wardId: string,
  title: string,
  body: string,
  meta?: { issueId?: string; projectId?: string },
) {
  const staff = await prisma.user.findMany({
    where: { adminUnitId: wardId, role: { in: [Role.ADMIN, Role.OFFICER, Role.INSPECTOR] } },
    select: { id: true },
  });
  await Promise.all(staff.map((u) => notify(u.id, title, body, meta)));
}
