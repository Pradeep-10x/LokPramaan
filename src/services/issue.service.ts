/**
 * WitnessLedger — Issue service
 * Core issue lifecycle: creation with auto-assignment, listing, assignment,
 * conversion to project, and duplicate toggling.
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { IssueStatus, ProjectStatus, Role } from '../generated/prisma/client.js';
import { config } from '../config';

export interface CreateIssueInput {
  title: string;
  description?: string;
  department: string;
  latitude: number;
  longitude: number;
  wardId: string;
  createdById: string;
  projectId?: string;
}

export interface AssignInput {
  assignedToId: string;
  slaHours?: number;
}

export interface ConvertInput {
  title: string;
  description?: string;
  budget?: number;
}

/**
 * Create a new issue. Status always starts as OPEN.
 * An officer may be pre-routed via assignedToId for dashboard visibility,
 * but the issue must be explicitly accepted before work begins.
 */
export async function createIssue(input: CreateIssueInput) {
  // Validate ward exists and is type WARD
  const ward = await prisma.adminUnit.findUnique({ where: { id: input.wardId } });
  if (!ward || ward.type !== 'WARD') {
    throw new AppError(400, 'INVALID_WARD', 'wardId must reference an existing WARD');
  }
   
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) {
      throw new AppError(400, 'INVALID_PROJECT', 'Project not found');
    }
  }

  // Find an officer assigned to this ward for dashboard routing
  const officer = await prisma.user.findFirst({
    where: { adminUnitId: input.wardId, role: Role.OFFICER },
    orderBy: { createdAt: 'asc' },
  });

  const issue = await prisma.issue.create({
    data: {
      title: input.title,
      description: input.description,
      department: input.department as any,
      latitude: input.latitude,
      longitude: input.longitude,
      wardId: input.wardId,
      createdById: input.createdById,
      assignedToId: officer?.id,
      status: IssueStatus.OPEN,
      projectId: input.projectId,
    },
    include: {
      ward: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      issueId: issue.id,
      actorId: input.createdById,
      action: 'ISSUE_CREATED',
      metadata: {
        routedToOfficer: officer?.id ?? null,
        status: issue.status,
      },
    },
  });

  return issue;
}

/**
 * Accept an issue (OFFICER/ADMIN action).
 * Transitions status from OPEN → ACCEPTED and records the accepting user.
 */
export async function acceptIssue(
  issueId: string,
  actorId: string,
  actorAdminUnitId: string | null,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  if (issue.status !== IssueStatus.OPEN) {
    throw new AppError(400, 'INVALID_STATUS', 'Only OPEN issues can be accepted');
  }

  // Ward-match check: actor must belong to the same ward as the issue
  if (!actorAdminUnitId || actorAdminUnitId !== issue.wardId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only accept issues in your own ward');
  }

  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: {
        status: IssueStatus.ACCEPTED,
        acceptedById: actorId,
        acceptedAt: now,
      },
      include: {
        ward: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        acceptedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId,
        actorId,
        action: 'ISSUE_ACCEPTED',
        metadata: { previousStatus: issue.status },
      },
    }),
  ]);

  return updated;
}

/**
 * Reject an issue (OFFICER/ADMIN action).
 * Transitions status from OPEN → REJECTED with a mandatory reason.
 */
export async function rejectIssue(
  issueId: string,
  actorId: string,
  actorAdminUnitId: string | null,
  reason: string,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  if (issue.status !== IssueStatus.OPEN) {
    throw new AppError(400, 'INVALID_STATUS', 'Only OPEN issues can be rejected');
  }

  if (!actorAdminUnitId || actorAdminUnitId !== issue.wardId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only reject issues in your own ward');
  }

  if (!reason || reason.trim().length === 0) {
    throw new AppError(400, 'MISSING_REASON', 'A reason is required when rejecting an issue');
  }

  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: {
        status: IssueStatus.REJECTED,
        rejectedById: actorId,
        rejectedAt: now,
        rejectionReason: reason.trim(),
      },
      include: {
        ward: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId,
        actorId,
        action: 'ISSUE_REJECTED',
        metadata: { reason: reason.trim() },
      },
    }),
  ]);

  return updated;
}

/**
 * List issues with optional filters.
 */
export async function listIssues(filters: {
  wardId?: string;
  status?: IssueStatus;
  assignedToId?: string;
  projectId?: string;
}) {
  return prisma.issue.findMany({
    where: {
      ...(filters.wardId && { wardId: filters.wardId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.assignedToId && { assignedToId: filters.assignedToId }),
       ...(filters.projectId && { projectId: filters.projectId }),
    },
    include: {
      ward: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { evidence: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single issue with full details and evidence.
 */
export async function getIssueById(id: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      ward: true,
      project: { select: { id: true, title: true, status: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      evidence: {
        orderBy: { uploadedAt: 'asc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      verification: true,
      duplicateOf: { select: { id: true, title: true } },
    },
  });

  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  // Fetch timeline (audit logs)
  const timeline = await prisma.auditLog.findMany({
    where: { issueId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, name: true } } },
  });

  return { ...issue, timeline };
}

/**
 * (Re-)assign an issue to a user (OFFICER/ADMIN action).
 */
export async function assignIssue(issueId: string, actorId: string, input: AssignInput) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId } });
  if (!assignee) {
    throw new AppError(400, 'INVALID_USER', 'Assignee not found');
  }

  const slaHours = input.slaHours ?? config.slaDefaultHours;
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: {
        assignedToId: input.assignedToId,
        status: IssueStatus.ASSIGNED,
        slaDeadline,
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId,
        actorId,
        action: 'ISSUE_ASSIGNED',
        metadata: { assignedToId: input.assignedToId, slaHours },
      },
    }),
  ]);

  return updated;
}

/**
 * Convert an issue into a proposed project (OFFICER only, atomic transaction).
 */
export async function convertIssueToProject(
  issueId: string,
  actorId: string,
  input: ConvertInput,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  // Use a transaction to ensure atomicity
  const [project] = await prisma.$transaction([
    prisma.project.create({
      data: {
        title: input.title,
        description: input.description ?? '',
        budget: input.budget,
        status: ProjectStatus.PROPOSED,
        adminUnitId: issue.wardId,
        createdById: actorId,
      },
    }),
    // Defer further updates — we'll use the result outside
  ]);

  // Now link issue and update status
  await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: {
        projectId: project.id,
        status: IssueStatus.IN_PROGRESS,
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId,
        projectId: project.id,
        actorId,
        action: 'ISSUE_CONVERTED_TO_PROJECT',
        metadata: { projectTitle: input.title, budget: input.budget },
      },
    }),
  ]);

  return project;
}

/**
 * Toggle duplicate status on an issue.
 */
export async function toggleDuplicate(issueId: string, actorId: string, duplicateOfId?: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  if (duplicateOfId) {
    const original = await prisma.issue.findUnique({ where: { id: duplicateOfId } });
    if (!original) {
      throw new AppError(400, 'INVALID_ISSUE', 'Duplicate target issue not found');
    }
  }

  const newDuplicateOfId = issue.duplicateOfId ? null : (duplicateOfId ?? null);

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: { duplicateOfId: newDuplicateOfId },
    }),
    prisma.auditLog.create({
      data: {
        issueId,
        actorId,
        action: newDuplicateOfId ? 'ISSUE_MARKED_DUPLICATE' : 'ISSUE_UNMARKED_DUPLICATE',
        metadata: { duplicateOfId: newDuplicateOfId },
      },
    }),
  ]);

  return updated;
}
