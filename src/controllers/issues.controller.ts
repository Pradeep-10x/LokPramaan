/**
 * WitnessLedger — Issues controller
 */
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as issueService from '../services/issue.service';
import * as evidenceService from '../services/evidence.service';
import { EvidenceType, IssueStatus } from '../generated/prisma/client.js';
import { prisma } from '../prisma/client';
import { tryExtractPhotoLocation } from '../services/exif.service';
import { getNearestWard } from '../services/adminUnit.service';
import { haversineDistance } from '../utils/geo.util';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const upload = multer({ storage: multer.memoryStorage() });

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    let latitude: number | undefined;
    let longitude: number | undefined;
    let photoDeviceLocationWarning: string | null = null;

    // ── Step 1: Try photo EXIF first ──────────────────────────
    let exifLocation: { lat: number; lng: number } | null = null;
    if (req.file) {
      const exif = await tryExtractPhotoLocation(req.file.buffer);
      if (exif) {
        // ✅ Photo has valid GPS + fresh timestamp
        latitude     = exif.lat;
        longitude    = exif.lng;
        exifLocation = { lat: exif.lat, lng: exif.lng };
      }
      // ❌ Photo has no GPS / too old → fall through to device GPS
    }

    // ── Step 2: Fall back to device GPS sent by frontend ─────
    const deviceLat = parseFloat(req.body.deviceLat);
    const deviceLng = parseFloat(req.body.deviceLng);
    const hasDeviceGps = !isNaN(deviceLat) && !isNaN(deviceLng);

    if (latitude === undefined || longitude === undefined) {
      if (hasDeviceGps) {
        latitude  = deviceLat;
        longitude = deviceLng;
      }
    }

    // ── Step 3: Location is required — reject if still missing ─
    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({
        error: 'LOCATION_REQUIRED',
        message: 'Could not determine location. Please allow GPS access or upload a photo with location enabled.',
      });
      return;
    }

    // ── Step 4: Cross-check device GPS vs photo EXIF GPS ──────
    // If the citizen’s device GPS and the photo EXIF GPS are available but
    // far apart, the photo may have been taken at a different location.
    // We warn (not reject) since for issue creation the citizen might have
    // slightly moved between taking the photo and submitting.
    if (exifLocation && hasDeviceGps) {
      const dist = haversineDistance(exifLocation.lat, exifLocation.lng, deviceLat, deviceLng);
      if (dist > config.devicePhotoDistanceMetres) {
        photoDeviceLocationWarning =
          `Photo GPS and device GPS are ${Math.round(dist)}m apart. ` +
          `Using photo GPS. Verify you were on-site when the photo was taken.`;
      }
    }

    // ── Step 5: Always auto-detect ward — never trust body ────
    const nearest = await getNearestWard(latitude, longitude);

    const result = await issueService.createIssue({
      title:       req.body.title,
      description: req.body.description,
      projectId:   typeof req.params.projectId === 'string' ? req.params.projectId : (req.body.projectId as string | undefined),
      createdById: req.user!.id,
      latitude,
      longitude,
      wardId: nearest.wardId,   // always auto-detected, never from body
    });

    // ── Step 6: Persist citizen’s photo as CITIZEN evidence ────────────
    // The photo was already used for GPS; now store it permanently.
    let citizenEvidence: Awaited<ReturnType<typeof evidenceService.uploadEvidence>> | null = null;
    if (req.file) {
      try {
        citizenEvidence = await evidenceService.uploadEvidence(
          result.id,
          req.user!.id,
          req.user!.role,
          EvidenceType.CITIZEN,
          req.file,
          hasDeviceGps ? deviceLat : undefined,
          hasDeviceGps ? deviceLng : undefined,
        );
      } catch {
        // Photo storage failure must not block issue creation; log only
        logger.error('[create issue] Failed to store citizen photo', { issueId: result.id });
      }
    }

    res.status(201).json({
      ...result,
      citizenPhoto: citizenEvidence?.evidence ?? null,
      ...(photoDeviceLocationWarning ? { photoDeviceLocationWarning } : {}),
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const type = req.body.type as EvidenceType;

    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE', message: 'Photo evidence is required' });
      return;
    }

    const deviceLat = parseFloat(req.body.latitude);
    const deviceLng = parseFloat(req.body.longitude);

    if (isNaN(deviceLat) || isNaN(deviceLng)) {
      res.status(400).json({
        error: 'LOCATION_REQUIRED',
        message: 'Live device latitude and longitude are mandatory for evidence upload.',
      });
      return;
    }

    const result = await evidenceService.uploadEvidence(
      id,
      req.user!.id,
      req.user!.role,
      type,
      req.file,
      deviceLat,
      deviceLng,
    );

    res.status(201).json({
      evidence: result.evidence,
      warning: result.geoWarning,
    });
  } catch (err) {
    next(err);
  }
}


// ...existing code...
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const rawProjectId = req.params.projectId ?? req.query.projectId;
    const projectId = typeof rawProjectId === 'string' ? rawProjectId : undefined;

    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus && (Object.values(IssueStatus) as string[]).includes(rawStatus)
      ? (rawStatus as IssueStatus)
      : undefined;
    // We use a broader logical OR in the service if assignedTo is provided
    // so it matches officer, inspector, or contractor.
    const assignedId = req.query.assignedTo as string | undefined;

    const result = await issueService.listIssues({
      wardId:       req.query.wardId       as string | undefined,
      status,
      assignedToId: assignedId,
      inspectorId:  assignedId,
      contractorId: assignedId,
      createdById:  req.query.createdById  as string | undefined,
      projectId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
// ...existing code...

/**
 * GET /api/issues/mine
 * Returns all issues created by the logged-in citizen, newest first.
 */
export async function mine(req: Request, res: Response, next: NextFunction) {
  try {
    const mineRawStatus = req.query.status as string | undefined;
    const mineStatus = mineRawStatus && (Object.values(IssueStatus) as string[]).includes(mineRawStatus)
      ? (mineRawStatus as IssueStatus)
      : undefined;
    const result = await issueService.listIssues({
      createdById: req.user!.id,
      status: mineStatus,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/issues/my-ward
 * Returns all issues in the logged-in citizen's ward — full transparency.
 */
export async function myWard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user!.adminUnitId) {
      res.status(400).json({
        error: 'NO_WARD',
        message: 'Your account has no ward set. Update it via PATCH /api/users/me/ward',
      });
      return;
    }
    const wardRawStatus = req.query.status as string | undefined;
    const wardStatus = wardRawStatus && (Object.values(IssueStatus) as string[]).includes(wardRawStatus)
      ? (wardRawStatus as IssueStatus)
      : undefined;
    const result = await issueService.listIssues({
      wardId: req.user!.adminUnitId,
      status: wardStatus,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.getIssueById(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function assign(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.assignIssue(id, req.user!.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.acceptIssue(id, req.user!.id, req.user!.adminUnitId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.rejectIssue(
      id,
      req.user!.id,
      req.user!.adminUnitId,
      req.body.reason,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function convert(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.convertIssueToProject(id, req.user!.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function assignInspector(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    if (!req.body.inspectorId || typeof req.body.inspectorId !== 'string') {
      res.status(400).json({ error: 'inspectorId is required and must be a string' });
      return;
    }
    const result = await issueService.assignInspector(id, req.user!.id, req.body.inspectorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function hireContractor(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    if (!req.body.contractorId || typeof req.body.contractorId !== 'string') {
      res.status(400).json({ error: 'contractorId is required and must be a string' });
      return;
    }
    const result = await issueService.hireContractor(id, req.user!.id, req.body.contractorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function markWorkDone(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.markWorkDone(id, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function toggleDuplicate(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await issueService.toggleDuplicate(
      id,
      req.user!.id,
      req.body.duplicateOfId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const logs = await prisma.auditLog.findMany({
      where: { issueId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, name: true } } },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
