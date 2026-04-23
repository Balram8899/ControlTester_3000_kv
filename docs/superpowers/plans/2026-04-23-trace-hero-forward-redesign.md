# TRACE Hero-Forward Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll the approved hero-forward TRACE redesign across the existing UI using shared shell, hero, spacing, and surface updates without changing workflows or data flow.

**Architecture:** Concentrate the redesign in shared shell and visual primitives first, then apply common wrapper classes to the main page families so the app gets broad coverage with minimal logic churn. Keep all page behavior intact and treat the rollout as a presentational refactor.

**Tech Stack:** React, TypeScript, Wouter, Tailwind utility classes, shared KPMG brand CSS, source-based Node tests

---

### Task 1: Lock the Shared Hero-Forward Contracts

**Files:**
- Create: `kpmg_ui/client/src/components/hero-section.layout.test.ts`
- Modify: `kpmg_ui/client/src/components/app-layout.sidebar.test.ts`
- Test: `kpmg_ui/client/src/components/hero-section.layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const heroSectionSource = fs.readFileSync(
  path.resolve("client/src/components/HeroSection.tsx"),
  "utf8",
);

assert.match(
  heroSectionSource,
  /trace-page-hero/,
  "HeroSection should render the shared hero-forward page shell",
);

assert.match(
  heroSectionSource,
  /subtitle/,
  "HeroSection should preserve subtitle support inside the shared hero",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx .\client\src\components\hero-section.layout.test.ts`
Expected: FAIL because `HeroSection.tsx` does not yet contain the new shared hero markup.

- [ ] **Step 3: Extend the sidebar/source test for the new shell contract**

```ts
assert.match(
  appLayoutSource,
  /trace-shell-main/,
  "App layout should wrap authenticated pages in the new hero-forward shell main surface",
);
```

- [ ] **Step 4: Run the source tests again**

Run:
- `node --import tsx .\client\src\components\hero-section.layout.test.ts`
- `node --import tsx .\client\src\components\app-layout.sidebar.test.ts`

Expected: both still fail until the shared shell implementation lands.

### Task 2: Implement Shared Shell And Visual Primitives

**Files:**
- Modify: `kpmg_ui/client/src/components/HeroSection.tsx`
- Modify: `kpmg_ui/client/src/components/TraceNavBar.tsx`
- Modify: `kpmg_ui/client/src/components/AppLayout.tsx`
- Modify: `kpmg_ui/client/src/components/KpiCard.tsx`
- Modify: `kpmg_ui/client/src/styles/kpmg-brand-override.css`
- Test: `kpmg_ui/client/src/components/hero-section.layout.test.ts`

- [ ] **Step 1: Implement the shared hero-forward section**

```tsx
<section className="hero-section trace-page-hero">
  <TraceNavBar breadcrumb={title} actions={actions} />
  <div className="trace-page-hero__inner">
    ...
  </div>
</section>
```

- [ ] **Step 2: Upgrade the authenticated app shell wrapper**

```tsx
<div className="flex-1 flex flex-col min-w-0 trace-shell-main">
  <main className="flex-1 overflow-hidden trace-shell-canvas">{children}</main>
  <Footer />
</div>
```

- [ ] **Step 3: Refresh shared KPI and shell tokens**

```css
.trace-page-hero { ... }
.trace-page-body { ... }
.trace-page-content { ... }
.trace-workbench-shell { ... }
.trace-shell-main { ... }
.dashboard-panel { ... }
```

- [ ] **Step 4: Run tests to verify the shared shell passes**

Run:
- `node --import tsx .\client\src\components\hero-section.layout.test.ts`
- `node --import tsx .\client\src\components\app-layout.sidebar.test.ts`

Expected: PASS

### Task 3: Roll Shared Wrappers Across Standard App Pages

**Files:**
- Modify: `kpmg_ui/client/src/pages/dashboard.tsx`
- Modify: `kpmg_ui/client/src/pages/control-testing.tsx`
- Modify: `kpmg_ui/client/src/pages/risk-assessment.tsx`
- Modify: `kpmg_ui/client/src/pages/reports.tsx`
- Modify: `kpmg_ui/client/src/pages/settings.tsx`
- Modify: `kpmg_ui/client/src/pages/chat.tsx`
- Modify: `kpmg_ui/client/src/pages/evidence-assessment.tsx`
- Modify: `kpmg_ui/client/src/pages/issue-management.tsx`
- Modify: `kpmg_ui/client/src/pages/asset-registry.tsx`
- Test: `kpmg_ui/client/src/pages/hero-forward.routes.test.ts`

- [ ] **Step 1: Write the failing page-wrapper test**

```ts
assert.match(
  dashboardSource,
  /trace-page-body/,
  "Dashboard should use the shared page body wrapper",
);
```

- [ ] **Step 2: Run the new test to verify failure**

Run: `node --import tsx .\client\src\pages\hero-forward.routes.test.ts`
Expected: FAIL because the shared wrapper classes are not yet applied.

- [ ] **Step 3: Apply the shared page body/content wrappers**

```tsx
<div className="trace-page-body">
  <div className="trace-page-content trace-page-content--wide">
    ...
  </div>
</div>
```

- [ ] **Step 4: Resize the densest dashboard sections**

```tsx
<section className="dashboard-band trace-summary-band ...">
...
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
```

- [ ] **Step 5: Run the wrapper test again**

Run: `node --import tsx .\client\src\pages\hero-forward.routes.test.ts`
Expected: PASS

### Task 4: Apply Sizing-Only Updates To Workbench Pages

**Files:**
- Modify: `kpmg_ui/client/src/pages/controls-library.tsx`
- Modify: `kpmg_ui/client/src/pages/regulatory-library.tsx`
- Modify: `kpmg_ui/client/src/pages/frameworks-library.tsx`
- Modify: `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- Modify: `kpmg_ui/client/src/pages/controls-diagnostics.tsx`
- Modify: `kpmg_ui/client/src/pages/control-quality-analysis.tsx`
- Modify: `kpmg_ui/client/src/pages/risk-controls-coverage.tsx`
- Modify: `kpmg_ui/client/src/pages/regulation-controls-coverage.tsx`
- Modify: `kpmg_ui/client/src/pages/control-360.tsx`
- Test: `kpmg_ui/client/src/pages/hero-forward.routes.test.ts`

- [ ] **Step 1: Keep workbench mechanics intact and add visual wrapper hooks**

```tsx
<div className="h-full flex flex-col overflow-hidden select-none trace-workbench-shell">
```

- [ ] **Step 2: Replace tight panel spacing with the shared workbench sizing rules**

```tsx
<div className="trace-workbench-panel ...">
```

- [ ] **Step 3: Re-run the page-wrapper test**

Run: `node --import tsx .\client\src\pages\hero-forward.routes.test.ts`
Expected: PASS with the new workbench hooks present.

### Task 5: Verify The Rollout

**Files:**
- Modify: `docs/superpowers/specs/2026-04-23-trace-hero-forward-redesign-design.md`
- Modify: `docs/superpowers/plans/2026-04-23-trace-hero-forward-redesign.md`
- Test: `kpmg_ui/client/src/components/app-layout.sidebar.test.ts`
- Test: `kpmg_ui/client/src/components/hero-section.layout.test.ts`
- Test: `kpmg_ui/client/src/pages/hero-forward.routes.test.ts`

- [ ] **Step 1: Run the targeted source tests**

Run:
- `node --import tsx .\client\src\components\app-layout.sidebar.test.ts`
- `node --import tsx .\client\src\components\hero-section.layout.test.ts`
- `node --import tsx .\client\src\pages\hero-forward.routes.test.ts`

Expected: PASS

- [ ] **Step 2: Run the app build**

Run: `npm run build`
Expected: build succeeds without TypeScript or Vite errors.

- [ ] **Step 3: Record any implementation deltas**

```md
- verification completed
- visual-only scope preserved
- no route or workflow changes introduced
```
