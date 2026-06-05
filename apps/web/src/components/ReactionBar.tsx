import { useState } from 'react';
import type { ReactionSummary } from '../lib/api';

const QUICK_EMOJIS = ['👍', '👎', '❤️', '🎉', '🚀', '👀', '🙏', '😄'] as const;

type Props = {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => Promise<void> | void;
};

export function ReactionBar({ reactions, onToggle }: Props) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const handle = async (emoji: string) => {
    if (busy) return;
    setBusy(emoji);
    try {
      await onToggle(emoji);
      setPicking(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => handle(r.emoji)}
          disabled={busy === r.emoji}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-mono disabled:opacity-50 ${
            r.mine
              ? 'border-xp-accent bg-xp-accent-tint text-xp-accent-strong'
              : 'border-xp-border bg-xp-canvas text-xp-muted hover:border-xp-input'
          }`}
          title={`${r.count} reaction${r.count === 1 ? '' : 's'}`}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="rounded-full border border-xp-border bg-xp-canvas px-2 py-0.5 text-xs font-mono text-xp-muted hover:text-xp-ink"
        >
          + react
        </button>
        {picking && (
          <div className="absolute left-0 z-10 mt-1 flex gap-1 rounded-xp-sm border border-xp-border bg-xp-surface p-1 shadow-xp-2">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handle(emoji)}
                disabled={busy === emoji}
                className="rounded-xp-sm px-1.5 py-0.5 text-base hover:bg-xp-layer disabled:opacity-50"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
