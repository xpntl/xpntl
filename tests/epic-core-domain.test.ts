/**
 * Integration tests for the 11 Core Domain Model epic tasks.
 * Runs against a live API server at localhost:4000.
 *
 * Coverage:
 *  1. Sub-issues (parent/child, rootOnly filter, sub-issue counts)
 *  2. Soft-delete & restore
 *  3. Teams CRUD + members
 *  4. Projects CRUD + team linking
 *  5. Initiatives CRUD
 *  6. Milestones CRUD (project-scoped)
 *  7. Multi-assignees
 *  8. Custom fields
 *  9. Tags + issue tagging + merge
 * 10. Issue templates
 * 11. Project templates
 */

import { beforeAll, describe, expect, it } from 'vitest';

const BASE = 'http://localhost:4000/v1';
let TOKEN = '';
let USER_ID = '';

// Shared state across tests (populated by earlier tests, consumed by later ones)
const state: Record<string, string> = {};

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// ── Setup: create a fresh workspace for the test run ──────────────────────────

beforeAll(async () => {
  const ts = Date.now();
  const keyChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rk = Array.from(
    { length: 3 },
    () => keyChars[Math.floor(Math.random() * keyChars.length)],
  ).join('');
  const res = await api('POST', '/auth/signup', {
    workspaceName: `Epic Test ${ts}`,
    workspaceSlug: `test-${ts}`,
    workspaceKey: rk,
    email: `runner-${ts}@test.dev`,
    password: 'TestPassword1234!',
    displayName: 'Test Runner',
  });
  expect(res.status).toBe(201);
  TOKEN = res.data.token;
  USER_ID = res.data.user.id;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SUB-ISSUES
// ═══════════════════════════════════════════════════════════════════════════════

describe('1 · Sub-issues', () => {
  it('creates a parent issue', async () => {
    const r = await api('POST', '/issues', { title: 'Parent Issue' });
    expect(r.status).toBe(201);
    expect(r.data.issue.key).toBeTruthy();
    state.parentKey = r.data.issue.key;
    state.parentId = r.data.issue.id;
  });

  it('creates a child issue with parentId', async () => {
    const r = await api('POST', '/issues', {
      title: 'Child Issue 1',
      parentId: state.parentId,
    });
    expect(r.status).toBe(201);
    expect(r.data.issue.parentId).toBe(state.parentId);
    state.childKey1 = r.data.issue.key;
  });

  it('creates a second child', async () => {
    const r = await api('POST', '/issues', {
      title: 'Child Issue 2',
      parentId: state.parentId,
    });
    expect(r.status).toBe(201);
    state.childKey2 = r.data.issue.key;
  });

  it('child issues are hidden from root list (rootOnly default)', async () => {
    const r = await api('GET', '/issues');
    expect(r.status).toBe(200);
    const keys = r.data.issues.map((i: any) => i.key);
    expect(keys).toContain(state.parentKey);
    expect(keys).not.toContain(state.childKey1);
    expect(keys).not.toContain(state.childKey2);
  });

  it('parent has subIssueCount in list response', async () => {
    const r = await api('GET', '/issues');
    const parent = r.data.issues.find((i: any) => i.key === state.parentKey);
    expect(parent.subIssueCount).toBeDefined();
    expect(parent.subIssueCount.total).toBe(2);
    expect(parent.subIssueCount.completed).toBe(0);
  });

  it('GET /:key/sub-issues returns children', async () => {
    const r = await api('GET', `/issues/${state.parentKey}/sub-issues`);
    expect(r.status).toBe(200);
    expect(r.data.issues).toHaveLength(2);
    const titles = r.data.issues.map((i: any) => i.title);
    expect(titles).toContain('Child Issue 1');
    expect(titles).toContain('Child Issue 2');
  });

  it('can set parentId via update', async () => {
    const extra = await api('POST', '/issues', { title: 'Soon a child' });
    const r = await api('PATCH', `/issues/${extra.data.issue.key}`, {
      parentId: state.parentId,
    });
    expect(r.status).toBe(200);
    expect(r.data.issue.parentId).toBe(state.parentId);
    state.childKey3 = extra.data.issue.key;
  });

  it('rejects self-referential parent', async () => {
    const r = await api('PATCH', `/issues/${state.parentKey}`, {
      parentId: state.parentId,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SOFT-DELETE & RESTORE
// ═══════════════════════════════════════════════════════════════════════════════

describe('2 · Soft-delete & restore', () => {
  let victimKey: string;

  it('creates an issue to delete', async () => {
    const r = await api('POST', '/issues', { title: 'Delete Me' });
    expect(r.status).toBe(201);
    victimKey = r.data.issue.key;
  });

  it('soft-deletes the issue', async () => {
    const r = await api('DELETE', `/issues/${victimKey}`);
    expect(r.status).toBe(204);
  });

  it('deleted issue is gone from main list', async () => {
    const r = await api('GET', '/issues');
    const keys = r.data.issues.map((i: any) => i.key);
    expect(keys).not.toContain(victimKey);
  });

  it('deleted issue appears in /deleted', async () => {
    const r = await api('GET', '/issues/deleted');
    expect(r.status).toBe(200);
    const keys = r.data.issues.map((i: any) => i.key);
    expect(keys).toContain(victimKey);
  });

  it('restores the issue', async () => {
    const r = await api('POST', `/issues/${victimKey}/restore`);
    expect(r.status).toBe(200);
    expect(r.data.issue.key).toBe(victimKey);
  });

  it('restored issue is back in main list', async () => {
    const r = await api('GET', '/issues');
    const keys = r.data.issues.map((i: any) => i.key);
    expect(keys).toContain(victimKey);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TEAMS
// ═══════════════════════════════════════════════════════════════════════════════

describe('3 · Teams', () => {
  it('creates a team', async () => {
    const r = await api('POST', '/teams', {
      name: 'Engineering',
      key: 'ENG',
    });
    expect(r.status).toBe(201);
    expect(r.data.team.name).toBe('Engineering');
    expect(r.data.team.key).toBe('ENG');
    state.teamId = r.data.team.id;
  });

  it('lists teams', async () => {
    const r = await api('GET', '/teams');
    expect(r.status).toBe(200);
    expect(r.data.teams.length).toBeGreaterThanOrEqual(1);
    expect(r.data.teams.some((t: any) => t.id === state.teamId)).toBe(true);
  });

  it('gets team by id', async () => {
    const r = await api('GET', `/teams/${state.teamId}`);
    expect(r.status).toBe(200);
    expect(r.data.team.name).toBe('Engineering');
  });

  it('updates a team', async () => {
    const r = await api('PATCH', `/teams/${state.teamId}`, {
      description: 'Backend & infra',
    });
    expect(r.status).toBe(200);
    expect(r.data.team.description).toBe('Backend & infra');
  });

  it('creator is auto-added as Lead member', async () => {
    const r = await api('GET', `/teams/${state.teamId}/members`);
    expect(r.status).toBe(200);
    expect(r.data.members.length).toBeGreaterThanOrEqual(1);
    const me = r.data.members.find((m: any) => m.userId === USER_ID);
    expect(me).toBeDefined();
    expect(me.role).toBe('Lead');
  });

  it('rejects duplicate team key', async () => {
    const r = await api('POST', '/teams', {
      name: 'Duplicate',
      key: 'ENG',
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('4 · Projects', () => {
  it('creates a project', async () => {
    const r = await api('POST', '/projects', {
      name: 'Launch v1',
      color: '#FF6600',
    });
    expect(r.status).toBe(201);
    expect(r.data.project.name).toBe('Launch v1');
    state.projectId = r.data.project.id;
  });

  it('lists projects', async () => {
    const r = await api('GET', '/projects');
    expect(r.status).toBe(200);
    expect(r.data.projects.some((p: any) => p.id === state.projectId)).toBe(true);
  });

  it('gets project by id', async () => {
    const r = await api('GET', `/projects/${state.projectId}`);
    expect(r.status).toBe(200);
    expect(r.data.project.name).toBe('Launch v1');
  });

  it('updates a project', async () => {
    const r = await api('PATCH', `/projects/${state.projectId}`, {
      status: 'started',
      description: 'Ship it!',
    });
    expect(r.status).toBe(200);
    expect(r.data.project.status).toBe('started');
  });

  it('links a team to the project', async () => {
    const r = await api('POST', `/projects/${state.projectId}/teams`, {
      teamId: state.teamId,
    });
    expect(r.status).toBe(201);
  });

  it('unlinks a team from the project', async () => {
    const r = await api('DELETE', `/projects/${state.projectId}/teams/${state.teamId}`);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. INITIATIVES
// ═══════════════════════════════════════════════════════════════════════════════

describe('5 · Initiatives', () => {
  it('creates an initiative', async () => {
    const r = await api('POST', '/initiatives', {
      name: 'Q3 Goals',
      color: '#3366FF',
    });
    expect(r.status).toBe(201);
    expect(r.data.initiative.name).toBe('Q3 Goals');
    state.initiativeId = r.data.initiative.id;
  });

  it('lists initiatives', async () => {
    const r = await api('GET', '/initiatives');
    expect(r.status).toBe(200);
    expect(r.data.initiatives.some((i: any) => i.id === state.initiativeId)).toBe(true);
  });

  it('gets initiative by id', async () => {
    const r = await api('GET', `/initiatives/${state.initiativeId}`);
    expect(r.status).toBe(200);
    expect(r.data.initiative.name).toBe('Q3 Goals');
  });

  it('updates an initiative', async () => {
    const r = await api('PATCH', `/initiatives/${state.initiativeId}`, {
      status: 'active',
      description: 'Hit the targets',
    });
    expect(r.status).toBe(200);
    expect(r.data.initiative.status).toBe('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MILESTONES
// ═══════════════════════════════════════════════════════════════════════════════

describe('6 · Milestones', () => {
  it('creates a milestone', async () => {
    const r = await api('POST', '/milestones', {
      projectId: state.projectId,
      name: 'Alpha Release',
    });
    expect(r.status).toBe(201);
    expect(r.data.milestone.name).toBe('Alpha Release');
    state.milestoneId = r.data.milestone.id;
  });

  it('lists milestones for project', async () => {
    const r = await api('GET', `/milestones?projectId=${state.projectId}`);
    expect(r.status).toBe(200);
    expect(r.data.milestones.some((m: any) => m.id === state.milestoneId)).toBe(true);
  });

  it('gets milestone by id', async () => {
    const r = await api('GET', `/milestones/${state.milestoneId}`);
    expect(r.status).toBe(200);
    expect(r.data.milestone.name).toBe('Alpha Release');
  });

  it('updates a milestone', async () => {
    const r = await api('PATCH', `/milestones/${state.milestoneId}`, {
      description: 'First public preview',
    });
    expect(r.status).toBe(200);
    expect(r.data.milestone.description).toBe('First public preview');
  });

  it('deletes a milestone', async () => {
    const extra = await api('POST', '/milestones', {
      projectId: state.projectId,
      name: 'Throwaway',
    });
    const r = await api('DELETE', `/milestones/${extra.data.milestone.id}`);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. MULTI-ASSIGNEES
// ═══════════════════════════════════════════════════════════════════════════════

describe('7 · Multi-assignees', () => {
  it('sets assignees on an issue', async () => {
    const r = await api('PUT', `/issues/${state.parentKey}/assignees`, {
      userIds: [USER_ID],
    });
    expect(r.status).toBe(200);
    expect(r.data.assignees).toHaveLength(1);
    expect(r.data.assignees[0].userId).toBe(USER_ID);
  });

  it('adds an assignee (idempotent)', async () => {
    const r = await api('POST', `/issues/${state.parentKey}/assignees`, {
      userId: USER_ID,
    });
    expect(r.status).toBe(201);
  });

  it('removes an assignee', async () => {
    const r = await api('DELETE', `/issues/${state.parentKey}/assignees/${USER_ID}`);
    expect(r.status).toBe(200);
  });

  it('clears all assignees', async () => {
    const r = await api('PUT', `/issues/${state.parentKey}/assignees`, {
      userIds: [],
    });
    expect(r.status).toBe(200);
    expect(r.data.assignees).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. CUSTOM FIELDS
// ═══════════════════════════════════════════════════════════════════════════════

describe('8 · Custom fields', () => {
  it('creates a dropdown custom field', async () => {
    const r = await api('POST', '/custom-fields', {
      slug: 'severity',
      label: 'Severity',
      type: 'dropdown',
      config: { options: ['Low', 'Medium', 'High', 'Critical'] },
    });
    expect(r.status).toBe(201);
    expect(r.data.field.slug).toBe('severity');
    state.customFieldId = r.data.field.id;
  });

  it('creates a number custom field', async () => {
    const r = await api('POST', '/custom-fields', {
      slug: 'story_points',
      label: 'Story Points',
      type: 'number',
    });
    expect(r.status).toBe(201);
    state.customFieldId2 = r.data.field.id;
  });

  it('lists custom fields', async () => {
    const r = await api('GET', '/custom-fields');
    expect(r.status).toBe(200);
    expect(r.data.fields.length).toBeGreaterThanOrEqual(2);
  });

  it('gets custom field by id', async () => {
    const r = await api('GET', `/custom-fields/${state.customFieldId}`);
    expect(r.status).toBe(200);
    expect(r.data.field.label).toBe('Severity');
  });

  it('updates a custom field', async () => {
    const r = await api('PATCH', `/custom-fields/${state.customFieldId}`, {
      label: 'Bug Severity',
    });
    expect(r.status).toBe(200);
    expect(r.data.field.label).toBe('Bug Severity');
  });

  it('deletes a custom field', async () => {
    const r = await api('DELETE', `/custom-fields/${state.customFieldId2}`);
    expect(r.status).toBe(204);
  });

  it('rejects duplicate slug', async () => {
    const r = await api('POST', '/custom-fields', {
      slug: 'severity',
      label: 'Duplicate',
      type: 'number',
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. TAGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('9 · Tags & issue tagging', () => {
  it('creates a tag', async () => {
    const r = await api('POST', '/tags', { name: 'bug', color: '#FF0000' });
    expect(r.status).toBe(201);
    expect(r.data.tag.name).toBe('bug');
    state.tagId1 = r.data.tag.id;
  });

  it('creating same tag name is idempotent', async () => {
    const r = await api('POST', '/tags', { name: 'bug' });
    expect(r.status).toBe(201);
    expect(r.data.tag.id).toBe(state.tagId1);
  });

  it('creates a second tag for merge test', async () => {
    const r = await api('POST', '/tags', { name: 'defect', color: '#CC0000' });
    expect(r.status).toBe(201);
    state.tagId2 = r.data.tag.id;
  });

  it('lists tags', async () => {
    const r = await api('GET', '/tags');
    expect(r.status).toBe(200);
    expect(r.data.tags.length).toBeGreaterThanOrEqual(2);
  });

  it('tags an issue', async () => {
    const r = await api('POST', `/issues/${state.parentKey}/tags`, {
      tagId: state.tagId1,
    });
    expect(r.status).toBe(201);
    expect(r.data.tags.some((t: any) => t.id === state.tagId1)).toBe(true);
  });

  it('tags issue with second tag', async () => {
    const r = await api('POST', `/issues/${state.parentKey}/tags`, {
      tagId: state.tagId2,
    });
    expect(r.status).toBe(201);
    expect(r.data.tags).toHaveLength(2);
  });

  it('untags an issue', async () => {
    const r = await api('DELETE', `/issues/${state.parentKey}/tags/${state.tagId2}`);
    expect(r.status).toBe(200);
    expect(r.data.tags).toHaveLength(1);
  });

  it('merges tags', async () => {
    const r = await api('POST', `/tags/${state.tagId2}/merge`, {
      targetId: state.tagId1,
    });
    expect(r.status).toBe(200);
  });

  it('merged tag is deleted', async () => {
    const r = await api('GET', '/tags');
    expect(r.data.tags.find((t: any) => t.id === state.tagId2)).toBeUndefined();
  });

  it('deletes a tag', async () => {
    const extra = await api('POST', '/tags', { name: 'throwaway' });
    const r = await api('DELETE', `/tags/${extra.data.tag.id}`);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ISSUE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('10 · Issue templates', () => {
  it('creates an issue template', async () => {
    const r = await api('POST', '/issue-templates', {
      name: 'Bug Report',
      templateTitle: 'Bug: ',
      templateBody: '## Steps to reproduce\n\n## Expected\n\n## Actual',
      priority: 2,
    });
    expect(r.status).toBe(201);
    expect(r.data.template.name).toBe('Bug Report');
    state.issueTemplateId = r.data.template.id;
  });

  it('lists issue templates', async () => {
    const r = await api('GET', '/issue-templates');
    expect(r.status).toBe(200);
    expect(r.data.templates.some((t: any) => t.id === state.issueTemplateId)).toBe(true);
  });

  it('gets issue template by id', async () => {
    const r = await api('GET', `/issue-templates/${state.issueTemplateId}`);
    expect(r.status).toBe(200);
    expect(r.data.template.templateTitle).toBe('Bug:');
  });

  it('updates an issue template', async () => {
    const r = await api('PATCH', `/issue-templates/${state.issueTemplateId}`, {
      description: 'Use this for bugs',
      priority: 3,
    });
    expect(r.status).toBe(200);
    expect(r.data.template.description).toBe('Use this for bugs');
    expect(r.data.template.priority).toBe(3);
  });

  it('deletes an issue template', async () => {
    const extra = await api('POST', '/issue-templates', { name: 'Temp' });
    const r = await api('DELETE', `/issue-templates/${extra.data.template.id}`);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. PROJECT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('11 · Project templates', () => {
  it('creates a project template', async () => {
    const r = await api('POST', '/project-templates', {
      name: 'Product Launch',
      description: 'Standard launch playbook',
      color: '#4EA7FC',
      variables: [
        { key: 'product_name', label: 'Product Name' },
        { key: 'launch_date', label: 'Launch Date', defaultValue: '2025-01-01' },
      ],
      blueprint: {
        milestones: [
          { name: 'Design Complete', offsetDays: 14 },
          { name: 'Launch Day', offsetDays: 30 },
        ],
        issues: [
          { title: 'Create landing page', priority: 2, milestone: 'Design Complete' },
          { title: 'Launch email blast', priority: 1, milestone: 'Launch Day' },
        ],
      },
    });
    expect(r.status).toBe(201);
    expect(r.data.template.name).toBe('Product Launch');
    expect(r.data.template.variables).toHaveLength(2);
    expect(r.data.template.blueprint.milestones).toHaveLength(2);
    state.projectTemplateId = r.data.template.id;
  });

  it('lists project templates', async () => {
    const r = await api('GET', '/project-templates');
    expect(r.status).toBe(200);
    expect(r.data.templates.some((t: any) => t.id === state.projectTemplateId)).toBe(true);
  });

  it('gets project template by id', async () => {
    const r = await api('GET', `/project-templates/${state.projectTemplateId}`);
    expect(r.status).toBe(200);
    expect(r.data.template.description).toBe('Standard launch playbook');
  });

  it('updates a project template', async () => {
    const r = await api('PATCH', `/project-templates/${state.projectTemplateId}`, {
      name: 'Product Launch v2',
      variables: [{ key: 'product_name', label: 'Product Name' }],
    });
    expect(r.status).toBe(200);
    expect(r.data.template.name).toBe('Product Launch v2');
    expect(r.data.template.variables).toHaveLength(1);
  });

  it('deletes a project template', async () => {
    const extra = await api('POST', '/project-templates', { name: 'Throwaway Template' });
    const r = await api('DELETE', `/project-templates/${extra.data.template.id}`);
    expect(r.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: Auth guard validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auth guards', () => {
  it('rejects unauthenticated requests to all new endpoints', async () => {
    const savedToken = TOKEN;
    TOKEN = '';

    const endpoints = [
      ['GET', '/teams'],
      ['GET', '/projects'],
      ['GET', '/initiatives'],
      ['GET', '/milestones?projectId=00000000-0000-0000-0000-000000000000'],
      ['GET', '/custom-fields'],
      ['GET', '/tags'],
      ['GET', '/issue-templates'],
      ['GET', '/project-templates'],
    ];

    for (const [method, path] of endpoints) {
      const r = await api(method, path);
      expect(r.status, `${method} ${path} should require auth`).toBe(401);
    }

    TOKEN = savedToken;
  });
});
