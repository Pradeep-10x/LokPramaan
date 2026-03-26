/**
 * JanPramaan — Escalation service
 *
 * Runs as a background job. Scans for stalled issues and notifies
 * specific parties so nothing falls through the cracks.
 *
 * Three checks on every run:
 *  1. OPEN > 48 h with no officer action          → notify ADMINs + assigned officer
 *  2. SLA deadline breached, not yet resolved      → notify ADMINs + concerned officer + citizen
 *  3. INSPECTING_WORK > 48 h (inspector hasn't sent AFTER photo) → notify concerned officer + inspector
 */
import { prisma } from '../prisma/client';
import { IssueStatus, Role } from '../generated/prisma/client.js';
import { notify } from './notification.service.js';
import { logger } from '../app.js';

const OPEN_ESCALATION_HOURS             = 48;
const INSPECTING_WORK_ESCALATION_HOURS  = 48;

export async function runEscalationCheck(): Promise<{ escalated: number }> {
  logger.info('[Escalation] Starting check…');
  const now  = new Date();
  let   total = 0;

  // ── 1. OPEN too long → notify ADMINs + assigned officer ──────────────────
  const openCutoff = new Date(now.getTime() - OPEN_ESCALATION_HOURS * 3_600_000);

  const staleOpen = await prisma.issue.findMany({
    where: {
      status:      IssueStatus.OPEN,
      createdAt:   { lt: openCutoff },
      escalatedAt: null,
    },
    include: { ward: { select: { name: true } } },
  });

  if (staleOpen.length) {
    for (const issue of staleOpen) {
      const admins = await prisma.user.findMany({
        where: { adminUnitId: issue.wardId, role: Role.ADMIN },
        select: { id: true },
      });
      for (const admin of admins) {
        await notify(
          admin.id,
          '⚠️ Issue Not Picked Up',
          `"${issue.title}" in ${issue.ward.name} has been OPEN for over ${OPEN_ESCALATION_HOURS}h with no action.`,
          { issueId: issue.id },
        );
      }
      if (issue.assignedToId) {
        await notify(
          issue.assignedToId,
          '⚠️ Pending Issue Requires Action',
          `"${issue.title}" assigned to you has been OPEN for over ${OPEN_ESCALATION_HOURS}h. Please accept or reject it.`,
          { issueId: issue.id },
        );
      }
      await prisma.issue.update({ where: { id: issue.id }, data: { escalatedAt: now } });
      await prisma.auditLog.create({
        data: {
          issueId:  issue.id,
          actorId:  null,
          action:   'ISSUE_ESCALATED',
          metadata: { reason: 'OPEN_TOO_LONG', hoursOpen: OPEN_ESCALATION_HOURS },
        },
      });
    }
    total += staleOpen.length;
    logger.info(`[Escalation] ${staleOpen.length} OPEN-too-long issue(s) escalated.`);
  }

  // ── 2. SLA breached → notify ADMINs + concerned officer + citizen ────────
  const slaBreached = await prisma.issue.findMany({
    where: {
      slaDeadline: { lt: now, not: null },
      status: {
        notIn: [
          IssueStatus.VERIFIED,
          IssueStatus.COMPLETED,
          IssueStatus.REJECTED,
        ],
      },
      escalatedAt: null,
    },
    include: { ward: { select: { name: true } } },
  });

  if (slaBreached.length) {
    for (const issue of slaBreached) {
      const admins = await prisma.user.findMany({
        where: { adminUnitId: issue.wardId, role: Role.ADMIN },
        select: { id: true },
      });
      for (const admin of admins) {
        await notify(
          admin.id,
          '🚨 SLA Breached',
          `"${issue.title}" in ${issue.ward.name} has exceeded its SLA deadline and is still ${issue.status}.`,
          { issueId: issue.id },
        );
      }
      if (issue.assignedToId) {
        await notify(
          issue.assignedToId,
          '🚨 SLA Breached — Your Issue',
          `"${issue.title}" assigned to you has exceeded its SLA deadline. Current status: ${issue.status}. Please take action immediately.`,
          { issueId: issue.id },
        );
      }
      await notify(
        issue.createdById,
        '⏰ Your Issue Is Overdue',
        `We are sorry — your issue "${issue.title}" has exceeded its target resolution time. Our team has been alerted.`,
        { issueId: issue.id },
      );
      await prisma.issue.update({ where: { id: issue.id }, data: { escalatedAt: now } });
      await prisma.auditLog.create({
        data: {
          issueId:  issue.id,
          actorId:  null,
          action:   'ISSUE_ESCALATED',
          metadata: { reason: 'SLA_BREACHED', status: issue.status },
        },
      });
    }
    total += slaBreached.length;
    logger.info(`[Escalation] ${slaBreached.length} SLA-breached issue(s) escalated.`);
  }

  // ── 3. INSPECTING_WORK > 48h → notify concerned officer + inspector ──────
  const inspectCutoff = new Date(now.getTime() - INSPECTING_WORK_ESCALATION_HOURS * 3_600_000);

  const staleInspecting = await prisma.issue.findMany({
    where: {
      status:      IssueStatus.INSPECTING_WORK,
      updatedAt:   { lt: inspectCutoff },
      escalatedAt: null,
    },
    include: { ward: { select: { name: true } } },
  });

  if (staleInspecting.length) {
    for (const issue of staleInspecting) {
      if (issue.inspectorId) {
        await notify(
          issue.inspectorId,
          '⚠️ AFTER Photo Required',
          `Work on "${issue.title}" was marked done ${INSPECTING_WORK_ESCALATION_HOURS}h ago. Please submit your AFTER photo to complete the inspection.`,
          { issueId: issue.id },
        );
      }
      if (issue.assignedToId) {
        await notify(
          issue.assignedToId,
          '⚠️ Inspection Stalled',
          `"${issue.title}" in ${issue.ward.name} has been in INSPECTING_WORK for over ${INSPECTING_WORK_ESCALATION_HOURS}h. Inspector has not yet submitted an AFTER photo.`,
          { issueId: issue.id },
        );
      }
      await prisma.issue.update({ where: { id: issue.id }, data: { escalatedAt: now } });
      await prisma.auditLog.create({
        data: {
          issueId:  issue.id,
          actorId:  null,
          action:   'ISSUE_ESCALATED',
          metadata: { reason: 'INSPECTING_WORK_NO_AFTER_PHOTO', hoursWaiting: INSPECTING_WORK_ESCALATION_HOURS },
        },
      });
    }
    total += staleInspecting.length;
    logger.info(`[Escalation] ${staleInspecting.length} INSPECTING_WORK-stalled issue(s) escalated.`);
  }

  logger.info(`[Escalation] Check complete. Total escalated: ${total}`);
  return { escalated: total };
}
