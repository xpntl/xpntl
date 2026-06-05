import { analytics } from '@xpntl/domain';
import { Router } from 'express';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const analyticsRouter: Router = Router();

analyticsRouter.use(requireFullAuth);

analyticsRouter.get('/cycle-time', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const days = req.query.days ? Number(req.query.days) : undefined;
  const result = await analytics.getCycleTimeStats(getAuth(req), { projectId, days });
  res.json(result);
});

analyticsRouter.get('/throughput', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const days = req.query.days ? Number(req.query.days) : undefined;
  const result = await analytics.getThroughput(getAuth(req), { projectId, days });
  res.json({ buckets: result });
});

analyticsRouter.get('/velocity', async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const weeks = req.query.weeks ? Number(req.query.weeks) : undefined;
  const result = await analytics.getVelocity(getAuth(req), { projectId, weeks });
  res.json({ buckets: result });
});

analyticsRouter.get('/burndown', async (req, res) => {
  const projectId = req.query.projectId as string;
  const result = await analytics.getBurndown(getAuth(req), { projectId });
  res.json({ buckets: result });
});

analyticsRouter.get('/load-by-assignee', async (req, res) => {
  const result = await analytics.getIssueLoadByAssignee(getAuth(req));
  res.json({ assignees: result });
});

analyticsRouter.get('/export', async (req, res) => {
  const ctx = getAuth(req);
  const projectId = req.query.projectId as string | undefined;
  const format = (req.query.format as string) === 'json' ? 'json' : 'csv';

  const [cycleTime, throughput, velocity, assigneeLoad] = await Promise.all([
    analytics.getCycleTimeStats(ctx, { projectId }),
    analytics.getThroughput(ctx, { projectId }),
    analytics.getVelocity(ctx, { projectId }),
    analytics.getIssueLoadByAssignee(ctx),
  ]);

  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.json"');
    res.json({ cycleTime, throughput, velocity, assigneeLoad });
    return;
  }

  const lines: string[] = [];
  lines.push('# Cycle Time');
  lines.push('count,avgHours,p50Hours,p75Hours,p90Hours');
  lines.push(
    `${cycleTime.count},${cycleTime.avgHours},${cycleTime.p50Hours},${cycleTime.p75Hours},${cycleTime.p90Hours}`,
  );
  lines.push('');
  lines.push('# Throughput (weekly)');
  lines.push('weekStart,count');
  for (const b of throughput) lines.push(`${b.weekStart},${b.count}`);
  lines.push('');
  lines.push('# Velocity (weekly)');
  lines.push('weekStart,completed');
  for (const b of velocity) lines.push(`${b.weekStart},${b.completed}`);
  lines.push('');
  lines.push('# Load by Assignee');
  lines.push('assigneeId,displayName,email,openCount');
  for (const a of assigneeLoad)
    lines.push(`${a.assigneeId},"${a.displayName ?? ''}",${a.email},${a.openCount}`);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
  res.send(lines.join('\n'));
});
