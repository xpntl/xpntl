/**
 * Domain errors. Each carries an HTTP-mappable status code so the REST adapter
 * doesn't need to know about every error subclass.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, opts: { status: number; code: string }) {
    super(message);
    this.name = 'DomainError';
    this.status = opts.status;
    this.code = opts.code;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message, { status: 404, code: 'not_found' });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Invalid input') {
    super(message, { status: 400, code: 'validation_error' });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, { status: 401, code: 'unauthorized' });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, { status: 403, code: 'forbidden' });
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, { status: 409, code: 'conflict' });
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, { status: 503, code: 'service_unavailable' });
    this.name = 'ServiceUnavailableError';
  }
}
