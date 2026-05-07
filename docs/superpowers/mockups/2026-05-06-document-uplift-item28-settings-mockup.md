# Document Uplift Item 28 Settings Mockup

**Plan item:** Item 28 - Settings page Pipeline Controls card  
**Review status:** Approved by human and implemented  
**Skills applied:** `kpmg-trace-page-style`, `frontend-skill`

**Correction:** Replaces the earlier mockup, which drifted into a Settings redesign. This version uses the current `/settings` page screenshots as the source of truth, with the final card placement corrected to follow Item 28 exactly: below **LLM Provider** and above **LLM Model**.

## Mockup Image

[Corrected Current Settings Page Mockup](./2026-05-06-document-uplift-settings-current-page-option-mockup.svg)

Superseded review image:
[Old Settings Pipeline Controls Mockup](./2026-05-06-document-uplift-settings-pipeline-controls-mockup.svg)

## Intended Behavior

- Add a **Document Uplift / Pipeline Controls** card to the existing Settings page.
- Show and edit `max_llm_calls_per_pipeline`.
- Save via `/settings/document-uplift-config`.
- Include a reset-to-default action for `80` calls.
- Keep the setting scoped to future Document Uplift runs.
- Keep the existing **LLM Provider**, **LLM Model**, **General Context**, **Company Policy Context**, and **Navigation Visibility** sections unchanged.

## Approval Checklist

- [x] Card placement is acceptable.
- [x] Copy is clear enough for auditors/admins.
- [x] Controls are sufficient: numeric input, Save, Reset.
- [x] Existing LLM selection, visibility controls, and context upload sections remain visually intact.
- [x] No additional settings are required for Item 28.
