# @vein/web

## Build And Test

- Backend: `bun run build:backend` → `dist/server.js`. Must `--external better-sqlite3`.
- Frontend: `bun run dev:frontend` (Vite :5173) | `bun run build:frontend` → `dist/client/`
- Root `dev:web` builds backend + starts server only; frontend needs separate `vite`

## Architecture Boundaries

- Import only from `@vein/core` single entry (root contract)
- `server.ts`: Hono app using Node.js `http.createServer` (not Bun.serve) — cross-runtime compat
- `routes/`: Hono sub-routers mounted at `/api/projects`, `/api/projects/current/*`
- `client/`: React SPA (TanStack Router + Query), Vite-build into `dist/client/`
- Static root: server probes two paths (dev `../../dist/client`, prod `../client`) — see `staticRoot` in `server.ts`
- API client (`lib/api.ts`) auto-injects `X-Vein-Project` header AND `project` query param (from localStorage) on every request. New backend endpoints must read the project via `projectMiddleware`; new frontend API helpers must use `h()` / `u()` from `api.ts`.

## Design System

All visual design governed by `DESIGN.md` (repo root). Read it before writing any UI code.

## Coding Conventions

### Tailwind v4 Limitations

- **`[property:value]` doesn't support `var()`** — workaround: custom CSS class in `styles.css`.
- **`hover:` only applies to Tailwind utilities, not custom CSS classes** — use native `:hover` pseudo-class instead.
- **Custom classes named `ring-*` conflict with Tailwind's built-in `ring-*` utilities** — use suffixed names (`ring-ink-border`, `ring-ink-focus`).

### Interaction Patterns — Two Models

- **Content rows & large surfaces** (doc list, history, sidebar): sand background hover — per DESIGN.md `hoverBackground` tokens.
- **Selection controls & dropdowns** (SelectField, project picker, menus): border-based (cream → ink). Background stays `ivory`.

### Unit Discipline

DESIGN.md sizes are in `pt`. Use Tailwind arbitrary values: `px-[12pt]`, `rounded-[8pt]`. Never Tailwind's default spacing scale for spec-mandated dimensions.

### Dropdown & Overflow

Any `.rounded-*` container with full-width hover child backgrounds MUST include `overflow-hidden` to clip to border-radius.

### Hover Implementation

Prefer native CSS pseudo-classes (`:hover`, `:active`) in `styles.css` over Tailwind's `hover:` variant — avoids variant scope issues, works on touch devices.

### Keyboard Accessibility — Two Patterns

- **Interactive chrome** (sidebar icons, tree buttons, menus): `focus-visible:outline-2 focus-visible:outline-ink` — keyboard-only ring.
- **Form controls** (inputs, SelectField trigger, search bar): focus matches hover — border color change only, **no ring, no box-shadow, no outline**.

## Safety Rails

### NEVER

- Hardcoded hex colors (`bg-[#xxx]`, `text-[#xxx]`) — CI enforces
- `focus:` pseudo-class on interactive chrome (use `focus-visible:`). Exception: form controls may use `focus:` for border transitions.
- Ring/box-shadow/outline on form controls — border color change only
- Native `<select>` — always `<SelectField>`
- Mix `--tint` (cool blue-gray) with warm parchment backgrounds — use warm sand tones
- **Import runtime values from `@vein/core` in client code** — pulls `node:fs`, `better-sqlite3` into Vite bundle and breaks build. Type-only imports are safe.

### ALWAYS

- `overflow-hidden` on rounded containers with full-width hover child backgrounds
- **Client needs runtime data from `@vein/core`?** Expose via HTTP API endpoint (`server.ts`), fetch in client (`lib/api.ts`)
