# TRACE UI Design System — KPMG Enterprise SaaS

**Date:** 2026-05-25  
**Scope:** Frontend-only. Zero changes to backend routes, API contracts, data models, or business logic.  
**Stack:** React + TypeScript + Tailwind CSS + shadcn/ui + Lucide icons + Recharts  
**Reference mockup:** `.superpowers/brainstorm/1916-1779711650/content/trace-v3-proper.html`

---

## 1. Design Principles

1. **Typography does the work.** No decorative gradients on data surfaces. Weight, size, and spacing create hierarchy.
2. **Color is functional.** Navy for primary actions and active state. Status colors (green/amber/red) only when they carry meaning. Never decorative.
3. **Borders over shadows.** Panels use `1px solid var(--border)`. The only shadow is on the outermost shell and modals.
4. **Icons are precise.** Lucide SVG, 15–16px, `stroke-width="1.75"`, no fill. Never emoji, never font icons.
5. **Every screen earns its whitespace.** Padding is on a 4px grid. No arbitrary gaps.
6. **Gradients: one place only.** The primary button gets a subtle inset gradient for depth. Nothing else.

---

## 2. Design Tokens

All tokens live in `kpmg_ui/client/src/index.css` as CSS custom properties.

### 2.1 Color Palette

```css
/* ── KPMG Brand ──────────────────────── */
--kpmg-navy:    #00338D;   /* Primary actions, active sidebar */
--kpmg-cobalt:  #1E49E2;   /* Links, focus rings, interactive */
--kpmg-pacific: #00B8F5;   /* Logo accent, progress highlights */

/* ── Semantic ────────────────────────── */
--color-success: #059669;
--color-warning: #D97706;
--color-danger:  #DC2626;
--color-info:    #1E49E2;
--color-purple:  #7C3AED;  /* Escalation, special category */

/* ── Surfaces ────────────────────────── */
--background:  220 28% 95%;   /* #F1F5FB — page bg */
--card:        0 0% 100%;     /* #FFFFFF — panel/card bg */
--border:      214 25% 88%;   /* #E2E8F3 — standard border */
--border-2:    214 25% 93%;   /* #EEF2F8 — row dividers, subtle */

/* ── Sidebar ─────────────────────────── */
--sidebar:              218 52% 11%;   /* #0B1526 */
--sidebar-border:       rgba(255,255,255,0.04);
--sidebar-foreground:   210 45% 78%;   /* #A8C0DC */
--sidebar-muted:        213 30% 38%;   /* #3D5570 */
--sidebar-icon:         210 35% 52%;   /* #5C7A9A */
--sidebar-active-bg:    rgba(0,51,141,0.22);
--sidebar-active-border:#1E49E2;
--sidebar-hover:        rgba(255,255,255,0.055);

/* ── Text ────────────────────────────── */
--foreground:          215 50% 12%;   /* #0F1C2E */
--foreground-2:        214 30% 32%;   /* #3D5066 */
--muted-foreground:    214 22% 53%;   /* #7085A0 */
--disabled-foreground: 214 22% 68%;   /* #A8BBCE */
```

### 2.2 Typography

Font: **Inter** (already loaded). Use `font-feature-settings: "cv02","cv03","cv04","cv11"` for tabular numerals in tables.

| Role | Size | Weight | Tracking | Usage |
|---|---|---|---|---|
| Page Title | 24px | 800 | −0.025em | `<h1>` on every page |
| Section Heading | 18px | 700 | −0.02em | Major sections |
| Panel Title | 14.5px | 700 | 0 | Panel/card headers |
| Topbar Title | 14.5px | 700 | −0.01em | Topbar left |
| Body | 13px | 400 | 0 | All flowing text |
| Cell Primary | 12px | 600 | 0 | Bold table cells |
| Cell Secondary | 12px | 400 | 0 | Muted table cells |
| Caption/Meta | 11px | 500 | 0 | Timestamps, counts |
| Column Header | 10.5px | 700 | +0.07em | Table `<th>`, UPPERCASE |
| Micro Label | 9.5px | 700 | +0.12em | Sidebar group labels, UPPERCASE |

### 2.3 Spacing System (4px base grid)

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | Tight gaps, icon margins |
| `space-2` | 8px | Compact items |
| `space-3` | 12px | Default gap |
| `space-4` | 16px | Card/panel padding |
| `space-5` | 20px | Page content padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Large separations |

### 2.4 Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 6px | Tags, micro elements |
| `rounded` | 8px | Buttons, inputs, icon containers |
| `rounded-md` | 10px | Panels, cards |
| `rounded-lg` | 12px | KPI cards |
| `rounded-xl` | 14px | Shell/outer containers |
| `rounded-full` | 999px | Status pills |

### 2.5 Shadows

```css
/* Only use these three. Nothing else. */
--shadow-sm:  0 1px 3px rgba(11,21,38,0.06), 0 1px 2px rgba(11,21,38,0.04);
--shadow:     0 4px 16px rgba(11,21,38,0.08), 0 1px 4px rgba(11,21,38,0.04);
--shadow-lg:  0 8px 40px rgba(11,21,38,0.14), 0 1px 4px rgba(11,21,38,0.08);
```

- **Panels/cards:** border only, no shadow
- **Dropdowns/popovers:** `--shadow`
- **Modals/dialogs:** `--shadow-lg`
- **Shell container:** `--shadow-lg` (applied once to the outermost shell div)

---

## 3. App Shell

### 3.1 `AppLayout.tsx`

```
┌──────────────────────────────────────────────────┐
│  Sidebar (232px expanded / 68px collapsed)        │  Main area
│  ┌──────────────────────────────────────────────┐ │  ┌─────────────────────────────────────────┐
│  │  Logo bar (52px)                             │ │  │  Topbar (52px)                          │
│  ├──────────────────────────────────────────────┤ │  ├─────────────────────────────────────────┤
│  │  Nav groups (scroll)                         │ │  │  Page content area (flex-1, scroll)     │
│  │   · Group label (9.5px/700/uppercase)        │ │  │                                         │
│  │   · Nav item (34px tall)                     │ │  │                                         │
│  ├──────────────────────────────────────────────┤ │  └─────────────────────────────────────────┘
│  │  User footer (48px)                          │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**Sidebar nav item states:**
- Default: `text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)]`
- Active: `bg-[var(--sidebar-active-bg)] text-white` + `3px left border in cobalt` + icon in pacific
- Disabled/coming-soon: `opacity-40 cursor-not-allowed`

**Nav group structure** (consolidated from current 15 flat items):

| Group | Pages |
|---|---|
| Overview | Dashboard, Asset Registry |
| Libraries | Regulatory Library, Controls Library, Frameworks Library |
| Testing | Control Testing, Controls Assurance (NEW), Risk Assessment, Regulatory Testing |
| Operations | Issue Management (with red count badge), Reports, AI Chat |
| _(footer)_ | Settings (gear icon, no label), User avatar+name+role |

**Topbar (52px, white, border-bottom):**
- Left: Page title (14.5px/700) + subtitle line (11px/500, muted) — both come from each page's metadata
- Right: search box (if applicable), icon buttons (bell with dot, overflow menu), primary CTA button

**Collapsed sidebar (68px):**
- Icons only, 34px tall items, centered
- Tooltip on hover (shadcn `<Tooltip>`)
- Logo collapses to KPMG mark only

### 3.2 Removing `HeroSection.tsx`

`HeroSection.tsx` is the full-width gradient banner currently used on most pages. **Replace it entirely.** The new pattern is:

```tsx
// Page header — inside the scrollable content area, not as a separate banner
<div className="page-header">
  <div>
    <h1>Controls Library</h1>
    <p>348 controls · NIST CSF 2.0, ISO 27001, SOX</p>
  </div>
  <div className="page-header-actions">
    <Button variant="outline" size="sm">Export</Button>
    <Button size="sm">+ Add Control</Button>
  </div>
</div>
```

No gradient, no decorative panel. The page title lives inside `<main>`, not in a fixed hero bar.

---

## 4. Page Templates

Every page in TRACE fits one of five templates. Pick the right template and apply it consistently.

### Template A — List Page

Used by: Controls Library, Regulatory Library, Frameworks Library, Asset Registry, Issue Management, Reports

```
[Page header: title + subtitle + actions]
[Filter bar: search · filter chips · sort · export]
[Full-width table]
  [thead: checkbox · columns with sort indicators]
  [tbody: rows with hover state, row-level actions (⋯) appearing on hover]
[Pagination footer: "Showing X–Y of Z" + page buttons]
```

**Table rules:**
- Row height: 44px (`py-2.5`)
- Checkbox column: 40px wide
- `<th>` background: `hsl(var(--muted)/0.3)`, 1px bottom border
- Row hover: `bg-blue-50/60` (`#F0F5FF`)
- Row-level actions: appear on `tr:hover` as a `<div>` absolutely positioned right, containing icon buttons
- Sortable headers: show `↕` icon (muted) by default; `↑`/`↓` when active (navy)
- Empty state: centred illustration-free message with a single CTA (see §6.6)
- **Never zebra stripe.** Hover state is sufficient.

### Template B — Detail / View Page

Used by: Controls Assurance Detail, Evidence Assessment, Document Uplift Case, Control 360

```
[Breadcrumb: Home / Section / Item name]
[Page header: item title + status pill + actions]
[Two-column layout: main content (flex:1) + sidebar panel (320px)]
  Main: sections with Panel containers
  Sidebar: metadata, status, related items
```

### Template C — Wizard / Step Flow

Used by: Controls Assurance New, Risk Assessment (questionnaire), Regulatory Testing

```
[Step indicator: horizontal steps at top of content, not in topbar]
[Step content: centred card, max-width 720px]
[Footer: Back · Next/Submit — sticky bottom of card]
```

Step indicator: numbered circles (32px) connected by lines. Completed = filled navy. Active = ring in navy. Upcoming = grey.

### Template D — Dashboard / Analytics

Used by: Dashboard, Risk Controls Coverage, Regulation Controls Coverage, Controls Diagnostics, Control Quality Analysis

```
[Page header: title + date range selector + refresh button]
[KPI strip: 3–5 cards]
[Chart/analysis section: grid of panels]
```

Chart panels: white card, panel header (title + legend + download icon), chart body (Recharts, see §6.5).

### Template E — Standalone / Auth

Used by: Login, Landing (feature index), Not Found

No sidebar. Full-viewport centred layout. Use `TraceStandalonePage.tsx` shell.

---

## 5. Core Components

### 5.1 Buttons

Four variants, two sizes. **No custom CSS — use shadcn Button with class overrides.**

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `default` (primary) | `#00338D` | white | — | One per screen, primary CTA |
| `outline` (secondary) | white | `foreground-2` | `border` | Secondary actions |
| `ghost` | transparent | `muted-foreground` | transparent | Tertiary, table row actions |
| `destructive` | `red/8%` | red | `red/18%` | Delete, remove |

Sizes: `default` (32px h, 14px px), `sm` (28px h, 10px px).  
Shape: `rounded` (8px).  
Primary button: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,51,141,0.3)` — the only intentional shadow on a button.

### 5.2 Inputs & Form Controls

```
height: 34px
border: 1px solid hsl(var(--border))
border-radius: 8px
padding: 0 12px
font-size: 13px

:focus → border-color: var(--kpmg-cobalt), box-shadow: 0 0 0 3px rgba(30,73,226,0.11)
:error → border-color: var(--color-danger), box-shadow: 0 0 0 3px rgba(220,38,38,0.09)
```

Labels: 12px/600, color `foreground-2`, `mb-1.5`.  
Helper text / error message: 11.5px/500, `mt-1`.  
Select: same sizing as input. Use shadcn `<Select>`.  
Textarea: `min-h-[80px]`, `resize-y`.  
Checkbox: 14px, 3px radius, navy fill when checked.

### 5.3 Status Pills (Badges)

Rounded-full, 11px/600, inline-flex with 5px dot.

| Name | Background | Text | Dot |
|---|---|---|---|
| Passed / Active | `green/10%` | `#065F46` | `#059669` |
| Failed / Error | `red/9%` | `#991B1B` | `#DC2626` |
| In Review / Warning | `amber/10%` | `#92400E` | `#D97706` |
| Pending / Info | `cobalt/8%` | `#1E40AF` | `#1E49E2` |
| Escalated | `purple/9%` | `#5B21B6` | `#7C3AED` |
| NEW (label) | `#1E49E2` | white | — |

**Never use a filled background for KPI cards or section headers.** Pills are inline only, inside table cells, detail panels, or the topbar subtitle.

### 5.4 KPI Cards

White card, `rounded-lg` (12px), `border`, `p-4`. A **3px top border accent** in the relevant semantic color is the only color on the card.

```tsx
<div className="kpi-card kpi-card--blue">
  <p className="kpi-label">Controls Tested</p>
  <p className="kpi-value">142</p>
  <div className="kpi-meta">
    <span className="trend trend--up">↑ 12</span>
    <span className="kpi-context">this week</span>
  </div>
</div>
```

`kpi-value`: 27px/800/−0.03em tracking.  
`kpi-label`: 10.5px/700/uppercase/0.07em.  
`kpi-meta trend`: 11px/600, pill with 10% tinted background.  
No sparklines unless the page is specifically analytics (Dashboard, Controls Diagnostics).

### 5.5 Panels

```tsx
<div className="panel">
  <div className="panel-header">
    <span className="panel-title">Title</span>
    <span className="panel-count">12</span>       {/* optional */}
    <div className="panel-actions ml-auto">…</div>
  </div>
  <div className="panel-body">…</div>             {/* or panel-table for tables */}
  <div className="panel-footer">…</div>           {/* optional — pagination, summaries */}
</div>
```

`panel`: `bg-card border border-border rounded-[10px] overflow-hidden`.  
`panel-header`: `flex items-center gap-2 px-4 py-3 border-b border-border/60`.  
`panel-title`: `text-[13px] font-semibold text-foreground`.  
`panel-count`: `text-[10.5px] font-semibold bg-muted/50 border border-border rounded-full px-2 py-0.5 text-muted-foreground`.

### 5.6 Modals & Dialogs

Use shadcn `<Dialog>`. Override:

```
max-width: 560px (default), 720px (wide/form), 900px (review/evidence)
border-radius: 14px
box-shadow: --shadow-lg
padding: 24px
overlay: rgba(11,21,38,0.45) backdrop-blur-sm
```

**Dialog anatomy:**
1. Header: title (18px/700) + optional subtitle + X close button (top-right)
2. Divider (1px border)
3. Body: scrollable if content exceeds 60vh
4. Footer: sticky bottom, right-aligned, `gap-2` — Ghost cancel + Primary confirm

**Destructive confirm dialogs:** Red primary button. Body explains what will be deleted. Never skip the confirmation step.

### 5.7 Drawers / Slide-Over Panels

Use shadcn `<Sheet>` with `side="right"`. Override:

```
width: 480px (detail), 640px (form/evidence review)
border-left: 1px solid var(--border)
box-shadow: --shadow-lg
```

Drawer header: same as dialog header, but with a breadcrumb trail instead of close X.  
Used for: viewing a control detail without leaving the list, reviewing evidence inline, editing session metadata.

### 5.8 Dropdowns & Command Palettes

Dropdowns: shadcn `<DropdownMenu>`. `rounded-[10px]`, `shadow`, `border`, `p-1`. Items: 32px tall, 12px text, `rounded` on hover.

Command palette (⌘K): shadcn `<Command>` inside a `<Dialog>`. Trigger: `Cmd+K` / `Ctrl+K`. Searches controls, sessions, pages. Not a new feature — just expose the existing navigation in a palette UI.

### 5.9 Tooltips

shadcn `<Tooltip>`, `delayDuration={0}`. `rounded-[7px]`, `text-[11.5px]`, max-width 220px. Used for:
- Collapsed sidebar nav items
- Icon buttons with no text label
- Truncated cell content

### 5.10 Tabs & Segmented Controls

For page-level tab switching (e.g., dashboard has "Overview / Libraries / Workflows"):

```tsx
// Tab bar lives inside the content area, below the page header
<div className="tab-bar">
  <button className="tab active">Overview</button>
  <button className="tab">Libraries</button>
  <button className="tab">Workflows</button>
</div>
```

`tab-bar`: `flex border-b border-border gap-0 mb-4`.  
`tab`: `px-4 py-2.5 text-[13px] font-medium text-muted-foreground border-b-2 border-transparent -mb-px`.  
`tab.active`: `text-foreground border-b-2 border-[var(--kpmg-navy)]`.

Do **not** use shadcn `<Tabs>` for this — the default variant doesn't match.

### 5.11 Filter Bars

Standard pattern above any list:

```
[Search input 220px] [Filter button] [Active filter chips…] [spacer] [Sort] [Export] [Column toggle]
```

Filter chip: `rounded-full`, tinted bg matching the filter type, `text-[11.5px]/600`, with an `×` dismiss.  
"Clear all" link: `text-[11.5px]/600 text-cobalt`, only appears when ≥1 filter is active.  
Result count: `text-[11.5px] text-muted-foreground ml-auto` — "Showing 1–12 of 156".

---

## 6. Specialised Patterns

### 6.1 Charts (Recharts)

**Existing `chartTheme.ts`** defines axis/tooltip styles. Update to match new tokens:

```ts
// AXIS_STYLE
{ fill: '#7085A0', fontSize: 11, fontWeight: 500 }

// GRID_STYLE  
{ stroke: '#E2E8F3', strokeDasharray: '3 3' }

// CHART_TOOLTIP_STYLE
{ background: '#fff', border: '1px solid #E2E8F3', borderRadius: 8,
  boxShadow: '0 4px 16px rgba(11,21,38,0.10)', padding: '8px 12px' }

// CHART_TOOLTIP_LABEL_STYLE
{ color: '#0F1C2E', fontSize: 12, fontWeight: 700 }

// CHART_TOOLTIP_ITEM_STYLE
{ color: '#3D5066', fontSize: 12 }
```

**Color series for charts** (use in order, never red/green for non-semantic data):
1. `#00338D` (Navy)
2. `#1E49E2` (Cobalt)
3. `#00B8F5` (Pacific)
4. `#7C3AED` (Purple)
5. `#D97706` (Amber — only if 5th series needed)

**Bar charts:** `barSize={24}`, `radius={[4,4,0,0]}`, gridlines horizontal only.  
**Pie/Donut charts:** `innerRadius="60%"` for donut. Center label with total count.  
**Line charts:** `strokeWidth={2}`, dots hidden by default, shown on hover.  
**All charts:** `<ResponsiveContainer width="100%" height={220}>` inside a Panel body.

### 6.2 Progress Indicators

**Inline progress bar** (in table cells, cards):
- Track: `h-1 bg-border rounded-full w-[72px]`
- Fill: navy for normal, semantic color when value is below threshold

**Circular progress** (quality scores, coverage %):
- Use a simple SVG ring, not a third-party lib
- Size: 40px default, 56px for dashboard hero
- Stroke: 3px, `navy` fill, `border` track

**Step progress** (wizards): See Template C.

### 6.3 Empty States

Every table and list must have an empty state. Two types:

**No data (first time):**
```
[Lucide icon, 40px, muted-foreground/30%]
[Heading: "No controls yet" — 14px/600]
[Body: one sentence explaining what this section does — 12.5px, muted]
[CTA button: primary action to create first item]
```

**No search results:**
```
[Lucide Search icon, 32px, muted]
[Heading: "No results for '{query}'"]
[Body: "Try adjusting your filters or search term."]
[Link: "Clear filters"]
```

No illustrations or SVG blobs. Keep it text and icon.

### 6.4 Loading States

**Table skeleton:** Replace `tbody` rows with 6 skeleton rows. Each cell: a `rounded` div with `animate-pulse bg-muted/40`, width randomised between 60–90%.

**Full-page loading:** A centred `<Loader2 className="animate-spin" size={24} />` in `text-muted-foreground`. No spinner overlays on the entire viewport.

**Button loading:** Replace button text with `<Loader2 className="animate-spin" size={14} />` + "Loading…". Disable the button.

**Never** use a full-page spinner that blocks the sidebar.

### 6.5 Notifications & Toasts

Use shadcn `<Sonner>` (toast). Positioned bottom-right.

| Type | Icon | Style |
|---|---|---|
| Success | `<CheckCircle2>` | green left border |
| Error | `<XCircle>` | red left border |
| Warning | `<AlertTriangle>` | amber left border |
| Info | `<Info>` | cobalt left border |

Toast anatomy: icon + title (13px/600) + optional description (12px/400). Auto-dismiss 4s. Max 3 visible.

### 6.6 Forms (multi-field)

Long forms (e.g., Settings, New Session, Asset creation):

- Two-column grid for short fields (name, ID, type), full-width for long fields (description, notes)
- Section headers (`<h3>` 15px/700) to group related fields, with a `<hr>` separator
- Sticky footer with Save/Cancel when form is long
- Field validation: show error message inline below the field, never in a modal
- Required fields: asterisk in `text-danger` next to label — not in the placeholder

---

## 7. Page-by-Page Guidance

### 7.1 `landing.tsx` (Template E)

Current: full-page feature card grid with accordion.  
New: Clean feature index — centered logo + tagline, three-column feature cards (icon + title + one-line description), no accordion. Cards are white on the cool-grey BG. Primary CTA "Enter Dashboard" in navbar top-right.

### 7.2 `login.tsx` (Template E)

Current state unknown. Target:
- Split layout: left panel (navy gradient with KPMG|TRACE branding, tagline, version tag), right panel (white, centered form)
- Form: email + password + "Remember me" + Sign in button
- No social login (internal tool)

### 7.3 `dashboard.tsx` (Template D)

- Remove `HeroSection`
- Page header: "Dashboard" + `FY 2026 Q2 · Updated X ago` + Refresh button
- Tab bar: Overview / Libraries / Workflows / Exceptions (existing `DashboardTab`)
- KPI strip: 4 cards (Controls Tested, Pass Rate, Pending Review, Open Exceptions)
- Two-column grid: sessions table (left) + activity feed (right, 292px)
- Charts tab ("Workflows"): bar charts in panels, using updated `chartTheme`

### 7.4 `asset-registry.tsx` (Template A)

List page. Table columns: checkbox, Asset ID, Name, CIA Total, Criticality band (pill), Owner, Last Updated, ⋯.  
Filter by: Criticality (Low/Medium/High/Critical), CIA dimension, Owner.

### 7.5 `regulatory-library.tsx` (Template A)

Table: checkbox, Regulation ID, Title, Jurisdiction, Obligations count, Framework, Status, ⋯.  
Upload area: replace current drag-zone with a compact secondary button "Upload Document" that opens a drawer with the drag-drop zone inside.

### 7.6 `controls-library.tsx` (Template A)

Table: checkbox, Control ID (monospace), Name, Domain (category pill), Framework, Quality score (inline progress + fraction), Status, ⋯.  
Quality filter: chip buttons "All / Red / Amber / Green" (5W1H bands).

### 7.7 `frameworks-library.tsx` (Template A)

Table: checkbox, Framework, Version, Elements count, Coverage %, Status, ⋯.

### 7.8 `control-testing.tsx` (Template A + B hybrid)

List view: sessions table. Click row → slide-over drawer with session detail.  
Session detail drawer (640px): session metadata header + controls sub-table + evidence links + generate report button.  
Uses legacy `/audit/*` endpoints — do not change API calls.

### 7.9 `controls-assurance.tsx` (Template A)

New feature. Table: checkbox, Case ID, Control ref, Assurance level, Assigned to (avatar), Status, Created, ⋯.  
"NEW" badge in sidebar item.

### 7.10 `controls-assurance-new.tsx` (Template C — Wizard)

Multi-step form. Steps: Select Control → Upload Evidence → Configure → Review → Submit.  
Step indicator at top. Each step in a centred card (max-w-[720px]).

### 7.11 `controls-assurance-detail.tsx` (Template B)

Breadcrumb: Controls Assurance / Case CA-042.  
Main: evidence viewer (full-height panel) + analysis results.  
Sidebar: case metadata, status, assigned auditor, linked control.

### 7.12 `risk-assessment.tsx` (Template C for active session, Template A for list)

- List view: sessions table with status
- Active session: step-based questionnaire. One question per card. Section progress bar at top. Compact "X of N" counter. Navigation: Previous / Next / Save & Exit.

### 7.13 `regulatory-testing.tsx` (Template A + step flow)

Similar to control-testing. List of test runs + inline detail.

### 7.14 `issue-management.tsx` (Template A)

Table: checkbox, Issue ID, Title, Severity pill (Critical/High/Medium/Low), Status, Owner (avatar), Due Date, ⋯.  
Filter by severity and status. Red count badge on sidebar item.

### 7.15 `reports.tsx` (Template A)

Table: checkbox, Report Name, Type, Generated by (avatar), Date, Format (PDF/MD), ⋯.  
Download button on each row. Bulk download via selected checkboxes.

### 7.16 `chat.tsx` (standalone with sidebar)

Full-height chat layout. Left sidebar (thread list, 240px) + main chat area (flex-1).  
Bubbles: user right-aligned (navy bg), assistant left-aligned (white card with border).  
Input bar: sticky bottom, textarea + send button.

### 7.17 `settings.tsx` (Template B layout, form body)

Three-column nav (left 200px) + form content (flex-1) + preview/help panel (right 260px, optional).  
Sections: LLM Provider, Model Selection, API Keys, Navigation Visibility, About.  
Each section is a Panel with a panel-header and a form body.

### 7.18 `evidence-assessment.tsx` (Template B)

Wide two-column: document viewer left (flex-1) + assessment panel right (360px).  
Assessment panel: structured output in white panels, status pills, approve/reject actions.

### 7.19 `control-360.tsx` (Template B)

360 view of a single control. Main: coverage chart + testing history timeline. Sidebar: control metadata + linked obligations + issues.

### 7.20 `exception-management.tsx` (Template A)

Same as issue-management. Table-centric. Severity bands.

### 7.21 `risk-controls-coverage.tsx` (Template D)

Analytics page. KPI strip + heat-map or matrix chart + detail table below.

### 7.22 `regulation-controls-coverage.tsx` (Template D)

Similar to above. Coverage matrix: regulations (rows) × controls (cols) with colour-coded cells.

### 7.23 `controls-diagnostics.tsx` (Template D)

Analytics + table hybrid. Diagnostics panels with bar charts + flagged controls list.

### 7.24 `control-quality-analysis.tsx` (Template D)

5W1H scoring visualisation. Radar/spider chart per control + table of all scores.

### 7.25 `sop-uplift.tsx` (Template B, legacy — maintain for now)

Document upload + uplift results viewer. Mark as legacy in sidebar tooltip. No structural change required beyond applying the shell and component styles.

### 7.26 `document-uplift.tsx` (Template C — Wizard)

Upload → Configure → Preview → Download. Step wizard. 3 steps.

### 7.27 `document-uplift-case.tsx` (Template B)

Detail view of an uplift case. Document diff viewer + side panel.

### 7.28 `not-found.tsx` (Template E)

Centred: large "404", one-line message, "Back to Dashboard" primary button.

---

## 8. Component File Changes (No Backend Impact)

| File | Change |
|---|---|
| `index.css` | Replace all CSS variables with new token set |
| `kpmg-brand-override.css` | Can be deleted — tokens replace it |
| `AppLayout.tsx` | Rebuild sidebar with grouped nav, 34px items, SVG icons, user footer |
| `HeroSection.tsx` | Delete. Replace with inline page-header pattern at each usage site |
| `TracePageBody.tsx` | Remove HeroSection wrapper. Expose `pageTitle`, `pageSubtitle`, `pageActions` props |
| `TraceStandalonePage.tsx` | Apply new surface/shadow tokens |
| `TraceNavBar.tsx` | Assess if still used — may be replaced by AppLayout topbar |
| `KpiCard.tsx` | Rebuild with 3px top-border accent pattern, no gradient fill |
| `ControlTestingKpis.tsx` | Uses KpiCard — update automatically |
| `Footer.tsx` | Slim down: just version + copyright. 40px height. |
| `chartTheme.ts` | Update all constants to new token values |
| `TraceAnalysisPrimitives.tsx` | Apply panel/pill/typography tokens |

---

## 9. What NOT to Change

- All API calls, route handlers, fetch hooks — untouched
- `useControlTesting`, `useRiskAssessment`, and all other custom hooks — untouched
- MongoDB collection access, `ct_models.py`, pipeline stages — untouched
- FastAPI router logic — untouched
- Test files — untouched (unless a component prop signature changes, requiring test fixture updates only)
- Authentication flow logic — untouched (only login page visual changes)

---

## 10. Tailwind Config

Add to `tailwind.config.ts`:

```ts
extend: {
  colors: {
    'kpmg-navy':    '#00338D',
    'kpmg-cobalt':  '#1E49E2',
    'kpmg-pacific': '#00B8F5',
  },
  fontFamily: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  },
  fontSize: {
    '2xs': ['10px', { lineHeight: '14px' }],
    'xs':  ['11px', { lineHeight: '16px' }],
    'sm':  ['12px', { lineHeight: '18px' }],
    'base':['13px', { lineHeight: '20px' }],
    'md':  ['14.5px', { lineHeight: '22px' }],
    'lg':  ['16px', { lineHeight: '24px' }],
    'xl':  ['18px', { lineHeight: '26px' }],
    '2xl': ['24px', { lineHeight: '30px' }],
  },
}
```

---

## 11. Implementation Order

Recommended build sequence to avoid breaking the app mid-way:

1. **Tokens** — update `index.css` CSS variables. Visual shift everywhere, but nothing broken.
2. **Shell** — rebuild `AppLayout.tsx`. Every page now has the new sidebar + topbar.
3. **Shared components** — `KpiCard`, `TracePageBody`, `chartTheme`. Fixes the most visible pages.
4. **Delete `HeroSection`** — replace at each call site. ~12 pages affected.
5. **List pages** (Template A) — `controls-library`, `regulatory-library`, `asset-registry`, `issue-management`, `reports`. These are the most used.
6. **Dashboard** — template D with tabs, KPI strip, activity feed.
7. **Detail/wizard pages** — templates B and C.
8. **Analytics pages** — template D variant.
9. **Standalone pages** — login, landing, not-found.
10. **Polish pass** — empty states, loading skeletons, toast styles, focus rings.

---

## 12. Out of Scope (This Pass)

- **Dark mode** — `ThemeProvider.tsx` and the `.dark {}` block in `index.css` exist today. This pass targets light mode only. Dark mode tokens can be updated in a follow-on pass once light mode is stable. Do not remove `ThemeProvider.tsx`.
- **`font-mockup.tsx`** — developer reference page, not a user-facing route. Skip entirely.
- **Mobile / responsive layouts** — TRACE is a desktop-first internal tool. No breakpoint work required.
- **Animation / micro-interactions** — `transition-colors`, `transition-background` on hover states only. No keyframe animations added in this pass.
- **New features** — no new routes, no new API calls, no new data. Visual layer only.
