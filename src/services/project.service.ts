/**
 * WitnessLedger — Project service
 * Handles project creation, listing, approval.
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { ProjectStatus } from '../generated/prisma/client.js';

export interface CreateProjectInput {
  title: string;
  description?: string;
  adminUnitId: string;
  createdById: string;
  budget?: number;
}

/**
 * Create a new project (ADMIN only). Defaults to PROPOSED status.
 */
export async function createProject(input: CreateProjectInput) {
  const unit = await prisma.adminUnit.findUnique({ where: { id: input.adminUnitId } });
  if (!unit) {
    throw new AppError(400, 'INVALID_UNIT', 'Admin unit not found');
  }

  const project = await prisma.project.create({
    data: {
      title: input.title,
      description: input.description ?? '',
      adminUnitId: input.adminUnitId,
      createdById: input.createdById,
      budget: input.budget,
      status: ProjectStatus.PROPOSED,
    },
    include: { adminUnit: true, createdBy: { select: { id: true, name: true } } },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      actorId: input.createdById,
      action: 'PROJECT_CREATED',
      metadata: { title: input.title, status: 'PROPOSED' },
    },
  });

  return project;
}

/**
 * List projects with optional filter by adminUnitId or status.
 */
export async function listProjects(filters: { adminUnitId?: string; status?: ProjectStatus }) {
  return prisma.project.findMany({
    where: {
      ...(filters.adminUnitId && { adminUnitId: filters.adminUnitId }),
      ...(filters.status && { status: filters.status }),
    },
    include: {
      adminUnit: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { issues: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single project by ID with full details.
 */
export async function getProjectById(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      adminUnit: true,
      createdBy: { select: { id: true, name: true } },
      issues: { select: { id: true, title: true, status: true } },
    },
  });

  if (!project) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found');
  }

  return project;
}

/**
 * Approve a PROPOSED project (ADMIN only). Sets status to ACTIVE.
 */
export async function approveProject(projectId: string, actorId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found');
  }
  if (project.status !== ProjectStatus.PROPOSED) {
    throw new AppError(400, 'INVALID_STATUS', 'Only PROPOSED projects can be approved');
  }

  const [updated] = await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { status: ProjectStatus.ACTIVE } }),
    prisma.auditLog.create({
      data: {
        projectId,
        actorId,
        action: 'PROJECT_APPROVED',
        metadata: { previousStatus: 'PROPOSED', newStatus: 'ACTIVE' },
      },
    }),
  ]);

  return updated;
}
