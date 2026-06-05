import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import type { BlobStore } from './index.js';

type AzureBlobStoreOpts = {
  container: string;
  proxyBaseUrl?: string;
} & (
  | { connectionString: string; accountName?: never }
  | { accountName: string; connectionString?: never }
);

export function createAzureBlobStore(opts: AzureBlobStoreOpts): BlobStore {
  const serviceClient = opts.connectionString
    ? BlobServiceClient.fromConnectionString(opts.connectionString)
    : new BlobServiceClient(
        `https://${opts.accountName}.blob.core.windows.net`,
        new DefaultAzureCredential(),
      );
  const containerClient = serviceClient.getContainerClient(opts.container);

  let containerReady: Promise<void> | null = null;

  async function ensureContainer() {
    if (!containerReady) {
      containerReady = (async () => {
        await containerClient.createIfNotExists();
      })().catch((err) => {
        containerReady = null;
        throw err;
      });
    }
    await containerReady;
  }

  function sasUrl(blobPath: string): string {
    const cred = serviceClient.credential;
    if (!(cred instanceof StorageSharedKeyCredential)) {
      return containerClient.getBlobClient(blobPath).url;
    }
    const sas = generateBlobSASQueryParameters(
      {
        containerName: opts.container,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(),
        expiresOn: new Date(Date.now() + 60 * 60 * 1000),
      },
      cred,
    );
    return `${containerClient.getBlobClient(blobPath).url}?${sas.toString()}`;
  }

  return {
    async put({ kind, workspaceId, key, body, contentType }) {
      await ensureContainer();
      const blobPath = `${workspaceId}/${kind}/${key}`;
      const blockBlob = containerClient.getBlockBlobClient(blobPath);
      if (Buffer.isBuffer(body)) {
        await blockBlob.uploadData(body, {
          blobHTTPHeaders: { blobContentType: contentType },
        });
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of body as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        await blockBlob.uploadData(Buffer.concat(chunks), {
          blobHTTPHeaders: { blobContentType: contentType },
        });
      }
      return { blobRef: `az://${opts.container}/${blobPath}` };
    },

    async get(blobRef: string) {
      const { blobPath } = parseBlobRef(blobRef);
      const resp = await containerClient.getBlobClient(blobPath).download();
      return resp.readableStreamBody as unknown as NodeJS.ReadableStream;
    },

    async delete(blobRef: string) {
      const { blobPath } = parseBlobRef(blobRef);
      await containerClient.getBlobClient(blobPath).deleteIfExists();
    },

    toProxyUrl(blobRef: string) {
      const { blobPath } = parseBlobRef(blobRef);
      if (opts.proxyBaseUrl) {
        return `${opts.proxyBaseUrl}/${blobPath}`;
      }
      return sasUrl(blobPath);
    },
  };
}

function parseBlobRef(ref: string): { container: string; blobPath: string } {
  const m = ref.match(/^az:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid Azure blob ref: ${ref}`);
  return { container: m[1]!, blobPath: m[2]! };
}
