// packages/ui/src/utils/avatar.ts
//
// Deterministic avatar color + initials. Hash(name) → 1..12, mapped to the
// --xp-av-1..12 ramp defined in tokens.css. Same name always lands on the
// same color across the workspace, the device, and the planet.

const RAMP_SIZE = 12;

/** DJB2 hash — 5-bit shift, signed-int safe. */
export function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Normalize before hashing so "Lena  Park" and "lena park" land the same. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns the CSS-variable reference for the deterministic color. */
export function avatarColorFor(name: string): string {
  const idx = (hashName(normalize(name)) % RAMP_SIZE) + 1; // 1..12
  return `var(--xp-av-${idx})`;
}

/** First letter of first word + first letter of last word, uppercase. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
