# @vein/web

## Build And Test

- Backend: `bun run build:backend` → `dist/server.js`
- Frontend: `bun run dev:frontend` (Vite :5173) | `bun run build:frontend` → `dist/client/`
- Root `dev:web` builds backend + starts server only; frontend needs a separate `vite` (or prebuilt `dist/client`)

## Architecture Boundaries

- Import only from `@vein/core` single entry (root contract)
- `server.ts`: Hono app on Node `http.createServer` (not `Bun.serve`) — cross-runtime compat; mounts `routes/` sub-routers; static root probing in `staticRoot`
- `client/`: React SPA (TanStack Router + Query), Vite-build into `dist/client/`
- API client (`lib/api.ts`) auto-injects `X-Vein-Project` header AND `project` query param (from localStorage) on every request. New backend endpoints must read the project via `projectMiddleware`; new frontend API helpers must use `h()` / `u()` from `api.ts`

## Coding Conventions

- **Visual design**: all tokens/components governed by `DESIGN.md` (repo root) — read it before any UI code
- **Tailwind v4**: `[property:value]` doesn't support `var()` → custom CSS class in `styles.css`
- **Tailwind v4**: `hover:` only applies to utilities, not custom CSS classes → native `:hover` pseudo-class
- Custom classes named `ring-*` conflict with Tailwind's ring utilities → suffix names (`ring-ink-border`, `ring-ink-focus`)
- DESIGN.md sizes are in `pt` → arbitrary values only: `px-[12pt]`, `rounded-[8pt]`; never the default spacing scale
- Any `.rounded-*` container with full-width hover children needs `overflow-hidden`

## Safety Rails

### NEVER

- Hardcoded hex colors (`bg-[#xxx]`, `text-[#xxx]`) — CI-enforced by `lint:hex`
- Import runtime values from `@vein/core` into client code — pulls `node:fs`, `bun:sqlite` into the Vite bundle and breaks the build. Type-only imports are safe.

### ALWAYS

- Client needs runtime data from `@vein/core`? Expose via HTTP API endpoint (`server.ts`), fetch in client (`lib/api.ts`)
