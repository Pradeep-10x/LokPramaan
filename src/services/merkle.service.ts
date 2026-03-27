/**
 * JanPramaan — Merkle service
 * Higher-level service wrapping the merkle utility.
 * Computes, persists, and audits Merkle roots for evidence integrity.
 */
import { prisma } from '../prisma/client';
import { merkleRoot } from '../utils/merkle.util';

/**
 * Compute Merkle root for all evidence hashes of a given issue.
 * Includes ALL evidence (even soft-deleted) to preserve the audit trail.
 */
export async function computeIssueMerkleRoot(issueId: string): Promise<string | null> {
  const evidence = await prisma.evidence.findMany({
    where: { issueId },           // no deletedAt filter — hashes must always be in the tree
    orderBy: { uploadedAt: 'asc' },
    select: { fileHash: true },
  });

  if (evidence.length === 0) return null;

  return merkleRoot(evidence.map((e) => e.fileHash));
}

/**
 * Recompute and persist the Merkle root + timestamp on the Issue record.
 * Call this after every evidence upload, soft-delete, or rejection.
 */
export async function persistIssueMerkleRoot(issueId: string): Promise<string | null> {
  const root = await computeIssueMerkleRoot(issueId);
  const now = new Date();

  await prisma.issue.update({
    where: { id: issueId },
    data: {
      merkleRoot: root,
      merkleRootComputedAt: now,
    },
  });

  return root;
}

/**
 * Verify that the stored Merkle root matches a freshly computed one.
 * Returns { valid, storedRoot, computedRoot } for audit comparison.
 */
export async function verifyIssueMerkleIntegrity(issueId: string): Promise<{
  valid: boolean;
  storedRoot: string | null;
  computedRoot: string | null;
  computedAt: Date | null;
}> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { merkleRoot: true, merkleRootComputedAt: true },
  });

  const computedRoot = await computeIssueMerkleRoot(issueId);

  return {
    valid: issue?.merkleRoot === computedRoot,
    storedRoot: issue?.merkleRoot ?? null,
    computedRoot,
    computedAt: issue?.merkleRootComputedAt ?? null,
  };
}

/**
 * Compute Merkle roots for all issues that have evidence.
 * Useful for batch integrity audits.
 */
export async function computeAllMerkleRoots(): Promise<Record<string, string>> {
  const issues = await prisma.issue.findMany({
    where: { evidence: { some: {} } },
    select: {
      id: true,
      evidence: { orderBy: { uploadedAt: 'asc' }, select: { fileHash: true } },
    },
  });

  const roots: Record<string, string> = {};
  for (const issue of issues) {
    roots[issue.id] = merkleRoot(issue.evidence.map((e) => e.fileHash));
  }

  return roots;
}
