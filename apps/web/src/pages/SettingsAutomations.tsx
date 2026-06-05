import { type FormEvent, useEffect, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { type Automation, FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

const TRIGGER_TYPES = [
  { value: 'state_change', label: 'State changes' },
  { value: 'issue_created', label: 'Issue created' },
  { value: 'label_added', label: 'Label added' },
  { value: 'due_date_passed', label: 'Due date passed' },
] as const;

const ACTION_TYPES = [
  { value: 'set_label', label: 'Set label' },
  { value: 'set_assignee', label: 'Set assignee' },
  { value: 'set_priority', label: 'Set priority' },
  { value: 'add_comment', label: 'Add comment' },
  { value: 'move_state', label: 'Move to state' },
] as const;

const STATE_TYPES = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'] as const;
const PRIORITIES = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
];

export function SettingsAutomationsPage() {
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Automations</h1>
      <AutomationsManager />
    </SettingsLayout>
  );
}

function AutomationsManager() {
  const { token } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listAutomations(token)
      .then((r) => setAutomations(r.automations))
      .catch((err) => setError(err instanceof FetchError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const { automation } = await api.updateAutomation(id, { enabled }, token);
      setAutomations((prev) => prev.map((a) => (a.id === id ? automation : a)));
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to update');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this automation?')) return;
    try {
      await api.deleteAutomation(id, token);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Failed to delete');
    }
  }

  function handleCreated(automation: Automation) {
    setAutomations((prev) => [automation, ...prev]);
    setShowForm(false);
  }

  if (loading) {
    return <div style={{ fontSize: 11, color: 'var(--xp-faint)' }}>Loading...</div>;
  }

  return (
    <div>
      {error && (
        <div style={{ fontSize: 11, color: 'var(--xp-danger)', marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => setShowForm(!showForm)} style={primaryBtnStyle}>
          {showForm ? 'Cancel' : 'Create Automation'}
        </button>
      </div>

      {showForm && <CreateAutomationForm onCreated={handleCreated} />}

      {automations.length === 0 && !showForm && (
        <div style={{ fontSize: 12, color: 'var(--xp-faint)', padding: '24px 0' }}>
          No automations yet. Create one to automate your workflow.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {automations.map((a) => (
          <AutomationCard
            key={a.id}
            automation={a}
            onToggle={(enabled) => handleToggle(a.id, enabled)}
            onDelete={() => handleDelete(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onDelete,
}: {
  automation: Automation;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        background: automation.enabled ? 'var(--xp-surface)' : 'var(--xp-canvas)',
        opacity: automation.enabled ? 1 : 0.6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <strong style={{ fontSize: 12.5, flex: 1 }}>{automation.name}</strong>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--xp-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={automation.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            style={{ accentColor: 'var(--xp-accent-strong)' }}
          />
          {automation.enabled ? 'Enabled' : 'Disabled'}
        </label>
        <button type="button" onClick={onDelete} style={dangerBtnStyle}>
          Delete
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--xp-muted)' }}>
        <span style={{ color: 'var(--xp-faint)', fontWeight: 600 }}>WHEN</span>{' '}
        {describeTrigger(automation.triggerType, automation.triggerConfig)}{' '}
        <span style={{ color: 'var(--xp-faint)', fontWeight: 600 }}>THEN</span>{' '}
        {describeAction(automation.actionType, automation.actionConfig)}
      </div>
    </div>
  );
}

function CreateAutomationForm({ onCreated }: { onCreated: (a: Automation) => void }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('state_change');
  const [actionType, setActionType] = useState('set_label');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Trigger config state
  const [fromStateType, setFromStateType] = useState('');
  const [toStateType, setToStateType] = useState('');
  const [triggerStateType, setTriggerStateType] = useState('');
  const [triggerLabelId, setTriggerLabelId] = useState('');

  // Action config state
  const [actionLabelId, setActionLabelId] = useState('');
  const [actionAssigneeId, setActionAssigneeId] = useState('');
  const [actionPriority, setActionPriority] = useState(0);
  const [actionCommentBody, setActionCommentBody] = useState('');
  const [actionStateType, setActionStateType] = useState('');

  function buildTriggerConfig(): Record<string, unknown> {
    switch (triggerType) {
      case 'state_change': {
        const cfg: Record<string, unknown> = {};
        if (fromStateType) cfg.from_state_type = fromStateType;
        if (toStateType) cfg.to_state_type = toStateType;
        return cfg;
      }
      case 'issue_created': {
        const cfg: Record<string, unknown> = {};
        if (triggerStateType) cfg.state_type = triggerStateType;
        return cfg;
      }
      case 'label_added': {
        const cfg: Record<string, unknown> = {};
        if (triggerLabelId) cfg.label_id = triggerLabelId;
        return cfg;
      }
      default:
        return {};
    }
  }

  function buildActionConfig(): Record<string, unknown> {
    switch (actionType) {
      case 'set_label':
        return actionLabelId ? { label_id: actionLabelId } : {};
      case 'set_assignee':
        return actionAssigneeId ? { assignee_id: actionAssigneeId } : {};
      case 'set_priority':
        return { priority: actionPriority };
      case 'add_comment':
        return actionCommentBody ? { body: actionCommentBody } : {};
      case 'move_state':
        return actionStateType ? { state_type: actionStateType } : {};
      default:
        return {};
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg('Name is required');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { automation } = await api.createAutomation(
        {
          name: name.trim(),
          triggerType,
          triggerConfig: buildTriggerConfig(),
          actionType,
          actionConfig: buildActionConfig(),
        },
        token,
      );
      onCreated(automation);
    } catch (err) {
      setMsg(err instanceof FetchError ? err.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        background: 'var(--xp-surface)',
        marginBottom: 16,
        maxWidth: 520,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <FieldLabel>Name</FieldLabel>
        <FieldInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Auto-close on Done"
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <FieldLabel>WHEN</FieldLabel>
        <FieldSelect value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </FieldSelect>
      </div>

      {/* Trigger config fields */}
      {triggerType === 'state_change' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>From state type (optional)</FieldLabel>
            <FieldSelect value={fromStateType} onChange={(e) => setFromStateType(e.target.value)}>
              <option value="">Any</option>
              {STATE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>To state type</FieldLabel>
            <FieldSelect value={toStateType} onChange={(e) => setToStateType(e.target.value)}>
              <option value="">Any</option>
              {STATE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FieldSelect>
          </div>
        </div>
      )}

      {triggerType === 'issue_created' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Initial state type (optional)</FieldLabel>
          <FieldSelect
            value={triggerStateType}
            onChange={(e) => setTriggerStateType(e.target.value)}
          >
            <option value="">Any</option>
            {STATE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FieldSelect>
        </div>
      )}

      {triggerType === 'label_added' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Label ID (optional, blank = any label)</FieldLabel>
          <FieldInput
            value={triggerLabelId}
            onChange={(e) => setTriggerLabelId(e.target.value)}
            placeholder="Label UUID"
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <FieldLabel>THEN</FieldLabel>
        <FieldSelect value={actionType} onChange={(e) => setActionType(e.target.value)}>
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </FieldSelect>
      </div>

      {/* Action config fields */}
      {actionType === 'set_label' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Label ID</FieldLabel>
          <FieldInput
            value={actionLabelId}
            onChange={(e) => setActionLabelId(e.target.value)}
            placeholder="Label UUID"
          />
        </div>
      )}

      {actionType === 'set_assignee' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Assignee user ID</FieldLabel>
          <FieldInput
            value={actionAssigneeId}
            onChange={(e) => setActionAssigneeId(e.target.value)}
            placeholder="User UUID"
          />
        </div>
      )}

      {actionType === 'set_priority' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Priority</FieldLabel>
          <FieldSelect
            value={String(actionPriority)}
            onChange={(e) => setActionPriority(Number(e.target.value))}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </FieldSelect>
        </div>
      )}

      {actionType === 'add_comment' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Comment body</FieldLabel>
          <textarea
            value={actionCommentBody}
            onChange={(e) => setActionCommentBody(e.target.value)}
            placeholder="Comment text..."
            rows={3}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              fontSize: 12.5,
              fontFamily: 'var(--xp-font-mono)',
              background: 'var(--xp-canvas)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              color: 'var(--xp-ink)',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {actionType === 'move_state' && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Target state type</FieldLabel>
          <FieldSelect value={actionStateType} onChange={(e) => setActionStateType(e.target.value)}>
            <option value="">Select...</option>
            {STATE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FieldSelect>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={busy} style={primaryBtnStyle}>
          {busy ? 'Creating...' : 'Create'}
        </button>
        {msg && <span style={{ fontSize: 11, color: 'var(--xp-danger)' }}>{msg}</span>}
      </div>
    </form>
  );
}

// --- Helpers ---

function describeTrigger(type: string, config: Record<string, unknown>): string {
  switch (type) {
    case 'state_change': {
      const from = config.from_state_type as string | undefined;
      const to = config.to_state_type as string | undefined;
      if (from && to) return `state changes from ${from} to ${to}`;
      if (to) return `state changes to ${to}`;
      if (from) return `state changes from ${from}`;
      return 'any state change';
    }
    case 'issue_created': {
      const st = config.state_type as string | undefined;
      return st ? `issue created in ${st}` : 'issue created';
    }
    case 'label_added': {
      const labelId = config.label_id as string | undefined;
      return labelId ? `label ${labelId.slice(0, 8)}... added` : 'any label added';
    }
    case 'due_date_passed':
      return 'due date passed';
    default:
      return type;
  }
}

function describeAction(type: string, config: Record<string, unknown>): string {
  switch (type) {
    case 'set_label': {
      const id = config.label_id as string | undefined;
      return id ? `set label ${id.slice(0, 8)}...` : 'set label';
    }
    case 'set_assignee': {
      const id = config.assignee_id as string | undefined;
      return id ? `assign to ${id.slice(0, 8)}...` : 'set assignee';
    }
    case 'set_priority': {
      const p = config.priority as number | undefined;
      const label = PRIORITIES.find((pr) => pr.value === p)?.label ?? String(p);
      return `set priority to ${label}`;
    }
    case 'add_comment': {
      const body = config.body as string | undefined;
      return body
        ? `add comment "${body.slice(0, 30)}${body.length > 30 ? '...' : ''}"`
        : 'add comment';
    }
    case 'move_state': {
      const st = config.state_type as string | undefined;
      const sid = config.state_id as string | undefined;
      if (st) return `move to ${st}`;
      if (sid) return `move to state ${sid.slice(0, 8)}...`;
      return 'move state';
    }
    default:
      return type;
  }
}

// --- Shared UI atoms ---

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--xp-faint)' }}>
      {children}
    </div>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        display: 'block',
        width: '100%',
        height: 'var(--xp-input-h)',
        padding: '0 10px',
        fontSize: 12.5,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-canvas)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-ink)',
        outline: 'none',
        ...props.style,
      }}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, ...rest } = props;
  return (
    <select
      {...rest}
      style={{
        display: 'block',
        width: '100%',
        height: 'var(--xp-input-h)',
        padding: '0 10px',
        fontSize: 12.5,
        fontFamily: 'var(--xp-font-mono)',
        background: 'var(--xp-canvas)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-ink)',
        outline: 'none',
        ...rest.style,
      }}
    >
      {children}
    </select>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-accent)',
  color: 'var(--xp-accent-fg)',
  border: 'none',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--xp-danger)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  padding: 0,
  textDecoration: 'underline',
};
