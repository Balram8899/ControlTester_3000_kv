# Risk Assessment Page-Local UI Overhaul

## Design Intent

Redesign `kpmg_ui/client/src/pages/risk-assessment.tsx` as a TRACE-style workflow while preserving the existing route, providers, questionnaire submission, analysis endpoints, control application, residual calculation, and report generation behavior.

The redesign direction keeps the current feature workflow intact:

- Assessment dashboard
- Create assessment
- Questionnaire
- Analysis running
- Identified risks
- Control application
- Residual risk
- Final report

The goal is to move the page away from the generic two-panel shadcn workbench and toward a clearer KPMG TRACE assessment flow that feels deliberate, lighter, and easier to scan.

## Approved Mockup Notes

- Keep the existing app shell and Risk Assessment route.
- Align visual treatment toward the canonical TRACE page language used across the recent overhauls.
- Keep the left app navigation and the Risk Assessment route identity.
- Preserve the real seven-step wizard already in the feature:
  - `Create`
  - `Questionnaire`
  - `Analyse`
  - `Risks`
  - `Controls`
  - `Residual`
  - `Report`
- Keep the assessment list as part of the experience, but make it feel like a session rail instead of a cramped utility column.
- Make each step feel like a dedicated screen within the single route.
- Use only realistic utility copy and workflow labels. No invented AI feed text or decorative summary prose.
- Preserve all current feature operations through the existing contexts and endpoints.

## Screen Direction

### 1. Assessment Dashboard

- Session rail with status-backed assessments.
- `How It Works` strip and three operational KPIs.
- Recent assessments table for quick re-entry.

### 2. Create Assessment

- Intake workspace instead of a simple modal.
- Asset selection on one side and ad hoc application intake on the other.
- CIA scoring presented as structured controls, not cramped fields.

### 3. Questionnaire

- Stepper at top.
- Sticky application progress strip.
- Section accordion with question-type pills and compact answer controls.

### 4. Analysis Running

- Focused processing state with progress signal and checklist.
- Explain what the system is calculating rather than showing a blank loader.

### 5. Identified Risks

- Risk register cards with category, band, likelihood, impact, and rationale.
- Top action moves to control application.

### 6. Controls

- Suggested control mapping by risk.
- Separate applied controls from suggested controls.
- Relevance scoring remains visible but secondary.

### 7. Residual Risk

- Compare inherent and residual posture per risk.
- Show controls applied, average effectiveness, and residual score in a more review-friendly layout.

### 8. Final Report

- Formatted report preview with executive summary, scope, risk posture, control response, and next actions.
- Export is present, but the preview should read like a review document, not raw markdown.

## Files Changed

- `kpmg_ui/client/src/pages/risk-assessment.tsx`
- `kpmg_ui/client/src/risk-assessment.overhaul.test.ts`
- `docs/ui-overhaul/risk-assessment-design.md`
- `docs/ui-overhaul/risk-assessment-mockups.html`
- `docs/ui-overhaul/risk-assessment-mockups-board-1.svg`
- `docs/ui-overhaul/risk-assessment-mockups-board-2.svg`
- `docs/ui-overhaul/ui-overhaul-log.md`
- `docs/HANDOFF.md`

## Data Sources Preserved

- `useRiskAssessment()` state and actions:
  - `fetchAssessments`
  - `createAssessment`
  - `fetchSections`
  - `submitResponseBatch`
  - `analyzeAssessment`
  - `suggestControls`
  - `applyControl`
  - `fetchResidual`
  - `generateReport`
- `useAssetRegistry()`:
  - `assets`
  - `fetchAssets`
- Existing direct refresh call to `GET /api/risk-assessment/{id}`

## Functionality Deliberately Untouched

- Risk assessment API routes, data contracts, and provider behavior.
- `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx`
- `kpmg_ui/client/src/contexts/AssetRegistryContext.tsx`
- Any non-risk-assessment page or shared layout logic.

## Implementation Notes

- The redesign stays on the same route and keeps the wizard step model.
- The page now has three visual states:
  - dashboard with no selected assessment
  - create-assessment workspace
  - selected-assessment workflow
- Browser smoke markers are available for the key surfaces:
  - `data-risk-assessment-page`
  - `data-risk-assessment-rail`
  - `data-risk-assessment-dashboard`
  - `data-risk-assessment-create`
  - `data-risk-assessment-stepper`
  - `data-risk-assessment-questionnaire`
  - `data-risk-assessment-analysis`
  - `data-risk-assessment-risks`
  - `data-risk-assessment-controls`
  - `data-risk-assessment-residual`
  - `data-risk-assessment-report`

## Follow-Up Items

- Browser smoke the full workflow with real seeded data after the page compiles cleanly.
- Consider whether ad hoc applications should eventually participate directly in the questionnaire path at the backend level. This implementation leaves that behavior untouched.
