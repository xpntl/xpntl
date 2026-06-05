import { type ReactNode, useEffect, useRef, useState } from 'react';
import { SettingsLayout } from '../components/SettingsLayout';
import { FetchError, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useProjects } from '../lib/project-store';

type Step = 'credentials' | 'select-jira-project' | 'select-xpntl-project' | 'importing';

type JiraProjectOption = {
  id: string;
  key: string;
  name: string;
  type: string;
};

type ImportJob = {
  id: string;
  projectId: string;
  status: string;
  filename: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: Array<{ row: number; message: string }>;
  createdAt: string;
  completedAt: string | null;
};

export function SettingsImportPage() {
  const [source, setSource] = useState<'csv' | 'jira' | 'github'>('csv');
  return (
    <SettingsLayout>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Import</h1>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
        Bring your issues into an xpntl project from a CSV file, Jira Cloud, or GitHub.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        <SourceTab active={source === 'csv'} onClick={() => setSource('csv')}>CSV file</SourceTab>
        <SourceTab active={source === 'jira'} onClick={() => setSource('jira')}>Jira Cloud</SourceTab>
        <SourceTab active={source === 'github'} onClick={() => setSource('github')}>GitHub</SourceTab>
      </div>
      {source === 'csv' && <CsvImportWizard />}
      {source === 'jira' && <JiraImportWizard />}
      {source === 'github' && <GitHubImportWizard />}
    </SettingsLayout>
  );
}

function GitHubImportWizard() {
  const { token } = useAuth();
  const projects = useProjects((s) => s.all);
  const [repo, setRepo] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Awaited<ReturnType<typeof api.getImportJob>> | null>(null);

  useEffect(() => {
    if (token) void useProjects.getState().load(token);
  }, [token]);
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  async function handleImport() {
    if (!repo.trim() || !ghToken.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let result = await api.startGithubImport(
        { repo: repo.trim(), token: ghToken.trim(), projectId: projectId || projects[0]?.id || '' },
        token,
      );
      setJob(result);
      for (let i = 0; i < 90 && (result.status === 'pending' || result.status === 'processing'); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        result = await api.getImportJob(result.id, token);
        setJob(result);
      }
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  if (job) {
    const done = job.status === 'completed' || job.status === 'failed';
    return (
      <div style={csvCard}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          {!done ? 'Importing…' : job.status === 'completed' ? 'Import complete' : 'Import finished with errors'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>
          {job.importedRows} of {job.totalRows} issues imported
          {job.failedRows > 0 ? ` · ${job.failedRows} failed` : ''}.
        </div>
        {Array.isArray(job.errors) && job.errors.length > 0 && (
          <ul style={{ marginTop: 10, fontSize: 11, color: 'var(--xp-danger)', fontFamily: 'var(--xp-font-mono)' }}>
            {job.errors.slice(0, 8).map((e: unknown, i: number) => (
              <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>
            ))}
          </ul>
        )}
        {done && (
          <button
            type="button"
            onClick={() => {
              setJob(null);
              setRepo('');
            }}
            style={{ ...csvPrimaryBtn(false), marginTop: 16 }}
          >
            Import another repo
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={csvCard}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Import from GitHub Issues</div>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
        Imports open & closed issues (pull requests are skipped) with their labels. Needs a token with{' '}
        <strong>repo</strong> read access.
      </p>
      <CsvFieldRow label="Repository">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo"
          style={{ ...csvSelect, width: '100%' } as React.CSSProperties}
        />
      </CsvFieldRow>
      <CsvFieldRow label="GitHub token">
        <input
          value={ghToken}
          onChange={(e) => setGhToken(e.target.value)}
          type="password"
          placeholder="ghp_… (personal access token)"
          autoComplete="off"
          style={{ ...csvSelect, width: '100%' } as React.CSSProperties}
        />
      </CsvFieldRow>
      <CsvFieldRow label="Target project">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={csvSelect}>
          <option value="">Default project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </CsvFieldRow>
      {error && <div style={{ color: 'var(--xp-danger)', fontSize: 11, margin: '8px 0' }}>{error}</div>}
      <button
        type="button"
        disabled={!repo.trim() || !ghToken.trim() || busy}
        onClick={handleImport}
        style={{ ...csvPrimaryBtn(!repo.trim() || !ghToken.trim() || busy), marginTop: 8 }}
      >
        {busy ? 'Importing…' : 'Import issues'}
      </button>
    </div>
  );
}

function SourceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--xp-font-mono)',
        background: active ? 'var(--xp-accent)' : 'var(--xp-surface)',
        color: active ? 'var(--xp-accent-fg)' : 'var(--xp-ink)',
        border: `1px solid ${active ? 'var(--xp-accent)' : 'var(--xp-border)'}`,
        borderRadius: 'var(--xp-r-sm)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const CSV_FIELDS: Array<{ key: string; label: string; required?: boolean; guess: RegExp }> = [
  { key: 'title', label: 'Title', required: true, guess: /title|summary|name|subject/i },
  { key: 'description', label: 'Description', guess: /desc|body|details|notes/i },
  { key: 'priority', label: 'Priority', guess: /priority|prio/i },
  { key: 'state', label: 'State', guess: /state|status|stage/i },
  { key: 'assignee', label: 'Assignee', guess: /assign|owner|responsible/i },
];

const SKIP = '__skip';

function CsvImportWizard() {
  const { token } = useAuth();
  const projects = useProjects((s) => s.all);

  const [step, setStep] = useState<'upload' | 'map' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Awaited<ReturnType<typeof api.getImportJob>> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) void useProjects.getState().load(token);
  }, [token]);
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    setBusy(true);
    try {
      const preview = await api.previewCsvImport(f, token);
      setHeaders(preview.headers);
      setSampleRows(preview.sampleRows);
      setTotalRows(preview.totalRows);
      // Auto-guess the mapping by header name.
      const guessed: Record<string, string> = {};
      for (const field of CSV_FIELDS) {
        const match = preview.headers.find((h) => field.guess.test(h));
        if (match) guessed[field.key] = match;
      }
      setMapping(guessed);
      setStep('map');
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Could not read that CSV.');
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file || !mapping.title) return;
    setBusy(true);
    setError(null);
    try {
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, v]) => v && v !== SKIP),
      );
      let result = await api.startCsvImport(
        file,
        { projectId: projectId || undefined, mapping: cleanMapping },
        token,
      );
      setJob(result);
      setStep('result');
      // Poll until the job finishes.
      for (let i = 0; i < 60 && (result.status === 'pending' || result.status === 'processing'); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        result = await api.getImportJob(result.id, token);
        setJob(result);
      }
    } catch (err) {
      setError(err instanceof FetchError ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setSampleRows([]);
    setMapping({});
    setJob(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (step === 'result' && job) {
    const done = job.status === 'completed' || job.status === 'failed';
    return (
      <div style={csvCard}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          {!done ? 'Importing…' : job.status === 'completed' ? 'Import complete' : 'Import finished with errors'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)' }}>
          {job.importedRows} of {job.totalRows} issues imported
          {job.failedRows > 0 ? ` · ${job.failedRows} failed` : ''}.
        </div>
        {Array.isArray(job.errors) && job.errors.length > 0 && (
          <ul style={{ marginTop: 10, fontSize: 11, color: 'var(--xp-danger)', fontFamily: 'var(--xp-font-mono)' }}>
            {job.errors.slice(0, 8).map((e: unknown, i: number) => (
              <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>
            ))}
          </ul>
        )}
        {done && (
          <button type="button" onClick={reset} style={{ ...csvPrimaryBtn(false), marginTop: 16 }}>
            Import another file
          </button>
        )}
      </div>
    );
  }

  if (step === 'map') {
    return (
      <div style={csvCard}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Map columns</div>
        <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
          {totalRows} row{totalRows === 1 ? '' : 's'} in <strong>{file?.name}</strong>. Match your CSV
          columns to issue fields — Title is required.
        </p>

        <div style={{ marginBottom: 16 }}>
          <CsvFieldRow label="Target project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={csvSelect}>
              <option value="">Default project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </CsvFieldRow>
          {CSV_FIELDS.map((field) => (
            <CsvFieldRow key={field.key} label={`${field.label}${field.required ? ' *' : ''}`}>
              <select
                value={mapping[field.key] ?? SKIP}
                onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                style={csvSelect}
              >
                <option value={SKIP}>— Skip —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </CsvFieldRow>
          ))}
        </div>

        {sampleRows.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid var(--xp-border)', borderRadius: 'var(--xp-r-sm)', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--xp-font-mono)' }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--xp-muted)', borderBottom: '1px solid var(--xp-border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, ri) => (
                  <tr key={ri}>
                    {headers.map((_h, ci) => (
                      <td key={ci} style={{ padding: '6px 8px', borderBottom: '1px solid var(--xp-hairline)', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <div style={{ color: 'var(--xp-danger)', fontSize: 11, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={reset} style={csvGhostBtn}>Back</button>
          <button type="button" disabled={!mapping.title || busy} onClick={handleImport} style={csvPrimaryBtn(!mapping.title || busy)}>
            {busy ? 'Importing…' : `Import ${totalRows} issue${totalRows === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    );
  }

  // step === 'upload'
  return (
    <div style={csvCard}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Upload a CSV</div>
      <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
        One issue per row, with a header row. You’ll map columns to fields next.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        style={{ display: 'none' }}
      />
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={csvPrimaryBtn(busy)}>
        {busy ? 'Reading…' : 'Choose CSV file'}
      </button>
      {error && <div style={{ color: 'var(--xp-danger)', fontSize: 11, marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function CsvFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ width: 120, fontSize: 12, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-ink)' }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const csvCard: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  padding: 20,
  maxWidth: 620,
};

const csvSelect: React.CSSProperties = {
  width: '100%',
  height: 'var(--xp-input-h)',
  padding: '0 10px',
  fontSize: 12.5,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-surface)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  color: 'var(--xp-ink)',
};

function csvPrimaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--xp-font-mono)',
    background: 'var(--xp-accent)',
    color: 'var(--xp-accent-fg)',
    border: 'none',
    borderRadius: 'var(--xp-r-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

const csvGhostBtn: React.CSSProperties = {
  padding: '7px 16px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--xp-font-mono)',
  background: 'var(--xp-surface)',
  color: 'var(--xp-ink)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

function JiraImportWizard() {
  const { token } = useAuth();
  const projects = useProjects((s) => s.all);

  const [step, setStep] = useState<Step>('credentials');

  // Step 1 — credentials
  const [jiraUrl, setJiraUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [credError, setCredError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Step 2 — Jira project selection
  const [jiraProjects, setJiraProjects] = useState<JiraProjectOption[]>([]);
  const [selectedJiraKey, setSelectedJiraKey] = useState('');

  // Step 3 — xpntl project selection
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Step 4 — import progress
  const [job, setJob] = useState<ImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-select first xpntl project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId]);

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleFetchJiraProjects() {
    const url = jiraUrl.trim();
    const em = email.trim();
    const tok = apiToken.trim();
    if (!url || !em || !tok) {
      setCredError('All fields are required.');
      return;
    }
    setCredError(null);
    setLoadingProjects(true);
    try {
      const result = await api.getJiraProjects({ jiraUrl: url, email: em, apiToken: tok }, token);
      setJiraProjects(result.projects);
      if (result.projects.length > 0) {
        setSelectedJiraKey(result.projects[0]!.key);
      }
      setStep('select-jira-project');
    } catch (err) {
      setCredError(err instanceof FetchError ? err.message : 'Failed to connect to Jira. Check your URL and credentials.');
    } finally {
      setLoadingProjects(false);
    }
  }

  function handleJiraProjectNext() {
    if (!selectedJiraKey) return;
    setStep('select-xpntl-project');
  }

  async function handleStartImport() {
    if (!selectedJiraKey || !selectedProjectId) return;
    setImportError(null);
    try {
      const newJob = await api.startJiraImport(
        {
          jiraUrl: jiraUrl.trim(),
          email: email.trim(),
          apiToken: apiToken.trim(),
          jiraProjectKey: selectedJiraKey,
          projectId: selectedProjectId,
        },
        token,
      );
      setJob(newJob);
      setStep('importing');
      // Poll for progress every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const updated = await api.getImportJob(newJob.id, token);
          setJob(updated);
          if (updated.status === 'completed' || updated.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 3000);
    } catch (err) {
      setImportError(err instanceof FetchError ? err.message : 'Failed to start import.');
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('credentials');
    setJiraUrl('');
    setEmail('');
    setApiToken('');
    setCredError(null);
    setJiraProjects([]);
    setSelectedJiraKey('');
    setSelectedProjectId(projects[0]?.id ?? '');
    setJob(null);
    setImportError(null);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <StepIndicator current={step} />

      {step === 'credentials' && (
        <div>
          <SectionTitle>Step 1 — Connect to Jira Cloud</SectionTitle>
          <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
            Generate an API token at{' '}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--xp-accent-strong)' }}
            >
              id.atlassian.com
            </a>
            . Your credentials are never stored — they are only used to fetch your Jira projects.
          </p>
          <FieldRow label="Jira Cloud URL">
            <input
              value={jiraUrl}
              onChange={(e) => setJiraUrl(e.target.value)}
              placeholder="mycompany.atlassian.net"
              style={inputStyle}
            />
          </FieldRow>
          <FieldRow label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </FieldRow>
          <FieldRow label="API Token">
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Your Jira API token"
              style={inputStyle}
            />
          </FieldRow>
          {credError && (
            <div style={{ color: 'var(--xp-danger, #e53e3e)', fontSize: 11, fontFamily: 'var(--xp-font-mono)', marginBottom: 12 }}>
              {credError}
            </div>
          )}
          <PrimaryButton onClick={handleFetchJiraProjects} disabled={loadingProjects}>
            {loadingProjects ? 'Connecting...' : 'Connect & fetch projects'}
          </PrimaryButton>
        </div>
      )}

      {step === 'select-jira-project' && (
        <div>
          <SectionTitle>Step 2 — Select Jira project</SectionTitle>
          <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
            Choose which Jira project to import from.
          </p>
          <FieldRow label="Jira project">
            <select
              value={selectedJiraKey}
              onChange={(e) => setSelectedJiraKey(e.target.value)}
              style={inputStyle}
            >
              {jiraProjects.map((p) => (
                <option key={p.key} value={p.key}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostButton onClick={() => setStep('credentials')}>Back</GhostButton>
            <PrimaryButton onClick={handleJiraProjectNext} disabled={!selectedJiraKey}>
              Next
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 'select-xpntl-project' && (
        <div>
          <SectionTitle>Step 3 — Select target xpntl project</SectionTitle>
          <p style={{ fontSize: 11, color: 'var(--xp-muted)', fontFamily: 'var(--xp-font-mono)', marginBottom: 16 }}>
            Issues from <strong>{selectedJiraKey}</strong> will be imported into this project.
          </p>
          <FieldRow label="xpntl project">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={inputStyle}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.key}] {p.name}
                </option>
              ))}
            </select>
          </FieldRow>
          {importError && (
            <div style={{ color: 'var(--xp-danger, #e53e3e)', fontSize: 11, fontFamily: 'var(--xp-font-mono)', marginBottom: 12 }}>
              {importError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostButton onClick={() => setStep('select-jira-project')}>Back</GhostButton>
            <PrimaryButton onClick={handleStartImport} disabled={!selectedProjectId}>
              Start import
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 'importing' && job && (
        <div>
          <SectionTitle>Step 4 — Import progress</SectionTitle>
          <ImportProgress job={job} />
          {(job.status === 'completed' || job.status === 'failed') && (
            <div style={{ marginTop: 20 }}>
              <PrimaryButton onClick={handleReset}>Start a new import</PrimaryButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'credentials', label: '1. Credentials' },
    { id: 'select-jira-project', label: '2. Jira project' },
    { id: 'select-xpntl-project', label: '3. Target project' },
    { id: 'importing', label: '4. Import' },
  ];

  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        marginBottom: 28,
        borderBottom: '1px solid var(--xp-hairline)',
        paddingBottom: 12,
      }}
    >
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = s.id === current;
        return (
          <div
            key={s.id}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10,
              fontFamily: 'var(--xp-font-mono)',
              fontWeight: active ? 700 : 400,
              color: active
                ? 'var(--xp-accent-strong)'
                : done
                ? 'var(--xp-ink)'
                : 'var(--xp-faint)',
              paddingBottom: 8,
              borderBottom: active ? '2px solid var(--xp-accent-strong)' : '2px solid transparent',
              marginBottom: -13,
            }}
          >
            {done ? '✓ ' : ''}{s.label}
          </div>
        );
      })}
    </div>
  );
}

function ImportProgress({ job }: { job: ImportJob }) {
  const done = job.status === 'completed' || job.status === 'failed';
  const progress =
    job.totalRows > 0 ? Math.round((job.importedRows / job.totalRows) * 100) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <StatusBadge status={job.status} />
        <span style={{ fontSize: 11, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-muted)' }}>
          {job.filename}
        </span>
      </div>

      {!done && (
        <div
          style={{
            background: 'var(--xp-hairline)',
            borderRadius: 4,
            height: 6,
            marginBottom: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--xp-accent-strong)',
              borderRadius: 4,
              width: progress !== null ? `${progress}%` : '30%',
              transition: 'width 0.4s ease',
              animation: progress === null ? 'pulse 1.5s infinite' : undefined,
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatBox label="Total" value={job.totalRows === 0 && !done ? '...' : String(job.totalRows)} />
        <StatBox label="Imported" value={String(job.importedRows)} color="var(--xp-success, #38a169)" />
        <StatBox label="Failed" value={String(job.failedRows)} color={job.failedRows > 0 ? 'var(--xp-danger, #e53e3e)' : undefined} />
      </div>

      {job.errors.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--xp-font-mono)', marginBottom: 6 }}>
            Errors ({job.errors.length})
          </div>
          <div
            style={{
              background: 'var(--xp-surface)',
              border: '1px solid var(--xp-border)',
              borderRadius: 'var(--xp-r-sm)',
              padding: 8,
              maxHeight: 200,
              overflow: 'auto',
              fontSize: 10,
              fontFamily: 'var(--xp-font-mono)',
              color: 'var(--xp-danger, #e53e3e)',
            }}
          >
            {job.errors.slice(0, 50).map((e, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                Row {e.row}: {e.message}
              </div>
            ))}
            {job.errors.length > 50 && (
              <div style={{ color: 'var(--xp-muted)' }}>… and {job.errors.length - 50} more</div>
            )}
          </div>
        </div>
      )}

      {done && job.status === 'completed' && job.failedRows === 0 && (
        <div
          style={{
            background: 'var(--xp-success-tint, #f0fff4)',
            border: '1px solid var(--xp-success, #38a169)',
            borderRadius: 'var(--xp-r-sm)',
            padding: 10,
            fontSize: 11,
            fontFamily: 'var(--xp-font-mono)',
            color: 'var(--xp-success, #38a169)',
            marginTop: 12,
          }}
        >
          Import complete. {job.importedRows} issue{job.importedRows !== 1 ? 's' : ''} imported successfully.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'completed'
      ? 'var(--xp-success, #38a169)'
      : status === 'failed'
      ? 'var(--xp-danger, #e53e3e)'
      : status === 'processing'
      ? 'var(--xp-accent-strong)'
      : 'var(--xp-muted)';

  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: 'var(--xp-font-mono)',
        fontWeight: 700,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {status}
    </span>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'var(--xp-surface)',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        padding: '8px 12px',
      }}
    >
      <div style={{ fontSize: 9, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-faint)', marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--xp-font-mono)', color: color ?? 'var(--xp-ink)' }}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--xp-font-mono)' }}>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 12,
  color: 'var(--xp-ink)',
  outline: 'none',
  boxSizing: 'border-box',
};

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'var(--xp-accent)',
        border: '1px solid transparent',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-accent-fg)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 11,
        fontWeight: 600,
        padding: '6px 16px',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid var(--xp-border)',
        borderRadius: 'var(--xp-r-sm)',
        color: 'var(--xp-muted)',
        cursor: 'pointer',
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 11,
        padding: '6px 16px',
      }}
    >
      {children}
    </button>
  );
}
