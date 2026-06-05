import { findSessionByToken } from '@xpntl/domain';
import type { GraphQLContext } from './builder.js';

const COOKIE_NAME = 'xpntl_session';

function extractToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null;
  }
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.split('=');
      if (rawKey?.trim() === COOKIE_NAME) {
        return decodeURIComponent(rest.join('=').trim()) || null;
      }
    }
  }
  return null;
}

export async function createGraphQLContext(args: { request: Request }): Promise<GraphQLContext> {
  const token = extractToken(args.request);
  if (!token) return { auth: null };
  const found = await findSessionByToken(token);
  return { auth: found };
}
