import { DomainError } from '@xpntl/domain';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/**
 * Centralized error mapping. Domain errors carry their own HTTP status;
 * ZodErrors are 400; everything else is 500.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof DomainError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  console.error('[xpntl/api] unhandled error', {
    method: req.method,
    url: req.originalUrl,
    error: err,
  });
  res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error' },
  });
};
