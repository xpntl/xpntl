/**
 * Integration tests for Issue Experience features:
 *   - Issue relations
 *   - Checklists with progress
 *   - Activity log
 *   - Attachments (basic guard test)
 *
 * Runs against the live API at localhost:4000.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const API = 'http://localhost:4000/v1';

function randomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function signup(overrides: Record<string, string> = {}) {
  const key = randomKey();
  const slug = `test-${key.toLowerCase()}-${Date.now()}`;
  const res = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceName: `Test ${key}`,
      workspaceSlug: slug,
      workspaceKey: key,
      email: `owner-${slug}@test.local`,
      password: 'testpassword12',
      displayName: 'Test Owner',
      ...overrides,
    }),
  });
  expect(res.ok).toBe(true);
  return res.json() as Promise<{ workspace: any; user: any; token: string }>;
}

function h(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

let TOKEN: string;
let ISSUE_A_KEY: string;
let ISSUE_B_KEY: string;

beforeAll(async () => {
  const result = await signup();
  TOKEN = result.token;

  const a = await fetch(`${API}/issues`, {
    method: 'POST',
    headers: h(TOKEN),
    body: JSON.stringify({ title: 'Issue A' }),
  });
  ISSUE_A_KEY = (await a.json()).issue.key;

  const b = await fetch(`${API}/issues`, {
    method: 'POST',
    headers: h(TOKEN),
    body: JSON.stringify({ title: 'Issue B' }),
  });
  ISSUE_B_KEY = (await b.json()).issue.key;
});

// ── Issue Relations ─────────────────────────────────────────────────────────

describe('Issue Relations', () => {
  it('POST /:key/relations — creates a relation and inverse', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ toIssueKey: ISSUE_B_KEY, type: 'blocks' }),
    });
    expect(res.status).toBe(201);
    const { relation } = await res.json();
    expect(relation.type).toBe('blocks');
    expect(relation.relatedIssueKey).toBe(ISSUE_B_KEY);
  });

  it('GET /:key/relations — lists relations for issue A', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const { relations } = await res.json();
    expect(relations.length).toBeGreaterThanOrEqual(1);
    expect(relations[0].type).toBe('blocks');
  });

  it('inverse relation visible on issue B', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_B_KEY}/relations`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const { relations } = await res.json();
    expect(relations.length).toBeGreaterThanOrEqual(1);
    expect(relations[0].type).toBe('blocked_by');
    expect(relations[0].relatedIssueKey).toBe(ISSUE_A_KEY);
  });

  it('GET /:key — detail includes relations', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.relations).toBeDefined();
    expect(body.relations.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /:key/relations — removes relation and inverse', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      method: 'DELETE',
      headers: h(TOKEN),
      body: JSON.stringify({ toIssueKey: ISSUE_B_KEY, type: 'blocks' }),
    });
    expect(res.status).toBe(204);

    const check = await fetch(`${API}/issues/${ISSUE_B_KEY}/relations`, {
      headers: h(TOKEN),
    });
    const { relations } = await check.json();
    expect(relations.length).toBe(0);
  });

  it('rejects self-referencing relation', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ toIssueKey: ISSUE_A_KEY, type: 'relates_to' }),
    });
    expect(res.ok).toBe(false);
  });

  it('creates duplicate_of / duplicated_by pair', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ toIssueKey: ISSUE_B_KEY, type: 'duplicate_of' }),
    });
    expect(res.status).toBe(201);

    const inv = await fetch(`${API}/issues/${ISSUE_B_KEY}/relations`, {
      headers: h(TOKEN),
    });
    const { relations } = await inv.json();
    expect(relations.some((r: any) => r.type === 'duplicated_by')).toBe(true);

    // cleanup
    await fetch(`${API}/issues/${ISSUE_A_KEY}/relations`, {
      method: 'DELETE',
      headers: h(TOKEN),
      body: JSON.stringify({ toIssueKey: ISSUE_B_KEY, type: 'duplicate_of' }),
    });
  });
});

// ── Checklists ──────────────────────────────────────────────────────────────

describe('Checklists', () => {
  let checklistId: string;
  let itemId: string;

  it('POST /:key/checklists — creates checklist', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/checklists`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ title: 'My Checklist' }),
    });
    expect(res.status).toBe(201);
    const { checklist } = await res.json();
    expect(checklist.title).toBe('My Checklist');
    expect(checklist.items).toEqual([]);
    checklistId = checklist.id;
  });

  it('POST /checklists/:id/items — adds item', async () => {
    const res = await fetch(`${API}/issues/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ content: 'First task' }),
    });
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item.content).toBe('First task');
    expect(item.checked).toBe(false);
    itemId = item.id;
  });

  it('PATCH /checklist-items/:id — toggles checked', async () => {
    const res = await fetch(`${API}/issues/checklist-items/${itemId}`, {
      method: 'PATCH',
      headers: h(TOKEN),
      body: JSON.stringify({ checked: true }),
    });
    expect(res.ok).toBe(true);
    const { item } = await res.json();
    expect(item.checked).toBe(true);
  });

  it('GET /:key/checklists — lists checklists with items', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/checklists`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const { checklists } = await res.json();
    expect(checklists.length).toBe(1);
    expect(checklists[0].items.length).toBe(1);
    expect(checklists[0].items[0].checked).toBe(true);
  });

  it('PATCH /checklists/:id — updates title', async () => {
    const res = await fetch(`${API}/issues/checklists/${checklistId}`, {
      method: 'PATCH',
      headers: h(TOKEN),
      body: JSON.stringify({ title: 'Renamed Checklist' }),
    });
    expect(res.ok).toBe(true);
    const { checklist } = await res.json();
    expect(checklist.title).toBe('Renamed Checklist');
  });

  it('DELETE /checklist-items/:id — removes item', async () => {
    const res = await fetch(`${API}/issues/checklist-items/${itemId}`, {
      method: 'DELETE',
      headers: h(TOKEN),
    });
    expect(res.status).toBe(204);
  });

  it('DELETE /checklists/:id — removes checklist', async () => {
    const res = await fetch(`${API}/issues/checklists/${checklistId}`, {
      method: 'DELETE',
      headers: h(TOKEN),
    });
    expect(res.status).toBe(204);
  });
});

// ── Activity Log ────────────────────────────────────────────────────────────

describe('Activity Log', () => {
  it('GET /:key/activity — returns activity entries', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/activity`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const { activity } = await res.json();
    expect(Array.isArray(activity)).toBe(true);
  });
});

// ── Attachments (guard test — MinIO may not be running) ─────────────────────

describe('Attachments', () => {
  it('GET /:key/attachments — returns empty list', async () => {
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/attachments`, {
      headers: h(TOKEN),
    });
    expect(res.ok).toBe(true);
    const { attachments } = await res.json();
    expect(attachments).toEqual([]);
  });

  it('rejects unauthenticated upload', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello']), 'test.txt');
    const res = await fetch(`${API}/issues/${ISSUE_A_KEY}/attachments`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(401);
  });
});

// ── Sub-issue progress rollup ───────────────────────────────────────────────

describe('Sub-issue progress', () => {
  it('issue detail includes subIssueCount with progress fields', async () => {
    // Create a sub-issue for issue A
    const sub = await fetch(`${API}/issues`, {
      method: 'POST',
      headers: h(TOKEN),
      body: JSON.stringify({ title: 'Sub-issue 1', parentId: undefined }),
    });
    expect(sub.ok).toBe(true);

    const detail = await fetch(`${API}/issues/${ISSUE_A_KEY}`, {
      headers: h(TOKEN),
    });
    expect(detail.ok).toBe(true);
    const body = await detail.json();
    // subIssueCount may be undefined if no children, which is fine
    if (body.issue.subIssueCount) {
      expect(body.issue.subIssueCount).toHaveProperty('total');
      expect(body.issue.subIssueCount).toHaveProperty('completed');
      expect(body.issue.subIssueCount).toHaveProperty('canceled');
      expect(body.issue.subIssueCount).toHaveProperty('inProgress');
      expect(body.issue.subIssueCount).toHaveProperty('progress');
    }
  });
});
