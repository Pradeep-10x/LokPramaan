/**
 * WitnessLedger — Issues controller
 */
import { Request, Response, NextFunction } from 'express';
import * as issueService from '../services/issue.service';
import { prisma } from '../prisma/client';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await issueService.createIssue({
      ...req.body,
      createdById: req.user!.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await issueService.listIssues({
      wardId: req.query.wardId as string | undefined,
      status: req.query.status as any,
      assignedToId: req.query.assignedTo as string | undefined,
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
