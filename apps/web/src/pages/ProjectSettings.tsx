// XP-86 Project Settings — project-scoped settings reached from the sidebar
// sub-nav (/p/:projectKey/settings). Edits auto-save on blur/change.

import { Select } from '@xpntl/ui';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useProjects } from '../lib/project-store';
import { DotIcon } from '../lib/select-options';
import { useProjectScope } from '../lib/use-project-scope';
import { useToasts } from '../lib/toast-store';
import { useUsers } from '../lib/user-store';

const STATUS_COLORS: Record<string, string> = {
  planned: 'var(--xp-muted)',
  started: 'var(--xp-accent)',
  paused: 'oklch(65% 0.16 60)',
  completed: 'var(--xp-success)',
  canceled: 'var(--xp-faint)',
};
const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'started', label: 'Started' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
].map((o) => ({ ...o, title: `Status: ${o.label}`, icon: <DotIcon color={STATUS_COLORS[o.value]!} /> }));

export function ProjectSettingsPage() {
  const { token } = useAuth();
  const { project, projectKey } = useProjectScope();
  const reload = useProjects((s) => s.reload);
  const navigate = useNavigate();
  const { push: pushToast } = useToasts();
  const usersById = useUsers((s) => s.byId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setDeleteConfirm('');
    }
  }, [project]);

  if (!project) {
    return (
      <AppLayout>
        <div style={{ padding: '24px 32px', fontSize: 12, color: 'var(--xp-muted)' }}>
          {projectKey ? `Project "${projectKey}" not found.` : 'No project in scope.'}
        </div>
      </AppLayout>
    );
  }

  const members = Object.values(usersById);

  async function save(patch: Parameters<typeof api.updateProject>[1]) {
    if (!project) return;
    try {
      await api.updateProject(project.id, patch, token);
      await reload(token);
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to save');
    }
  }

  async function handleDelete() {
    if (!project || deleteConfirm.trim() !== project.name || deleting) return;
    setDeleting(true);
    try {
      await api.deleteProject(project.id, token);
      await reload(token);
      navigate('/projects');
    } catch (err) {
      pushToast('danger', err instanceof FetchError ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: 640, padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{project.name}</h1>
          <span style={{ fontSize: 11, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-faint)' }}>
            {project.key}
          </span>
        </div>

        <Field label="Name">
          <Input value={name} onChange={setName} onBlur={() => name.trim() && name !== project.name && save({ name: name.trim() })} />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (project.description ?? '') && save({ description: description.trim() || null })}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 12.5,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 16 }}>
          <Field label="Status">
            <div style={{ width: 200 }}>
              <Select value={project.status} onValueChange={(v) => v !== project.status && save({ status: v })} options={STATUS_OPTIONS} />
            </div>
          </Field>
          <Field label="Lead">
            <div style={{ width: 220 }}>
              <Select
                value={project.leadId ?? ''}
                onValueChange={(v) => save({ leadId: v || null })}
                options={[
                  { value: '', label: 'No lead' },
                  ...members.map((m) => ({ value: m.id, label: m.displayName ?? m.email })),
                ]}
              />
            </div>
          </Field>
        </div>

        <Field label="Target date">
          <input
            type="date"
            value={project.targetDate ? project.targetDate.slice(0, 10) : ''}
            onChange={(e) => save({ targetDate: e.target.value || undefined })}
            style={{
              height: 'var(--xp-input-h)',
              padding: '0 10px',
              fontSize: 12.5,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
            }}
          />
        </Field>

        {/* Read-only identifiers + metadata */}
        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            background: 'var(--xp-surface)',
            border: '1px solid var(--xp-hairline)',
            borderRadius: 'var(--xp-r-sm)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <Meta label="Identifier" value={project.key} mono />
          <Meta label="Created" value={new Date(project.createdAt).toLocaleDateString()} />
          <Meta label="Updated" value={new Date(project.updatedAt).toLocaleDateString()} />
        </div>

        <div
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: '1px solid var(--xp-hairline)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--xp-danger)', marginBottom: 6 }}>
            Danger zone
          </div>
          <p style={{ fontSize: 12, color: 'var(--xp-muted)', margin: '0 0 10px', lineHeight: 1.5, maxWidth: 520 }}>
            Deleting <strong>{project.name}</strong> permanently removes the project and{' '}
            <strong>all of its issues</strong> (and their comments). This cannot be undone. Type{' '}
            <code style={{ fontFamily: 'var(--xp-font-mono)', background: 'var(--xp-surface)', padding: '1px 5px', borderRadius: 4 }}>
              {project.name}
            </code>{' '}
            to confirm.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 520 }}>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={project.name}
              aria-label="Type the project name to confirm deletion"
              style={{
                flex: 1,
                height: 'var(--xp-input-h)',
                padding: '0 10px',
                fontSize: 12.5,
                fontFamily: 'var(--xp-font-mono)',
                background: 'var(--xp-surface)',
                border: '1px solid var(--xp-border)',
                borderRadius: 'var(--xp-r-sm)',
                color: 'var(--xp-ink)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteConfirm.trim() !== project.name || deleting}
              style={{
                padding: '0 14px',
                height: 'var(--xp-input-h)',
                fontSize: 12,
                fontFamily: 'var(--xp-font-mono)',
                fontWeight: 600,
                flexShrink: 0,
                background: deleteConfirm.trim() === project.name ? 'var(--xp-danger)' : 'transparent',
                color: deleteConfirm.trim() === project.name ? 'var(--xp-accent-fg)' : 'var(--xp-faint)',
                border: '1px solid var(--xp-danger)',
                borderRadius: 'var(--xp-r-sm)',
                cursor: deleteConfirm.trim() === project.name && !deleting ? 'pointer' : 'not-allowed',
                opacity: deleteConfirm.trim() === project.name ? 1 : 0.6,
              }}
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--xp-faint)' }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, marginTop: 2, fontFamily: mono ? 'var(--xp-font-mono)' : undefined }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{
        width: '100%',
        height: 'var(--xp-input-h)',
        padding: '0 10px',
        fontSize: 12.5,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-ink)',
        outline: 'none',
      }}
    />
  );
}
