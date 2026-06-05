import { randomUUID } from 'node:crypto';
import { isAtLeast } from '@xpntl/auth';
import { tenantPoolQuery } from '@xpntl/db';
import type { BlobStore } from '@xpntl/storage';
import { record } from '../audit/audit.service.js';
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../errors.js';
import { newId } from '../id.js';
import type { FullAuthContext } from '../types.js';

export type AttachmentRow = {
  id: string;
  workspace_id: string;
  issue_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  blob_ref: string;
  uploaded_by: string | null;
  created_at: Date;
};

let blobStore: BlobStore | null = null;

export function setBlobStore(store: BlobStore) {
  blobStore = store;
}

export function getBlobStore(): BlobStore | null {
  return blobStore;
}

function requireBlobStore(): BlobStore {
  if (!blobStore) throw new ServiceUnavailableError('File storage is not configured');
  return blobStore;
}

function sanitizeAttachmentFilename(input: string): string {
  const raw = input.replaceAll('\\', '/').split('/').pop() ?? '';
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["<>:|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 140)
    .replace(/[.-]+$/, '');
  return cleaned || 'attachment';
}

function sanitizeContentType(input: string): string {
  const cleaned = input.trim().toLowerCase();
  if (!cleaned || cleaned.length > 200 || /[\r\n]/.test(cleaned)) return 'application/octet-stream';
  return cleaned;
}

export async function uploadAttachment(input: {
  ctx: FullAuthContext;
  issueId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  body: Buffer | NodeJS.ReadableStream;
}): Promise<AttachmentRow> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can upload attachments');
  }

  const store = requireBlobStore();
  const filename = sanitizeAttachmentFilename(input.filename);
  const contentType = sanitizeContentType(input.contentType);
  const fileKey = `${randomUUID()}/${filename}`;

  const { blobRef } = await store.put({
    kind: 'attachments',
    workspaceId: input.ctx.workspace.id,
    key: fileKey,
    body: input.body,
    contentType,
  });

  const { rows } = await tenantPoolQuery<AttachmentRow>(
    input.ctx.workspace.id,
    `INSERT INTO attachments (id, workspace_id, issue_id, filename, content_type, size_bytes, blob_ref, uploaded_by)
     VALUES ($1, $8, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [newId(), input.issueId, filename, contentType, input.sizeBytes, blobRef, input.ctx.user.id],
  );

  await record({
    workspaceId: input.ctx.workspace.id,
    actorUserId: input.ctx.user.id,
    eventType: 'attachment.uploaded',
    targetType: 'issue',
    targetId: input.issueId,
    metadata: { attachmentId: rows[0]!.id, filename },
  });

  return rows[0]!;
}

export async function deleteAttachment(input: {
  ctx: FullAuthContext;
  attachmentId: string;
}): Promise<void> {
  if (!isAtLeast(input.ctx.user.role, 'Member')) {
    throw new ForbiddenError('Members and above can delete attachments');
  }

  const { rows } = await tenantPoolQuery<AttachmentRow>(
    input.ctx.workspace.id,
    'DELETE FROM attachments WHERE {TENANT} AND id = $1 RETURNING *',
    [input.attachmentId],
  );

  if (!rows[0]) throw new NotFoundError('Attachment not found');

  const store = requireBlobStore();
  await store.delete(rows[0].blob_ref).catch(() => {});

  await record({
    workspaceId: input.ctx.workspace.id,
    actorUserId: input.ctx.user.id,
    eventType: 'attachment.deleted',
    targetType: 'issue',
    targetId: rows[0].issue_id,
    metadata: { attachmentId: rows[0].id, filename: rows[0].filename },
  });
}

export async function listAttachmentsForIssue(
  ctx: FullAuthContext,
  issueId: string,
): Promise<AttachmentRow[]> {
  const { rows } = await tenantPoolQuery<AttachmentRow>(
    ctx.workspace.id,
    'SELECT * FROM attachments WHERE {TENANT} AND issue_id = $1 ORDER BY created_at ASC',
    [issueId],
  );
  return rows;
}

export async function attachmentsForIssues(
  ctx: FullAuthContext,
  issueIds: string[],
): Promise<Map<string, AttachmentRow[]>> {
  if (issueIds.length === 0) return new Map();
  const { rows } = await tenantPoolQuery<AttachmentRow>(
    ctx.workspace.id,
    'SELECT * FROM attachments WHERE {TENANT} AND issue_id = ANY($1::text[]) ORDER BY created_at ASC',
    [issueIds],
  );
  const map = new Map<string, AttachmentRow[]>();
  for (const r of rows) {
    const list = map.get(r.issue_id) ?? [];
    list.push(r);
    map.set(r.issue_id, list);
  }
  return map;
}

export function attachmentUrl(row: AttachmentRow): string {
  return requireBlobStore().toProxyUrl(row.blob_ref);
}
