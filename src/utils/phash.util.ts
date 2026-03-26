/**
 * JanPramaan — Perceptual Hash Utility
 *
 * Implements dHash (Difference Hash), a fast perceptual hashing algorithm
 * that produces a 64-bit fingerprint of an image.
 *
 * Algorithm:
 *  1. Resize image to 9×8 pixels (greyscale)
 *  2. For each row, compare each pixel to its right neighbour
 *     → 1 if left > right, 0 otherwise
 *  3. Pack 64 bits into a 16-char hex string
 *
 * Hamming distance between two hashes indicates visual similarity:
 *  0        → identical images
 *  1–10     → very similar / suspected duplicate
 *  11–20    → similar but probably different
 *  > 20     → different images
 */
import sharp from 'sharp';

/** Width used for dHash (one extra column for gradient comparisons). */
const DHASH_WIDTH  = 9;
/** Height used for dHash. */
const DHASH_HEIGHT = 8;

/**
 * Compute the dHash of an image buffer.
 * Returns a 16-character lowercase hex string (64-bit hash).
 * Returns null if the image is corrupt or cannot be processed.
 */
export async function dHash(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(imageBuffer)
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Validate buffer length: must be exactly 9×8 = 72 bytes (greyscale)
    if (data.length !== DHASH_WIDTH * DHASH_HEIGHT) {
      return null;
    }

    // Build 64-bit binary string: compare each pixel to its right neighbour
    let bits = '';
    for (let row = 0; row < DHASH_HEIGHT; row++) {
      for (let col = 0; col < DHASH_HEIGHT; col++) {          // 8 comparisons per row
        const idx = row * DHASH_WIDTH + col;
        bits += data[idx] > data[idx + 1] ? '1' : '0';
      }
    }

    // Convert 64-bit binary string → 16-char hex
    // Process in 4-bit chunks to avoid JS integer overflow
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex; // e.g. "a3f2c1d4e5b67890"
  } catch {
    // Corrupt/unreadable image — return null instead of crashing the upload
    return null;
  }
}

/**
 * Compute the Hamming distance between two 16-char hex hashes.
 * Lower = more similar. Range: 0 (identical) to 64 (completely different).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash length mismatch — cannot compare');
  }
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    // XOR nibble-by-nibble and count set bits
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    distance += popcount4(xor);
  }
  return distance;
}

/** Count set bits in a 4-bit nibble (0–15). */
function popcount4(n: number): number {
  return [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4][n];
}
