/**
 * JanPramaan — Proof service
 * Builds a tamper-evident proof bundle for an issue:
 * before/after hashes, merkle root (persisted + verified), inclusion proofs,
 * and verification info.
 */
import { prisma } from '../prisma/client';
import { AppError } from '../middleware/error.middleware';
import { merkleRoot, merkleProof } from '../utils/merkle.util';

/**
 * Build the public proof for an issue.
 * Returns before/after hashes, merkle root with integrity check,
 * individual inclusion proofs, verification info, and timestamps.
 */
export async function getIssueProof(issueId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      evidence: { orderBy: { uploadedAt: 'asc' } },
      verification: {
        include: { verifiedBy: { select: { id: true, name: true } } },
      },
    },
  });

  if (!issue) {
    throw new AppError(404, 'NOT_FOUND', 'Issue not found');
  }

  // All hashes (including soft-deleted) are used for the Merkle tree
  const allHashes = issue.evidence.map((e) => e.fileHash);
  const computedRoot = allHashes.length > 0 ? merkleRoot(allHashes) : null;

  // Integrity check: compare stored root vs freshly computed root
  const storedRoot = issue.merkleRoot ?? null;
  const integrityValid = storedRoot === null
    ? computedRoot === null   // both null = no evidence yet, valid
    : storedRoot === computedRoot;

  // Active (non-deleted) evidence grouped by type
  const activeEvidence = issue.evidence.filter((e) => !e.deletedAt);

  const beforeHashes = activeEvidence
    .filter((e) => e.type === 'BEFORE')
    .map((e) => e.fileHash);

  const afterHashes = activeEvidence
    .filter((e) => e.type === 'AFTER')
    .map((e) => e.fileHash);

  // Generate inclusion proofs for each active piece of evidence
  const inclusionProofs = allHashes.length > 0
    ? activeEvidence.map((e) => {
        const leafIndex = issue.evidence.findIndex((ev) => ev.id === e.id);
        return {
          evidenceId: e.id,
          type: e.type,
          fileHash: e.fileHash,
          proof: merkleProof(allHashes, leafIndex),
        };
      })
    : [];

  return {
    issueId: issue.id,
    title: issue.title,
    status: issue.status,
    beforeHashes,
    afterHashes,
    merkleRoot: computedRoot,
    merkleRootStoredAt: issue.merkleRootComputedAt,
    integrityCheck: {
      valid: integrityValid,
      storedRoot,
      computedRoot,
      message: integrityValid
        ? 'Evidence integrity verified — stored root matches computed root'
        : '⚠️ INTEGRITY MISMATCH — stored root does not match computed root. Evidence may have been tampered with.',
    },
    evidenceCount: allHashes.length,
    activeEvidenceCount: activeEvidence.length,
    inclusionProofs,
    verification: issue.verification
      ? {
          verdict: issue.verification.verdict,
          remarks: issue.verification.remarks,
          verifiedBy: issue.verification.verifiedBy,
          verifiedAt: issue.verification.verifiedAt,
        }
      : null,
    timestamps: {
      created: issue.createdAt,
      updated: issue.updatedAt,
      slaDeadline: issue.slaDeadline,
    },
  };
}
