import {
  type AttachmentRow,
  attachmentUrl,
  deleteAttachment,
  getIssueByKey,
  listAttachmentsForIssue,
  updateIssue,
  uploadAttachment,
} from '@xpntl/domain';
import { Router } from 'express';
import multer from 'multer';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { requireRasterImage, safeUploadContentType } from '../upload-security.js';

export const attachmentsRouter: Router = Router();

attachmentsRouter.use(requireFullAuth);

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

attachmentsRouter.get('/:key/attachments', async (req, res) => {
  const key = String(req.params.key);
  const issue = await getIssueByKey(getAuth(req), key);
  const attachments = await listAttachmentsForIssue(getAuth(req), issue.id);
  res.json({ attachments: attachments.map(toAttachmentJson) });
});

attachmentsRouter.post('/:key/attachments', upload.single('file'), async (req, res) => {
  const key = String(req.params.key);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { code: 'validation_error', message: 'file required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  const attachment = await uploadAttachment({
    ctx: getAuth(req),
    issueId: issue.id,
    filename: file.originalname,
    contentType: safeUploadContentType(file.mimetype),
    sizeBytes: file.size,
    body: file.buffer,
  });
  res.status(201).json({ attachment: toAttachmentJson(attachment) });
});

attachmentsRouter.post('/:key/cover', upload.single('file'), async (req, res) => {
  const key = String(req.params.key);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { code: 'validation_error', message: 'file required' } });
    return;
  }
  const issue = await getIssueByKey(getAuth(req), key);
  const image = requireRasterImage(file, 'Cover image');
  const attachment = await uploadAttachment({
    ctx: getAuth(req),
    issueId: issue.id,
    filename: `cover.${image.extension}`,
    contentType: image.contentType,
    sizeBytes: file.size,
    body: file.buffer,
  });
  await updateIssue({
    ctx: getAuth(req),
    key,
    patch: { coverBlobRef: attachmentUrl(attachment) },
  });
  res.status(201).json({
    coverUrl: attachmentUrl(attachment),
    attachment: toAttachmentJson(attachment),
  });
});

attachmentsRouter.delete('/:key/cover', async (req, res) => {
  const key = String(req.params.key);
  await updateIssue({
    ctx: getAuth(req),
    key,
    patch: { coverBlobRef: null },
  });
  res.status(204).end();
});

attachmentsRouter.delete('/attachments/:id', async (req, res) => {
  const id = String(req.params.id);
  await deleteAttachment({ ctx: getAuth(req), attachmentId: id });
  res.status(204).end();
});

function toAttachmentJson(a: AttachmentRow) {
  return {
    id: a.id,
    issueId: a.issue_id,
    filename: a.filename,
    contentType: a.content_type,
    sizeBytes: a.size_bytes,
    url: attachmentUrl(a),
    uploadedBy: a.uploaded_by,
    createdAt: a.created_at,
  };
}
