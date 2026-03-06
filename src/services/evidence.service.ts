/**
 * WitnessLedger — Evidence service
 * Handles evidence upload, SHA-256 hashing, EXIF extraction,
 * and geo-proximity validation against the parent issue.
 */
import path from 'path';
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { EvidenceType, Role } from '../generated/prisma/client.js';
import { sha256Buffer } from '../utils/hash.util';
import { extractExif } from '../utils/exif.util';
import { haversineDistance } from '../utils/geo.util';
import { config } from '../config';
import { IssueStatus } from '../generated/prisma/client.js';
import { storeFile } from '../utils/storage.util';
import { notify, notifyWardOfficers } from './notification.service.js';
import { checkPhotoFraud, persistFraudFlag } from './fraud.service.js';


/**
 * Upload and store evidence for an issue.
 * Returns the created Evidence record and any geo-warning.
 */
export async function uploadEvidence(
  issueId: string,
  uploaderId: string,
  uploaderRole: string,
  type: EvidenceType,
  file: Express.Multer.File,
  deviceLat?: number,
  deviceLng?: number,
) {
  // Validate issue exists
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, title: true, status: true, latitude: true, longitude: true, inspectorId: true, wardId: true, createdById: true },
  });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  // BEFORE photo: only the assigned INSPECTOR, issue must be INSPECTING
  if (type === EvidenceType.BEFORE) {
    if (uploaderRole !== Role.INSPECTOR)
      throw new AppError(403, 'FORBIDDEN', 'Only an INSPECTOR can upload BEFORE evidence');
    if (issue.inspectorId !== uploaderId)
      throw new AppError(403, 'FORBIDDEN', 'Only the assigned inspector for this issue can upload BEFORE evidence');
    if (issue.status !== IssueStatus.INSPECTING)
      throw new AppError(400, 'INVALID_STATUS', 'Issue must be in INSPECTING status for a BEFORE photo');
  }

  // AFTER photo: only the assigned INSPECTOR, issue must be WORK_DONE
  if (type === EvidenceType.AFTER) {
    if (uploaderRole !== Role.INSPECTOR)
      throw new AppError(403, 'FORBIDDEN', 'Only an INSPECTOR can upload AFTER evidence');
    if (issue.inspectorId !== uploaderId)
      throw new AppError(403, 'FORBIDDEN', 'Only the assigned inspector for this issue can upload AFTER evidence');
    if (issue.status !== IssueStatus.WORK_DONE)
      throw new AppError(400, 'INVALID_STATUS', 'Issue must be in WORK_DONE status for an AFTER photo — contractor must mark work done first');
  }

 

  // Compute file hash
  const fileHash = sha256Buffer(file.buffer);

  // Extract EXIF data
  const exif = await extractExif(file.buffer);

  // ── EXIF age validation (hard reject) ─────────────────────────────────────
  // If the photo carries a timestamp, it must be recent. This prevents
  // inspectors and citizens from submitting archived or stock photos.
  if (exif.datetime) {
    const maxAgeMs = config.photoMaxAgeHours * 60 * 60 * 1000;
    const cutoff   = new Date(Date.now() - maxAgeMs);
    if (exif.datetime < cutoff) {
      throw new AppError(
        400,
        'PHOTO_TOO_OLD',
        `Photo was taken at ${exif.datetime.toISOString()} which is more than ${config.photoMaxAgeHours}h ago. Please take a fresh photo on-site.`,
      );
    }
  }

  // Determine coordinates: use EXIF if available, else flag as geoFallback
  let evidenceLat = exif.latitude;
  let evidenceLon = exif.longitude;
  let geoFallback = false;

  if (evidenceLat === null || evidenceLon === null) {
    geoFallback = true;
    evidenceLat = null;
    evidenceLon = null;
  }

  // ── Device GPS vs EXIF GPS check (hard reject) ─────────────────────────
  // If the client sent its live device GPS AND the photo contains EXIF GPS,
  // both coordinates must agree within the configured tolerance. A large
  // discrepancy means the photo was taken elsewhere and passed off as on-site.
  if (
    deviceLat !== undefined && deviceLat !== null &&
    deviceLng !== undefined && deviceLng !== null &&
    evidenceLat !== null    && evidenceLon !== null
  ) {
    const deviceToPhotoDistance = haversineDistance(
      deviceLat, deviceLng, evidenceLat, evidenceLon,
    );
    if (deviceToPhotoDistance > config.devicePhotoDistanceMetres) {
      throw new AppError(
        400,
        'LOCATION_MISMATCH',
        `Your device location and the photo’s GPS location are ${Math.round(deviceToPhotoDistance)}m apart ` +
        `(limit: ${config.devicePhotoDistanceMetres}m). Please take the photo on-site with location enabled.`,
      );
    }
  }

  // Geo-proximity check against issue location
  let geoWarning: string | null = null;
  if (evidenceLat !== null && evidenceLon !== null) {
    const distance = haversineDistance(issue.latitude, issue.longitude, evidenceLat, evidenceLon);
    if (distance > config.geoThresholdMetres) {
      geoWarning = `Evidence location is ${Math.round(distance)}m from issue (threshold: ${config.geoThresholdMetres}m)`;
      geoFallback = true;
    }
  }

  // Save file (Cloudinary in production, local disk in dev)
  const fileUrl = await storeFile(file.buffer, file.originalname, 'evidence');

  // ── Perceptual hash + fraud detection ──────────────────────────────────
  // Always compute pHash (used both for storage and later fraud cross-checks).
  // For AFTER photos, also run the full fraud analysis before committing.
  const fraudResult = await checkPhotoFraud(file.buffer, issueId, type);

  // Create evidence record
  const evidence = await prisma.evidence.create({
    data: {
      issueId,
      type,
      fileUrl,
      fileHash,
      pHash:    fraudResult.pHash,   // store hash for future cross-checks
      latitude: evidenceLat,
      longitude: evidenceLon,
      exifTime: exif.datetime,
      geoFallback,
      uploadedById: uploaderId,
    },
  });

  // If fraud was detected, flag the record and alert ward staff
  if (fraudResult.fraudDetected) {
    await persistFraudFlag(
      evidence.id,
      issueId,
      issue.title,
      issue.wardId,
      fraudResult,
    );
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      issueId,
      actorId: uploaderId,
      action: `EVIDENCE_UPLOADED_${type}`,
      metadata: {
        evidenceId: evidence.id,
        fileHash,
        geoFallback,
        geoWarning,
      },
    },
  });

  // AFTER photo uploaded → automatically move issue to UNDER_REVIEW
  if (type === EvidenceType.AFTER) {
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: IssueStatus.UNDER_REVIEW },
    });
    await prisma.auditLog.create({
      data: {
        issueId,
        actorId: uploaderId,
        action: 'STATUS_CHANGED_TO_UNDER_REVIEW',
        metadata: { trigger: 'AFTER_PHOTO_UPLOADED' },
      },
    });
    // Notify ward officers to review
    await notifyWardOfficers(
      issue.wardId,
      'Issue Ready for Verification 📋',
      `Inspector has submitted an AFTER photo for "${issue.title}". Please verify the resolution.`,
      { issueId },
    );
    // Notify the citizen
    await notify(
      issue.createdById,
      'Almost There! Under Review 📋',
      `The work on your issue "${issue.title}" is being reviewed. You will be notified once it is verified.`,
      { issueId },
    );
  }

  return { evidence, geoWarning };
}

/**
 * List all evidence for a given issue.
 */
export async function listEvidence(issueId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  return prisma.evidence.findMany({
    where: { issueId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { uploadedAt: 'asc' },
  });
}
