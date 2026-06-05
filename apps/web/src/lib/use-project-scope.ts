import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { type Project } from './api';
import { useProjects } from './project-store';

export type ProjectScope = {
  /** The project key in scope (from the /p/:projectKey/* route, or ?project= fallback). */
  projectKey: string;
  /** The resolved project, if it matches one in the workspace. */
  project: Project | null;
  /** The resolved project id, or '' when not in project scope. */
  projectId: string;
};

/**
 * Resolves the active project from a project-scoped route (/p/:projectKey/*),
 * falling back to a legacy `?project=` query param. Returns empty scope when
 * neither is present (workspace-global views).
 */
export function useProjectScope(): ProjectScope {
  const params = useParams<{ projectKey?: string }>();
  const [searchParams] = useSearchParams();
  const projects = useProjects((s) => s.all);

  const projectKey = params.projectKey ?? searchParams.get('project') ?? '';

  return useMemo(() => {
    if (!projectKey) return { projectKey: '', project: null, projectId: '' };
    const match =
      projects.find((p) => p.key === projectKey) ??
      projects.find((p) => p.id === projectKey) ??
      null;
    return { projectKey, project: match, projectId: match?.id ?? '' };
  }, [projectKey, projects]);
}
