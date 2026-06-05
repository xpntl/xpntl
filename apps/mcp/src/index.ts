import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

async function main() {
  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[xpntl/mcp] server started on stdio');
}

main().catch((err) => {
  console.error('[xpntl/mcp] fatal:', err);
  process.exit(1);
});
