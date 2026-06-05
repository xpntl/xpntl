import { Button, EmptyState, Skeleton } from '@xpntl/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { type Project, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useProjects } from '../lib/project-store';
import { useToasts } from '../lib/toast-store';

const STATUS_LABELS: Record<Project['status'], string> = {
  planned: 'Planned',
  started: 'Started',
  paused: 'Paused',
  completed: 'Completed',
  canceled: 'Canceled',
};

const STATUS_COLORS: Record<Project['status'], string> = {
  planned: 'var(--xp-muted)',
  started: 'var(--xp-accent)',
  paused: 'oklch(65% 0.16 60)',
  completed: 'var(--xp-success)',
  canceled: 'var(--xp-faint)',
};

export function ProjectsPage() {
  const { token } = useAuth();
  const pushToast = useToasts((s) => s.push);
  const storeProjects = useProjects((s) => s.all);
  const reloadProjects = useProjects((s) => s.reload);
  const storeLoading = useProjects((s) => s.loading);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    setProjects(storeProjects);
    if (!storeLoading) setLoading(false);
  }, [storeProjects, storeLoading]);

  function handleCreated(p: Project) {
    setProjects((prev) => [p, ...prev]);
    setShowCreate(false);
    pushToast('success', `Created project "${p.name}"`);
    reloadProjects(token);
  }

  function handleUpdated(p: Project) {
    setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setEditId(null);
    pushToast('success', `Updated project "${p.name}"`);
    reloadProjects(token);
  }

  function handleDeleted(id: string) {
    setProjects((prev) => prev.filter((x) => x.id !== id));
    pushToast('info', 'Project deleted');
    reloadProjects(token);
  }

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid var(--xp-hairline)',
            flex: 'none',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 'var(--xp-track-wide)',
              textTransform: 'uppercase',
              color: 'var(--xp-ink)',
            }}
          >
            Projects
          </h1>
          <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
            New project
          </Button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {showCreate && (
            <ProjectForm
              onSave={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={40} />
              ))}
            </div>
          )}

          {!loading && projects.length === 0 && !showCreate && (
            <div
              style={{
                padding: '24px',
                border: '1px dashed var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                background: 'var(--xp-surface)',
              }}
            >
              <EmptyState
                icon={
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 8h16v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8z" /><path d="M6 8l3-3h10l3 3" /><path d="M11 14h6" /></svg>
                }
                title="No projects yet"
                description="Create your first project to organize and group issues."
                action={
                  <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
                    New project
                  </Button>
                }
              />
            </div>
          )}

          {projects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {projects.map((p) =>
                editId === p.id ? (
                  <ProjectForm
                    key={p.id}
                    project={p}
                    onSave={handleUpdated}
                    onCancel={() => setEditId(null)}
                    onDelete={() => handleDeleted(p.id)}
                  />
                ) : (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onEdit={() => setEditId(p.id)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function ProjectRow({ project: p, onEdit }: { project: Project; onEdit: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 'var(--xp-r-sm)',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12.5,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--xp-layer)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[p.status],
          flex: 'none',
        }}
      />
      <Link
        to={`/p/${encodeURIComponent(p.key)}/board`}
        title="Open project board"
        style={{ fontWeight: 600, color: 'var(--xp-ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
      >
        {p.name}
      </Link>
      {p.description && (
        <span style={{ color: 'var(--xp-faint)', fontSize: 11, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
          {p.description}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: STATUS_COLORS[p.status],
          flex: 'none',
        }}
      >
        {STATUS_LABELS[p.status]}
      </span>
      {p.targetDate && (
        <span style={{ color: 'var(--xp-faint)', fontSize: 11, flex: 'none' }}>
          {new Date(p.targetDate).toLocaleDateString()}
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        title="Edit project"
        style={{ fontFamily: 'var(--xp-font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--xp-muted)', background: 'transparent', border: 0, cursor: 'pointer', flex: 'none' }}
      >
        EDIT
      </button>
      <Link
        to={`/p/${encodeURIComponent(p.key)}/archived`}
        title="View archived issues"
        style={{ fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--xp-muted)', textDecoration: 'none', flex: 'none' }}
      >
        ⌗ ARCHIVED
      </Link>
    </div>
  );
}

function ProjectForm({
  project,
  onSave,
  onCancel,
  onDelete,
}: {
  project?: Project;
  onSave: (p: Project) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState(project?.name ?? '');
  const [projectKey, setProjectKey] = useState('');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'planned');
  const [targetDate, setTargetDate] = useState(project?.targetDate?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (project) {
        const { project: updated } = await api.updateProject(
          project.id,
          {
            name: name.trim(),
            description: description.trim() || undefined,
            status,
            targetDate: targetDate || undefined,
          },
          token,
        );
        onSave(updated);
      } else {
        const { project: created } = await api.createProject(
          {
            name: name.trim(),
            key: projectKey.trim().toUpperCase() || name.trim().slice(0, 5).toUpperCase().replace(/\s+/g, ''),
            description: description.trim() || undefined,
          },
          token,
        );
        onSave(created);
      }
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!project || !onDelete || deleteName.trim() !== project.name) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(project.id, token);
      onDelete();
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 10px',
    fontSize: 12.5,
    fontFamily: 'var(--xp-font-mono)',
    background: 'var(--xp-surface)',
    border: '1px solid var(--xp-border)',
    borderRadius: 'var(--xp-r-sm)',
    color: 'var(--xp-ink)',
    outline: 'none',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '12px',
        marginBottom: 8,
        background: 'var(--xp-canvas)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          style={inputStyle}
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="off"
        />
        {!project && (
          <input
            style={inputStyle}
            placeholder="Key (e.g. PROJ)"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
            autoComplete="off"
            maxLength={10}
          />
        )}
        <input
          style={inputStyle}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoComplete="off"
        />
        {project && (
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Project['status'])}
              style={{
                ...inputStyle,
                flex: 1,
                cursor: 'pointer',
              }}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="date"
              style={{ ...inputStyle, flex: 1 }}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Button size="sm" variant="primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : project ? 'Save' : 'Create'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} type="button">
          Cancel
        </Button>
        {error && (
          <span style={{ fontSize: 11, color: 'var(--xp-danger)', fontFamily: 'var(--xp-font-mono)' }}>
            {error}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {project && onDelete && (
          confirmDelete ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
                placeholder={`Type "${project.name}"`}
                aria-label="Type the project name to confirm deletion"
                title="Deletes the project and all of its issues"
                style={{
                  width: 160,
                  padding: '4px 8px',
                  fontSize: 11.5,
                  fontFamily: 'var(--xp-font-mono)',
                  background: 'var(--xp-surface)',
                  border: '1px solid var(--xp-danger)',
                  borderRadius: 'var(--xp-r-sm)',
                  color: 'var(--xp-ink)',
                  outline: 'none',
                }}
              />
              <Button
                size="sm"
                variant="danger"
                onClick={handleDelete}
                disabled={busy || deleteName.trim() !== project.name}
                type="button"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteName('');
                }}
                disabled={busy}
                type="button"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy} type="button">
              <span style={{ color: 'var(--xp-danger)' }}>Delete</span>
            </Button>
          )
        )}
      </div>
    </form>
  );
}
