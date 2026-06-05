import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';
import { issueSyncTicket } from '../../sync/tickets.js';

export const syncRouter: Router = Router();

syncRouter.use(requireFullAuth);

/**
 * Mint a short-lived, single-use ticket for the WS handshake. The caller is
 * already authenticated here (normal bearer auth); the ticket — not the session
 * token — is what travels in the ws:// URL.
 */
syncRouter.post('/ticket', (req, res) => {
  const { workspace, user } = getAuth(req);
  if (!workspace || !user) {
    res.status(403).json({ error: { code: 'no_workspace', message: 'No active workspace' } });
    return;
  }
  res.json({ ticket: issueSyncTicket(workspace.id, user.id) });
});
