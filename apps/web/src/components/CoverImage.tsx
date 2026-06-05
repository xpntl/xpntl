import { useRef, useState } from 'react';
import { api } from '../lib/api';

interface CoverImageProps {
  issueKey: string;
  coverUrl: string | null;
  coverPosition: number;
  token?: string | null;
  onUpdate: (coverUrl: string | null, coverPosition: number) => void;
  compact?: boolean;
}

export function CoverImage({
  issueKey,
  coverUrl,
  coverPosition,
  token,
  onUpdate,
  compact = false,
}: CoverImageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const result = await api.uploadCoverImage(issueKey, file, token);
      onUpdate(result.coverUrl, 50);
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    try {
      await api.removeCoverImage(issueKey, token);
      onUpdate(null, 50);
    } catch {
      // silent
    }
  }

  async function handlePositionChange(position: number) {
    onUpdate(coverUrl, position);
    try {
      await api.updateIssue(issueKey, { coverPosition: position }, token);
    } catch {
      // silent
    }
  }

  const height = compact ? 120 : 180;

  if (!coverUrl) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        style={{
          position: 'relative',
          height: 40,
          borderRadius: 'var(--xp-r-md)',
          border: dragging ? '2px dashed var(--xp-accent-strong)' : '1px dashed var(--xp-border)',
          background: dragging ? 'var(--xp-accent-tint)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <span
          style={{
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 11,
            color: 'var(--xp-muted)',
          }}
        >
          {uploading ? 'Uploading…' : '+ Add cover image'}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'relative', borderRadius: 'var(--xp-r-md)', overflow: 'hidden' }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <img
        src={coverUrl}
        alt=""
        style={{
          width: '100%',
          height,
          objectFit: 'cover',
          objectPosition: `center ${coverPosition}%`,
          display: 'block',
          borderRadius: 'var(--xp-r-md)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          display: 'flex',
          gap: 4,
        }}
      >
        {!compact && (
          <input
            type="range"
            min={0}
            max={100}
            value={coverPosition}
            onChange={(e) => handlePositionChange(Number(e.target.value))}
            title="Adjust focal point"
            style={{ width: 80, accentColor: 'var(--xp-accent-strong)' }}
          />
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Replace cover"
          style={coverActionBtnStyle}
        >
          ↻
        </button>
        <button
          type="button"
          onClick={handleRemove}
          title="Remove cover"
          style={coverActionBtnStyle}
        >
          ✕
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {uploading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'var(--xp-font-mono)',
            fontSize: 12,
            borderRadius: 'var(--xp-r-md)',
          }}
        >
          Uploading…
        </div>
      )}
    </div>
  );
}

const coverActionBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: 'var(--xp-r-sm)',
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  cursor: 'pointer',
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 12,
  backdropFilter: 'blur(4px)',
};
