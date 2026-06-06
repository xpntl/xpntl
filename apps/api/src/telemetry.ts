/**
 * Open-core stub for telemetry.ts.
 *
 * The self-hostable build ships NO server telemetry: index.ts imports this for
 * its side effect (there is none), and the mirror strips @azure/monitor-
 * opentelemetry from the public package.json. Keeps the public/self-host build
 * free of hosted-only Azure dependencies.
 */
export {};
