/**
 * JanPramaan — Deterministic Merkle tree utility
 *
 * Builds a binary Merkle tree from an array of hex-encoded leaf hashes.
 * If the leaf count is odd the lone node is promoted (no duplication)
 * to avoid the CVE-2012-2459 ambiguity present in Bitcoin's original design.
 *
 * Hash pairs use a `|` separator to prevent second-preimage collisions
 * where hashPair("ab","cdef") would otherwise equal hashPair("abc","def").
 */
import crypto from 'crypto';

/**
 * Hash two hex strings with a separator to prevent second-preimage attacks.
 * SHA-256( left | "|" | right )
 */
function hashPair(a: string, b: string): string {
  return crypto.createHash('sha256').update(a + '|' + b).digest('hex');
}

/**
 * Compute the Merkle root of an array of hex-encoded hashes.
 * @throws if the input array is empty
 */
export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    throw new Error('Cannot compute merkle root of empty array');
  }
  if (hashes.length === 1) {
    return hashes[0];
  }

  let level = [...hashes];

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashPair(level[i], level[i + 1]));
      } else {
        // Promote lone node directly — avoids CVE-2012-2459 duplication ambiguity
        next.push(level[i]);
      }
    }
    level = next;
  }

  return level[0];
}

/**
 * Generate a Merkle inclusion proof for a specific leaf.
 * Returns an array of { hash, position } pairs (sibling nodes) that,
 * together with the leaf hash, can reconstruct the root.
 *
 * @param hashes    All leaf hashes in order
 * @param leafIndex Index of the leaf to prove (0-based)
 * @returns Array of proof steps: { hash, position: 'left' | 'right' }
 */
export function merkleProof(
  hashes: string[],
  leafIndex: number,
): { hash: string; position: 'left' | 'right' }[] {
  if (hashes.length === 0) throw new Error('Cannot prove inclusion in empty array');
  if (leafIndex < 0 || leafIndex >= hashes.length) {
    throw new Error(`Leaf index ${leafIndex} out of range [0, ${hashes.length - 1}]`);
  }
  if (hashes.length === 1) return []; // single leaf IS the root

  const proof: { hash: string; position: 'left' | 'right' }[] = [];
  let level = [...hashes];
  let idx = leafIndex;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashPair(level[i], level[i + 1]));

        // If our tracked index is in this pair, record the sibling
        if (i === idx || i + 1 === idx) {
          const siblingIdx = i === idx ? i + 1 : i;
          proof.push({
            hash: level[siblingIdx],
            position: siblingIdx > idx ? 'right' : 'left',
          });
        }
      } else {
        // Lone node promoted — no sibling to record
        next.push(level[i]);
      }
    }
    idx = Math.floor(idx / 2);
    level = next;
  }

  return proof;
}

/**
 * Verify a Merkle inclusion proof.
 * @param leafHash  The hash of the leaf to verify
 * @param proof     The proof steps from merkleProof()
 * @param root      The expected Merkle root
 * @returns true if the proof is valid
 */
export function verifyProof(
  leafHash: string,
  proof: { hash: string; position: 'left' | 'right' }[],
  root: string,
): boolean {
  let current = leafHash;
  for (const step of proof) {
    current = step.position === 'right'
      ? hashPair(current, step.hash)
      : hashPair(step.hash, current);
  }
  return current === root;
}
