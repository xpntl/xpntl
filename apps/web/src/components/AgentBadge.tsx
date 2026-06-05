// apps/web/src/components/AgentBadge.tsx
//
// XP-11 — Agent presence/status indicators.
//
// AgentBadge: small bot-icon overlay used on top of an avatar to mark a user
// as an AI agent. Shows harness name as a tooltip.
//
// AgentAvatar: drop-in replacement for <Avatar> that adds the badge when the
// user is an agent. Accepts all Avatar props plus optional isAgent/harness.

import { Avatar } from '@xpntl/ui';
import type { CSSProperties } from 'react';

export const HARNESS_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  custom: 'Custom',
};

type HarnessStyle = { background: string; color: string };

const DEFAULT_HARNESS_STYLE: HarnessStyle = {
  background: 'var(--xp-accent-strong, oklch(65% 0.2 255))',
  color: 'var(--xp-canvas, #fff)',
};

const HARNESS_STYLES: Record<string, HarnessStyle> = {
  claude_code: { background: '#d97757', color: '#fff7ed' },
  codex: { background: '#111827', color: '#f9fafb' },
  cursor: { background: '#111111', color: '#ffffff' },
  opencode: { background: '#2563eb', color: '#eff6ff' },
  custom: DEFAULT_HARNESS_STYLE,
};

// ─── Harness icon SVGs ────────────────────────────────────────────────────────

function HarnessIcon({ harness, size }: { harness?: string | null; size: number }) {
  if (harness === 'claude_code') return <ClaudeCodeIcon size={size} />;
  if (harness === 'codex') return <CodexIcon size={size} />;
  if (harness === 'cursor') return <CursorIcon size={size} />;
  if (harness === 'opencode') return <OpenCodeIcon size={size} />;
  return <BotIcon size={size} />;
}

function ClaudeCodeIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      <path
        d="M8 2.2v3.1M8 10.7v3.1M2.2 8h3.1M10.7 8h3.1M3.9 3.9l2.2 2.2M9.9 9.9l2.2 2.2M12.1 3.9 9.9 6.1M6.1 9.9l-2.2 2.2"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodexIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M8 2.2 13 5v6L8 13.8 3 11V5l5-2.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5.8 6.2 8 4.9l2.2 1.3v3.6L8 11.1 5.8 9.8V6.2Z" fill="currentColor" />
    </svg>
  );
}

function CursorIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d="M3 2.2 12.8 8 8.9 9.1l2.2 4.1-2.1 1.1-2.2-4.2-2.8 2.8L3 2.2Z" fill="currentColor" />
    </svg>
  );
}

function OpenCodeIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="m6.4 4.2-3.1 3.8 3.1 3.8M9.6 4.2l3.1 3.8-3.1 3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 3.5 7.3 12.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

function BotIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* head */}
      <rect x="2" y="4" width="12" height="9" rx="2" fill="currentColor" />
      {/* antenna */}
      <line
        x1="8"
        y1="1"
        x2="8"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="1" r="1" fill="currentColor" />
      {/* eyes */}
      <circle cx="5.5" cy="8" r="1.25" fill="var(--xp-canvas, #fff)" />
      <circle cx="10.5" cy="8" r="1.25" fill="var(--xp-canvas, #fff)" />
      {/* mouth */}
      <rect
        x="5"
        y="10.5"
        width="6"
        height="1"
        rx="0.5"
        fill="var(--xp-canvas, #fff)"
        opacity="0.7"
      />
    </svg>
  );
}

// ─── HarnessPersona ───────────────────────────────────────────────────────────

interface HarnessPersonaProps {
  /** Avatar diameter */
  size: number;
  harness?: string | null;
  name?: string;
}

/**
 * An agent's identity rendered as a full avatar tile: the harness logo on its
 * brand color, matching the shape of a human `<Avatar>`. This is the agent's
 * persona — not a status badge. Badges are reserved for presence/status.
 */
export function HarnessPersona({ size, harness, name }: HarnessPersonaProps) {
  const harnessStyle = harness
    ? (HARNESS_STYLES[harness] ?? DEFAULT_HARNESS_STYLE)
    : DEFAULT_HARNESS_STYLE;
  const label = harness ? (HARNESS_LABELS[harness] ?? harness) : 'Agent';

  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 'var(--xp-r-sm, 4px)',
    background: harnessStyle.background,
    color: harnessStyle.color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  };

  return (
    <span style={style} title={name ? `${name} · ${label}` : label} aria-label={`Agent: ${label}`}>
      <HarnessIcon harness={harness} size={Math.round(size * 0.6)} />
    </span>
  );
}

// ─── HarnessPill ──────────────────────────────────────────────────────────────

interface HarnessPillProps {
  harness: string;
}

/**
 * Inline text chip showing the harness name next to an agent's display name.
 */
export function HarnessPill({ harness }: HarnessPillProps) {
  const label = HARNESS_LABELS[harness] ?? harness;
  const harnessStyle = HARNESS_STYLES[harness] ?? DEFAULT_HARNESS_STYLE;
  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9.5,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--xp-accent-strong, oklch(65% 0.2 255))',
    background: 'color-mix(in oklch, var(--xp-accent-strong, oklch(65% 0.2 255)) 12%, transparent)',
    padding: '1px 5px',
    borderRadius: 'var(--xp-r-xs, 3px)',
    fontFamily: 'var(--xp-font-mono)',
    fontWeight: 600,
    verticalAlign: 'middle',
    flexShrink: 0,
  };
  const iconStyle: CSSProperties = {
    width: 13,
    height: 13,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: harnessStyle.background,
    color: harnessStyle.color,
    flexShrink: 0,
  };
  return (
    <span title={`Agent harness: ${label}`} style={pillStyle}>
      <span style={iconStyle}>
        <HarnessIcon harness={harness} size={9} />
      </span>
      {label}
    </span>
  );
}

// ─── AgentAvatar ──────────────────────────────────────────────────────────────

interface AgentAvatarProps {
  name: string;
  size?: number;
  src?: string;
  isAgent?: boolean;
  harness?: string | null;
}

/**
 * Drop-in replacement for `<Avatar>`. For an agent, the avatar *is* its harness
 * persona — the harness logo fills the tile (no corner badge; badges are for
 * status, not identity). A custom uploaded image, when set, takes over. Humans
 * render as a normal `<Avatar>`.
 */
export function AgentAvatar({ name, size = 24, src, isAgent, harness }: AgentAvatarProps) {
  // Humans, and agents with a custom uploaded image, render as a normal avatar.
  if (!isAgent || src) {
    return <Avatar name={name} size={size} src={src} />;
  }
  return <HarnessPersona size={size} harness={harness} name={name} />;
}
