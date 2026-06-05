import { getBlobStore } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { sanitizeUploadFilename } from '../upload-security.js';

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const SAFE_INLINE_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export const filesRouter: Router = Router();

filesRouter.use(requireFullAuth);

filesRouter.get('/*path', async (req, res) => {
  const raw = req.params.path;
  const blobPath = Array.isArray(raw) ? raw.join('/') : raw;
  if (!blobPath) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing file path' } });
    return;
  }
  // Blob paths are always composed as `{workspaceId}/{kind}/{key}` by the
  // storage layer, so the leading segment must match the caller's workspace.
  // Without this check any member of workspace A could read workspace B's
  // attachments/avatars by guessing the path (IDOR). Authz runs before the
  // storage-availability check so it can't be probed around.
  const workspaceId = getAuth(req).workspace.id;
  if (blobPath !== workspaceId && !blobPath.startsWith(`${workspaceId}/`)) {
    res.status(403).json({ error: { code: 'forbidden', message: 'File not in your workspace' } });
    return;
  }
  const store = getBlobStore();
  if (!store) {
    res
      .status(503)
      .json({ error: { code: 'service_unavailable', message: 'File storage is not configured' } });
    return;
  }
  try {
    const container = process.env.AZURE_STORAGE_CONTAINER ?? 'workspace-storage';
    const blobRef = `az://${container}/${blobPath}`;
    const stream = await store.get(blobRef);
    const ext = blobPath.split('.').pop()?.toLowerCase();
    const mime = MIME_TYPES[ext ?? ''] ?? 'application/octet-stream';
    const canRenderInline = ext ? SAFE_INLINE_IMAGE_EXTENSIONS.has(ext) : false;
    res.setHeader('Content-Type', mime);
    // Stored-XSS defense: never let the browser sniff a different type than we
    // declare. Only verified raster-image paths render inline; everything else
    // is a download from this authenticated API origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!canRenderInline) {
      const filename = sanitizeUploadFilename(blobPath.split('/').pop(), 'download');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: { code: 'not_found', message: 'File not found' } });
  }
});
