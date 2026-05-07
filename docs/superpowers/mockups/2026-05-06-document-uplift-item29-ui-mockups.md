# Document Uplift Item 29 UI Mockups

**Plan item:** Item 29 - `kpmg_ui/client/src/pages/document-uplift.tsx` full UI  
**Review status:** Awaiting human approval before frontend implementation  
**Skills applied:** `kpmg-trace-page-style`, `frontend-skill`

## Mockup Image

[Document Uplift UI Flow Mockups - PNG](./2026-05-06-document-uplift-item29-ui-flow-mockups.png)

Editable source:
[Document Uplift UI Flow Mockups - SVG](./2026-05-06-document-uplift-item29-ui-flow-mockups.svg)

## Screens Covered

- Case list and create-case workflow.
- Case detail with upload/tag panel and pipeline progress.
- Suggestion review panel with per-suggestion diff, source references, accept/edit/reject actions, bulk actions, reject-all confirmation, auto-accept warning, generated outputs, and cost badge.

## Plan Notes Reflected

- New `/document-uplift` page remains separate from SOP Uplift.
- Sidebar shows a separate **Document Uplift** entry with a `NEW` badge.
- The page includes the UI surfaces required by Item 29; SSE wiring is visually represented as progress, but the actual endpoint is Item 30.
- Cost badge is represented at the complete/review stage; final data-flow validation remains Item 31 and Checkpoint C.

## Approval Checklist

- [ ] Case list layout is acceptable.
- [ ] Upload/tag workflow is clear enough for auditors/admins.
- [ ] Suggestion review/diff layout is acceptable.
- [ ] Bulk actions, reject-all confirmation, and auto-accept warning are clear.
- [ ] Output/cost area is acceptable.
- [ ] No additional Item 29 screens are required before TSX implementation.
