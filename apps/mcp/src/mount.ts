import crypto from 'node:crypto';
import { harnessKeys } from '@xpntl/domain';
import type { Express } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { buildServer, harnessKeyFromHeader } from './server.js';

export function mountMcp(app: Express, path = '/mcp'): void {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all(path, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });

        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) transports.delete(sid);
        };

        const { server, setAuthCtx } = buildServer();
        // Pre-authenticate from a bearer harness key if the client sent one, so
        // standard MCP clients don't need an explicit xpntl_authenticate call.
        const key = harnessKeyFromHeader(req.headers.authorization);
        if (key) {
          const ctx = await harnessKeys.resolveHarnessKeyContext(key);
          if (ctx) setAuthCtx(ctx);
        }
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[xpntl/mcp] error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get(`${path}/health`, (_req, res) => {
    res.json({ status: 'ok', sessions: transports.size });
  });
}
