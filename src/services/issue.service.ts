/**
 * WitnessLedger — Issue service
 * Core issue lifecycle: creation with auto-assignment, listing, assignment,
 * conversion to project, and duplicate toggling.
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { IssueStatus, ProjectStatus, Role, EvidenceType } from '../generated/prisma/client.js';
import { config } from '../config';
import { notify, notifyWardOfficers } from './notification.service.js';
import { haversineDistance } from '../utils/geo.util.js';
import { classifyDepartment, type ClassificationResult } from './classification.service.js';

/** Issues within this radius (metres) are flagged as potential duplicates on creation. */
const DUPLICATE_RADIUS_METRES = 100;

/**
 * Returns a 0-100 progress score for an issue based on its current status.
 * Useful for progress bars / dashboards.
 */
export function getProgressScore(status: IssueStatus): number {
  const scores: Record<IssueStatus, number> = {
    [IssueStatus.OPEN]:                 5,
    [IssueStatus.ACCEPTED]:            15,
    [IssueStatus.REJECTED]:             0,
    [IssueStatus.ASSIGNED]:            25,
    [IssueStatus.INSPECTING]:          40,
    [IssueStatus.CONTRACTOR_ASSIGNED]: 55,
    [IssueStatus.WORK_DONE]:           70,
    [IssueStatus.UNDER_REVIEW]:        85,
    [IssueStatus.IN_PROGRESS]:         60,
    [IssueStatus.COMPLETED]:           95,
    [IssueStatus.VERIFIED]:           100,
  };
  return scores[status] ?? 0;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  /** Optional — if omitted the department is auto-classified from title + description. */
  department?: string;
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
  // ── Auto-classify department ──────────────────────────────────────────────
  const classification = classifyDepartment(
    input.title,
    input.description,
    input.department,          // undefined → auto-classify; provided → honour as-is
  );
  const resolvedDepartment = classification.department;

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
      department: resolvedDepartment as any,
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

  // Notify all officers in the ward about the new issue
  await notifyWardOfficers(
    input.wardId,
    'New Issue Reported',
    `"${issue.title}" has been submitted in your ward (${issue.ward.name}).`,
    { issueId: issue.id },
  );

  // ── Duplicate Detection ──────────────────────────────────────────────────
  // Find active issues in the same ward and flag any within 100 m as potential duplicates.
  const wardIssues = await prisma.issue.findMany({
    where: {
      wardId: input.wardId,
      id:     { not: issue.id },
      status: { notIn: [IssueStatus.REJECTED, IssueStatus.VERIFIED, IssueStatus.COMPLETED] },
    },
    select: { id: true, title: true, status: true, latitude: true, longitude: true },
  });

  const potentialDuplicates = wardIssues
    .map((i) => ({
      id:             i.id,
      title:          i.title,
      status:         i.status,
      distanceMetres: Math.round(haversineDistance(input.latitude, input.longitude, i.latitude, i.longitude)),
    }))
    .filter((i) => i.distanceMetres <= DUPLICATE_RADIUS_METRES)
    .sort((a, b) => a.distanceMetres - b.distanceMetres);

  if (potentialDuplicates.length > 0) {
    await notifyWardOfficers(
      input.wardId,
      '⚠️ Possible Duplicate Issue',
      `New issue "${issue.title}" may be a duplicate of ${potentialDuplicates.length} existing issue(s) nearby (within ${DUPLICATE_RADIUS_METRES}m).`,
      { issueId: issue.id },
    );
  }

  return { ...issue, progressScore: getProgressScore(issue.status), potentialDuplicates, classification };
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

  // Notify the citizen who raised the issue
  await notify(
    issue.createdById,
    'Issue Accepted ✓',
    `Your issue "${issue.title}" has been accepted and is now being processed.`,
    { issueId },
  );

  // ── Auto-assign Inspector ─────────────────────────────────────────────────
  // Pick the least-busy inspector in the ward (one with no active inspections first,
  // otherwise fall back to any inspector in the ward).
  const freeInspector = await prisma.user.findFirst({
    where: {
      adminUnitId: issue.wardId,
      role: Role.INSPECTOR,
      inspectedIssues: {
        none: { status: { in: [IssueStatus.INSPECTING, IssueStatus.CONTRACTOR_ASSIGNED, IssueStatus.WORK_DONE] } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const inspector = freeInspector ?? await prisma.user.findFirst({
    where: { adminUnitId: issue.wardId, role: Role.INSPECTOR },
    orderBy: { createdAt: 'asc' },
  });

  let autoAssignedInspector: { id: string; name: string } | null = null;

  if (inspector) {
    await prisma.$transaction([
      prisma.issue.update({
        where: { id: issueId },
        data:  { inspectorId: inspector.id, status: IssueStatus.INSPECTING },
      }),
      prisma.auditLog.create({
        data: {
          issueId,
          actorId: null,   // system-triggered
          action:  'INSPECTOR_AUTO_ASSIGNED',
          metadata: { inspectorId: inspector.id, inspectorName: inspector.name },
        },
      }),
    ]);
    await notify(
      inspector.id,
      'Inspection Assignment 🔍',
      `You have been auto-assigned to inspect "${issue.title}". Please upload a BEFORE photo.`,
      { issueId },
    );
    await notify(
      issue.createdById,
      'Inspector Assigned 🔍',
      `An inspector has been auto-assigned to your issue "${issue.title}". Site inspection is underway.`,
      { issueId },
    );
    autoAssignedInspector = { id: inspector.id, name: inspector.name };
  }

  return {
    ...updated,
    progressScore: getProgressScore(autoAssignedInspector ? IssueStatus.INSPECTING : IssueStatus.ACCEPTED),
    autoAssignedInspector,
  };
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

  // Notify the citizen who raised the issue
  await notify(
    issue.createdById,
    'Issue Rejected',
    `Your issue "${issue.title}" was rejected. Reason: ${reason.trim()}`,
    { issueId },
  );

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
  createdById?: string;
}) {
  const issues = await prisma.issue.findMany({
    where: {
      ...(filters.wardId      && { wardId:       filters.wardId }),
      ...(filters.status      && { status:       filters.status }),
      ...(filters.assignedToId && { assignedToId: filters.assignedToId }),
      ...(filters.projectId   && { projectId:    filters.projectId }),
      ...(filters.createdById && { createdById:  filters.createdById }),
    },
    include: {
      ward: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { evidence: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return issues.map((i) => ({ ...i, progressScore: getProgressScore(i.status) }));
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
      createdBy:  { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      acceptedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      evidence: {
        orderBy: { uploadedAt: 'asc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      verification: {
        include: { verifiedBy: { select: { id: true, name: true } } },
      },
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

  return { ...issue, timeline, progressScore: getProgressScore(issue.status) };
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

  // Notify the officer who was assigned
  await notify(
    input.assignedToId,
    'Issue Assigned to You',
    `You have been assigned to handle issue "${issue.title}". SLA: ${slaHours} hours.`,
    { issueId },
  );

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

  // Resolve project status based on actor's role (mirrors project.service.ts logic)
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  const projectStatus = actor?.role === Role.ADMIN
    ? ProjectStatus.ACTIVE    // ADMIN → auto-approved
    : ProjectStatus.PROPOSED; // OFFICER → needs admin approval

  // Use a transaction to ensure atomicity
  const [project] = await prisma.$transaction([
    prisma.project.create({
      data: {
        title: input.title,
        description: input.description ?? '',
        budget: input.budget,
        status: projectStatus,
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
        metadata: { projectTitle: input.title, budget: input.budget, projectStatus },
      },
    }),
  ]);

  // Notify the citizen who raised the issue
  await notify(
    issue.createdById,
    'Issue Upgraded to Project 🏗️',
    `Your issue "${issue.title}" has been converted into a project: "${input.title}".`,
    { issueId, projectId: project.id },
  );

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

/**
 * Assign an inspector to an issue (OFFICER/ADMIN action).
 * Issue must be ACCEPTED. Inspector must have INSPECTOR role.
 * Status transitions: ACCEPTED → INSPECTING
 */
export async function assignInspector(issueId: string, actorId: string, inspectorId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  if (issue.status !== IssueStatus.ACCEPTED)
    throw new AppError(400, 'INVALID_STATUS', 'Issue must be ACCEPTED before assigning an inspector');

  const inspector = await prisma.user.findUnique({ where: { id: inspectorId } });
  if (!inspector || inspector.role !== Role.INSPECTOR)
    throw new AppError(400, 'INVALID_USER', 'User must have INSPECTOR role');

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: { inspectorId, status: IssueStatus.INSPECTING },
      include: {
        inspector: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId, actorId,
        action: 'INSPECTOR_ASSIGNED',
        metadata: { inspectorId, inspectorName: inspector.name },
      },
    }),
  ]);

  // Notify the inspector
  await notify(
    inspectorId,
    'Inspection Assignment',
    `You have been assigned to inspect issue "${issue.title}". Please upload a BEFORE photo.`,
    { issueId },
  );

  // Notify the citizen
  await notify(
    issue.createdById,
    'Inspector Assigned 🔍',
    `An inspector has been assigned to your issue "${issue.title}". Site inspection is underway.`,
    { issueId },
  );

  return updated;
}

/**
 * Hire a contractor for an issue (OFFICER/ADMIN action).
 * Issue must be INSPECTING and a BEFORE photo must already be uploaded.
 * Status transitions: INSPECTING → CONTRACTOR_ASSIGNED
 */
export async function hireContractor(issueId: string, actorId: string, contractorId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { evidence: { where: { type: EvidenceType.BEFORE } } },
  });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  if (issue.status !== IssueStatus.INSPECTING)
    throw new AppError(400, 'INVALID_STATUS', 'Inspector must be assigned first (status must be INSPECTING)');
  if (issue.evidence.length === 0)
    throw new AppError(400, 'MISSING_BEFORE_PHOTO', 'Inspector must upload a BEFORE photo before a contractor is hired');

  const contractor = await prisma.user.findUnique({ where: { id: contractorId } });
  if (!contractor || contractor.role !== Role.CONTRACTOR)
    throw new AppError(400, 'INVALID_USER', 'User must have CONTRACTOR role');

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: { contractorId, status: IssueStatus.CONTRACTOR_ASSIGNED },
      include: {
        contractor: { select: { id: true, name: true } },
        inspector:  { select: { id: true, name: true } },
        ward:       { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.create({
      data: {
        issueId, actorId,
        action: 'CONTRACTOR_HIRED',
        metadata: { contractorId, contractorName: contractor.name },
      },
    }),
  ]);

  // Notify the contractor
  await notify(
    contractorId,
    'Work Assignment',
    `You have been hired to fix issue "${issue.title}". Please complete the work and mark it as done.`,
    { issueId },
  );

  // Notify the citizen
  await notify(
    issue.createdById,
    'Work In Progress 🚧',
    `A contractor has been assigned and work has begun on your issue "${issue.title}".`,
    { issueId },
  );

  return updated;
}

/**
 * Contractor marks their work as done.
 * Only the assigned contractor can call this.
 * Status transitions: CONTRACTOR_ASSIGNED → WORK_DONE
 */
export async function markWorkDone(issueId: string, actorId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  if (issue.contractorId !== actorId)
    throw new AppError(403, 'FORBIDDEN', 'Only the assigned contractor can mark work as done');
  if (issue.status !== IssueStatus.CONTRACTOR_ASSIGNED)
    throw new AppError(400, 'INVALID_STATUS', 'Issue must be in CONTRACTOR_ASSIGNED status');

  const [updated] = await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: { status: IssueStatus.WORK_DONE },
      include: { ward: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.create({
      data: {
        issueId, actorId,
        action: 'WORK_MARKED_DONE',
        metadata: {},
      },
    }),
  ]);

  // Notify ward officers that the contractor has finished
  await notifyWardOfficers(
    issue.wardId,
    'Work Completed 🔨',
    `Contractor has marked work done for issue "${issue.title}". Inspector must now submit an AFTER photo.`,
    { issueId },
  );

  // Notify the citizen
  await notify(
    issue.createdById,
    'Work Completed 🔨',
    `The contractor has finished work on your issue "${issue.title}". A final inspection is now in progress.`,
    { issueId },
  );

  return updated;
}
