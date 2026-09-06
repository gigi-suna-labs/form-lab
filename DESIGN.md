# FORM Lab Design System

## 1. Atmosphere & Identity

FORM Lab is a quiet, instrument-like bench interface: warm paper, restrained borders, editorial headings, and dense numerical readouts. Its signature is the contrast between the serif laboratory voice and monospace live measurements. This document records the existing interface; new work preserves it.

## 2. Color

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Page | `--paper` | `#FAF8F3` | `#0B0A09` | Page and form controls |
| Muted surface | `--cream` | `#F1ECE3` | `#161412` | Active rows and chips |
| Panel | `--panel` | `#FFFFFF` | `#161412` | Main panels |
| Primary text | `--ink` | `#0B0A09` | `#F1ECE3` | Headings, primary controls |
| Secondary text | `--ink-2` | `#2A2724` | `#D8D2C6` | Labels and links |
| Muted text | `--stone` | `#746D63` | `#A89E90` | Hints and metadata |
| Border | `--line` | `rgba(11,10,9,.14)` | `rgba(241,236,227,.16)` | Panel and control outlines |
| Focus | `--blush` | `#C4A094` | `#C4A094` | Focus rings |
| Data primary | `--series` | `#C2573A` | `#D96A4E` | Resistance chart |
| Axis X | `--ax` | `#C2573A` | `#D96A4E` | Motion chart |
| Axis Y | `--ay` | `#2F6F9F` | `#4A8FC4` | Motion chart |
| Axis Z | `--az` | `#4E8A3A` | `#5FA24C` | Motion chart |
| Connected | `--good` | `#2F7D4F` | `#6FBF8F` | Connection status |
| Warning | `--warn` | `#B8860B` | `#E0B44C` | Recoverable warning |
| Recording | `--recording` | `#C0392B` | `#C0392B` | Recording activity |

Color is functional. Accent colors identify chart series or device state; they are not decorative.

## 3. Typography

| Level | Size | Weight | Line height | Usage |
|---|---:|---:|---:|---|
| Wordmark | 17px | 700 | 1.5 | Brand |
| Heading | 24px | 400 | 1.5 | Panel title |
| Metric | 22px | 400 | 1.2 | Live values |
| Body | 15px | 400 | 1.5 | Default copy and controls |
| Hint | 13px | 400 | 1.5 | Status guidance |
| Metadata | 12px | 400 | 1.5 | Tile captions and tables |
| Overline | 11px | 600 | 1.5 | Uppercase section labels |

- Sans: `Instrument Sans`, then system sans-serif.
- Serif: `Instrument Serif`, then Georgia.
- Mono: `JetBrains Mono`, then Menlo/monospace.

## 4. Spacing & Layout

- Base unit: 2px, with the existing interface primarily using 4px, 6px, 8px, 10px, 12px, 14px, 18px, 20px, 22px, 28px, 32px, and 60px increments.
- Desktop shell: sticky 320px recordings rail plus a flexible live workspace, 28px gap, 32px page gutter, maximum width 1500px.
- At 960px and below, the shell becomes one column and the rail becomes non-sticky.
- Primary data content must not overflow at 375px; tiles and header controls may wrap into readable rows.

## 5. Components

### Panel
- Structure: semantic `section.panel` with overline, serif heading, then content.
- Spacing: 18px vertical and 20px horizontal padding.
- States: default and hidden.
- Accessibility: semantic heading hierarchy and DOM content, never image-backed UI.
- Motion: none.

### Button
- Variants: primary, ghost, pill-shaped tab.
- States: default, hover, active/pressed, focus-visible, disabled, and async busy through label plus `aria-busy`.
- Accessibility: native button semantics, keyboard activation, 2px blush focus outline.
- Motion: 100ms press transform adapted from beui.dev `button`; disabled under reduced motion.

### Status pill
- Structure: status dot, text, optional adjacent action.
- States: disconnected, choosing, connected, recording, error guidance.
- Accessibility: the connection text uses polite live-region announcements; color is never the only status indicator.
- Motion: recording dot opacity pulse only; static under reduced motion.

### Form field
- Structure: uppercase label wrapping an input or select.
- States: default, focus-visible, disabled/read-only.
- Accessibility: native label association through wrapping and visible focus.
- Motion: none.

### Metric tile
- Structure: monospace value and muted caption.
- States: empty and populated.
- Accessibility: readable text remains in the DOM.
- Motion: none; high-frequency values update without animation.

### Session row
- Structure: full-width button, session name, chips, metadata.
- States: default, hover, focus-visible, active.
- Accessibility: native button and visible focus.
- Motion: none.

## 6. Motion & Interaction

- Micro interaction: 100ms `ease-out`; button active state scales to 0.98 using only `transform`.
- Stateful Bluetooth button changes its label for idle, choosing, connected, and unsupported states and announces progress with `aria-busy`/live status text.
- Recording uses a one-second opacity pulse.
- `prefers-reduced-motion: reduce` disables press transforms, smooth scrolling, and pulsing.
- Live chart updates do not animate; responsiveness takes priority for 20 Hz sensor data.

## 7. Depth & Surface

Borders-only. Panels and controls use `--line`; there are no shadows. Tonal differences between `--paper`, `--cream`, and `--panel` provide secondary separation.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA.
- Every interactive element is keyboard reachable and has a visible focus state.
- Connection changes are announced without relying only on color.
- Bluetooth errors remain visible as actionable text.
- The page uses English UI copy and must not introduce clipped or orphaned CJK strings.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Remote Google Fonts dependency | `public/index.html` | Existing interface behavior, preserved by user request | Self-host if offline operation becomes a requirement |
| Existing inline CSS and JavaScript | `public/index.html` | Copy-nearby change explicitly chosen over a component refactor | Extract only when a broader redesign is approved |
