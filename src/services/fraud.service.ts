/**
 * WitnessLedger — Photo Fraud Detection Service
 *
 * Uses perceptual hashing (dHash) to detect two types of fraud:
 *
 * 1. SAME_AS_BEFORE  — The AFTER photo is visually identical to the BEFORE
 *                      photo of the same issue (contractor did nothing).
 *
 * 2. RECYCLED_PHOTO  — The AFTER photo matches an evidence photo already
 *                      stored in the database for a different issue
 *                      (contractor reused a stock/old image).
 *
 * Hamming distance ≤ FRAUD_THRESHOLD (10 / 64 bits ≈ 84% similar) is flagged.
 *
 * When fraud is detected:
 *  • The evidence record is marked `fraudFlag = true`
 *  • An EVIDENCE_FRAUD_DETECTED audit log is written (actorId = null → system)
 *  • Ward staff are notified via notifyWardStaff()
 */
import { prisma }        from '../prisma/client.js';
import { dHash, hammingDistance } from '../utils/phash.util.js';
import { notifyWardStaff }        from './notification.service.js';

/** Maximum Hamming distance to consider two images "the same". */
const FRAUD_THRESHOLD = 10;

export interface FraudCheckResult {
  fraudDetected:    boolean;
  reason?:          'SAME_AS_BEFORE' | 'RECYCLED_PHOTO';
  hamming?:         number;
  matchedEvidenceId?: string;
  pHash:            string;
}

/**
 * Compute the pHash for any uploaded image and (for AFTER photos) check
 * it against:
 *   1. The BEFORE photo of the same issue
 *   2. All other evidence hashes across the entire database
 *
 * Returns the computed pHash plus fraud details so the caller can persist both.
 */
export async function checkPhotoFraud(
  imageBuffer: Buffer,
  issueId:     string,
  evidenceType: 'BEFORE' | 'AFTER',
): Promise<FraudCheckResult> {
  // Compute hash for the incoming image
  const pHash = await dHash(imageBuffer);

  // Only run fraud checks on AFTER photos
  if (evidenceType !== 'AFTER') {
    return { fraudDetected: false, pHash };
  }

  // ── Check 1: Compare with BEFORE photo of the same issue ─────────────────
  const beforeEvidence = await prisma.evidence.findFirst({
    where: { issueId, type: 'BEFORE', pHash: { not: null } },
    select: { id: true, pHash: true },
  });

  if (beforeEvidence?.pHash) {
    const dist = hammingDistance(pHash, beforeEvidence.pHash);
    if (dist <= FRAUD_THRESHOLD) {
      return {
        fraudDetected:    true,
        reason:           'SAME_AS_BEFORE',
        hamming:          dist,
        matchedEvidenceId: beforeEvidence.id,
        pHash,
      };
    }
  }

  // ── Check 2: Compare against all other evidence in the database ───────────
  // Fetch in batches to avoid loading everything into memory at once
  const BATCH = 500;
  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.evidence.findMany({
      take:   BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where:  { issueId: { not: issueId }, pHash: { not: null } },
      select: { id: true, pHash: true },
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;

    for (const ev of batch) {
      if (!ev.pHash) continue;
      const dist = hammingDistance(pHash, ev.pHash);
      if (dist <= FRAUD_THRESHOLD) {
        return {
          fraudDetected:    true,
          reason:           'RECYCLED_PHOTO',
          hamming:          dist,
          matchedEvidenceId: ev.id,
          pHash,
        };
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;
  }

  return { fraudDetected: false, pHash };
}

/**
 * Persist fraud detection results: mark the evidence record, write an
 * audit log, and alert ward staff.
 */
export async function persistFraudFlag(
  evidenceId:      string,
  issueId:         string,
  issueTitle:      string,
  wardId:          string,
  result:          FraudCheckResult,
): Promise<void> {
  if (!result.fraudDetected) return;

  const reason = result.reason === 'SAME_AS_BEFORE'
    ? `AFTER photo is visually identical to BEFORE photo (Hamming: ${result.hamming}/64)`
    : `AFTER photo matches a previously uploaded evidence image (Hamming: ${result.hamming}/64, matched: ${result.matchedEvidenceId})`;

  await prisma.evidence.update({
    where: { id: evidenceId },
    data:  { fraudFlag: true, fraudReason: reason },
  });

  await prisma.auditLog.create({
    data: {
      issueId,
      actorId:  null,   // system-triggered
      action:   'EVIDENCE_FRAUD_DETECTED',
      metadata: {
        evidenceId,
        reason:           result.reason,
        hamming:          result.hamming,
        matchedEvidenceId: result.matchedEvidenceId ?? null,
      },
    },
  });

  await notifyWardStaff(
    wardId,
    '🚨 Fraud Alert: Suspicious Photo',
    result.reason === 'SAME_AS_BEFORE'
      ? `The AFTER photo for "${issueTitle}" appears identical to the BEFORE photo. Possible fraud — please review.`
      : `The AFTER photo for "${issueTitle}" matches a photo from a previous issue. Possible recycled evidence — please review.`,
    { issueId },
  );
}
