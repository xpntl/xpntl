import path from 'node:path';
import { ValidationError } from '@xpntl/domain';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

const RASTER_IMAGES: Record<string, { mime: string; extension: string }> = {
  png: { mime: 'image/png', extension: 'png' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  webp: { mime: 'image/webp', extension: 'webp' },
  gif: { mime: 'image/gif', extension: 'gif' },
};

const MAX_FILENAME_LENGTH = 140;

export function requireRasterImage(
  file: UploadFile,
  label = 'Image',
): { contentType: string; extension: string } {
  const detected = detectRasterImage(file.buffer);
  if (!detected) {
    throw new ValidationError(`${label} must be a PNG, JPEG, WebP, or GIF image`);
  }
  return { contentType: detected.mime, extension: detected.extension };
}

export function sanitizeUploadFilename(
  input: string | null | undefined,
  fallback = 'file',
): string {
  const parsed = path.posix.basename(String(input ?? '').replaceAll('\\', '/'));
  const cleaned = parsed
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["<>:|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/[.-]+$/, '');

  return cleaned || fallback;
}

export function safeUploadContentType(input: string | null | undefined): string {
  const value = String(input ?? '')
    .trim()
    .toLowerCase();
  if (!value || value.length > 200 || /[\r\n]/.test(value)) return 'application/octet-stream';
  return value;
}

function detectRasterImage(buffer: Buffer): { mime: string; extension: string } | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return RASTER_IMAGES.png!;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return RASTER_IMAGES.jpeg!;
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return RASTER_IMAGES.webp!;
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') return RASTER_IMAGES.gif!;
  }
  return null;
}
