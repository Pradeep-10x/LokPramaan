/**
 * JanPramaan — Photo Fraud Detection Service (Production)
 *
 * Uses perceptual hashing (dHash) to detect photo fraud:
 *
 * 1. SAME_AS_BEFORE  — AFTER photo identical to BEFORE (contractor did nothing).
 * 2. RECYCLED_PHOTO  — AFTER or CONTRACTOR photo matches evidence from another issue.
 *
 * Hamming distance ≤ FRAUD_THRESHOLD (10 / 64 bits ≈ 84% similar) is flagged.
 *
 * When fraud is detected:
 *  • Evidence record marked `fraudFlag = true` + reason
 *  • EVIDENCE_FRAUD_DETECTED audit log (actorId = null → system)
 *  • Ward staff notified immediately
 *
 * Production hardening:
 *  • dHash returns null for corrupt images → graceful degradation
 *  • persistFraudFlag uses a Prisma transaction for atomicity
 *  • CONTRACTOR photos are also checked for recycling
 */
import { prisma }        from '../prisma/client.js';
import { dHash, hammingDistance } from '../utils/phash.util.js';
import { notifyWardStaff }        from './notification.service.js';
import { logger }                 from '../app.js';

/** Maximum Hamming distance to consider two images "the same". */
const FRAUD_THRESHOLD = 10;

export interface FraudCheckResult {
  fraudDetected:    boolean;
  reason?:          'SAME_AS_BEFORE' | 'RECYCLED_PHOTO';
  hamming?:         number;
  matchedEvidenceId?: string;
  pHash:            string | null;
}

/**
 * Compute the pHash for any uploaded image and run fraud checks:
 *   - AFTER photos: checked against BEFORE + entire DB
 *   - CONTRACTOR photos: checked against entire DB (recycled stock photos)
 *   - BEFORE / CITIZEN: hash computed but no fraud checks
 *
 * Returns the computed pHash plus fraud details so the caller can persist both.
 */
export async function checkPhotoFraud(
  imageBuffer: Buffer,
  issueId:     string,
  evidenceType: 'BEFORE' | 'AFTER' | 'CITIZEN' | 'CONTRACTOR',
): Promise<FraudCheckResult> {
  // Compute hash — returns null for corrupt/unreadable images
  const pHash = await dHash(imageBuffer);

  if (!pHash) {
    logger.warn(`[Fraud] dHash returned null for ${evidenceType} photo on issue ${issueId} — image may be corrupt`);
    return { fraudDetected: false, pHash: null };
  }

  // BEFORE and CITIZEN photos: just store the hash, no fraud checks
  if (evidenceType === 'BEFORE' || evidenceType === 'CITIZEN') {
    return { fraudDetected: false, pHash };
  }

  // ── Check 1 (AFTER only): Compare with BEFORE photo of the same issue ────
  if (evidenceType === 'AFTER') {
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
  }

  // ── Check 2 (AFTER + CONTRACTOR): Compare against all other evidence ─────
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
 * Persist fraud detection results atomically:
 *  1. Mark the evidence record as fraudulent
 *  2. Write an audit log
 *  3. Alert ward staff
 *
 * Steps 1 & 2 run inside a transaction for consistency.
 * Step 3 (notification) runs after commit — a failed notification
 * should not roll back the fraud flag.
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
    : `${result.reason === 'RECYCLED_PHOTO' ? 'Photo' : 'Evidence'} matches a previously uploaded image (Hamming: ${result.hamming}/64, matched: ${result.matchedEvidenceId})`;

  // Atomic: flag evidence + write audit log in one transaction
  await prisma.$transaction([
    prisma.evidence.update({
      where: { id: evidenceId },
      data:  { fraudFlag: true, fraudReason: reason },
    }),
    prisma.auditLog.create({
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
    }),
  ]);

  // Notification runs after commit — non-critical, should not roll back fraud flag
  try {
    await notifyWardStaff(
      wardId,
      '🚨 Fraud Alert: Suspicious Photo',
      result.reason === 'SAME_AS_BEFORE'
        ? `The AFTER photo for "${issueTitle}" appears identical to the BEFORE photo. Possible fraud — please review.`
        : `A photo for "${issueTitle}" matches evidence from a previous issue. Possible recycled evidence — please review.`,
      { issueId },
    );
  } catch (err) {
    logger.error('[Fraud] Failed to send fraud notification', { issueId, evidenceId, err });
  }
}
