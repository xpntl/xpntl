import type { Express } from 'express';

/**
 * Open-core stub for the commercial seam (see commercial.ts).
 *
 * The self-hostable build ships this file as `commercial.ts`: no hosted
 * control-plane routes (admin / billing / organizations / feedback) and no
 * social tick.
 */
export function registerCommercialRoutes(_app: Express): void {
  // No commercial routes in the open build.
}

export async function runCommercialSocialTick(): Promise<void> {
  // No social automation in the open build.
}
