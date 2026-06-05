import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './recurrence.service.js';

// after = Thursday 2026-01-15 12:00 local. Assertions use date components
// (not absolute timestamps) so they're timezone-independent. Recurrences
// normalize the time-of-day to 09:00 local.
const after = new Date(2026, 0, 15, 12, 0, 0);

describe('nextOccurrence', () => {
  it('daily → next day at 09:00', () => {
    const next = nextOccurrence('daily', after)!;
    expect(next).not.toBeNull();
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(9);
  });

  it('weekly (no day) → same weekday 7 days later', () => {
    const next = nextOccurrence('weekly', after)!;
    expect(next.getDate()).toBe(22);
    expect(next.getDay()).toBe(after.getDay());
    expect(next.getHours()).toBe(9);
  });

  it('weekly on a named day → next matching weekday within a week', () => {
    const next = nextOccurrence('weekly on monday', after)!;
    expect(next).not.toBeNull();
    expect(next.getDay()).toBe(1); // Monday
    // strictly after `after`, within 7 days
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });

  it('monthly (no day) → next month, same day, 09:00', () => {
    const next = nextOccurrence('monthly', after)!;
    expect(next.getMonth()).toBe(1); // February
    expect(next.getDate()).toBe(15);
    expect(next.getHours()).toBe(9);
  });

  it('monthly on N → next month on day N (clamped to 28)', () => {
    expect(nextOccurrence('monthly on 20', after)!.getDate()).toBe(20);
    expect(nextOccurrence('monthly on 31', after)!.getDate()).toBe(28); // clamp
  });

  it('every N days/weeks/months', () => {
    expect(nextOccurrence('every 3 days', after)!.getDate()).toBe(18);
    expect(nextOccurrence('every 2 weeks', after)!.getDate()).toBe(29);
    expect(nextOccurrence('every 2 months', after)!.getMonth()).toBe(2); // March
  });

  it('is case- and whitespace-insensitive', () => {
    expect(nextOccurrence('  DAILY  ', after)!.getDate()).toBe(16);
  });

  it('returns null for unrecognized rules', () => {
    expect(nextOccurrence('yearly', after)).toBeNull();
    expect(nextOccurrence('', after)).toBeNull();
    expect(nextOccurrence('every 0 frobs', after)).toBeNull();
  });
});
