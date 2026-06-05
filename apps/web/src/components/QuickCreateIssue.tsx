import { Button, Dialog, Input, Select } from '@xpntl/ui';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Issue, Project, WorkflowState } from '../lib/api';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { PRIORITY_SELECT_OPTIONS, TYPE_SELECT_OPTIONS, stateSelectOptions } from '../lib/select-options';

interface QuickCreateIssueProps {
  open: boolean;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
  projects: Project[];
  states: WorkflowState[];
  defaultProjectId?: string;
}

export function QuickCreateIssue({
  open,
  onClose,
  onCreated,
  projects,
  states,
  defaultProjectId,
}: QuickCreateIssueProps) {
  const { token } = useAuth();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [stateId, setStateId] = useState('');
  const [priority, setPriority] = useState('0');
  const [issueType, setIssueType] = useState('issue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setProjectId(defaultProjectId ?? '');
      setStateId('');
      setPriority('0');
      setIssueType('issue');
      setError(null);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, defaultProjectId]);

  const stateOptions = stateSelectOptions(
    states.filter((s) => s.type !== 'completed' && s.type !== 'canceled'),
  );

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      const input: Parameters<typeof api.createIssue>[0] = {
        title: title.trim(),
        projectId,
        priority: Number(priority) || undefined,
      };
      if (description.trim()) input.description = description.trim();
      if (stateId) input.stateId = stateId;
      if (issueType && issueType !== 'issue') input.type = issueType;
      const { issue } = await api.createIssue(input, token);
      onCreated(issue);
      onClose();
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to create issue');
    } finally {
      setBusy(false);
    }
  }, [title, description, projectId, stateId, priority, issueType, token, onCreated, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New issue"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={(e: any) => handleSubmit(e)} disabled={busy || !title.trim() || !projectId}>
            {busy ? 'Creating...' : 'Create issue'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <FieldLabel>Title</FieldLabel>
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
          />
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={3}
            style={{
              display: 'block',
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
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Project</FieldLabel>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              options={projectOptions}
              placeholder="Select project"
            />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>State</FieldLabel>
            <Select
              value={stateId}
              onValueChange={setStateId}
              options={[{ value: '', label: 'Default' }, ...stateOptions]}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Priority</FieldLabel>
            <Select
              value={priority}
              onValueChange={setPriority}
              options={PRIORITY_SELECT_OPTIONS}
            />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Type</FieldLabel>
            <Select
              value={issueType}
              onValueChange={setIssueType}
              options={TYPE_SELECT_OPTIONS}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 11, color: 'var(--xp-danger)' }}>{error}</div>
        )}

        <button type="submit" style={{ display: 'none' }} />
      </form>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--xp-faint)', marginBottom: 4, letterSpacing: '0.04em' }}>
      {children}
    </div>
  );
}
