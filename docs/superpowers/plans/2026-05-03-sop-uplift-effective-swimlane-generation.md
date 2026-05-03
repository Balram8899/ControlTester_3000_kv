# SOP Uplift Effective Swimlane Generation Plan

## Summary

Implement the SOP Uplift swimlane fix against the current worktree without overwriting existing SOP Uplift changes. The implementation should be incremental: preserve existing diagram model/schema/exporter improvements, then close the remaining gaps around stale final diagrams, effective SOP prompt rules, reference artifacts, legend semantics, and readability tests.

The key current-code finding is that final output generation can reuse stale `case.diagram_model` through `_diagram_model_for_outputs()`. That must change so final artifacts are rebuilt from `revised_sop_sections` and current suggestion statuses.

## Implementation Changes

- Final output diagram behavior:
  - Change `_diagram_model_for_outputs()` so final generated artifacts do not prefer existing `case.diagram_model`.
  - Use `revised_sop_sections` as the primary source for output-time diagram building.
  - Keep pipeline-time `case.diagram_model` as preview/draft only.
  - Add warnings for no accepted/edited suggestions and for excluded rejected/open suggestions.

- Prompt updates:
  - Update `swimlane_diagram_model` in `utils/sop_uplift/prompt_templates.py` to use the effective updated SOP as process truth.
  - Keep supporting documents as enrichment only: controls, risks, evidence, systems, metadata, role names.
  - Add explicit anti-invention rules for C#/R#/E# badges.
  - Add connector, legend, sizing, readability, and reference-image instructions.
  - Strengthen `sop_uplift_suggestions` and `case_sop_uplift_suggestions` with the testability checklist and insert-ready SOP language rules.

- Renderer/reference artifacts:
  - Add `docs/sop-uplift/reference/swimlane-target-reference.svg`.
  - Add `docs/sop-uplift/reference/swimlane-target-reference.png`.
  - Add `docs/sop-uplift/reference/swimlane-target-reference.md`.
  - Use the reference image as developer/LLM visual guidance only; the text spec remains authoritative.
  - Extend SVG legend only for visual notation actually rendered. If dotted blue/red connector styles are added, include them in the legend; otherwise do not claim them.

- Readability:
  - Preserve large, zoom-friendly canvas behavior.
  - Avoid fit-to-page compression.
  - Ensure footer summaries do not clip.
  - Prefer wrapping over truncating; do not shrink text below readable minimums.

## Detailed Prompt To Put In The Repo Plan

```text
You are working in the TRACE / ControlTester 3000 codebase.

Goal:
Fix SOP Uplift so final generated swimlane diagrams represent the effective updated SOP after user review decisions, and improve SOP suggestion quality so accepted suggestions produce useful, process-ready SOP language.

Core rule:
Final diagram outputs must always be regenerated from the effective SOP state at `generate-outputs` time. Do not reuse a stale `case.diagram_model` generated before the user accepted, edited, rejected, or left suggestions open.

Current codebase note:
The current code already includes enhanced diagram model fields such as `shape`, `column`, `badge`, `meta`, `control_summary`, `risk_summary`, and SVG header/legend/footer rendering. Preserve these existing changes and patch only the remaining gaps.

Required implementation:
- At final output generation time, always build the diagram model from the effective SOP state.
- Do not blindly reuse existing `case.diagram_model` for generated output artifacts.
- It is acceptable to keep pipeline-time `case.diagram_model` as a preview/draft model.
- The final generated PNG/SVG/PDF/Draw.io/Mermaid outputs must reflect current suggestion statuses.

Effective SOP construction:
For each SOP anchor/section:
- If one or more suggestions for that anchor have status `accepted` or `edited`, use those accepted/edited changes as the revised SOP language.
- For `accepted`, use `suggested_text`.
- For `edited`, use `user_text` / user-approved edited text as authoritative.
- If no accepted/edited suggestion applies, retain the original SOP text.
- Exclude `rejected` suggestions from the implemented process.
- Exclude `open` / pending suggestions from the implemented process.
- Rejected/open suggestions may be mentioned only in warnings, limitations, or unresolved opportunities.

Acceptance-state behavior:
- If all suggestions are accepted or edited, final diagram represents the fully uplifted SOP.
- If some suggestions are accepted or edited, final diagram represents the partially uplifted SOP.
- If no suggestions are accepted or edited, final diagram represents the current uploaded SOP and includes warning:
  "No accepted or edited uplift suggestions were applied; diagram reflects the current uploaded SOP."
- If rejected or open suggestions exist, include warning:
  "Rejected and open suggestions were excluded from the implemented process diagram."

Supporting-document policy:
- The effective updated SOP is the process source of truth.
- Supporting documents may enrich the diagram with controls, risks, evidence, systems, metadata, repositories, and role names.
- Supporting documents include RCMs, risk registers, control inventories, evidence files, uploaded process diagrams, audit findings, and case chat context.
- Supporting documents must not override the effective updated SOP process flow.
- Supporting documents must not invent process steps absent from the effective SOP.
- If supporting documents imply a process step that the effective SOP does not contain, include a warning or follow-up question instead of silently adding the step.
- If supporting documents conflict with the effective SOP, prefer the effective SOP and include a warning.

Reference image requirement:
- Add `docs/sop-uplift/reference/swimlane-target-reference.svg`.
- Add `docs/sop-uplift/reference/swimlane-target-reference.png`.
- Add `docs/sop-uplift/reference/swimlane-target-reference.md`.
- The image should show the visual target: KPMG/TRACE header, document metadata, horizontal swimlanes, process steps, decisions, C# controls, R# risks, E# evidence, repository/data store, legend, connector meanings, and footer panels.
- The image is guidance, not the source of truth. The text prompt/spec remains authoritative.

Final diagram generation prompt:
Create a KPMG/TRACE audit-quality swimlane diagram for the effective updated SOP, not the original uploaded SOP and not the suggestion queue.

Source priority:
1. `revised_sop_sections[].revised_text` is the primary SOP language.
2. `original_text` is used only where no accepted/edited suggestion applies.
3. Accepted suggestions are implemented changes.
4. Edited suggestions are implemented user-approved changes.
5. Rejected suggestions are excluded from the implemented process.
6. Open suggestions are excluded from the implemented process.
7. Supporting documents may enrich controls, risks, evidence, metadata, systems, repositories, and role names, but must not override the effective updated SOP.

Do not create nodes from:
- SOP title or purpose statements;
- scope paragraphs;
- regulatory citations alone;
- document references;
- document history;
- role table rows unless they correspond to an actual process step;
- risk rating values such as Low / Medium / High;
- extracted sentence fragments;
- rejected suggestions;
- open suggestions;
- supporting-document-only process steps not present in the effective SOP.

Control, risk, and evidence numbering rules:
- `C#` means control number.
- `R#` means risk number.
- `E#` means evidence number.
- Use C# only for actual controls supported by the effective SOP or supporting documents.
- Use R# only for actual risks or failure modes supported by the effective SOP or supporting documents.
- Use E# only for concrete evidence artifacts or repositories supported by the effective SOP or supporting documents.
- If unsure whether something is a control, risk, or evidence item, do not badge it as C#, R#, or E#.
- Do not invent controls, risks, or evidence just to populate the diagram.
- Do not treat every review step as a control unless it has a clear control purpose.
- Do not treat every regulation, risk rating value, or policy reference as a risk.

Connector and legend rules:
- Solid arrow means process sequence.
- Labeled solid arrow means branch condition or handoff condition.
- Dotted blue connector means control/evidence relationship, but only include this if rendered.
- Dotted red connector means risk relationship or exposure linkage, but only include this if rendered.
- Do not include a legend item unless the renderer actually displays that visual notation.

Sizing and readability:
- Prefer a large zoom-friendly canvas over forced fit-to-page compression.
- SVG and PDF should preserve vector text/paths where possible.
- PNG export should use high resolution suitable for zooming.
- Use minimum node width/height, lane height, column spacing, and footer panel height.
- Never reduce text below a readable minimum font size just to fit more nodes.
- Wrap labels intentionally.
- Do not truncate mid-word or mid-sentence.
- Footer summaries must be readable and must not clip.
```

## Tests

- Add or update tests for:
  - accepted suggestions appear in final diagram;
  - edited suggestions use `user_text`;
  - rejected and open suggestions do not appear;
  - stale `case.diagram_model` is not reused for final outputs;
  - no accepted/edited suggestions adds the expected warning;
  - supporting docs enrich but do not invent process flow;
  - prompt text includes effective SOP priority, enrichment-only rules, C#/R#/E# anti-invention rules, reference image path, and sizing rules;
  - SVG legend reflects only implemented notation;
  - reference `.svg`, `.png`, and `.md` exist.

- Run:
  - `python -m pytest tests/test_sop_uplift_outputs.py -v`
  - `python -m pytest tests/test_sop_uplift_pipeline.py -v`

## Assumptions

- Existing dirty worktree changes are user/previous-agent work and must be preserved.
- Do not clean pycache/log/playwright files as part of this feature unless explicitly requested.
- The final implementation should touch only SOP Uplift code/tests/docs plus `docs/HANDOFF.md`.
- Reference image lives under `docs/sop-uplift/reference/`, not frontend public assets, because it is documentation/reference material.
