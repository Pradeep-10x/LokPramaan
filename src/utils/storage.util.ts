/**
 * JanPramaan — Cloud storage util
 * Uploads a file buffer to Cloudinary and returns the secure URL.
 * Falls back to local disk if CLOUDINARY_URL is not configured (dev only).
 */
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import dotenv from 'dotenv';

dotenv.config();

export async function storeFile(
  buffer: Buffer,
  originalName: string,
  folder: string = 'evidence',
): Promise<string> {
  const isCloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

  if (isCloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    // Upload to Cloudinary via upload_stream with long-term retention
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image', // explicitly use image rather than auto
          use_filename: false,
          unique_filename: true,
          access_mode: 'public', // ensure the image doesn't expire from private token signatures
          type: 'upload'
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    });
  }

  // ── Local disk fallback (dev / no Cloudinary configured) ──
  const ext      = path.extname(originalName) || '.bin';
  const filename = `${Date.now()}-${buffer.subarray(0, 4).toString('hex')}${ext}`;
  const uploadDir = config.uploadDir;

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
  } catch (err: any) {
    throw new Error(`Failed to write file to disk: ${err.message}`);
  }
  return `/uploads/${filename}`;
}
