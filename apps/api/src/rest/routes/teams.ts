import {
  type TeamRow,
  addTeamMember,
  createTeam,
  getTeamById,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const teamsRouter: Router = Router();

teamsRouter.use(requireFullAuth);

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  key: z.string().min(1).max(6),
  description: z.string().max(500).optional(),
  icon: z.string().max(64).optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['Lead', 'Member']).optional(),
});

teamsRouter.get('/', async (req, res) => {
  const teams = await listTeams(getAuth(req));
  res.json({ teams: teams.map(toTeamJson) });
});

teamsRouter.post('/', async (req, res) => {
  const input = createTeamSchema.parse(req.body);
  const team = await createTeam({
    ctx: getAuth(req),
    name: input.name,
    key: input.key,
    description: input.description,
    icon: input.icon,
  });
  res.status(201).json({ team: toTeamJson(team) });
});

teamsRouter.get('/:id', async (req, res) => {
  const team = await getTeamById(getAuth(req), req.params.id!);
  res.json({ team: toTeamJson(team) });
});

teamsRouter.patch('/:id', async (req, res) => {
  const patch = updateTeamSchema.parse(req.body);
  const team = await updateTeam({
    ctx: getAuth(req),
    id: req.params.id!,
    ...patch,
  });
  res.json({ team: toTeamJson(team) });
});

teamsRouter.get('/:id/members', async (req, res) => {
  const members = await listTeamMembers(getAuth(req), req.params.id!);
  res.json({
    members: members.map((m) => ({
      userId: m.user_id,
      email: m.email,
      displayName: m.display_name,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  });
});

teamsRouter.post('/:id/members', async (req, res) => {
  const input = addMemberSchema.parse(req.body);
  await addTeamMember({
    ctx: getAuth(req),
    teamId: req.params.id!,
    userId: input.userId,
    role: input.role,
  });
  res.status(201).json({ ok: true });
});

teamsRouter.delete('/:id/members/:userId', async (req, res) => {
  await removeTeamMember({
    ctx: getAuth(req),
    teamId: req.params.id!,
    userId: req.params.userId!,
  });
  res.json({ ok: true });
});

function toTeamJson(t: TeamRow) {
  return {
    id: t.id,
    name: t.name,
    key: t.key,
    description: t.description,
    icon: t.icon,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}
