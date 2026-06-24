# @vein/web

Thin web layer — Hono REST API + React SPA. All business logic delegated to `@vein/core`.

## Build And Test

`bun run dev:web`, verify search + docs + history pages.

## Architecture Boundaries

Routes are thin wrappers: call `@vein/core`, return JSON. Client uses TanStack Router + Query with typed fetch client in `lib/api.ts`.

## Design System

All visual design governed by `DESIGN.md` (repo root). Read it before writing any UI code. The rules below encode that spec in code.

## Safety Rails

### NEVER

- Inline business logic in routes or components — delegate to `@vein/core`
- Use hardcoded hex colors (`bg-[#xxx]`, `text-[#xxx]`) — CI enforces: `grep -rn '\[#' packages/web/src/client`
- Use `focus:` pseudo-class — use `focus-visible:` for keyboard-only focus ring
- Use ring/box-shadow/outline on form controls — border color change only, matching hover
- Use native `<select>` — always use `<SelectField>` component
- Mix `--tint` (cool blue-gray) with warm parchment backgrounds — use warm sand tones

### ALWAYS

- TanStack Router `<Link>` not `<a>` for internal navigation
- `whitespace-nowrap` for labels with dynamic content (not fixed `w-*`)
- `group` + `group-hover` pattern for row action buttons
- `e.stopPropagation()` + `e.preventDefault()` on buttons inside `<Link>`
- `useRouter().history.back()` for programmatic back navigation
- `IntersectionObserver` with `rootMargin: '200px'` for infinite scroll

## Coding Conventions

### Keyboard Accessibility — Two Distinct Patterns

- **Interactive chrome** (sidebar icons, tree buttons, menu items): `focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2` — keyboard-only ring.
- **Form controls** (inputs, SelectField trigger, search bar): focus matches hover — border color change only, **no ring, no box-shadow, no outline**. `border-cream` → `border-ink-light`.

### Component Rules

- **SelectField**: custom dropdown with keyboard nav (↑↓/Enter/Escape), click-outside close. Never native `<select>`.
- **Tool Call Blocks**: running and done share same `bg-ivory`. Only border changes: `border-cream` → `border-ink/30`.

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep intact (especially no native `<select>`, no ring on form controls)
2. Keyboard accessibility split (interactive chrome vs form controls)
3. CI hex color enforcement
4. Component rules (SelectField, Tool Call Blocks)
