import type { AuthContext } from '@xpntl/domain';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Populated when request is authenticated via API key. */
      apiKeyScopes?: string[];
    }
  }
}
