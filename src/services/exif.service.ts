/**
 * WitnessLedger — EXIF service
 * Extracts GPS + timestamp from photo and validates freshness.
 */
import { extractExif } from '../utils/exif.util';
import { AppError } from '../middleware/error.middleware';
import { config } from '../config/index.js';

/**
 * Strict version — throws if GPS/timestamp missing or photo too old.
 * Used by /location-from-photo endpoint.
 */
export async function extractAndValidatePhotoLocation(
  buffer: Buffer,
): Promise<{ lat: number; lng: number; takenAt: Date }> {
  const exif = await extractExif(buffer);

  if (exif.latitude === null || exif.longitude === null) {
    throw new AppError(
      422,
      'NO_GPS',
      'Photo does not contain GPS data. Please enable location on your camera and retake the photo.',
    );
  }

  if (!exif.datetime) {
    throw new AppError(
      422,
      'NO_TIMESTAMP',
      'Photo does not contain a timestamp. Please use the original camera photo.',
    );
  }

  const maxAgeMs = config.photoMaxAgeHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - maxAgeMs);

  if (exif.datetime < cutoff) {
    throw new AppError(
      400,
      'PHOTO_TOO_OLD',
      `Photo was taken at ${exif.datetime.toISOString()}. Only photos taken within the last ${config.photoMaxAgeHours} hour(s) are accepted.`,
    );
  }

  return {
    lat: exif.latitude,
    lng: exif.longitude,
    takenAt: exif.datetime,
  };
}

/**
 * Soft version — returns null if GPS/timestamp missing or photo too old.
 * Used during issue creation so it can fall back to device location.
 */
export async function tryExtractPhotoLocation(
  buffer: Buffer,
): Promise<{ lat: number; lng: number; takenAt: Date } | null> {
  const exif = await extractExif(buffer);

  if (exif.latitude === null || exif.longitude === null || !exif.datetime) {
    return null;
  }

  const maxAgeMs = config.photoMaxAgeHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - maxAgeMs);

  if (exif.datetime < cutoff) {
    return null;
  }

  return {
    lat: exif.latitude,
    lng: exif.longitude,
    takenAt: exif.datetime,
  };
}
