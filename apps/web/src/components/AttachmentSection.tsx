import { useCallback, useEffect, useRef, useState } from 'react';
import { type Attachment, api } from '../lib/api';

interface AttachmentSectionProps {
  issueKey: string;
  token?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentSection({ issueKey, token }: AttachmentSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { attachments } = await api.listAttachments(issueKey, token);
        if (!cancelled) setAttachments(attachments);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [issueKey, token]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadProgress(0);
      setError(null);

      // Simulate progress since fetch doesn't support upload progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 12, 90));
      }, 150);

      try {
        const { attachment } = await api.uploadAttachment(issueKey, file, token);
        setAttachments((prev) => [...prev, attachment]);
        setUploadProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        clearInterval(progressInterval);
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
        }, 400);
      }
    },
    [issueKey, token],
  );

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteAttachment(id, token);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmDeleteId(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleUpload(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = '';
  }

  function iconForType(contentType: string): string {
    if (contentType.startsWith('image/')) return '🖼';
    if (contentType.startsWith('video/')) return '🎬';
    if (contentType.startsWith('audio/')) return '🔊';
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gzip'))
      return '📦';
    if (contentType.includes('spreadsheet') || contentType.includes('csv')) return '📊';
    return '📎';
  }

  return (
    <div>
      {/* Drop zone / upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          position: 'relative',
          minHeight: 44,
          borderRadius: 'var(--xp-r-md)',
          border: dragging ? '2px dashed var(--xp-accent-strong)' : '1px dashed var(--xp-border)',
          background: dragging ? 'var(--xp-accent-tint)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 120ms ease',
          marginBottom: attachments.length > 0 ? 12 : 0,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div style={{ width: '100%', padding: '10px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                className="xp-spin-icon"
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  border: '2px solid var(--xp-muted)',
                  borderTopColor: 'var(--xp-accent-strong)',
                  borderRadius: '50%',
                  animation: 'var(--animate-xp-spin)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--xp-font-mono)',
                  fontSize: 11,
                  color: 'var(--xp-muted)',
                }}
              >
                Uploading... {uploadProgress}%
              </span>
            </div>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: 'var(--xp-hairline)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${uploadProgress}%`,
                  background: 'var(--xp-accent-strong)',
                  borderRadius: 2,
                  transition: 'width 150ms ease',
                }}
              />
            </div>
          </div>
        ) : (
          <span
            style={{
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-muted)',
              padding: '10px 0',
            }}
          >
            {dragging ? 'Drop file to attach' : '+ Attach file (or drag & drop)'}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            color: '#ef4444',
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      {/* Attachment list */}
      {loading && attachments.length === 0 ? (
        <div
          style={{
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            color: 'var(--xp-muted)',
            padding: '6px 0',
          }}
        >
          Loading attachments...
        </div>
      ) : (
        attachments.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((att) => (
              <li key={att.id} style={attachmentRowStyle}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{iconForType(att.contentType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 12,
                      color: 'var(--xp-ink)',
                      textDecoration: 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={att.filename}
                  >
                    {att.filename}
                  </a>
                  <span
                    style={{
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 10,
                      color: 'var(--xp-muted)',
                    }}
                  >
                    {formatBytes(att.sizeBytes)}
                  </span>
                </div>
                {confirmDeleteId === att.id ? (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(att.id);
                      }}
                      style={deleteConfirmBtnStyle}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      style={deleteCancelBtnStyle}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(att.id);
                    }}
                    title="Delete attachment"
                    style={deleteIconBtnStyle}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

const attachmentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 'var(--xp-r-sm)',
  background: 'var(--xp-canvas)',
  border: '1px solid var(--xp-hairline)',
};

const deleteIconBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  flexShrink: 0,
  transition: 'color 120ms ease',
};

const deleteConfirmBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  border: 0,
  borderRadius: 'var(--xp-r-sm)',
  background: '#ef4444',
  color: 'white',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10,
  fontWeight: 600,
};

const deleteCancelBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  background: 'transparent',
  color: 'var(--xp-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 10,
};
