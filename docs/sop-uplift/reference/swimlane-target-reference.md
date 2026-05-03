# SOP Uplift Swimlane Target Reference

This reference image is a visual target for SOP Uplift swimlane outputs. It is not a process source of truth and should not be treated as a fixed client workflow.

Use it to guide:

- KPMG/TRACE-style header and metadata layout.
- Horizontal swimlanes with role labels.
- Left-to-right process flow.
- Process, decision, data store, evidence, risk, and control notation.
- C#/R#/E# badge placement.
- Right-side legend.
- Footer panels for notes, control summary, risk summary, and document information.
- Large, zoom-friendly diagram sizing.

The text prompt and implementation spec remain authoritative. If the renderer cannot display a visual notation shown here, either implement that notation or omit it from the rendered legend.

## Notation

- Oval: Start / End.
- Rectangle: Process step or activity.
- Diamond: Decision / branch.
- Cylinder/repository: Data store, DMS, queue, register, repository, or retained record.
- Document icon: Evidence artifact.
- C#: Control number.
- R#: Risk number.
- E#: Evidence number.
- Solid arrow: Process sequence.
- Labeled solid arrow: Branch or handoff condition.
- Dotted blue connector: Control/evidence relationship.
- Dotted red connector: Risk relationship or exposure linkage.

## Guardrails

- Do not invent controls, risks, or evidence just to fill the diagram.
- Do not badge uncertain items as C#, R#, or E#.
- Supporting documents enrich the process but do not override the effective updated SOP.
- Prefer readable, zoom-friendly outputs over forced fit-to-page compression.
