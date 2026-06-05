import { processDueRecurrences, setBlobStore, webhooks } from '@xpntl/domain';
import { createAzureBlobStore } from '@xpntl/storage';
import { createApp } from './app.js';
import { runCommercialSocialTick } from './commercial.js';
import { attachSyncGateway } from './sync/gateway.js';

const azConnStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
const azAccountName = process.env.AZURE_STORAGE_ACCOUNT;
const azContainer = process.env.AZURE_STORAGE_CONTAINER ?? 'workspace-storage';

if (azConnStr) {
  setBlobStore(createAzureBlobStore({ connectionString: azConnStr, container: azContainer }));
} else if (azAccountName) {
  const apiOrigin = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT_API ?? 4000}`;
  setBlobStore(createAzureBlobStore({ accountName: azAccountName, container: azContainer, proxyBaseUrl: `${apiOrigin}/v1/files` }));
}

const PORT = Number(process.env.PORT_API ?? 4000);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[xpntl/api] listening on http://localhost:${PORT}`);
  console.log(`[xpntl/api]   REST    http://localhost:${PORT}/v1/health`);
  console.log(`[xpntl/api]   GraphQL http://localhost:${PORT}/graphql`);
});

// Real-time sync gateway (XP-3) — shares the HTTP server for the WS upgrade.
attachSyncGateway(server);

// ── Embedded worker ticks (recurrences + social posting) ──

const RECURRENCE_INTERVAL_MS = 60_000;
const SOCIAL_INTERVAL_MS = 60 * 60 * 1000;

async function recurrenceTick() {
  try {
    const created = await processDueRecurrences();
    if (created > 0) {
      console.log(`[worker/recurrence] created ${created} recurring issue(s)`);
    }
  } catch (err) {
    console.error('[worker/recurrence] tick failed:', err);
  }
}

// Hosted-only daily social post. The implementation lives behind the
// commercial seam (no-op in the open build).
const socialTick = runCommercialSocialTick;

const WEBHOOK_INTERVAL_MS = 15_000;

async function webhookTick() {
  try {
    const processed = await webhooks.processPendingDeliveries();
    if (processed > 0) {
      console.log(`[worker/webhooks] processed ${processed} delivery(ies)`);
    }
  } catch (err) {
    console.error('[worker/webhooks] tick failed:', err);
  }
}

// Background jobs run embedded in the API process by default — there is no
// separately-deployed worker today. Set DISABLE_EMBEDDED_TICKS=true once a
// dedicated worker (apps/worker) is deployed to avoid double-processing.
// Webhook delivery is concurrency-safe regardless (FOR UPDATE SKIP LOCKED).
if (process.env.DISABLE_EMBEDDED_TICKS === 'true') {
  console.log('[xpntl/api] embedded worker ticks disabled (DISABLE_EMBEDDED_TICKS=true)');
} else {
  console.log('[xpntl/api] worker ticks enabled — recurrences every 60s, webhooks every 15s, social check every 60m');
  recurrenceTick();
  setInterval(recurrenceTick, RECURRENCE_INTERVAL_MS);
  webhookTick();
  setInterval(webhookTick, WEBHOOK_INTERVAL_MS);
  socialTick();
  setInterval(socialTick, SOCIAL_INTERVAL_MS);
}

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`[xpntl/api] received ${signal}, closing`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
