# Document Uplift — UX Redesign Spec

**Date:** 2026-05-08  
**Status:** Approved (mockup reviewed by user)  
**Scope:** Frontend only — no backend API changes required

---

## Problem

The current `document-uplift.tsx` page dumps all pipeline stages onto a single scrollable view: case list, file upload, pipeline progress, suggestions review, and export outputs all coexist on screen simultaneously. This creates cognitive overload and makes it impossible to focus on a single stage.

---

## Solution Overview

Replace the single-page layout with two distinct routes and a tabbed case detail view:

| Route | Component | Purpose |
|---|---|---|
| `/document-uplift` | `DocumentUpliftPage` | Landing dashboard — case list + How It Works |
| `/document-uplift/:caseId` | `DocumentUpliftCasePage` | Case detail — tabbed workflow |

The case detail has four tabs that map directly to pipeline stages. Tabs are enabled/disabled based on the case's current `CaseStage`.

---

## Page 1 — Landing Dashboard (`/document-uplift`)

### Layout
Follows the standard TRACE page skeleton: hero section → main body.

### Hero
- Label: `DOCUMENT INTELLIGENCE`  
- H1: `Document Uplift`  
- Lede: existing description text  
- No CTA buttons in hero (kept minimal)

### Body Sections

**Section 1: How It Works** (collapsible, default open)  
- `slbl`: `PROCESS` / `stitle`: `How It Works`  
- 5 step cards in a `grid-cols-5` grid using the standard `StepCard` pattern  
- Steps: Create a Case (purple #7213EA) → Upload Documents (cobalt #1E49E2) → Run the Pipeline (pacific #00B8F5) → Review Suggestions (teal #098E7E) → Export (green #009A44)  
- Collapsed state persisted to `localStorage` key `apex_uplift_hiw_open`

**Section 2: Your Cases** (non-collapsible)  
- Section header with search input (right) and "New Case" primary button (purple)  
- Case list — one `CaseRow` card per case, sorted by `updated_at` desc  
- Each `CaseRow` shows: coloured left border (by status), icon, title, meta (domain · doc count · pending suggestion count · updated timestamp), status badge, "Open →" cobalt button, delete icon button  
- Left border colours: amber `#EAAA00` (review_ready), cobalt `#1E49E2` (converting/analyzing), green `#009A44` (complete), grey `#CAD7E8` (uploading/new)  
- Delete button → `DeleteCaseDialog` confirmation modal (case title, warning, Cancel / Delete Case)  
- "New Case" button → `CreateCaseDialog` modal

**CreateCaseDialog**  
Fields: Case Title (required), Process Name (optional), Domain / Notes (optional textarea)  
On submit: `POST /document-uplift/cases` → on success navigate to `/document-uplift/:caseId`

---

## Page 2 — Case Detail (`/document-uplift/:caseId`)

### Layout
Full-height flex column (no outer scroll). Top-to-bottom:
1. KPMG TRACE topnav (from `AppLayout`, no change)
2. Case sub-hero (dark gradient strip with case title, status badge, "← All Cases" back button)
3. Tab bar
4. Tab content panel (fills remaining height, each tab scrolls internally)

### Case Sub-Hero
- Background: `linear-gradient(135deg, #0C233C, #1a3660)`
- Left: case title (white, 18px bold) + status badge + meta row (domain · doc count · created date)
- Right: "← All Cases" ghost button navigates to `/document-uplift`

### Tab Bar

| Tab | ID | Unlock condition |
|---|---|---|
| Documents | `docs` | Always unlocked |
| Processing | `proc` | Always unlocked |
| Review Suggestions | `review` | stage ≥ `review_ready` |
| Export | `export` | Manually unlocked after user confirms "Move to Export" |

Locked tabs render with `#CAD7E8` text and a lock icon; clicking them does nothing.  
"Review Suggestions" tab shows a count badge (`tab-count`) with pending suggestions when stage = `review_ready`.

Back navigation: "← All Cases" button in sub-hero navigates to `/document-uplift`. The tab bar does NOT include a back link.

---

## Tab 1 — Documents

**Left column: Uploaded Documents**  
- List of `DocumentTagRow` cards: file icon (colour by type), filename, file size, tag badge, conversion status badge  
- Drop zone below list for additional uploads (dashed border, drag-and-drop + click-to-browse)  
- Uploading adds rows with a spinner conversion status

**Right column: Configuration & Pipeline**  
- Tag selector: pill buttons for each `DocumentTag` value (Procedure SOP, RCM / Controls, Policy, Risk Register, Evidence) — clicking assigns the selected tag to newly uploaded files  
- Pipeline status card: shows current stage summary and a "Go to Review →" button when `review_ready`  
- Re-run panel: "Re-run Pipeline on All Docs" secondary button triggers `POST /document-uplift/cases/:id/run`; navigates to Processing tab

---

## Tab 2 — Processing

- Section header: `PIPELINE` / `Processing Status`  
- Subtitle: completion timestamp or "Running…" if in progress  
- Three stage rows (Document Conversion, Corpus Analysis, Suggestion Generation) each showing: coloured icon, title, detail text, status badge  
- Status: green ✓ Done, cobalt spinner + progress for in-progress, grey for not started  
- Live SSE updates via existing `/document-uplift/cases/:id/progress` endpoint (re-uses existing SSE hook)  
- "Review Suggestions →" primary button appears when stage = `review_ready`

---

## Tab 3 — Review Suggestions

### Toolbar (fixed, above split)
- Left: suggestion count + document count summary  
- Middle: "Accept All" (green), "Reject All" (red), filter-by-document select, filter-by-severity select  
- Right: "Move to Export →" purple button

**Move to Export button behaviour:**  
Opens `MoveToExportDialog`. Dialog shows count of still-pending suggestions. Two actions: "Go Back and Review" (closes dialog) / "Continue to Export →" (closes dialog, unlocks Export tab, navigates to it).

### Split Layout (fills remaining height)
`grid-cols-[1fr_300px]`, each column scrolls independently.

**Left — Document Viewer**  
- Document selector dropdown at top (lists all uploaded docs by filename)  
- Suggestion count for selected doc shown as metadata text  
- Document rendered as styled HTML (preserves headings, paragraphs, lists — no actual Word rendering, re-use existing content from API)  
- Anchor spans highlighted in `#FFF3CD` / amber underline for suggestions referencing that text span  
- Active highlight: `#FFE69C` / purple underline  
- Clicking a highlight activates the corresponding suggestion card in the right pane (and vice versa)

**Right — Suggestion Pane**  
- Section label: `SUGGESTIONS (N)`  
- One `SuggestionCard` per suggestion in the selected document  
- Card states: default, active (purple border + ring), accepted (green tint), rejected (red tint + reduced opacity)  
- Card content: severity badge (HIGH/MEDIUM/LOW/CRITICAL in correct brand colours), title, proposed text, source reference line  
- Per-card: Accept ✓ (green) and Reject ✕ (red) buttons  
- Accepting/rejecting calls `PATCH /document-uplift/cases/:id/suggestions/:sugId`  
- Accepted/rejected cards remain visible but lose their action buttons

---

## Tab 4 — Export

- Success banner: green gradient, checkmark, "Uplift Complete", accepted suggestion count  
- Section header: `DOWNLOADS` / `Export Files`  
- One `OutputCard` per output file: file type icon, filename, file size/metadata, "Download" primary button  
- "Download All as ZIP" secondary button  
- Downloads call existing `/document-uplift/cases/:id/outputs/:outputId/download`

---

## Routing

Two new routes added to `PAGES` array in `App.tsx`:

```
{ path: "/document-uplift", component: DocumentUpliftPage }
{ path: "/document-uplift/:caseId", component: DocumentUpliftCasePage }
```

The existing `/document-uplift` entry (current monolithic page) is replaced. `AppLayout.tsx` sidebar entry stays the same path.

Navigation uses `wouter` `useLocation` throughout. No React Router.

---

## State Management

**Landing page:**  
- Cases list: `useQuery` → `GET /document-uplift/cases`  
- How It Works open/closed: `localStorage` key `apex_uplift_hiw_open`

**Case detail:**  
- Case data: `useQuery` → `GET /document-uplift/cases/:caseId`  
- Active tab: local `useState` (not persisted — tabs reopen on Review by default when `review_ready`)  
- Export tab unlocked: local `useState` `exportUnlocked` (set true when user confirms MoveToExportDialog)  
- Selected document in viewer: local `useState`  
- Active suggestion: local `useState`  
- SSE pipeline progress: re-use existing `sseConnected` / `sseProgress` pattern from current page

---

## Component Breakdown

All new components are page-local (inline at top of file) unless noted:

| Component | File | Notes |
|---|---|---|
| `CaseRow` | inline `DocumentUpliftPage` | Case list row |
| `DeleteCaseDialog` | inline `DocumentUpliftPage` | shadcn Dialog |
| `CreateCaseDialog` | inline `DocumentUpliftPage` | shadcn Dialog |
| `StepCard` | inline `DocumentUpliftPage` | How It Works step |
| `CaseSubHero` | inline `DocumentUpliftCasePage` | Dark gradient strip |
| `DocumentTagRow` | inline, tab component | Uploaded doc row |
| `SuggestionCard` | inline, tab component | Suggestion in pane |
| `OutputCard` | inline, tab component | Export download row |

---

## Files to Create / Modify

| Action | File |
|---|---|
| **Create** | `kpmg_ui/client/src/pages/document-uplift.tsx` (replaces current) |
| **Create** | `kpmg_ui/client/src/pages/document-uplift-case.tsx` |
| **Modify** | `kpmg_ui/client/src/App.tsx` — add new route, remove old |

The existing `document-uplift.tsx` is replaced entirely. All types, interfaces, and API call patterns are preserved and migrated into the two new files.

---

## What Does NOT Change

- All FastAPI backend endpoints (`/document-uplift/*`) — zero backend changes  
- The SSE pipeline progress endpoint  
- Existing TypeScript interfaces (`DocumentUpliftCase`, `Suggestion`, `OutputItem`, etc.)  
- The sidebar nav entry in `AppLayout.tsx` (path stays `/document-uplift`)  
- Existing test files — new tests will be added alongside existing ones

---

## Non-Goals

- Native Word/PDF rendering (document content rendered as styled HTML, not embedded viewer)  
- Inline text editing of the document in the viewer pane  
- Multi-case comparison  
- Real-time collaboration
