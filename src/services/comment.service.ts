/**
 * JanPramaan — Comment Service
 *
 * Handles per-issue comments with @mention notifications.
 * Access rules:
 *  - Issue creator (citizen) can comment
 *  - Any citizen belonging to the issue's ward can comment
 *  - Officers, Inspectors, Admins involved in the issue can comment
 *
 * @mention system:
 *  - Parse @username patterns from comment body
 *  - Match against users involved in the issue (admin, officer, inspector, contractor)
 *  - Send in-app notification to mentioned users
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { notify } from './notification.service.js';

// ── Mention parser ────────────────────────────────────────────────────────────
// Matches @username (alphanumeric, dots, underscores, hyphens)
const MENTION_REGEX = /@([a-zA-Z0-9._-]+)/g;

/**
 * Extract unique @mention usernames from a comment body.
 */
function extractMentions(body: string): string[] {
  const matches = body.matchAll(MENTION_REGEX);
  const names = new Set<string>();
  for (const m of matches) {
    names.add(m[1].toLowerCase());
  }
  return Array.from(names);
}

// ── Create Comment ────────────────────────────────────────────────────────────

export async function createComment(
  issueId: string,
  authorId: string,
  body: string,
) {
  // Validate issue exists and get ward info
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      title: true,
      wardId: true,
      createdById: true,
      assignedToId: true,
      inspectorId: true,
      contractorId: true,
    },
  });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');

  // Check author belongs to the issue's ward or is involved in the issue
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, name: true, role: true, adminUnitId: true },
  });
  if (!author) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const isInvolved =
    issue.createdById === authorId ||
    issue.assignedToId === authorId ||
    issue.inspectorId === authorId ||
    issue.contractorId === authorId ||
    author.role === 'ADMIN';

  const isWardCitizen =
    author.role === 'CITIZEN' && author.adminUnitId === issue.wardId;

  const isWardStaff =
    ['OFFICER', 'INSPECTOR', 'ADMIN'].includes(author.role) &&
    author.adminUnitId === issue.wardId;

  if (!isInvolved && !isWardCitizen && !isWardStaff) {
    throw new AppError(403, 'FORBIDDEN', 'You can only comment on issues in your ward or issues you are involved in');
  }

  // Parse @mentions from body
  const mentionedNames = extractMentions(body);

  // Resolve mentioned names to user IDs — search by name (case-insensitive)
  let mentionedUsers: { id: string; name: string }[] = [];
  if (mentionedNames.length > 0) {
    // Find users whose name matches any of the mentioned names
    // We search among users involved in the issue + ward staff
    const candidateIds = [
      issue.createdById,
      issue.assignedToId,
      issue.inspectorId,
      issue.contractorId,
    ].filter(Boolean) as string[];

    // Also include all ward staff
    const wardStaff = await prisma.user.findMany({
      where: {
        adminUnitId: issue.wardId,
        role: { in: ['OFFICER', 'INSPECTOR', 'ADMIN'] },
      },
      select: { id: true, name: true },
    });

    const allCandidates = await prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, name: true },
    });

    // Merge and deduplicate
    const candidateMap = new Map<string, { id: string; name: string }>();
    for (const u of [...allCandidates, ...wardStaff]) {
      candidateMap.set(u.id, u);
    }

    // Match by name (case-insensitive, supporting partial match with dots/underscores)
    for (const [, user] of candidateMap) {
      const normalizedName = user.name.toLowerCase().replace(/\s+/g, '.');
      const normalizedNameUnderscore = user.name.toLowerCase().replace(/\s+/g, '_');
      const normalizedNameNoSpace = user.name.toLowerCase().replace(/\s+/g, '');

      for (const mention of mentionedNames) {
        if (
          mention === normalizedName ||
          mention === normalizedNameUnderscore ||
          mention === normalizedNameNoSpace ||
          mention === user.name.toLowerCase()
        ) {
          mentionedUsers.push(user);
          break;
        }
      }
    }
  }

  // Create comment + mentions in a transaction
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        issueId,
        authorId,
        body,
        mentions: {
          create: mentionedUsers.map((u) => ({
            userId: u.id,
          })),
        },
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        mentions: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    return created;
  });

  // Send notifications to mentioned users (async, non-blocking)
  for (const mentioned of mentionedUsers) {
    if (mentioned.id !== authorId) {
      notify(
        mentioned.id,
        `💬 ${author.name} mentioned you`,
        `${author.name} mentioned you in a comment on "${issue.title}": "${body.slice(0, 100)}${body.length > 100 ? '...' : ''}"`,
        { issueId },
      ).catch(() => {}); // non-blocking
    }
  }

  return comment;
}

// ── List Comments ─────────────────────────────────────────────────────────────

export async function listComments(
  issueId: string,
  page = 1,
  limit = 20,
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { id: true } });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { issueId },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true, role: true } },
        mentions: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    }),
    prisma.comment.count({ where: { issueId } }),
  ]);

  return { comments, total, page, limit, pages: Math.ceil(total / limit) };
}

// ── Delete Comment ────────────────────────────────────────────────────────────

export async function deleteComment(
  commentId: string,
  actorId: string,
  actorRole: string,
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new AppError(404, 'NOT_FOUND', 'Comment not found');

  // Only the author or an ADMIN can delete
  if (comment.authorId !== actorId && actorRole !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comments');
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return { deleted: true };
}

// ── Mentionable Users ─────────────────────────────────────────────────────────

/**
 * Returns a list of users who can be @mentioned on a given issue.
 * This helps the frontend build an autocomplete dropdown.
 */
export async function getMentionableUsers(issueId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      wardId: true,
      createdById: true,
      assignedToId: true,
      inspectorId: true,
      contractorId: true,
    },
  });
  if (!issue) throw new AppError(404, 'NOT_FOUND', 'Issue not found');

  // Get all involved users + ward staff
  const involvedIds = [
    issue.createdById,
    issue.assignedToId,
    issue.inspectorId,
    issue.contractorId,
  ].filter(Boolean) as string[];

  const [involved, wardStaff] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: involvedIds } },
      select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: {
        adminUnitId: issue.wardId,
        role: { in: ['OFFICER', 'INSPECTOR', 'ADMIN'] },
      },
      select: { id: true, name: true, role: true },
    }),
  ]);

  // Deduplicate
  const map = new Map<string, { id: string; name: string; role: string; mentionKey: string }>();
  for (const u of [...involved, ...wardStaff]) {
    if (!map.has(u.id)) {
      map.set(u.id, {
        ...u,
        mentionKey: u.name.toLowerCase().replace(/\s+/g, '.'),
      });
    }
  }

  return Array.from(map.values());
}
