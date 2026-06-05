/**
 * Storage interfaces. Implementations are selected at boot via env.
 *
 * Production (Azure):
 *   BlobStore  -> Azure Blob Storage
 *   Queue      -> pg-boss on Azure Postgres
 *   Mailer     -> Azure Communication Services Email
 *   Secrets    -> Azure Key Vault (via managed identity)
 *   Search     -> Postgres FTS, later Meilisearch
 *
 * Local dev:
 *   BlobStore  -> Azurite (Azure Storage emulator)
 *   Queue      -> pg-boss
 *   Mailer     -> SMTP (Mailpit in dev)
 *   Secrets    -> .env file
 *   Search     -> Postgres FTS
 */

export interface BlobStore {
  /** Upload a blob. Returns an opaque ref to be stored in the DB. */
  put(args: {
    kind: string;
    workspaceId: string;
    key: string;
    body: Buffer | NodeJS.ReadableStream;
    contentType?: string;
  }): Promise<{ blobRef: string }>;

  /** Stream a blob back. Authorization is enforced by the calling proxy. */
  get(blobRef: string): Promise<NodeJS.ReadableStream>;

  /** Delete a blob. Soft-delete is the implementation's choice. */
  delete(blobRef: string): Promise<void>;

  /** Convert a blobRef to the proxy URL clients fetch from. */
  toProxyUrl(blobRef: string): string;
}

export interface Queue {
  enqueue<T>(
    jobName: string,
    payload: T,
    opts?: { delaySeconds?: number; retryLimit?: number },
  ): Promise<string>;

  consume<T>(jobName: string, handler: (payload: T) => Promise<void>): void;
}

export interface Mailer {
  send(args: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

export interface Secrets {
  get(key: string): Promise<string | undefined>;
}

export { createAzureBlobStore } from './azure.js';

export interface Search {
  index(args: {
    entityType: string;
    workspaceId: string;
    doc: Record<string, unknown>;
  }): Promise<void>;

  query(args: {
    workspaceId: string;
    q: string;
    entityType?: string;
    limit?: number;
  }): Promise<Array<{ id: string; entityType: string; score: number }>>;
}
