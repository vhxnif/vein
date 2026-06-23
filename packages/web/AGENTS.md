# @vein/web

Thin web layer — REST API (Hono) + React SPA. All business logic delegated to `@vein/core`.

## Architecture Boundaries

Routes are thin wrappers — call `@vein/core`, return JSON. Client uses TanStack Router + Query with typed fetch client in `lib/api.ts`.

## Safety Rails

### NEVER

- Inline business logic in routes or components — delegate to `@vein/core`
- Use hardcoded hex colors (`bg-[#xxx]`, `text-[#xxx]`) — use Kami design tokens only (enforced by CI: `grep -rn '\[#' packages/web/src/client`)
- Use `focus:` pseudo-class — use `focus-visible:` for keyboard-only focus ring
- Use ring/box-shadow/outline on form controls (inputs, selects) — border color change only, matching hover
- Use native `<select>` elements — always use `<SelectField>` component
- Mix `--tint` (cool blue-gray) with warm parchment backgrounds — use warm sand tones

### ALWAYS

- Use TanStack Router `<Link>` not `<a>` for internal navigation
- Use `whitespace-nowrap` for labels with dynamic content (not fixed `w-*`)
- Use `group` + `group-hover` pattern for row action buttons
- Call `e.stopPropagation()` + `e.preventDefault()` on buttons inside `<Link>`
- Use `useRouter().history.back()` for programmatic back navigation
- Use `IntersectionObserver` with `rootMargin: '200px'` for infinite scroll

## Design Constraints

### Kami Token System

All colors via CSS custom properties in `styles.css`, bridged to Tailwind via `@theme`. CI grep enforces no hex colors. See components for token names.

### Keyboard Accessibility — Two Distinct Patterns

- **Interactive chrome** (sidebar icons, tree buttons, menu items): `focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2` — keyboard-only ring, not mouse.
- **Form controls** (inputs, SelectField trigger, search bar): focus matches hover — border color change only, **no ring, no box-shadow, no outline**. `border-cream` → `border-ink-light`.

### Key Component Rules

- **SelectField**: Always use `<SelectField>`, never native `<select>`. Custom dropdown with keyboard nav (↑↓/Enter/Escape), click-outside close.
- **Tool Call Blocks**: Running and done share same `bg-ivory`. Only border changes: `border-cream` → `border-ink/30`.

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep intact (especially no native `<select>`, no ring on form controls)
2. Keyboard accessibility split (interactive chrome vs form controls)
3. Kami token + CI hex color enforcement
4. Component rules (SelectField, Tool Call Blocks)
