/**
 * Open-core public barrel (see index.ts).
 *
 * The self-hostable build ships this file as `index.ts`. It is the commercial
 * barrel minus the hosted control plane:
 *   - `billing` is remapped to the open `gate` (unlimited / all features on)
 *   - `admin`, `license`, `social`, `feedback`, `organizations` are omitted
 * Everything a self-hosted instance needs (incl. `harnessKeys` resolution +
 * creation, and user-facing `dataExport`) stays public.
 */

export * from './errors.js';
export * from './types.js';
export { newId } from './id.js';
export * from './authz.js';
export * as audit from './audit/audit.service.js';
export * from './auth/account.service.js';
export * from './auth/signup.service.js';
export * from './auth/login.service.js';
export * from './auth/session.service.js';
export * from './auth/password.js';
export * as mfa from './auth/mfa.service.js';
export * as passkeys from './auth/passkey.service.js';
export * as oauth from './auth/oauth.service.js';
export * from './issues/issue.service.js';
export * from './issues/issue-types.js';
export * from './issues/issue-filter.js';
export * from './comments/comment.service.js';
export * from './reactions/reaction.service.js';
export * from './workflow-states/state.service.js';
export * from './users/user.service.js';
export * from './labels/label.service.js';
export * from './favorites/favorite.service.js';
export * from './recent-issues/recent-issue.service.js';
export * from './views/view.service.js';
export * from './teams/team.service.js';
export * from './projects/project.service.js';
export * as projectUpdates from './project-updates/project-update.service.js';
export * from './lists/list.service.js';
export * from './sync/op-log.service.js';
export * from './initiatives/initiative.service.js';
export * from './milestones/milestone.service.js';
export * from './assignees/assignee.service.js';
export * from './custom-fields/custom-field.service.js';
export * from './tags/tag.service.js';
export * from './templates/issue-template.service.js';
export * from './templates/project-template.service.js';
export * from './issues/issue-relation.service.js';
export * from './issues/issue-activity.service.js';
export * from './issues/recurrence.service.js';
export * from './attachments/attachment.service.js';
export * from './checklists/checklist.service.js';
export * from './audit/activity.service.js';
export * from './users/settings.service.js';
export * as invites from './users/invite.service.js';
export * from './workspaces/membership.service.js';
export * as agents from './agents/agent.service.js';
export * as billing from './billing/gate.js';
export * as harnessKeys from './billing/harness-key.service.js';
export * as apiKeys from './api-keys/api-key.service.js';
export * as email from './email/email.service.js';
export * as emailTemplates from './email/templates.js';
export * as notifications from './notifications/notification.service.js';
export * from './automations/automation.service.js';
export * from './automations/automation.executor.js';
export * as webhooks from './webhooks/webhook.service.js';
export * as github from './github/github.service.js';
export * as csvImport from './imports/csv-import.service.js';
export * as jiraImport from './imports/jira-import.service.js';
export * as githubImport from './imports/github-import.service.js';
export * as dataExport from './admin/export.service.js';
export * as analytics from './analytics/analytics.service.js';
export * as docs from './docs/doc.service.js';
export * as slack from './integrations/slack.service.js';
export * as sentry from './integrations/sentry.service.js';
