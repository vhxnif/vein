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
- Use `focus:` pseudo-class on interactive chrome (sidebar icons, buttons, links) — use `focus-visible:` for keyboard-only focus ring only. Exception: form controls (inputs, search bars, SelectField trigger) may use `focus:` for border transitions, since focus should be visible on both mouse click and keyboard tab.
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

### Tailwind v4 Limitations & Workarounds

- **Arbitrary property syntax (`[property:value]`) does not support `var()` CSS variables.** `focus:[box-shadow:0_0_0_1pt_var(--color-ink)]` silently produces no CSS. Workaround: define a custom CSS class with `:focus` pseudo-class directly in `styles.css` (see `.ring-ink-focus:focus`).
- **`hover:` variant only applies to Tailwind utility classes, not custom CSS classes.** `hover:ring-ink-border` produces nothing because `ring-ink-border` is not a Tailwind utility. Use native `:hover` pseudo-class in `styles.css` instead (`.class-name:hover`).
- **Custom CSS classes named `ring-*` conflict with Tailwind v4's built-in `ring-*` utilities.** Avoid bare names like `ring-ink`; use suffixed names (`ring-ink-border`, `ring-ink-focus`).

### Interaction Patterns — Two Distinct Models

- **Content rows & large surfaces** (doc list, history, sidebar icons): sand background hover — governed by DESIGN.md component specs with `hoverBackground` tokens.
- **Selection controls & dropdowns** (SelectField, project picker, dropdown menus): border-based interaction (cream → ink). Hover/select/active changes the border color only, background stays `ivory`.

### Unit Discipline

- DESIGN.md specifies sizes in `pt` units. Use Tailwind arbitrary values with `pt` suffix: `px-[12pt]`, `rounded-[8pt]`, `py-[16pt]`. Do NOT use Tailwind's default spacing scale (`px-3`, `py-4`) for spec-mandated dimensions — those output `px`/`rem`, not `pt`.

### Dropdown & Overflow

- Any `.rounded-*` container with child items that have full-width hover backgrounds MUST include `overflow-hidden` to clip backgrounds to the container's border-radius. SelectField's `.select-dropdown` establishes this pattern.

### Responsive Breakpoints

- Always use `md:` (768px) for mobile/desktop layout switches, matching the sidebar/tab bar breakpoint defined in `DESIGN.md`. Never use `sm:` (640px) for layout-level responsive changes.

### Hover Implementation

- Prefer native CSS pseudo-classes in `styles.css` (`.class:hover`, `.class:active`) over Tailwind's `hover:` variant for custom interactive components. This avoids Tailwind variant scope issues and works consistently on both desktop and touch devices.

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
