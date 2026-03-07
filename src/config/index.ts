/**
 * WitnessLedger — Centralised configuration
 * All environment variables are read and validated here.
 */
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  residentPhoneSalt: process.env.RESIDENT_PHONE_SALT || 'default_salt',

  /**
   * Comma-separated list of allowed CORS origins.
   * e.g. CORS_ORIGIN=https://your-frontend.vercel.app,http://localhost:3000
   * Defaults to '*' if not set (development convenience).
   */
  corsOrigin: process.env.CORS_ORIGIN || '*',

  /** Default SLA window for issue auto-assignment (hours) */
  slaDefaultHours: parseInt(process.env.SLA_DEFAULT_HOURS || '48', 10),

  /** Max geo-distance (metres) before evidence is flagged as geoFallback */
  geoThresholdMetres: parseInt(process.env.GEO_THRESHOLD_METRES || '50', 10),

  /**
   * Maximum age of photo EXIF timestamp (hours) — photos older than this
   * are rejected to prevent re-use of archive/stock images.
   * Default: 6 hours.
   */
  photoMaxAgeHours: parseInt(process.env.PHOTO_MAX_AGE_HOURS || '6', 10),

  /**
   * Maximum distance (metres) between device GPS and photo EXIF GPS.
   * If they differ more than this the upload is rejected.
   * Slightly more lenient than geoThresholdMetres to account for GPS drift.
   * Default: 500 m.
   */
  devicePhotoDistanceMetres: parseInt(process.env.DEVICE_PHOTO_DISTANCE_METRES || '500', 10),

  /** Twilio (optional) */
  twilio: {
    sid: process.env.TWILIO_SID,
    token: process.env.TWILIO_TOKEN,
    from: process.env.TWILIO_FROM,
  },
} as const;

// Ensure upload directory exists (Render has ephemeral filesystem)
fs.mkdirSync(config.uploadDir, { recursive: true });
