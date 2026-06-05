// packages/ui/src/primitives/Avatar.tsx
//
// Deterministic-colored avatar (PER-107) + stack with overflow chip.

import { useState } from 'react';
import { avatarColorFor, avatarInitials } from '../utils/avatar';

export interface AvatarProps {
  name: string;
  size?: number;
  src?: string;
}

export function Avatar({ name, size = 24, src }: AvatarProps) {
  // Fall back to the deterministic text avatar if the image fails to load
  // (missing blob, auth-gated proxy on a pre-session page, network error).
  // Tracked by src so a later URL change re-attempts the image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImg = !!src && failedSrc !== src;
  const bg = avatarColorFor(name);
  // Dynamic background color and computed font size must stay as inline style
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-xp-sm text-[oklch(98%_0.005_60)] font-mono font-semibold flex-none overflow-hidden tracking-[0px] ${showImg ? 'bg-transparent border border-xp-hairline' : 'border-0'}`}
      style={{
        width: size,
        height: size,
        background: showImg ? undefined : bg,
        fontSize: Math.max(9, Math.round(size * 0.42)),
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        avatarInitials(name)
      )}
    </span>
  );
}

export interface AvatarStackProps {
  names: string[];
  size?: number;
  max?: number;
}

export function AvatarStack({ names, size = 22, max = 4 }: AvatarStackProps) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((n, i) => (
        <span
          key={n + i}
          className="relative rounded-xp-sm shadow-[0_0_0_1.5px_var(--xp-canvas)]"
          style={{
            marginLeft: i === 0 ? 0 : -6,
            zIndex: shown.length - i,
          }}
        >
          <Avatar name={n} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-xp-sm bg-xp-layer text-xp-muted shadow-[0_0_0_1.5px_var(--xp-canvas)] font-mono font-semibold tracking-[0px]"
          style={{
            marginLeft: -6,
            width: size,
            height: size,
            fontSize: Math.max(9, Math.round(size * 0.42)),
          }}
        >+{overflow}</span>
      )}
    </span>
  );
}
