/**
 * WitnessLedger — Projects controller
 */
import { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service';
import { prisma } from '../prisma/client';
import { ProjectStatus } from '../generated/prisma/client.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const adminUnitId = req.body.adminUnitId ?? req.user!.adminUnitId;
    if (!adminUnitId) {
      res.status(400).json({ error: 'adminUnitId is required' });
      return;
    }
    const result = await projectService.createProject(
      {
        ...req.body,
        adminUnitId,
      },
      req.user!.id,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus && (Object.values(ProjectStatus) as string[]).includes(rawStatus)
      ? (rawStatus as ProjectStatus)
      : undefined;
    const result = await projectService.listProjects({
      adminUnitId: req.query.adminUnitId as string | undefined,
      status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/projects/my-ward
 * Returns all projects in the logged-in citizen's ward — full transparency.
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
    const wardStatus = wardRawStatus && (Object.values(ProjectStatus) as string[]).includes(wardRawStatus)
      ? (wardRawStatus as ProjectStatus)
      : undefined;
    const result = await projectService.listProjects({
      adminUnitId: req.user!.adminUnitId,
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
    const result = await projectService.getProjectById(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await projectService.approveProject(id, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const logs = await prisma.auditLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, name: true } } },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
}
