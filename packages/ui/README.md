# @xpntl/ui

The xpntl design system. Tokens, primitives, and three consumer screens — the
shape of every surface in xpntl. SSO is free, forever; design follows suit.

Stack: React 19, TypeScript, plain CSS variables. No CSS-in-JS, no Tailwind
runtime (yet — Tailwind v4 mapping is the planned follow-up). Components use
inline styles backed by tokens; primitives ship as TSX you can copy, edit, or
import wholesale.

```bash
pnpm add @xpntl/ui
```

```tsx
import '@xpntl/ui/tokens';
import { Button, IssueKey, StateDot } from '@xpntl/ui';
```

---

## Canon

1. **One face.** JetBrains Mono throughout. Weights 400 / 500 / 600 / 700. No
   serif, no humanist sans, no fallback display face. Tracking and weight do
   the work that a family-change would do elsewhere.
2. **One chromatic event.** Cadmium yellow `oklch(82% 0.18 95)` is the only
   color that means something. Workflow states, priorities, and the success/
   warn/danger triple are the only other places color appears.
3. **Hairlines do the work.** 1px borders, 0–4px radii, three subtle shadows.
   Depth comes from borders, not stacked shadows.
4. **Keyboard is the product.** Every meaningful action has a kbd shortcut.
   The `<Kbd>` component is a signature element, not an afterthought.
5. **Focus rings are designed.** Not a browser default. Four variants
   (`halo` / `offset` / `inset` / `dashed`) drive off `--xp-focus-ring`.
6. **No emoji.** No icon library beyond what's in this package. No
   purple-gradient flourishes. No glassmorphism.

---

## Token contract

Token CSS lives at `src/tokens.css`. Three root attributes drive the entire
system; flip them at the document root, never per-component.

| Attribute          | Values                              | Default     |
|--------------------|-------------------------------------|-------------|
| `data-theme`       | `light` / `dark`                    | `light`     |
| `data-density`     | `compact` / `comfortable`           | `compact`   |
| `data-focus-ring`  | `halo` / `offset` / `inset` / `dashed` | `offset` |

```html
<html data-theme="dark" data-density="compact" data-focus-ring="offset">
  …
</html>
```

### Surface stack (canvas → surface → layer, sibling not nested)

| Var              | Light                   | Dark                  |
|------------------|-------------------------|-----------------------|
| `--xp-canvas`    | `oklch(96.5% 0.006 80)` | `oklch(14% 0.006 60)` |
| `--xp-surface`   | `oklch(100% 0 0)`       | `oklch(17% 0.006 55)` |
| `--xp-layer`     | `oklch(93.5% 0.006 70)` | `oklch(21% 0.008 55)` |

`canvas` is the page. `surface` is a card on top of the page. `layer` is a hover
or selection on top of a surface. They are *siblings*, not nested; surface
does not stack on layer.

### The accent contract (Strategy B)

Cadmium yellow fails WCAG on cream when used as foreground (~1.65:1). The
system honors this with a **two-step accent**:

| Var                   | Yellow (default)        | Other accents      | Used for                                              |
|-----------------------|-------------------------|--------------------|-------------------------------------------------------|
| `--xp-accent`         | `oklch(82% 0.18 95)`    | the preset's color | Fills: swatches, state-fills, brand chip, accent-tint |
| `--xp-accent-strong`  | `oklch(60% 0.18 90)`    | `var(--xp-accent)` | Foreground: text, borders, strokes, focus halo        |
| `--xp-accent-fg`      | `oklch(60% 0.18 90)`    | white              | Things drawn *on* `--xp-accent` (checkbox check)      |
| `--xp-accent-tint`    | `oklch(96% 0.04 95)`    | the preset's tint  | Pill active background, soft chips                    |

The primary button uses **its own** three vars so a too-light accent can fall
back to outline without dark text on a bright fill:

| Var                    | Yellow                          | Other accents          |
|------------------------|---------------------------------|------------------------|
| `--xp-primary-bg`      | `transparent`                   | `var(--xp-accent)`     |
| `--xp-primary-fg`      | `var(--xp-accent-strong)` (mustard) | `var(--xp-accent-fg)` (white) |
| `--xp-primary-border`  | `var(--xp-accent-strong)`       | `var(--xp-accent)`     |

**To add a new accent preset:** set `--xp-accent`, `--xp-accent-tint`, and (if
the accent is too light to carry white text) override the four other vars
above. See `xpntl/specimen.jsx` ACCENT_PRESETS in the prototype repo.

### Workflow states

`--xp-st-triage` · `-backlog` · `-unstarted` · `-started` (= accent) · `-completed` (moss-green) · `-canceled`.

The `started` state always reflects the active accent. `<StateDot kind="started">`
draws a two-tone wedge (mustard stroke + bright fill) so the yellow case reads.

### Priority

`--xp-pri-urgent` (red) · `-high` (amber) · `-normal` · `-low` · `-none`. The
amber for `high` is intentionally distinct from the accent hue so the two
never compete for attention.

### Avatar fallback (PER-107)

12-step ramp (`--xp-av-1`..`--xp-av-12`). `hashName(normalize(name)) % 12`
selects. Same name → same color across every workspace, every device, every
fallback. See `src/utils/avatar.ts` for the algorithm.

---

## Primitives

| Component       | Notes                                                              |
|-----------------|--------------------------------------------------------------------|
| `Button`        | primary / secondary / ghost / danger. Outline-on-yellow built in.  |
| `Input`         | leading + trailing slots (e.g. ⌕, ⌘K).                             |
| `Select`        | Wraps native `<select>` — accessible by default.                   |
| `Combobox`      | Filterable popover under an input. Bring Radix for ARIA.           |
| `Popover`       | Visual chrome only. Anchor with Floating UI / Radix.               |
| `Dialog`        | Backdrop + escape-to-close.                                        |
| `SlideOver`     | Right-anchored peek panel (PER-106).                               |
| `Toast`         | Single notification. Wire to a queue manager.                      |
| `Tooltip`       | Hover + focus. Above-trigger by default.                           |
| `Avatar`        | Deterministic color (PER-107).                                     |
| `AvatarStack`   | Overlap + overflow chip.                                           |
| `Badge`         | Caps text + leading dot.                                           |
| `Pill`          | Filter chip, removable.                                            |
| `Checkbox`      | Off / on / mixed / disabled. Two-tone for yellow.                  |
| `Radio`         | Single choice.                                                     |
| `Switch`        | On / off. White thumb on accent track.                             |
| `Tabs`          | Caps + underline bar.                                              |
| `Tree`          | Recursive, expand/collapse, indents 14px per level.                |
| `Skeleton`      | Sweep loading.                                                     |
| `Spinner`       | Dashed-ring rotation.                                              |
| `ContextMenu`   | Static menu — render inline or anchor yourself.                    |
| `IssueKey`      | Hairline-box framed chip — `PER-103`, `AUT-44`. Canonical.         |
| `StateDot`      | Workflow geometry.                                                 |
| `Priority`      | Descending-bar glyph.                                              |
| `Kbd`           | Keyboard cap.                                                      |

---

## Screens

`SidebarShell` (PER-103) · `Peek` (PER-106) · `AvatarFallback` (PER-107).
Wired implementations of the three consumer tickets, using only this
package's primitives. Open them in Storybook to see the system in motion.

---

## Storybook

```bash
pnpm --filter @xpntl/ui storybook
```

Toolbar carries Theme / Density / Focus-ring switchers; flip them and every
story re-renders against the new root attributes. Stories live in
`src/stories/`; one per primitive screen.

---

## Migration roadmap

- **v0.2** — Tailwind v4 `@theme` mapping. Inline styles → utility classes
  keyed off the same OKLch tokens. Same visual output, smaller TSX.
- **v0.2** — Radix Dialog / Popover / Tooltip / SlideOver swap for ARIA
  parity. Visual layer unchanged.
- **v0.3** — `Combobox` to `cmdk`. ContextMenu to Radix.
- **v0.3** — CVA on Button, Badge, Pill for explicit variant lists.

---

## License

BSL-1.1. Source-available today, Apache 2.0 after four years.
