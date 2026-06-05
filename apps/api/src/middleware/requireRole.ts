import type { Role } from '@xpntl/auth';
import { ForbiddenError, UnauthorizedError, assertRole } from '@xpntl/domain';
import type { FullAuthContext } from '@xpntl/domain';
import type { NextFunction, Request, Response } from 'express';

/**
 * Express middleware: ensure the authenticated user holds at least `floor`.
 * Composes with `requireAuth`.
 */
export function requireRole(floor: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    try {
      assertRole(req.auth as FullAuthContext, floor);
      next();
    } catch (err) {
      next(err instanceof ForbiddenError ? err : new ForbiddenError());
    }
  };
}
