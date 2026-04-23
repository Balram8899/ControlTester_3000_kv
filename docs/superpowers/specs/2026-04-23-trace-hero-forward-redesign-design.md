# TRACE Hero-Forward Redesign Design

## Goal

Apply the approved hero-forward visual redesign across the existing TRACE UI without changing workflows, data flow, routing, or page logic.

## Scope

This redesign is visual-only.

It covers:

- shared shell styling across authenticated TRACE pages
- hero/header treatment for AppLayout pages
- spacing, panel sizing, typography hierarchy, and KPI sizing
- visual standardization of dashboards, library workbenches, and workflow pages
- responsive resizing to reduce crowding on dense pages

It does not cover:

- route changes
- context/provider changes
- changes to uploads, analysis flows, filters, dialogs, or table logic
- information architecture rewrites
- new features or new workflows

## Approved Direction

The approved direction is the hero-forward rollout.

Core decisions:

- keep the dark TRACE shell and KPMG blue navigation anchors
- introduce a stronger purple-to-blue hero summary band on major pages
- make KPI and chart surfaces larger and easier to scan
- reduce crowding through sizing, spacing, and responsive layout changes rather than content removal
- keep library and workflow pages operational, not marketing-heavy

## Page Families

### Dashboard and Reporting Pages

These pages get the strongest hero treatment.

Characteristics:

- prominent gradient hero summary near the top of the page
- larger KPI blocks
- larger chart and analytics panels
- more separation between sections

Primary targets:

- `kpmg_ui/client/src/pages/dashboard.tsx`
- `kpmg_ui/client/src/pages/reports.tsx`

### Library and Diagnostic Workbenches

These pages keep their existing workbench structure and controls, but adopt the shared hero, spacing, and sizing system.

Characteristics:

- shallower hero than the dashboard family
- faster transition into the work surface
- cleaner panel hierarchy
- more readable left/right panel spacing
- taller tables and content regions where possible

Primary targets:

- `kpmg_ui/client/src/pages/regulatory-library.tsx`
- `kpmg_ui/client/src/pages/controls-library.tsx`
- `kpmg_ui/client/src/pages/frameworks-library.tsx`
- `kpmg_ui/client/src/pages/asset-registry.tsx`
- `kpmg_ui/client/src/pages/regulatory-testing.tsx`

### Workflow and Execution Pages

These pages keep their current step logic and actions, but adopt the stronger hero and standardized surface styling.

Characteristics:

- hero carries status, purpose, and primary action framing
- action cards remain familiar
- spacing and component proportions reduce density

Primary targets:

- `kpmg_ui/client/src/pages/control-testing.tsx`
- `kpmg_ui/client/src/pages/risk-assessment.tsx`
- `kpmg_ui/client/src/pages/evidence-assessment.tsx`
- `kpmg_ui/client/src/pages/issue-management.tsx`
- `kpmg_ui/client/src/pages/settings.tsx`
- `kpmg_ui/client/src/pages/chat.tsx`
- `kpmg_ui/client/src/pages/controls-diagnostics.tsx`
- `kpmg_ui/client/src/pages/control-quality-analysis.tsx`
- `kpmg_ui/client/src/pages/risk-controls-coverage.tsx`
- `kpmg_ui/client/src/pages/regulation-controls-coverage.tsx`
- `kpmg_ui/client/src/pages/control-360.tsx`

## Shared Design Rules

### Shell

- keep the dark left rail and dark TRACE top ribbon
- refine spacing, active states, and borders so the shell feels calmer and more premium
- preserve the current sidebar behavior and navigation structure

### Hero

- AppLayout pages should use a shared hero section below the TRACE ribbon
- hero uses a purple-to-cobalt gradient with restrained atmospheric lighting
- title, subtitle, icon, and actions live inside the hero
- dashboard/reporting pages can visually support a stronger hero presence than workbench pages

### Panels and Cards

- shared KPI cards should be taller and slightly wider-feeling
- keep crisp KPMG rectangles with restrained radius
- preserve accent-top or accent-edge semantics already used for status
- charts and tables should sit in larger white surfaces with cleaner padding

### Typography

- keep sentence case
- use stronger contrast for headings
- reduce visual noise from overly small labels
- preserve utility-first copy for operational pages

### Responsive Behavior

- reduce column count earlier on crowded pages
- allow KPI rows to wrap more gracefully
- give charts more vertical height on desktop
- avoid clipped tables and compressed controls on smaller widths

## State Handling

Existing page states must remain behaviorally identical:

- loading
- empty
- partial data
- locked
- success
- error

Only visual presentation changes.

## Implementation Strategy

1. Update shared shell and hero components first.
2. Update shared visual tokens and reusable card/panel styles.
3. Apply shared page wrapper classes and spacing changes to key AppLayout pages.
4. Refine dense library/workbench pages with sizing-only changes.
5. Verify route behavior, layout stability, and responsive rendering.

## Verification

Minimum verification:

- source-based tests for shared shell and hero rollout
- existing layout/source tests still pass
- app build passes
- no route regressions in the current app shell
- no obvious clipped or collapsed sections on the updated pages

## Notes

The worktree is currently dirty, so this spec is being written without creating a commit as part of the design workflow.
