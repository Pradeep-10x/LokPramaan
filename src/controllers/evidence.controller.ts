/**
 * WitnessLedger — Evidence controller
 */
import { Request, Response, NextFunction } from 'express';
import * as evidenceService from '../services/evidence.service';
import { EvidenceType } from '../generated/prisma/client.js';

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ code: 'NO_FILE', message: 'File is required' });
      return;
    }

    const type = ((req.query.type || req.body.type) as string) as EvidenceType;
    if (!type || !['BEFORE', 'AFTER', 'DOCUMENT'].includes(type)) {
      res.status(400).json({ code: 'INVALID_TYPE', message: 'type must be BEFORE, AFTER,' });
      return;
    }

    const id = req.params.id as string;

    // Optional device GPS — used to cross-check against photo EXIF GPS
    const deviceLat = req.body.deviceLat !== undefined ? parseFloat(req.body.deviceLat) : undefined;
    const deviceLng = req.body.deviceLng !== undefined ? parseFloat(req.body.deviceLng) : undefined;

    const result = await evidenceService.uploadEvidence(
      id,
      req.user!.id,
      req.user!.role,
      type,
      req.file,
      !isNaN(deviceLat as number) ? (deviceLat as number) : undefined,
      !isNaN(deviceLng as number) ? (deviceLng as number) : undefined,
    );

    const status = result.geoWarning ? 200 : 201;
    res.status(status).json(result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await evidenceService.listEvidence(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
