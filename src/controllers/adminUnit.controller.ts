/**
 * WitnessLedger — AdminUnit controller
 */
import { Request, Response, NextFunction } from 'express';
import * as adminUnitService from '../services/adminUnit.service';

export async function listUnits(req: Request, res: Response, next: NextFunction) {
  try {
    const type = req.query.type as any;
    const parentId = req.query.parentId as string | undefined;
    const result = await adminUnitService.listAdminUnits(type, parentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminUnitService.createAdminUnit(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getChildren(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminUnitService.getChildren(req.params.id as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function nearestWard(req: Request, res: Response, next: NextFunction) {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'INVALID_COORDS', message: 'lat and lng are required numbers' });
      return;
    }

    const result = await adminUnitService.getNearestWard(lat, lng);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
