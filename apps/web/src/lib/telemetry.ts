/**
 * Open-core stub for lib/telemetry.ts.
 *
 * The self-hostable build ships NO client telemetry: initTelemetry is a no-op,
 * and the mirror strips @microsoft/applicationinsights-web from the public
 * package.json. Keeps the public/self-host build free of hosted-only Azure deps.
 */
export async function initTelemetry(): Promise<void> {}
