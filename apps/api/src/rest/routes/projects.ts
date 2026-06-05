import {
  type ProjectListRow,
  type ProjectRow,
  addProjectTeam,
  createProject,
  createProjectList,
  deleteProject,
  deleteProjectList,
  getProjectById,
  listProjectLists,
  listProjects,
  removeProjectTeam,
  reorderProjectLists,
  updateProject,
  updateProjectList,
} from '@xpntl/domain';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireFullAuth } from '../../middleware/auth.js';

export const projectsRouter: Router = Router();

projectsRouter.use(requireFullAuth);

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  key: z.string().min(1).max(10),
  description: z.string().max(5000).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(64).optional(),
  leadId: z.string().min(1).optional(),
  initiativeId: z.string().min(1).optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  key: z.string().min(1).max(10).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['planned', 'started', 'paused', 'completed', 'canceled']).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(64).nullable().optional(),
  leadId: z.string().min(1).nullable().optional(),
  initiativeId: z.string().min(1).nullable().optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

projectsRouter.get('/', async (req, res) => {
  const projects = await listProjects(getAuth(req));
  res.json({ projects: projects.map(toProjectJson) });
});

projectsRouter.post('/', async (req, res) => {
  const input = createProjectSchema.parse(req.body);
  const project = await createProject({ ctx: getAuth(req), ...input });
  res.status(201).json({ project: toProjectJson(project) });
});

projectsRouter.get('/:id', async (req, res) => {
  const project = await getProjectById(getAuth(req), req.params.id!);
  res.json({ project: toProjectJson(project) });
});

projectsRouter.patch('/:id', async (req, res) => {
  const patch = updateProjectSchema.parse(req.body);
  const project = await updateProject({ ctx: getAuth(req), id: req.params.id!, ...patch });
  res.json({ project: toProjectJson(project) });
});

projectsRouter.delete('/:id', async (req, res) => {
  await deleteProject(getAuth(req), req.params.id!);
  res.status(204).end();
});

projectsRouter.post('/:id/teams', async (req, res) => {
  const { teamId } = z.object({ teamId: z.string().min(1) }).parse(req.body);
  await addProjectTeam({ ctx: getAuth(req), projectId: req.params.id!, teamId });
  res.status(201).json({ ok: true });
});

projectsRouter.delete('/:id/teams/:teamId', async (req, res) => {
  await removeProjectTeam({
    ctx: getAuth(req),
    projectId: req.params.id!,
    teamId: req.params.teamId!,
  });
  res.json({ ok: true });
});

// ── Lists within a project (XP-74) ─────────────────────────

const createListSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const updateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const reorderListsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).max(200),
});

projectsRouter.get('/:id/lists', async (req, res) => {
  const lists = await listProjectLists(getAuth(req), req.params.id!);
  res.json({ lists: lists.map(toListJson) });
});

projectsRouter.post('/:id/lists', async (req, res) => {
  const input = createListSchema.parse(req.body);
  const list = await createProjectList({
    ctx: getAuth(req),
    projectId: req.params.id!,
    name: input.name,
    color: input.color,
  });
  res.status(201).json({ list: toListJson(list) });
});

projectsRouter.patch('/:id/lists/reorder', async (req, res) => {
  const input = reorderListsSchema.parse(req.body);
  const lists = await reorderProjectLists({
    ctx: getAuth(req),
    projectId: req.params.id!,
    orderedIds: input.orderedIds,
  });
  res.json({ lists: lists.map(toListJson) });
});

projectsRouter.patch('/:id/lists/:listId', async (req, res) => {
  const input = updateListSchema.parse(req.body);
  const list = await updateProjectList({
    ctx: getAuth(req),
    id: req.params.listId!,
    name: input.name,
    color: input.color,
  });
  res.json({ list: toListJson(list) });
});

projectsRouter.delete('/:id/lists/:listId', async (req, res) => {
  await deleteProjectList(getAuth(req), req.params.listId!);
  res.status(204).end();
});

function toListJson(l: ProjectListRow) {
  return {
    id: l.id,
    projectId: l.project_id,
    name: l.name,
    color: l.color,
    position: l.position,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

function toProjectJson(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    key: p.key,
    description: p.description,
    status: p.status,
    icon: p.icon,
    color: p.color,
    leadId: p.lead_id,
    initiativeId: p.initiative_id,
    startDate: p.start_date,
    targetDate: p.target_date,
    sortOrder: p.sort_order,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
