---
version: alpha
name: Vein (Kami)
description: A warm, print-inspired design system for an AI-powered knowledge search tool. Canvas is parchment (#f5f4ed), ink is a deep navy-blue (#1b365d), and typography runs on serif (Charter/Noto Serif SC) for body, sans (system-ui) for chrome, and JetBrains Mono for code — evoking a scholar's reading desk rather than a SaaS dashboard.

seo:
  title: "Vein Design System — Parchment #f5f4ed, Charter Serif, Kami Tokens"
  metaDescription: "Vein's Kami design language as a DESIGN.md file. Warm parchment #f5f4ed, ink-blue #1b365d, Charter serif, JetBrains Mono, 15+ components. For React, Hono, and AI tools."
  highlights:
    - "Warm parchment canvas — #f5f4ed never pure white, with a subtle paper texture overlay"
    - "Ink-blue primary — #1b365d carries all CTAs, headings, and links; never goes near-black for body text"
    - "Serif-first typography — Charter for content and display, system sans for chrome and buttons, JetBrains Mono for code"
    - "Print-inspired details — drop caps, ornamental dividers, dash lists, quote blocks with ink-blue borders"
    - "Stacked subtle shadows — ring-warm (1pt cream border) + whisper (soft 24pt spread); never heavy drop-shadows"
    - "Two navigation surfaces — fixed 48px desktop sidebar + mobile bottom tab bar with safe-area padding"
  tags:
    - "AI Knowledge Tool"
    - "Developer Tools"
  lastUpdated: "2026-06-24"
  author:
    name: "Vein Team"
  opening: |
    Vein's design language is the reading surface for an AI-powered knowledge tool, built for scholars and engineers who search across their own documents. The page operates with a warm, print-inspired palette: parchment #f5f4ed as the page body, ivory #faf9f5 for cards and inputs, and ink-blue #1b365d for CTAs, headings, and links. There is no pure white or pure black — every surface lives in a warm earth tone, from sand #e8e6dc hover states to olive #504e49 secondary text.

    This DESIGN.md packages the system into a single machine-readable file. Inside: 11 color tokens (parchment, ivory, sand, ink, ink-light, near-black, olive, stone, cream, error, tint), 4 typography faces across serif/sans/mono/code, 5 corner radii (all in pt units, tight 6pt → 12pt max), button components (primary/secondary/ghost/danger), form controls (SelectField, text inputs), navigation (sidebar, mobile tab bar), and 12+ component patterns from `markdown-body` to `confirm-dialog`. The format follows the Google Labs DESIGN.md spec — colors, typography, rounded, spacing, components, all token-referenced.

    Feed the file to Claude, Cursor, or Copilot when you need a React component that reads as Vein rather than as a generic Tailwind theme. The agent picks up the discipline — serif for content, sans for chrome, mono for code, ink-blue CTAs on parchment canvas, stacked ring+whisper shadows instead of heavy drops. Reference the tokens directly in Tailwind config via the @theme bridge in styles.css, or use the spec as an audit checklist. The system is worth studying because of what it refuses: no pure white, no pure black, no blue-gray cool tones for surfaces, no material elevation, no native `<select>` elements, no focus rings on form controls.

colors:
  parchment: "#f5f4ed"
  ivory: "#faf9f5"
  sand: "#e8e6dc"
  ink: "#1b365d"
  ink-light: "#2d5a8a"
  near-black: "#141413"
  olive: "#504e49"
  stone: "#595852"
  cream: "#d4d0c4"
  error: "#b53333"
  tint: "#eef2f7"
  tint-014: "#e4ecf5"
  tint-022: "#d0dce9"
  tint-030: "#d6e1ee"

typography:
  serif-display:
    fontFamily: "'Charter', 'Noto Serif SC', 'Georgia', serif"
    fontSize: 22pt
    fontWeight: 500
    lineHeight: 1.25
    use: "Page hero headings (project name, page titles)"
  serif-section:
    fontFamily: "'Charter', 'Noto Serif SC', 'Georgia', serif"
    fontSize: 20pt
    fontWeight: 500
    lineHeight: 1.25
    use: "Section headings (Documents, History, Settings)"
  serif-subsection:
    fontFamily: "'Charter', 'Noto Serif SC', 'Georgia', serif"
    fontSize: 16pt
    fontWeight: 500
    lineHeight: 1.3
    use: "Markdown H1 within content"
  serif-body:
    fontFamily: "'Charter', 'Noto Serif SC', 'Georgia', serif"
    fontSize: 10pt
    fontWeight: 400
    lineHeight: 1.6
    use: "Default body text in markdown, document lists, history rows"
  serif-body-lg:
    fontFamily: "'Charter', 'Noto Serif SC', 'Georgia', serif"
    fontSize: 11pt
    fontWeight: 400
    lineHeight: 1.6
    use: "Search input placeholder, H3 markdown headings"
  sans-label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 9pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Body copy in dialogs, empty states, metadata lines"
  sans-label-sm:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 8.5pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Form labels, settings field labels"
  sans-caption:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 8pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Secondary metadata (dates, doc counts, elapsed times)"
  sans-caption-strong:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 7.5pt
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.025em
    use: "Uppercase section eyebrows ('Reasoning process', 'Review', section labels)"
  sans-button:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 9pt
    fontWeight: 500
    lineHeight: 1.4
    use: "Button labels (primary, secondary, ghost, danger)"
  sans-mode-pill:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: 8pt
    fontWeight: 500
    lineHeight: 1.4
    use: "Mode selector pills (Review / Quick)"
  mono-code:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 9pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Inline code within markdown"
  mono-code-block:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 0.9em
    fontWeight: 400
    lineHeight: 1.4
    use: "Code blocks, trace output"
  mono-tool-label:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 8pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Tool call block labels in timeline"
  mono-tabular:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: 8pt
    fontWeight: 400
    lineHeight: 1.4
    use: "Elapsed time counters, tabular numbers"

rounded:
  xs: 4pt
  sm: 6pt
  md: 8pt
  lg: 12pt
  full: 9999px

spacing:
  xxs: 4pt
  xs: 8pt
  sm: 12pt
  md: 16pt
  lg: 24pt
  xl: 32pt
  2xl: 40pt
  3xl: 48pt
  section: 64pt

components:
  # ── Buttons ──
  btn-primary:
    description: "Primary CTA — ink-blue filled with white text. Used for Save, Import, primary actions."
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    typography: "{typography.sans-button}"
    rounded: "{rounded.md}"
    padding: "6pt 16pt"
    boxShadow: "0 0 0 1pt {colors.ink}"
    hover: "opacity 0.9"
    transition: "opacity 150ms ease"

  btn-secondary:
    description: "Secondary action — transparent with cream border. Used for Cancel, Prev/Next pagination."
    backgroundColor: "transparent"
    textColor: "{colors.stone}"
    typography: "{typography.sans-button}"
    rounded: "{rounded.md}"
    padding: "6pt 16pt"
    boxShadow: "0 0 0 1pt {colors.cream}"
    hover: "color {colors.near-black}, box-shadow 0 0 0 1pt {colors.ink}"
    transition: "all 150ms ease"

  btn-ghost:
    description: "Borderless text-only button. Used for Prev/Next pagination (alternate style), subtle secondary actions."
    backgroundColor: "transparent"
    textColor: "{colors.stone}"
    typography: "{typography.sans-button}"
    rounded: "{rounded.md}"
    padding: "6pt 16pt"
    hover: "color {colors.ink}"
    transition: "color 150ms ease"

  btn-danger:
    description: "Destructive action — red text, red background on hover. Used for Delete confirmations."
    backgroundColor: "transparent"
    textColor: "{colors.error}"
    typography: "{typography.sans-button}"
    rounded: "{rounded.md}"
    padding: "6pt 16pt"
    hover: "background {colors.error}, color #ffffff"
    transition: "all 150ms ease"

  # ── Mode Pills ──
  mode-pill-active:
    description: "Active mode selector pill (Review or Quick). Ink-blue filled."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ivory}"
    typography: "{typography.sans-mode-pill}"
    rounded: "{rounded.full}"
    padding: "4pt 12pt"
    border: "1px solid {colors.ink}"

  mode-pill-inactive:
    description: "Inactive mode selector pill. Transparent with cream border."
    backgroundColor: "transparent"
    textColor: "{colors.stone}"
    typography: "{typography.sans-mode-pill}"
    rounded: "{rounded.full}"
    padding: "4pt 12pt"
    border: "1px solid {colors.cream}"
    hover: "border-color {colors.ink}/30, color {colors.near-black}"

  # ── Navigation ──
  sidebar-desktop:
    description: "Fixed 48px-width left sidebar with project selector and icon navigation. Parchment background, cream right border. Icons are 16-18px SVGs with stone color, hover to ink-blue."
    backgroundColor: "{colors.parchment}"
    width: "48px"
    height: "100vh"
    position: "fixed"
    borderRight: "1px solid {colors.cream}/50"
    padding: "16pt 0"
    gap: "12pt"
    iconSize: "18px"
    iconColor: "{colors.stone}"
    iconHoverColor: "{colors.ink}"
    iconHoverBackground: "{colors.sand}"
    iconRounded: "{rounded.sm}"

  mobile-tab-bar:
    description: "Fixed bottom tab bar (mobile only, hidden on md+). Ivory background, cream top border. Four tabs: Ask, History, Docs, Projects. 20px SVG icons."
    backgroundColor: "{colors.ivory}"
    borderTop: "1px solid {colors.cream}/50"
    position: "fixed bottom-0 left-0 right-0"
    padding: "8pt 0"
    zIndex: 50
    safeArea: "padding-bottom: env(safe-area-inset-bottom, 8px)"
    iconSize: "20px"
    iconColor: "{colors.stone}"
    iconHoverColor: "{colors.ink}"

  sidebar-icon-button:
    description: "32x32pt icon button in sidebar. Stone icon, hover to ink-blue with sand background. Focus-visible outline in ink."
    width: "32pt"
    height: "32pt"
    rounded: "{rounded.sm}"
    iconColor: "{colors.stone}"
    hoverColor: "{colors.ink}"
    hoverBackground: "{colors.sand}"
    focusRing: "2px solid {colors.ink}, 2px offset"
    transition: "colors 150ms ease"

  # ── Cards & Surfaces ──
  confirm-dialog:
    description: "Modal confirmation dialog. Ivory background with ring-warm border + whisper shadow. Serif title, sans body. Action buttons right-aligned."
    backgroundColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "24pt"
    maxWidth: "400px"
    boxShadow: "0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.08)"
    overlayBackground: "{colors.near-black}/30"
    animation: "fadeIn 250ms ease"
    titleTypography: "{typography.serif-subsection}"
    bodyTypography: "{typography.sans-label}"
    buttonGap: "{spacing.sm}"

  # ── Forms ──
  form-input-search:
    description: "Large search input on the Ask page. Ivory background, ring-warm border, serif text. Focus transitions ring to ink-blue."
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.near-black}"
    placeholderColor: "{colors.stone}"
    typography: "{typography.serif-body-lg}"
    rounded: "{rounded.md}"
    padding: "16pt 24pt"
    width: "100%"
    boxShadow: "0 0 0 1pt {colors.cream}"
    focusBoxShadow: "0 0 0 1pt {colors.ink}"
    transition: "box-shadow 150ms ease"

  form-input-settings:
    description: "Underline-style text input for settings. Transparent background, cream bottom border. Focus transitions border to ink-blue."
    backgroundColor: "transparent"
    textColor: "{colors.near-black}"
    typography: "{typography.serif-body}"
    borderBottom: "1px solid {colors.cream}"
    padding: "8pt 0"
    width: "100%"
    focusBorder: "1px solid {colors.ink}"
    transition: "border-color 150ms ease"

  select-field-trigger:
    description: "Custom dropdown trigger button — always use <SelectField> component, never native <select>. Ivory background, cream border. Sans text. Chevron rotates on expand."
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.near-black}"
    placeholderColor: "{colors.stone}"
    typography: "{typography.sans-button}"
    rounded: "{rounded.sm}"
    border: "1px solid {colors.cream}"
    padding: "6pt 10pt"
    width: "100%"
    hoverBorder: "{colors.ink-light}"
    focusBorder: "{colors.ink-light}"
    expandedBorder: "{colors.ink-light}"
    disabledOpacity: 0.45
    disabledBackground: "{colors.sand}"

  select-field-dropdown:
    description: "Dropdown panel for SelectField. Ivory background, ring-warm + whisper shadow. Items have sand hover, ink-blue selected state."
    backgroundColor: "{colors.ivory}"
    rounded: "{rounded.md}"
    boxShadow: "0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.08)"
    maxHeight: "220pt"
    animation: "fadeIn 120ms ease"
    itemPadding: "5pt 10pt"
    itemTypography: "{typography.sans-button}"
    itemColor: "{colors.olive}"
    itemHoverBackground: "{colors.sand}"
    itemSelectedColor: "{colors.ink}"
    itemSelectedWeight: 500

  # ── Content ──
  markdown-body:
    description: "Rendered markdown content. Serif text, ink-blue links, cream dividers. H1-H4 in serif, code in mono on ivory background, blockquotes with ink-blue left border."
    textColor: "{colors.near-black}"
    typography: "{typography.serif-body}"
    h1Typography: "{typography.serif-subsection}"
    h1Border: "1px solid {colors.cream}"
    blockquoteBorder: "2px solid {colors.ink}"
    blockquoteColor: "{colors.olive}"
    inlineCodeBackground: "{colors.ivory}"
    inlineCodeColor: "{colors.ink}"
    linkColor: "{colors.ink}"
    linkHover: "underline"
    thTypography: "{typography.sans-caption-strong}"
    tdTypography: "font-serif text-[9pt]"

  code-block:
    description: "Fenced code block. Ivory background, cream hairline border, mono font."
    backgroundColor: "{colors.ivory}"
    border: "0.5pt solid {colors.cream}"
    rounded: "{rounded.sm}"
    typography: "{typography.mono-code-block}"
    padding: "12pt 16pt"

  quote-block:
    description: "Styled blockquote with ink-blue left border, italic olive text."
    borderLeft: "2pt solid {colors.ink}"
    paddingLeft: "16pt"
    color: "{colors.olive}"
    fontStyle: "italic"

  dash-list:
    description: "Unordered list with em-dash bullets in stone color, no default disc."
    bulletColor: "{colors.stone}"
    bulletChar: "—"

  drop-cap:
    description: "First paragraph drop cap. Ink-blue, large serif, floats left."
    selector: ".drop-cap > p:first-of-type::first-letter"
    fontFamily: "{typography.serif-display}"
    fontSize: "3.2em"
    lineHeight: 0.85
    color: "{colors.ink}"

  ornament-divider:
    description: "Section divider with centered ornamental dots, stone color, wide letter spacing."
    textAlign: "center"
    color: "{colors.stone}"
    fontFamily: "{typography.serif-display}"
    fontSize: "10pt"
    letterSpacing: "0.3em"
    userSelect: "none"

  # ── Data Display ──
  timeline-tool-block:
    description: "Tool call pill in streaming/reasoning timeline. Ivory background, cream border when running, ink/30 border when done. Mono font label, Braille spinner when running."
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.stone}"
    typography: "{typography.mono-tool-label}"
    rounded: "{rounded.full}"
    padding: "6pt 12pt"
    runningBorder: "{colors.cream}"
    doneBorder: "{colors.ink}/30"

  doc-list-row:
    description: "Document list row with hover sand background. Serif title, sans metadata. Delete button appears on hover (desktop) via group-hover."
    padding: "12pt 12pt"
    negativeMargin: "-12px horizontal"
    rounded: "{rounded.sm}"
    hoverBackground: "{colors.sand}/60"
    titleTypography: "{typography.serif-body}"
    titleColor: "{colors.near-black}"
    metadataTypography: "{typography.sans-caption}"
    metadataColor: "{colors.stone}"
    deleteButtonColor: "{colors.ink}/40"
    deleteButtonHover: "{colors.error}"

  history-row:
    description: "History entry row. Same layout as doc list row with mode pill badge and verdict indicator."
    padding: "12pt 12pt"
    negativeMargin: "-12px horizontal"
    rounded: "{rounded.sm}"
    hoverBackground: "{colors.sand}/60"
    queryTypography: "{typography.serif-body}"
    queryColor: "{colors.near-black}"
    metaTypography: "{typography.sans-caption}"
    metaColor: "{colors.olive}"

  tag-calm:
    description: "Small tinted tag/badge. Light blue-tinted background with ink-blue text."
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    typography: "{typography.sans-caption-strong}"
    rounded: "{rounded.sm}"
    padding: "2pt 8pt"

  status-bar:
    description: "Streaming status bar with RunCat animation, status text, elapsed timer. Fixed at bottom of search results during streaming."
    typography: "{typography.sans-caption}"
    statusColor: "{colors.olive}"
    timerTypography: "{typography.mono-tabular}"
    timerColor: "{colors.stone}"

  thinking-block:
    description: "In-progress thinking text in timeline. Italic, muted stone color."
    fontStyle: "italic"
    color: "{colors.stone}/70"
    typography: "{typography.serif-body}"

  # ── Review Section ──
  review-block:
    description: "Completed review verdict section. Divider top, label + verdict + score + reason side by side."
    borderTop: "1px solid {colors.cream}"
    labelTypography: "{typography.sans-caption-strong}"
    labelColor: "{colors.stone}"
    verdictPassColor: "{colors.ink}"
    verdictPartialColor: "{colors.error}"
    verdictFailColor: "{colors.stone}"
    reasonTypography: "{typography.sans-label}"
    reasonColor: "{colors.stone}"

  # ── Empty & Error States ──
  empty-state:
    description: "Centered empty state message. Sans text, stone color."
    typography: "{typography.sans-label}"
    color: "{colors.stone}"
    textAlign: "center"

  error-state:
    description: "Error message card. Ivory background with ring-warm border."
    backgroundColor: "{colors.ivory}"
    rounded: "{rounded.md}"
    padding: "16pt"
    boxShadow: "0 0 0 1pt {colors.cream}"
    typography: "{typography.sans-label}"
    color: "{colors.error}"

  loading-state:
    description: "Loading indicator text. Sans text, olive color."
    typography: "{typography.sans-label}"
    color: "{colors.olive}"

# ── Examples (illustrative) ────────────────────────────────────
examples:
  ex-search-page:
    description: "The main Ask page — search input + mode pills + streaming timeline + final markdown result + review block."
    maxWidth: "780px"
    horizontalPadding: "32pt"
    verticalPadding: "64pt"
    components: [form-input-search, mode-pill-active, mode-pill-inactive, timeline-tool-block, markdown-body, review-block]

  ex-doc-list-page:
    description: "Documents list — header with count + Import button, rows with hover + group-hover delete, pagination controls."
    maxWidth: "780px"
    horizontalPadding: "32pt"
    verticalPadding: "64pt"
    components: [btn-primary, btn-ghost, doc-list-row, confirm-dialog]

  ex-history-page:
    description: "History list — date-grouped on mobile, flat on desktop. Expandable entries with reasoning process + markdown answer + verdict."
    maxWidth: "780px"
    horizontalPadding: "32pt"
    verticalPadding: "64pt"
    components: [history-row, timeline-tool-block, markdown-body, review-block]

  ex-settings-page:
    description: "Settings form — narrower layout, grouped sections (Project, Models, Thinking, Database), SelectField for providers/models."
    maxWidth: "560px"
    components: [form-input-settings, select-field-trigger, select-field-dropdown, btn-primary]

  ex-reasoning-process:
    description: "Collapsible reasoning process details — uppercase mono eyebrow summary, cream left border, timeline blocks stacked."
    summaryTypography: "{typography.sans-caption-strong}"
    borderLeft: "2px solid {colors.cream}"

---

## Overview

Vein is an AI-powered knowledge search tool — the page is a scholar's reading desk, not a SaaS dashboard. It earns that posture with a warm, print-inspired palette: parchment `{colors.parchment}` (`#f5f4ed`) body background with a subtle noise texture overlay, ink-blue `{colors.ink}` (`#1b365d`) for CTAs, headings, and links, and earth-tone neutrals (olive `#504e49`, stone `#595852`) for secondary text. Pure white and pure black never appear — the closest is ivory `{colors.ivory}` (`#faf9f5`) for cards and near-black `{colors.near-black}` (`#141413`) for body text.

Typography is the decisive voice. The system runs **serif-first**: Charter (with Noto Serif SC for CJK, Georgia fallback) for all content — body paragraphs, headings, search input, document titles. System sans-serif handles chrome: buttons, form labels, metadata, navigation. JetBrains Mono carries all code and technical labels: inline code, code blocks, tool call labels, elapsed timers. This three-face split is non-negotiable — body text never appears in sans, chrome never in serif.

Surfaces use a three-step warm ladder: `{colors.parchment}` (`#f5f4ed`) for the page body, `{colors.ivory}` (`#faf9f5`) for cards/inputs/dropdowns, `{colors.sand}` (`#e8e6dc`) for hover states and selected rows. Shadows are exceptionally subtle — the `ring-warm` utility provides a 1pt cream border (`0 0 0 1pt #d4d0c4`) as the default card edge, optionally combined with a `whisper` shadow (`0 4pt 24pt rgba(0,0,0,0.05)`) for elevated surfaces like modals and dropdowns.

**Key Characteristics:**
- A single ink-blue primary CTA `{colors.ink}` (`#1b365d`) carries every primary action: Save, Import, Search. Secondary actions use transparent with cream border.
- Serif body text on warm parchment — the page looks like a printed book, not a web app.
- Print-inspired details: drop caps on opening paragraphs, ornamental dot dividers, em-dash bullet lists, ink-blue blockquote borders.
- Custom SelectField dropdown replacing all native `<select>` elements — keyboard-navigable (↑↓/Enter/Escape), click-outside close.
- Two navigation surfaces: a fixed 48px desktop sidebar (project selector + icon links) and a mobile bottom tab bar with safe-area padding.
- Focus management split: interactive chrome gets `focus-visible:outline-2` keyboard rings; form controls get border-color change only (matching hover), no ring/outline/box-shadow.
- Tool call blocks share the same `bg-ivory` background whether running or done; only the border changes: `border-cream` → `border-ink/30`.

## Colors

### Canvas & Surfaces
- **Parchment** (`{colors.parchment}` — `#f5f4ed`): The default page background. A warm off-white with a subtle paper texture overlay (SVG noise filter at 3% opacity). Every page body sits on this.
- **Ivory** (`{colors.ivory}` — `#faf9f5`): Card, input, dropdown, and dialog surface. Slightly lighter and cooler than parchment, providing a crisp surface distinction.
- **Sand** (`{colors.sand}` — `#e8e6dc`): Hover state background for rows, sidebar icons, dropdown items. Warmer and darker than parchment, giving a tactile "pressed paper" feel.
- **Cream** (`{colors.cream}` — `#d4d0c4`): Default border color. Used for `ring-warm` card borders, input borders, table row dividers, section dividers.
- **Tint** (`{colors.tint}` — `#eef2f7`): A cool blue-gray used sparingly for tag backgrounds (`tag-calm`). Explicitly NOT mixed with warm parchment backgrounds — only used for isolated badge elements.

### Brand & Primary
- **Ink** (`{colors.ink}` — `#1b365d`): The single primary CTA color. A deep navy-blue that carries every primary button, heading, link, and active state. Resolved as CSS variable `--ink-blue`.
- **Ink Light** (`{colors.ink-light}` — `#2d5a8a`): A lighter ink blue used for hover states on borders (select triggers, form inputs) and as a transitional tint.
- **Near Black** (`{colors.near-black}` — `#141413`): Body text on light surfaces. A warm near-black — never pure `#000`. Used for markdown paragraphs, document titles, search input text.

### Text Hierarchy
- **Near Black** (`{colors.near-black}` — `#141413`): Primary body text. Used for markdown content, document titles, history queries, search input value.
- **Olive** (`{colors.olive}` — `#504e49`): Secondary text. Used for blockquotes, dropdown item labels, loading states, pagination controls.
- **Stone** (`{colors.stone}` — `#595852`): Tertiary/muted text. Used for metadata (dates, doc counts, elapsed times), placeholder text, empty states, inactive navigation icons.
- **Ink** (`{colors.ink}` — `#1b365d`): Heading and CTA text. Used for page titles, section headings, active nav items, link text, primary button labels (on light buttons).

### Semantic
- **Error** (`{colors.error}` — `#b53333`): Destructive actions and error states. Used for delete button hover, error messages, partial/fail verdicts.
- **Success / Link** — Vein uses `{colors.ink}` (`#1b365d`) as its link color. There is no separate green success color; the ink-blue serves as the positive indicator.

### Key Design Constraints
- **Never use cool blue-gray (`--tint`) on warm surfaces.** Tint (`#eef2f7`) is reserved for isolated tag badges. Backgrounds must use warm tones: parchment, ivory, sand.
- **Never use pure white (`#fff`) or pure black (`#000`).** Always use ivory / near-black.
- **No hex colors in component code.** All colors reference CSS custom properties (Kami tokens) or Tailwind `@theme` bridge names. CI enforces this via `grep -rn '\[#' packages/web/src/client`.

## Typography

### Font Family
Three faces carry the entire system:

1. **Serif** (`--serif`): `'Charter', 'Noto Serif SC', 'Georgia', serif` — for all content. Charter is the primary reading face; Noto Serif SC handles CJK characters; Georgia is the system fallback. Used for body paragraphs, headings, search input, document titles, history queries.

2. **Sans** (`--sans`): `system-ui, -apple-system, sans-serif` — for all chrome. Used for buttons, form labels, metadata, navigation, dropdowns, status text. Never used for body content.

3. **Mono** (`--mono`): `'JetBrains Mono', 'Fira Code', monospace` — for all technical text. Used for inline code, code blocks, tool call labels, elapsed timers, source paths. JetBrains Mono at 8-9pt matches the technical voice; Fira Code is the fallback.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `serif-display` | 22pt | 500 | 1.25 | Page hero (project name on Ask page) |
| `serif-section` | 20pt | 500 | 1.25 | Section headings (Documents, History, Settings) |
| `serif-subsection` | 16pt | 500 | 1.3 | Markdown H1 |
| `serif-body-lg` | 11pt | 400 | 1.6 | Search input, markdown H3 |
| `serif-body` | 10pt | 400 | 1.6 | Default body text, document titles, history queries |
| `sans-label` | 9pt | 400 | 1.4 | Dialog body, empty states, metadata lines |
| `sans-label-sm` | 8.5pt | 400 | 1.4 | Form labels, settings field labels |
| `sans-button` | 9pt | 500 | 1.4 | All button labels |
| `sans-caption` | 8pt | 400 | 1.4 | Secondary metadata |
| `sans-caption-strong` | 7.5pt | 600 | 1.4 | Uppercase section eyebrows, badge labels |
| `sans-mode-pill` | 8pt | 500 | 1.4 | Mode selector pills |
| `mono-code` | 9pt | 400 | 1.4 | Inline code in markdown |
| `mono-code-block` | 0.9em | 400 | 1.4 | Code blocks, trace output |
| `mono-tool-label` | 8pt | 400 | 1.4 | Tool call block labels |
| `mono-tabular` | 8pt | 400 | 1.4 | Elapsed timers (tabular-nums) |

### Principles
- **Serif for content, sans for chrome, mono for code.** This three-way split is non-negotiable. A body paragraph never renders in sans-serif; a button label never renders in serif.
- **Sentence-case headings, period-terminated.** Page titles and section headings use sentence case with a deliberate absence of ALL-CAPS SHOUTING. Uppercase is reserved for small eyebrow labels (7.5pt, 600 weight, 0.025em tracking).
- **No display weight above 600.** The serif face runs at 400 (body) and 500 (headings). Sans runs at 400 (body) and 500-600 (strong/labels). No 700+ anywhere.
- **Drop caps for opening paragraphs.** The `.drop-cap` class floats an ink-blue 3.2em first letter — a print-inspired detail that signals the reading-first posture.

## Layout

### Spacing System
- **Base unit**: 4pt. All padding, margin, and gap values are multiples of 4pt.
- **Tokens**: `xxs` 4pt · `xs` 8pt · `sm` 12pt · `md` 16pt · `lg` 24pt · `xl` 32pt · `2xl` 40pt · `3xl` 48pt · `section` 64pt.
- **Page padding**: all content pages use `px-8 py-16` (32pt horizontal, 64pt vertical).
- **Card interior padding**: cards use 16-24pt padding. Modals use 24pt. Row items use 12pt with -12pt negative horizontal margin for full-width hover.
- **Inline gaps**: button rows use 12pt, mode pills use 8pt, metadata lines use 12-16pt.

### Grid & Container
- **Max width**: 780px for content-heavy pages (Ask, Docs, History). 560px for form pages (Settings). Content centers with horizontal auto-margin.
- **Sidebar**: Fixed 48px width. Content area uses `md:pl-[48px]` to offset.
- **Column patterns**: Single-column, full-width. Vein is a reading tool, not a dashboard — no multi-column card grids, no sidebars with content + widgets. The only two-panel surface is the desktop sidebar + main content area.

### Responsive Breakpoints

| Breakpoint | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar hidden; bottom tab bar visible. Content uses full width with 16pt horizontal padding and reduced vertical padding (24pt top, 80pt bottom for safe area). Infinite scroll (IntersectionObserver) replaces pagination. |
| Desktop | ≥ 768px | Fixed sidebar visible; bottom tab bar hidden. Content uses 32pt horizontal padding and 64pt vertical padding. Pagination controls replace infinite scroll. |

### Collapsing Strategy
- **Sidebar → Tab bar**: The fixed 48px sidebar collapses to a bottom tab bar at <768px. Icons resize from 18px → 20px for touch targets.
- **Document list**: Desktop uses pagination with Prev/Next buttons. Mobile uses infinite scroll with IntersectionObserver (rootMargin: 200px).
- **History list**: Desktop shows flat list with date in row. Mobile groups entries by date with section headers.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Level 0 — Flat | No shadow, no border. | Page body (parchment background), full-bleed sections. |
| Level 1 — Ring Warm | `0 0 0 1pt {colors.cream}` (1pt cream border). | Default card chrome — search input, tool call blocks, error cards. The universal "this is a distinct surface" cue. |
| Level 2 — Ring + Whisper | `0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.05)` | Elevated surfaces — SelectField dropdown. |
| Level 3 — Modal | `0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.08)` + backdrop (`bg-near-black/30`) | ConfirmDialog, any modal overlay. |

The brand uses **stacked subtle shadows** — a hairline cream border combined with a whisper-soft spread — never a single heavy drop-shadow. Cards read as sitting on the page without material-heaviness.

### Decorative Depth
- **Paper texture overlay**: A fixed full-viewport `::before` pseudo-element with SVG noise at 3% opacity gives the parchment background a tactile paper feel. This is applied to the body element once — not per-card.
- **No gradients, no mesh, no atmospheric color.** The decorative system is the paper texture + typography. Vein refuses decoration-by-color — the reading surface is the product.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `rounded.xs` | 4pt | Tightest — delete button hover area, inline elements |
| `rounded.sm` | 6pt | Default UI radius — form inputs, SelectField trigger, sidebar icons, document rows, code blocks, tags |
| `rounded.md` | 8pt | Card radius — search input, buttons, error/empty cards, SelectField dropdown, markdown code blocks |
| `rounded.lg` | 12pt | Large card radius — ConfirmDialog modal |
| `rounded.full` | 9999px | Fully rounded — mode selector pills, tool call block pills |

### Key Shape Principles
- **No pill-shaped CTAs.** Primary and secondary buttons use 8pt (`rounded.md`) — softly rounded rectangles, not full pills. Only mode selector pills and tool call blocks use `rounded.full`.
- **No square corners.** Even the tightest elements use at least 4pt radius. The system is warm and tactile — sharp corners feel cold and digital.
- **SelectField triggers use 6pt.** Tighter than primary buttons (8pt) to visually distinguish form controls from action buttons.

## Components

### Buttons

**`btn-primary`** — the canonical primary action button.
- Background `{colors.ink}` (`#1b365d`), text `#ffffff`, label set in `{typography.sans-button}` (9pt/500), padding `6pt 16pt`, shape `{rounded.md}` 8pt. Box-shadow `0 0 0 1pt {colors.ink}`. Hover: opacity 0.9. Used for Save, Import, primary form submission.

**`btn-secondary`** — the paired secondary action.
- Background `transparent`, text `{colors.stone}` (`#595852`), same typography/padding/shape as `btn-primary`. Box-shadow `0 0 0 1pt {colors.cream}`. Hover: text → `{colors.near-black}`, border → `{colors.ink}`. Used for Cancel.

**`btn-ghost`** — borderless text-only button.
- Background `transparent`, text `{colors.stone}`, same typography/padding/shape. Hover: text → `{colors.ink}`. Used for Prev/Next pagination, subtle secondary actions.

**`btn-danger`** — destructive action button.
- Background `transparent`, text `{colors.error}` (`#b53333`), same typography/padding/shape. Hover: background → `{colors.error}`, text → `#ffffff`. Used for Delete confirmations.

### Mode Selector Pills

**`mode-pill-active`** — the currently selected mode.
- Background `{colors.ink}`, text `{colors.ivory}`, label `{typography.sans-mode-pill}` (8pt/500), shape `{rounded.full}`, padding `4pt 12pt`, border `1px solid {colors.ink}`.

**`mode-pill-inactive`** — an unselected mode.
- Background `transparent`, text `{colors.stone}`, same typography/shape/padding. Border `1px solid {colors.cream}`. Hover: border → `{colors.ink}/30`, text → `{colors.near-black}`.

### Navigation

**`sidebar-desktop`** — fixed left sidebar (≥768px).
- Background `{colors.parchment}`, width 48px, height 100vh, position fixed. Right border `1px solid {colors.cream}/50`. Flexbox column, items centered, gap 12pt, padding 16pt vertical.
- Contains: ProjectSelector (icon button with dropdown), SidebarIcon links (Ask, History, Docs, Settings).
- Icons: 18px SVG, `{colors.stone}` fill → `{colors.ink}` on hover, `{colors.sand}` background on hover.

**`mobile-tab-bar`** — fixed bottom tab bar (<768px).
- Background `{colors.ivory}`, top border `1px solid {colors.cream}/50`. Four tabs equally spaced. Safe area padding via `env(safe-area-inset-bottom, 8px)`. Z-index 50.
- Icons: 20px SVG, same color behavior as sidebar.

**`sidebar-icon-button`** — individual icon link in sidebar.
- 32pt × 32pt, shape `{rounded.sm}` 6pt. `focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2`. Hover: `text-ink bg-sand`. Transition `colors 150ms ease`.

### Forms

**`form-input-search`** — the main search input on the Ask page.
- Background `{colors.ivory}`, text `{colors.near-black}`, placeholder `{colors.stone}`, set in `{typography.serif-body-lg}` (11pt serif). Padding `16pt 24pt`, shape `{rounded.md}` 8pt. Box-shadow `0 0 0 1pt {colors.cream}`. Focus: box-shadow → `0 0 0 1pt {colors.ink}`. Transition `box-shadow 150ms ease`.

**`form-input-settings`** — underline-style text input for settings.
- Background `transparent`, text `{colors.near-black}`, set in `{typography.serif-body}` (10pt serif). Border-bottom `1px solid {colors.cream}`, padding `8pt 0`. Focus: border-bottom → `1px solid {colors.ink}`.

**`select-field-trigger`** — custom dropdown trigger button.
- **ALWAYS use `<SelectField>` component — never native `<select>`.**
- Background `{colors.ivory}`, text `{colors.near-black}`, placeholder `{colors.stone}`, set in `{typography.sans-button}` (9pt/500 sans). Border `1px solid {colors.cream}`, padding `6pt 10pt`, shape `{rounded.sm}` 6pt. Width 100%.
- Hover/Expand: border → `{colors.ink-light}`.
- Disabled: opacity 0.45, background `{colors.sand}`, cursor not-allowed.
- Chevron: absolute right-8pt, rotates 180° on expand.

**`select-field-dropdown`** — dropdown panel.
- Background `{colors.ivory}`, shape `{rounded.md}` 8pt, box-shadow `0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.08)`. Max-height 220pt, animated `fadeIn 120ms ease`.
- Items: padding `5pt 10pt`, `{typography.sans-button}`, color `{colors.olive}`. Hover: background `{colors.sand}`. Selected: color `{colors.ink}`, weight 500, indicator dot.

### Content & Display

**`markdown-body`** — rendered markdown content.
- Body: `{typography.serif-body}` (10pt serif), color `{colors.near-black}`, leading-relaxed.
- H1: `{typography.serif-subsection}` (16pt/500 serif), bottom border `1px solid {colors.cream}`, mt-8 mb-3.
- H2: 13pt/500 serif, mt-6 mb-2.
- H3: 11pt/500 serif, mt-5 mb-2.
- H4: 10pt/600 serif, mt-4 mb-1.
- Blockquote: border-left `2px solid {colors.ink}`, italic, `{colors.olive}`.
- Inline code: `mono-code` (9pt mono), bg `{colors.ivory}`, px-1 py-0.5, rounded, text-ink.
- Links: `{colors.ink}`, hover:underline.
- Tables: th in `sans-caption-strong` (7.5pt/600 sans uppercase), td in serif 9pt.
- Lists: disc/decimal with serif text.

**`code-block`** — fenced code block.
- Background `{colors.ivory}`, border `0.5pt solid {colors.cream}`, shape `{rounded.sm}` 6pt, padding `12pt 16pt`, `{typography.mono-code-block}`.

**`quote-block`** — styled blockquote.
- Border-left `2pt solid {colors.ink}`, padding-left 16pt, italic, color `{colors.olive}`.

**`drop-cap`** — first paragraph drop cap.
- Selector: `.drop-cap > p:first-of-type::first-letter`. Float left, font-family serif, font-size 3.2em, line-height 0.85, color `{colors.ink}`.

**`ornament-divider`** — section divider.
- Text-align center, color `{colors.stone}`, serif 10pt, letter-spacing 0.3em, user-select none.

### Data Display

**`timeline-tool-block`** — tool call pill in streaming/reasoning timeline.
- Background `{colors.ivory}`, text `{colors.stone}`, set in `{typography.mono-tool-label}` (8pt mono). Shape `{rounded.full}`, padding `6pt 12pt`. Running: border `{colors.cream}` with Braille spinner. Done: border `{colors.ink}/30` with optional summary text.

**`thinking-block`** — in-progress thinking text in timeline.
- Italic, color `{colors.stone}/70`, set in `{typography.serif-body}`.

**`doc-list-row`** — document list row.
- Padding 12pt, negative horizontal margin -12pt for full-width hover. Shape `{rounded.sm}`. Hover: background `{colors.sand}/60`.
- Title: `{typography.serif-body}`, color `{colors.near-black}`.
- Metadata: `{typography.sans-caption}`, color `{colors.stone}`, gap 16pt.
- Delete button: hidden on desktop, visible on `group-hover` with `opacity-0 group-hover:opacity-100`. Color `{colors.ink}/40`, hover: `{colors.error}` with `{colors.error}/10` background. Must call `e.stopPropagation()` + `e.preventDefault()` since row is inside `<Link>`.

**`history-row`** — history entry row.
- Same padding/hover as doc-list-row. Query in serif-body near-black. Mode pill badge (quick=outlined, review=ink/10 bg). Verdict text inline (pass=ink, partial=error, fail=stone). Time + elapsed in mono-tabular.

**`tag-calm`** — tinted badge.
- Background `{colors.tint}` (`#eef2f7`), text `{colors.ink}`, set in `{typography.sans-caption-strong}` (7.5pt/600 sans uppercase). Shape `{rounded.sm}` 6pt, padding `2pt 8pt`.

### Overlays

**`confirm-dialog`** — modal confirmation dialog.
- Fixed inset-0 z-50, flex centered. Backdrop `bg-near-black/30`. Dialog: background `{colors.ivory}`, shape `{rounded.lg}` 12pt, box-shadow `0 0 0 1pt {colors.cream}, 0 4pt 24pt rgba(0,0,0,0.08)`, padding 24pt, max-width 400px.
- Title: serif-subsection (16pt/500), near-black.
- Body: sans-label (9pt), olive.
- Buttons: right-aligned, gap 12pt. Cancel uses `btn-secondary`, Confirm uses `btn-danger`.
- Keyboard: Escape closes. Focus trap: cancel button auto-focused on open. Click-outside closes (via backdrop click).
- Animation: `fadeIn 250ms ease`.

### States

**`empty-state`** — centered empty message.
- Text-align center, `{typography.sans-label}` (9pt sans), color `{colors.stone}`.

**`error-state`** — error card.
- Background `{colors.ivory}`, shape `{rounded.md}`, box-shadow `0 0 0 1pt {colors.cream}`, padding 16pt. Text: `{typography.sans-label}`, color `{colors.error}`.

**`loading-state`** — loading indicator.
- `{typography.sans-label}`, color `{colors.olive}`.

## Component Rules (from AGENTS.md)

### Keyboard Accessibility — Two Distinct Patterns

1. **Interactive chrome** (sidebar icons, tree buttons, menu items):
   - `focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2`
   - Keyboard-only ring — mouse users never see it.

2. **Form controls** (inputs, SelectField trigger, search bar):
   - Focus matches hover — border color change only (`border-cream` → `border-ink-light`)
   - **No ring, no box-shadow, no outline.** This is deliberate.

### Key Implementation Rules
- **Always use `<SelectField>` component, never native `<select>`.**
- **Use TanStack Router `<Link>` not `<a>` for internal navigation.**
- **Use `whitespace-nowrap` for labels with dynamic content** (not fixed `w-*`).
- **Use `group` + `group-hover` pattern for row action buttons.**
- **Call `e.stopPropagation()` + `e.preventDefault()` on buttons inside `<Link>`.**
- **Use `useRouter().history.back()` for programmatic back navigation.**
- **Use `IntersectionObserver` with `rootMargin: '200px'` for infinite scroll.**
- **Never use hex colors in component code** — reference Tailwind token names only. CI enforces: `grep -rn '\[#' packages/web/src/client`.
- **Never use `focus:` pseudo-class** — use `focus-visible:` for keyboard-only focus ring.
- **Never use ring/box-shadow/outline on form controls** — border color change only.
- **Never mix `--tint` (cool blue-gray) with warm parchment backgrounds** — use warm sand tones.

## Custom Scrollbar

All scrollable areas use thin, warm-toned scrollbars:
- `scrollbar-width: thin`
- Thumb: `{colors.cream}` (`#d4d0c4`), 4-5px width, 2-3px border-radius
- Track: transparent
- Hover: `{colors.stone}` (`#595852`)
- Applied via `.kami-scrollbar` utility class or global `html` styles.

## Animations

| Name | Duration | Easing | Use |
|---|---|---|---|
| `fadeIn` | varies | ease | Opacity 0→1 + translateY(6px→0). Used for page transitions (250ms), dropdown panels (120ms), result content (300ms), modals (250ms). |
| `pulse-dot` | — | — | Opacity 1→0.3→1. Used for RunCat animation dots. |
| `shimmer` | — | — | TranslateX(-100% → 100%). Skeleton loading shimmer (reserved, not yet in use). |

## Known Gaps

- **Dark mode**: Not implemented. The warm palette is inherently light-mode. Audit will be needed before adding dark mode support.
- **Hover transition durations**: Not fully standardized. Some use 150ms, some use 100ms, some don't specify.
- **Skeleton loading states**: The shimmer animation is defined but not yet applied to any component skeletons. Currently using text-based "Loading..." strings.
- **Focus management for modals**: ConfirmDialog auto-focuses cancel button but does not trap focus within the dialog.
- **Toast notifications**: Not yet implemented. The design system has no toast component defined.
- **Print stylesheet**: Not implemented. The print-inspired aesthetic would benefit from dedicated `@media print` styles.
- **Full typographic scale**: The serif-only content rule means sans-serif doesn't have a content reading scale. If chat messages or AI responses ever need sans-serif (e.g., for a chat UI mode), new type tokens will be needed.
