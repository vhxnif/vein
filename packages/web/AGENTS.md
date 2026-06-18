# @vein/web

Thin web layer — REST API (Hono) + React SPA. All business logic delegated to `@vein/core`.

## Architecture Boundaries

```
src/
├── server.ts            Hono entry + Node.js HTTP adapter
├── middleware/           Project resolution (X-Vein-Project header / ?project query)
├── routes/               Thin REST endpoints → call @vein/core
│   ├── projects.ts      Project CRUD + model listing
│   ├── documents.ts     Document CRUD + import (SSE) + resegment
│   ├── search.ts        POST search (JSON response)
│   └── history.ts       History list + detail
└── client/              React SPA (Vite)
    ├── routes/          TanStack Router file-based routes
    ├── components/      Layout (sidebar + mobile tab bar)
    └── lib/             api.ts (typed fetch client), project.tsx (context)
```

## Build And Run

| Command | Location | Purpose |
|---------|----------|---------|
| `bun run dev:web` | root | Dev server (macOS/Linux) |
| `bun run build:web` | root | Production build |
| `bun run dev` | `packages/web/` | Dev server with watch |
| `bun run build` | `packages/web/` | Build frontend + backend |
| `bun run start` | `packages/web/` | Production (node dist/server.js) |

Backend build uses `--external better-sqlite3`. Bun macOS/Linux can load it directly; Windows needs Node.js.

## Safety Rails

### NEVER

- Import `better-sqlite3`, `drizzle-orm`, or `@earendil-works/pi-ai` directly (enforced by dependency graph)
- Import from `@vein/core` sub-paths (enforced by core's `exports` map)
- Inline business logic in routes or components — delegate to `@vein/core`
- Use hardcoded hex colors (`bg-[#xxx]`, `text-[#xxx]`) — use Kami design tokens only (enforced by CI grep)
- Use `focus:` pseudo-class — use `focus-visible:` for keyboard-only focus ring
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

All colors via CSS custom properties defined in `styles.css`. Bridge to Tailwind v4 via `@theme`:

```css
@theme {
    --color-ink: #1b365d;
    --color-ivory: #faf9f5;
}
```

Then use `text-ink`, `bg-ivory` — never `text-[#1B365D]`, `bg-[#faf9f5]`.

**CI enforcement**: `grep -rn '\[#' packages/web/src/client` in lint step. Merge/push should fail if hex colors found.

### Hover Consistency

| Background | Hover | Usage |
|-----------|-------|-------|
| parchment `#f5f4ed` | `hover:bg-sand/60` | Doc list rows, history rows |
| ivory `#faf9f5` | `hover:bg-sand` | Project cards, dropdown items, sidebar icons |

### Color Replacement Trap

When migrating from hex to tokens with sed, process variants with opacity suffix FIRST (`bg-[#faf9f5]/50`), then plain ones (`bg-[#faf9f5]`). Otherwise `/50` becomes orphan text. JS template string dynamic classes (`` `${cond ? 'bg-[#hex]' : '...'}` ``) won't be matched by sed — edit manually.

### Keyboard Accessibility

Always `focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2` — not `focus:`. The `focus-visible:` variant only shows the ring on keyboard (Tab) navigation, not mouse clicks. Apply to: sidebar icons, outline tree buttons, settings `<select>`.

## UI Conventions

### Mobile Adaptations

- **Device detection**: `useState(false)` + `resize` event (`<768px`), not CSS `md:` breakpoint — required for JS-level behavior differences
- **Infinite scroll (mobile)**: `useInfiniteQuery` + `IntersectionObserver` with sentinel `<div>` at list bottom, `rootMargin: '200px'`
- **Desktop pagination**: `desktopPage` state indexing `data.pages[desktopPage - 1]`, Prev/Next buttons
- **Page size calculation**: dynamic based on viewport height (`availH / rowH`), computed once in `useState(() => ...)` initializer, never updated
- **Doc detail mobile**: sticky top nav with back + title (truncated) + outline toggle (☰); outline overlay hides content when open; auto-collapse on node select; default to outline open on enter

### Component Patterns

- **Delete button**: `group` parent + `group-hover:opacity-100` (desktop) / `opacity-100` (mobile always visible). Inside `<Link>`, must `e.stopPropagation()` + `e.preventDefault()`
- **Loading states**: TanStack Query `isLoading` → "Loading..."; search → pulsing dot + timer
- **Empty states**: Guidance copy for no data
- **Responsive**: ≥768px sidebar + 780px centered content; <768px bottom tab bar + full width
- **Dark mode**: `prefers-color-scheme`, warm dark tokens

### Chinese UI Text Audit Checklist

When localizing (Chinese → English), verify: page titles, section headers (`大纲`→`Outline`), metadata labels (`章节`→`sections`), model labels (`主模型`→`Main Model`), empty state copy, placeholder hints.

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep list intact
2. Design constraint table (hover consistency, Kami tokens)
3. Mobile adaptation patterns (infinite scroll, page size calculation)
4. Component patterns (delete button, keyboard accessibility)
5. CI hex color enforcement note
