import type { ComponentType } from 'react';

/**
 * Open-core stub for the commercial web surface (see commercial.tsx).
 *
 * The self-hostable build ships this file as `commercial.tsx`: no admin /
 * billing / organizations / feedback routes, so those page chunks never enter
 * the bundle.
 */
export type CommercialRoute = {
  path: string;
  guard: 'auth' | 'superadmin';
  Component: ComponentType;
};

export const commercialRoutes: CommercialRoute[] = [];
