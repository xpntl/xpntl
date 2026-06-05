import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { createYoga } from 'graphql-yoga';
import { createGraphQLContext } from './graphql/context.js';
import { schema } from './graphql/schema.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { mountMcp } from '@xpntl/mcp/mount';
import { activityRouter } from './rest/routes/activity.js';
import { automationsRouter } from './rest/routes/automations.js';
import { agentsRouter } from './rest/routes/agents.js';
import { attachmentsRouter } from './rest/routes/attachments.js';
import { authRouter } from './rest/routes/auth.js';
import { oauthRouter } from './rest/routes/oauth.js';
import { checklistsRouter } from './rest/routes/checklists.js';
import { commentsRouter } from './rest/routes/comments.js';
import { customFieldsRouter } from './rest/routes/custom-fields.js';
import { favoritesRouter } from './rest/routes/favorites.js';
import { filesRouter } from './rest/routes/files.js';
import { githubRouter } from './rest/routes/github.js';
import { exportRouter } from './rest/routes/export.js';
import { importsRouter } from './rest/routes/imports.js';
import { healthRouter } from './rest/routes/health.js';
import { initiativesRouter } from './rest/routes/initiatives.js';
import { issueTemplatesRouter } from './rest/routes/issue-templates.js';
import { issuesRouter } from './rest/routes/issues.js';
import { labelsRouter } from './rest/routes/labels.js';
import { milestonesRouter } from './rest/routes/milestones.js';
import { projectTemplatesRouter } from './rest/routes/project-templates.js';
import { projectsRouter } from './rest/routes/projects.js';
import { projectUpdatesRouter } from './rest/routes/project-updates.js';
import { tagsRouter } from './rest/routes/tags.js';
import { teamsRouter } from './rest/routes/teams.js';
import { usersRouter } from './rest/routes/users.js';
import { recentIssuesRouter } from './rest/routes/recent-issues.js';
import { viewsRouter } from './rest/routes/views.js';
import { workflowStatesRouter } from './rest/routes/workflow-states.js';
import { notificationsRouter } from './rest/routes/notifications.js';
import { apiKeysRouter } from './rest/routes/api-keys.js';
import { auditRouter } from './rest/routes/audit.js';
import { webhooksRouter } from './rest/routes/webhooks.js';
import { workspacesRouter } from './rest/routes/workspaces.js';
import { invitesRouter } from './rest/routes/invites.js';
import { analyticsRouter } from './rest/routes/analytics.js';
import { docsRouter } from './rest/routes/docs.js';
import { syncRouter } from './rest/routes/sync.js';
import { slackRouter } from './rest/routes/slack.js';
import { sentryRouter } from './rest/routes/sentry.js';
import { registerCommercialRoutes } from './commercial.js';
import { rateLimit } from './middleware/rate-limit.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // honor X-Forwarded-For from the load balancer

  // Webhook receivers must verify HMAC signatures over the EXACT raw bytes, so
  // capture the raw body for these routes before the JSON parser consumes it.
  app.use('/v1/billing/webhook', express.raw({ type: 'application/json' }));
  // GitHub PR payloads can be large; match the JSON parser's limit so big
  // webhooks aren't rejected with 413 before we can verify them.
  app.use('/v1/github/webhook', express.raw({ type: '*/*', limit: '4mb' }));
  app.use(express.json({ limit: '4mb' }));
  // Apple Sign In posts its OAuth callback as application/x-www-form-urlencoded
  // (response_mode=form_post); without this parser req.body is empty and every
  // Apple sign-in fails the state check.
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
        const allowed = [
          process.env.PUBLIC_WEB_URL,
          process.env.MARKETING_SITE_URL,
          'https://xpntl.dev',
          'https://www.xpntl.dev',
          'https://xpntl.app',
          'https://www.xpntl.app',
          'https://usexpntl.com',
          'https://www.usexpntl.com',
          'https://mcp.xpntl.dev',
        ];
        if (allowed.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // Resolve session for every request (no-op if no token).
  app.use(authenticate);

  // Rate limiting for all /v1/* routes.
  app.use('/v1', rateLimit);

  // REST surface (versioned).
  app.use('/v1/health', healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/auth/oauth', oauthRouter);
  app.use('/v1/issues', issuesRouter);
  app.use('/v1/issues', attachmentsRouter);
  app.use('/v1/issues', activityRouter);
  app.use('/v1/issues', checklistsRouter);
  app.use('/v1/comments', commentsRouter);
  app.use('/v1/workflow-states', workflowStatesRouter);
  app.use('/v1/users', usersRouter);
  app.use('/v1/labels', labelsRouter);
  app.use('/v1/teams', teamsRouter);
  app.use('/v1/projects', projectsRouter);
  app.use('/v1/project-updates', projectUpdatesRouter);
  app.use('/v1/initiatives', initiativesRouter);
  app.use('/v1/milestones', milestonesRouter);
  app.use('/v1/custom-fields', customFieldsRouter);
  app.use('/v1/tags', tagsRouter);
  app.use('/v1/issue-templates', issueTemplatesRouter);
  app.use('/v1/project-templates', projectTemplatesRouter);
  app.use('/v1/favorites', favoritesRouter);
  app.use('/v1/views', viewsRouter);
  app.use('/v1/recent-issues', recentIssuesRouter);
  app.use('/v1/workspaces', workspacesRouter);
  app.use('/v1/invites', invitesRouter);
  app.use('/v1/api-keys', apiKeysRouter);
  app.use('/v1/audit', auditRouter);
  app.use('/v1/agents', agentsRouter);
  app.use('/v1/notifications', notificationsRouter);
  app.use('/v1/automations', automationsRouter);
  app.use('/v1/webhooks', webhooksRouter);
  app.use('/v1/github', githubRouter);
  app.use('/v1/export', exportRouter);
  app.use('/v1/imports', importsRouter);
  app.use('/v1/files', filesRouter);
  app.use('/v1/analytics', analyticsRouter);
  app.use('/v1/docs', docsRouter);
  app.use('/v1/sync', syncRouter);
  app.use('/v1/slack', slackRouter);
  app.use('/v1/sentry', sentryRouter);

  // Commercial control plane (hosted-only; replaced by a no-op stub in the
  // open build): /v1/admin, /v1/billing, /v1/organizations, /v1/feedback.
  registerCommercialRoutes(app);

  // Rewrite mcp.xpntl.dev requests to /mcp so the vanity domain works.
  app.use((req, _res, next) => {
    const host = req.hostname;
    if (host === 'mcp.xpntl.dev' && !req.path.startsWith('/mcp')) {
      req.url = `/mcp${req.url}`;
    }
    next();
  });

  // MCP surface (Streamable HTTP). Mounted before GraphQL/error handler
  // so MCP clients at /mcp get handled directly.
  mountMcp(app, '/mcp');

  // GraphQL surface. Yoga's instance is callable (req, res) but its type signature
  // doesn't satisfy Express's Application overload directly, so we wrap it.
  const yoga = createYoga({
    schema,
    graphiql: process.env.NODE_ENV !== 'production',
    landingPage: false,
    context: createGraphQLContext,
  });
  app.use(yoga.graphqlEndpoint, (req, res) => yoga(req, res));

  // Centralized error mapping. MUST be last.
  app.use(errorHandler);

  return app;
}
