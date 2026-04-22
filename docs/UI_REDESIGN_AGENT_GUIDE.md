# TRACE UI Redesign Agent Guide

Generated: 2026-04-22

This document is for a future agent redesigning the UI. It explains the current product surface page by page, the navigation model, the UI-to-backend file map, and the boundaries that should be preserved during a visual redesign.

## 1. Product Summary

TRACE / ControlTester 3000 is a local cybersecurity audit and compliance platform. The UI supports:

- Uploading and extracting regulatory obligations.
- Uploading and extracting controls, then mapping controls to obligations.
- Uploading and extracting risk/framework elements.
- Comparing regulations and assessing RCM files against regulations.
- Running asset-based risk assessments.
- Running evidence assessment and control testing workflows.
- Tracking generated reports.
- Managing assets, issues, validation queue findings, AI chat, model settings, and navigation visibility.

The application is not a simple marketing site. It is a dense auditor workspace. A redesign should preserve task efficiency, review context, evidence traceability, and cross-page navigation.

## 2. Runtime Architecture

| Layer | Files | Notes |
|---|---|---|
| React UI | `kpmg_ui/client/src` | React 18, TypeScript, Vite, Tailwind, shadcn/Radix components, Recharts, Wouter routing. |
| Express proxy / BFF | `kpmg_ui/server/routes.ts` | Serves `/api/*`, strips `/api`, forwards to FastAPI. It special-cases `/api/models` and transforms FastAPI model strings into `{ value, label }`. |
| FastAPI backend | `api/main.py`, `api/routers/*` | Main API, long-running LLM endpoints, library endpoints, audit endpoints, and router modules. |
| Domain utilities | `utils/*` | Extraction, graph RAG, RCM analysis, evidence analysis, Mongo stores, risk scoring, report storage. |
| Database | MongoDB `trace_db` | Primary persistent data store. Do not assume the Drizzle/Postgres schema drives current product data. |
| Containers | `docker-compose.yml` | Services: `mongodb`, `fastapi_api`, `web_ui_agent`. UI on port 5000, FastAPI on 8000. |

Important runtime details:

- Most frontend calls use `/api/...`; Express forwards them to FastAPI.
- LLM calls must stay behind backend endpoints and `utils/llm_provider.py::get_llm()`.
- MongoDB database name is lowercase `trace_db`.
- Long LLM calls can take minutes. The proxy timeout is 10 minutes.
- `kpmg_ui/shared/schema.ts` defines Drizzle tables, but the current major workflows use MongoDB and FastAPI stores instead.

## 3. Application Shell And Navigation

Primary shell files:

- `kpmg_ui/client/src/App.tsx`
- `kpmg_ui/client/src/components/AppLayout.tsx`
- `kpmg_ui/client/src/components/app-layout.helpers.ts`
- `kpmg_ui/client/src/pages/landing.helpers.ts`
- `kpmg_ui/client/src/contexts/AuthContext.tsx`

Key shell behavior:

- The app uses Wouter routes.
- Auth is client-side localStorage auth, not backend auth.
- `/font-mockup` bypasses auth.
- Unauthenticated users are routed to `/login`.
- Authenticated `/login` redirects to `/landing`.
- Main application pages stay permanently mounted and are hidden or shown with CSS in `App.tsx`. This preserves page state across navigation. Do not casually replace this with normal route unmounting.
- The sidebar is driven by `HIDEABLE_TABS` plus Settings. Settings is always visible.
- Settings stores hidden sidebar pages in localStorage key `nav_hidden_pages` and dispatches a browser event with the same key.
- Landing page module cards are separate from sidebar tabs. The landing modules currently omit Controls Library, Frameworks Library, Regulatory Testing, and Settings.

### Sidebar Navigation Order

Defined in `kpmg_ui/client/src/components/app-layout.helpers.ts`:

| Label | Route | Page file |
|---|---|---|
| Dashboard | `/` | `pages/dashboard.tsx` |
| Regulatory Library | `/regulatory-library` | `pages/regulatory-library.tsx` |
| Controls Library | `/controls-library` | `pages/controls-library.tsx` |
| Frameworks Library | `/frameworks-library` | `pages/frameworks-library.tsx` |
| Regulatory Testing | `/regulatory-testing` | `pages/regulatory-testing.tsx` |
| Reports | `/reports` | `pages/reports.tsx` |
| Asset Registry | `/asset-registry` | `pages/asset-registry.tsx` |
| Risk Assessment | `/risk-assessment` | `pages/risk-assessment.tsx` |
| Final Report | `/evidence-assessment` | `pages/evidence-assessment.tsx` |
| Control Testing | `/control-testing` | `pages/control-testing.tsx` |
| Chat | `/chat` | `pages/chat.tsx` |
| Issue Management | `/issue-management` | `pages/issue-management.tsx` |
| Settings | `/settings` | `pages/settings.tsx` |

Other routes:

| Route | Page file | Notes |
|---|---|---|
| `/login` | `pages/login.tsx` | Local login/register. |
| `/landing` | `pages/landing.tsx` | Post-login module launcher. |
| `/exception-management` | `pages/exception-management.tsx` | Under-development placeholder. Not currently in sidebar helper. |
| `/font-mockup` | `pages/font-mockup.tsx` | Unauthenticated typography/design preview. |
| fallback | `pages/not-found.tsx` | 404 page. Button text says "Go to Chat" but navigates to `/`. |

## 4. Page-By-Page Feature Inventory

### Login

Route: `/login`

Frontend:

- `kpmg_ui/client/src/pages/login.tsx`
- `kpmg_ui/client/src/contexts/AuthContext.tsx`
- Asset: `kpmg_ui/client/src/assets/kpmg (1).png`

Features:

- KPMG-branded login page with animated Lottie background.
- Login form using local credentials.
- Register modal with name, email, password, confirm password validation.
- Default seeded user: `admin@bank.com` / `admin123`.
- Stores users in localStorage key `ct3_users`.
- Stores current user in localStorage key `ct3_current_user`.
- No backend login, sessions, JWTs, or password hashing.

Redesign notes:

- Safe to redesign layout, background, form structure, and copy.
- Preserve AuthContext methods and localStorage keys unless implementing a real auth migration.
- Do not imply production-grade authentication unless backend auth is added.

### Landing

Route: `/landing`

Frontend:

- `kpmg_ui/client/src/pages/landing.tsx`
- `kpmg_ui/client/src/pages/landing.helpers.ts`

Features:

- Post-login module launcher.
- Module cards navigate to Dashboard, Regulatory Library, Reports, Asset Registry, Risk Assessment, Final Reporting, Control Testing, Chat, and Issue Management.
- Shows user context and sign-out affordance.
- Uses module metadata from `LANDING_MODULES`.

Navigation:

- Entry after login.
- Cards call Wouter navigation to each module route.

Redesign notes:

- Safe to redesign card layout and visual hierarchy.
- If adding omitted modules, update `landing.helpers.ts` intentionally.
- Keep paths in sync with `App.tsx` and sidebar helper.

### Dashboard

Route: `/`

Frontend:

- `kpmg_ui/client/src/pages/dashboard.tsx`
- `kpmg_ui/client/src/contexts/LibraryMetricsContext.tsx`
- `kpmg_ui/client/src/contexts/CrossNavContext.tsx`

Backend/API:

- `GET /api/models`
- `GET /api/regulatory-library/documents`
- `GET /api/controls-library/documents`
- `GET /api/controls-library/all-controls`
- `GET /api/controls-library/merged`

Features:

- Executive dashboard for library health and cross-library coverage.
- KPI cards for regulations, obligations, regulatory domains, policy documents, controls, and control domains.
- Domain coverage chart comparing regulation domains against control domains.
- Obligation distribution chart.
- Diagnostic cards:
  - Controls-obligations coverage.
  - Control quality analysis.
  - Control duplicates.
  - Domain gap assessment.
- Cross-library coverage summary.
- System status/model status.
- Quick links to Regulatory Testing and Controls Library.

Navigation:

- Control coverage and quality diagnostics navigate into Controls Library.
- Domain gap diagnostics navigate into Regulatory Library.
- Cross-navigation state is passed via `CrossNavContext`.

Redesign notes:

- Preserve dashboard as a high-density summary, not a landing/marketing hero.
- Keep diagnostic cards clickable where current behavior is clickable.
- Preserve cross-navigation affordances so a reviewer can jump from KPI to underlying evidence.

### Regulatory Library

Route: `/regulatory-library`

Frontend:

- `kpmg_ui/client/src/pages/regulatory-library.tsx`
- `kpmg_ui/client/src/contexts/LibraryMetricsContext.tsx`
- `kpmg_ui/client/src/contexts/CrossNavContext.tsx`

Backend/API:

- `POST /api/regulatory-library/ingest`
- `GET /api/ingest-task/{task_id}`
- `GET /api/regulatory-library/documents`
- `GET /api/regulatory-library/documents/{document_id}`
- `DELETE /api/regulatory-library/documents/{document_id}`
- `DELETE /api/regulatory-library/all`
- `GET /api/regulatory-library/all-obligations`
- `GET /api/regulatory-library/merged-obligations`
- `POST /api/regulatory-library/gap-analysis`
- `POST /api/regulatory-library/gap-analysis-pdf`

Backend files:

- `api/main.py`
- `utils/regulatory_library.py`
- `utils.controls_library.remap_obligations_for_all`

Features:

- Resizable/collapsible left document panel.
- Upload regulatory documents: PDF, Word, TXT, MD, CSV, Excel, images.
- Extract and save obligations using selected model.
- Poll background ingest status via `/api/ingest-task/{task_id}`.
- List uploaded regulatory documents with domain badges and delete controls.
- Clear entire regulatory library.
- Dashboard view:
  - Documents, obligations, domains, merged obligation counts.
  - Cross-library coverage card derived from controls mapped to obligations.
  - Clickable metric breakdown dialog with obligations and mapped controls.
  - Domain distribution bars that filter obligations.
  - All vs merged obligations lists.
- Obligations view:
  - Selected document details.
  - Domain coverage.
  - Domain/enforcement filters.
  - Search.
  - Obligation cards with mapped controls and full text.
- Gap Analysis view:
  - Select two or more regulatory documents.
  - Run graph-enriched gap analysis.
  - Show compared documents, KPIs, domain coverage matrix, similarities, differences, unique domains, and final report markdown.
  - Export JSON, Markdown, and PDF.

Navigation:

- Links to mapped controls set `pendingControlId` and navigate to `/controls-library`.
- Dashboard and left panel drive views inside the page.

Redesign notes:

- Preserve the left document manager plus right analysis workspace pattern, even if visually improved.
- Preserve document selection, checkbox selection for gap analysis, and clear-library confirmation.
- Do not remove mapped-control deep links.
- Upload and polling states need explicit long-running progress treatment.

### Controls Library

Route: `/controls-library`

Frontend:

- `kpmg_ui/client/src/pages/controls-library.tsx`
- `kpmg_ui/client/src/contexts/LibraryMetricsContext.tsx`
- `kpmg_ui/client/src/contexts/CrossNavContext.tsx`

Backend/API:

- `POST /api/controls-library/ingest`
- `GET /api/ingest-task/{task_id}`
- `GET /api/controls-library/documents`
- `GET /api/controls-library/documents/{document_id}`
- `DELETE /api/controls-library/documents/{document_id}`
- `DELETE /api/controls-library/all`
- `POST /api/controls-library/remap-obligations`
- `GET /api/controls-library/all-controls`
- `GET /api/controls-library/merged`
- `POST /api/controls-library/quality-analysis`

Backend files:

- `api/main.py`
- `api/routers/controls_quality.py`
- `utils/controls_library.py`
- `utils/regulatory_library.py` for obligation mapping.

Features:

- Resizable/collapsible left document panel.
- Upload policy/control documents: PDF, Word, TXT, MD, Excel, CSV, images.
- Extract controls and save to library.
- Poll background ingest status.
- Auto quality analysis and obligation remapping are triggered during backend ingest.
- List uploaded documents with delete controls and recent-added feedback.
- Clear entire controls library.
- Remap obligations button to refresh all control-to-obligation mappings.
- Overview tab:
  - Documents, total controls, control domains, merged controls.
  - Domain distribution bars.
  - Searchable/filterable controls list.
  - Document vs merged views.
  - Expandable control cards with metadata, descriptions, keywords, source docs, mapped obligations.
- Quality Analysis tab:
  - Calls `/api/controls-library/quality-analysis`.
  - KPIs for assessed controls, average 5W1H score, improvement-needed count, green/no-action count.
  - Obligation mapping KPIs.
  - RAG donut, 5W1H prevalence chart, RAG by process area.
  - Quality table with RAG/search filters.
  - CSV export.
  - Control detail modal with citation, 5W1H flags, mapped obligations.

Navigation:

- Mapped obligation links set `pendingObligationId` and navigate to `/regulatory-library`.
- Dashboard can set `pendingQualityAnalysis` and open this page.

Redesign notes:

- Preserve the reviewer path from quality KPI to exact control details.
- Keep 5W1H result semantics: who, what, where, how, when, why; score 0-6; RAG green/amber/red.
- Keep remap obligations visible because it repairs relationships after library changes.
- Preserve data-testid attributes in the control testing and regulatory testing surfaces; broader components also have tests.

### Frameworks Library

Route: `/frameworks-library`

Frontend:

- `kpmg_ui/client/src/pages/frameworks-library.tsx`

Backend/API:

- `POST /api/frameworks-library/ingest`
- `GET /api/ingest-task/{task_id}`
- `GET /api/frameworks-library/documents`
- `GET /api/frameworks-library/documents/{document_id}`
- `DELETE /api/frameworks-library/documents/{document_id}`
- `DELETE /api/frameworks-library/all`
- `GET /api/frameworks-library/all-elements`
- `GET /api/frameworks-library/merged`
- `GET /api/frameworks-library/graph-stats`

Backend files:

- `api/main.py`
- `utils/frameworks_library.py`

Features:

- Resizable/collapsible left panel.
- Upload framework files: PDF, Word, TXT, MD, CSV, Excel, images.
- Extract framework/risk/control elements.
- Poll ingest task status.
- List uploaded framework documents with counts and type badges.
- Delete individual frameworks and clear entire library.
- KPI strip: frameworks uploaded, total elements, risk categories.
- Right panel views:
  - Overview: library summary, elements by risk category, uploaded frameworks.
  - Elements: document/all vs merged view, search, category filter, expandable element cards.
  - Graph: knowledge graph existence, stats, last updated, refresh.
- Element cards show element ID, risk category, specificity, description, control implications, applicability, keywords, source documents.

Navigation:

- Internal toggles switch Overview, Elements, Graph.
- Selecting a document opens its Elements view.

Redesign notes:

- This page is functionally similar to Regulatory/Controls libraries but uses different extracted entity types.
- Preserve graph stats view; it explains Graph-RAG behavior to power users.
- Existing file has mojibake in comments/text. A redesign can clean visible copy, but avoid broad unrelated code churn.

### Regulatory Testing

Route: `/regulatory-testing`

Frontend:

- `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- `kpmg_ui/client/src/pages/regulatory-testing.helpers.ts`
- `kpmg_ui/client/src/contexts/RegulatoryTestingContext.tsx`

Backend/API:

- `GET /api/regulatory-library/documents`
- `POST /api/compare-regulations`
- `POST /api/rcm_compliance`
- `POST /api/rcm_compliance_v2`
- `POST /api/regulatory-library/gap-analysis-pdf` is the backend PDF path.

Backend files:

- `api/main.py`
- `utils/regulatory_comparision.py`
- `utils/rcm_compliance_analyzer.py`
- `utils/rcm_report_store.py`

Features:

- Two modes:
  - Regulatory comparison.
  - RCM assessment.
- Regulatory comparison:
  - Configure Regulation A and Regulation B.
  - Each slot can use an uploaded file or a Regulatory Library document.
  - Accepts PDF, Word, TXT, MD, CSV, Excel, images.
  - Submits `regulation_a_source`, `regulation_b_source`, upload files or library document IDs, `selected_model`, `max_workers`.
  - Results tabs: Summary, Frameworks, Controls, Gap Analysis, Report.
  - Shows document analyses, stringency scores, control groups, compliance percentages, domain coverage, unique controls, final markdown report.
- RCM assessment:
  - Regulation source can be library or upload.
  - Library mode selects one or more regulatory library documents and uploads an RCM file.
  - Upload mode uploads one or more regulation files plus an RCM file.
  - Library mode calls `/api/rcm_compliance_v2` and saves report by default.
  - Upload mode calls `/api/rcm_compliance`.
  - Results tabs: Summary, Executive Report, Domain Reports.
  - Shows files analyzed, domains covered, remediation suggestion counts, executive markdown, per-domain reports.
- Exports:
  - JSON export.
  - Markdown report export.
  - PDF export.
  - New comparison reset.

Navigation:

- Sidebar entry opens this page.
- Regulatory Library is the data source for library-based selections.
- Saved RCM reports appear in Reports page.

Redesign notes:

- Preserve the two-mode split and source toggles. They materially change backend payloads.
- Preserve all data-testid attributes in this page; helper tests exist for endpoint selection.
- Current PDF export caution: this page calls `/api/regulatory-library/gap-analysis/pdf`, but backend exposes `/api/regulatory-library/gap-analysis-pdf`. Fixing that is a functional change, not just visual.

### Reports

Route: `/reports`

Frontend:

- `kpmg_ui/client/src/pages/reports.tsx`
- `kpmg_ui/client/src/components/ControlTestingKpis.tsx`

Backend/API:

- `GET /api/rcm-reports`
- `GET /api/rcm-reports/{report_id}`
- `GET /api/rcm-reports/{report_id}/rcm-file`
- `DELETE /api/rcm-reports/{report_id}`
- `POST /api/regulatory-library/gap-analysis-pdf`

Backend files:

- `api/main.py`
- `utils/rcm_report_store.py`

Features:

- Unified report history for:
  - RCM compliance.
  - Regulatory gap analysis.
  - Control testing workpapers.
  - Evidence assessment reports.
- Loading skeletons and empty state.
- Collapsible report cards.
- Type badges and status badges.
- RCM report summary: risk level, compliance score, controls analyzed, compliance KPI row.
- Gap analysis summary: document names, graph-enriched badge, domains/shared/gaps KPIs, markdown report preview.
- Control testing report summary: controls tested, issues, severity, pass/fail/partial/no-evidence.
- Evidence assessment summary: evidence files, controls assessed, graph nodes, executive summary.
- Actions:
  - Download RCM/source file.
  - Download control testing workpaper.
  - Download evidence assessment report.
  - Export report markdown/text.
  - Export gap analysis PDF.
  - Export JSON after full report load.
  - Delete report.

Navigation:

- Populated by Regulatory Testing, Regulatory Library gap analysis, Control Testing, and Evidence Assessment backend saves.

Redesign notes:

- Keep report type differentiation obvious.
- Do not collapse all report types into one generic card; each type has different evidence and download semantics.
- Preserve lazy loading of full report details when expanding a card.

### Asset Registry

Route: `/asset-registry`

Frontend:

- `kpmg_ui/client/src/pages/asset-registry.tsx`
- `kpmg_ui/client/src/contexts/AssetRegistryContext.tsx`
- `kpmg_ui/client/src/components/CiaRatingWidget.tsx`

Backend/API:

- `GET /api/assets?type&criticality&status`
- `POST /api/assets`
- `GET /api/assets/{id}`
- `PUT /api/assets/{id}`
- `DELETE /api/assets/{id}`
- `GET /api/assets/{id}/assessment-history`
- `POST /api/assets/{assetId}/suggest-controls`

Backend files:

- `api/routers/assets.py`
- `utils/risk_scorer.py`
- `utils/controls_library.py`
- `utils/regulatory_library.py`

Features:

- Left panel with asset search and Add Asset modal.
- Dashboard tab:
  - Total assets, critical assets, high assets.
  - Assets by type.
  - Selected asset summary.
- Detail tab:
  - Selected asset fields.
  - Delete.
  - Read-only CIA widget.
- Controls Mapping tab:
  - Suggest Controls button.
  - LLM-backed suggestions sourced from controls/regulatory libraries.
  - Suggestion cards show source and rationale.
- Add Asset modal fields:
  - Name.
  - Asset type.
  - Application-only hosting type.
  - Support type.
  - Description.
  - Use.
  - Location.
  - Status.
  - Owner/custodian.
  - Jurisdiction.
  - Classification.
  - CIA rating widget.

Data semantics:

- CIA values are 1-5.
- CIA total uses max values, not min values, for conservative scoring.
- UI labels more fields as required than the actual validation enforces. Backend defaults many optional fields.
- Only name and description are required by the current UI submission path.

Navigation:

- Risk Assessment can select Asset Registry assets.
- Asset controls suggestions depend on Controls/Regulatory libraries.

Redesign notes:

- Preserve the CIA range widget semantics.
- Safe to improve form layout and reduce modal density.
- Do not change asset enum values unless backend models and tests are updated too.

### Risk Assessment

Route: `/risk-assessment`

Frontend:

- `kpmg_ui/client/src/pages/risk-assessment.tsx`
- `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx`
- `kpmg_ui/client/src/contexts/AssetRegistryContext.tsx`
- `kpmg_ui/client/src/components/CiaRatingWidget.tsx`

Backend/API:

- `GET /api/risk-assessment/sections`
- `GET /api/risk-assessment`
- `POST /api/risk-assessment`
- `GET /api/risk-assessment/{id}`
- `POST /api/risk-assessment/{id}/respond`
- `POST /api/risk-assessment/{id}/respond-batch`
- `GET /api/risk-assessment/{id}/risks`
- `POST /api/risk-assessment/{id}/risks`
- `POST /api/risk-assessment/{id}/analyze`
- `POST /api/risk-assessment/{id}/controls`
- `GET /api/risk-assessment/{id}/residual`
- `POST /api/risk-assessment/{id}/suggest-controls`
- `POST /api/risk-assessment/{id}/generate-report`
- `GET /api/risk-assessment/{id}/report`

Backend files:

- `api/routers/risk_assessment.py`
- `utils/assessment_questions.py`
- `utils/risk_scorer.py`
- `utils/controls_library.py`

Features:

- Seven-step wizard:
  - Create.
  - Questionnaire.
  - Analyse.
  - Risks.
  - Controls.
  - Residual.
  - Report.
- Left assessment list with New Assessment.
- Create form:
  - Select Asset Registry assets.
  - Add ad hoc applications.
  - Ad hoc app fields include name, description, assessment context, and CIA widget.
- Questionnaire:
  - Per-asset tab bar.
  - Section accordion.
  - Yes/No/NA answers.
  - Optional details for Yes/No.
  - Sticky submit bar.
  - Saves one asset at a time via `respond-batch`.
  - Unanswered questions default to `na`.
- Analyse:
  - Auto-triggered by `useEffect`.
  - Calls backend LLM/rule-layer analysis.
  - Advances to risks when complete.
- Risks:
  - Shows generated risks with likelihood, impact, score, category.
- Controls:
  - Auto-suggests controls when entering step if none exist.
  - Refresh Suggestions.
  - Apply controls to risk.
- Residual:
  - Auto-fetches residual results.
  - Refresh and Generate Report.
- Report:
  - Generates and renders markdown report.

Data semantics:

- Backend supports real Asset Registry assets and ad hoc applications.
- Backend merges ad hoc IDs into `asset_ids`; the UI also displays `asset_ids.length + ad_hoc_applications.length` in places, which can overcount.
- Risk bands and scores are backend-owned.

Navigation:

- Pulls assets from Asset Registry context.
- Suggested controls come from Controls Library.
- Report stays within this page and backend can serve it by assessment ID.

Redesign notes:

- Preserve wizard progression and auto-run steps.
- Make long-running analysis states explicit.
- Do not change question answer values (`yes`, `no`, `na`) without backend updates.
- Any layout change must preserve multi-asset questionnaire context.

### Final Report / Evidence Assessment

Route: `/evidence-assessment`

Frontend:

- `kpmg_ui/client/src/pages/evidence-assessment.tsx`
- `kpmg_ui/client/src/contexts/EvidenceContext.tsx`

Backend/API:

- `POST /api/assess-evidence`
- `POST /api/generate-summary`
- `GET /api/download-report?filename=...`

Backend files:

- `api/main.py`
- `utils/evidence_assessor.py`
- `utils/evidence_report_generator.py`
- `utils/graph_rag.py`
- `utils/rcm_report_store.py`
- `utils/controls_library.py`

Features:

- Upload evidence files: PDF, Word, Excel, CSV, TXT.
- Requires selected model in Settings.
- Multi-agent visual flow:
  - Validation Agent.
  - Assessment Agent.
  - Report Agent.
- The UI intentionally waits before validation completion to show an agent progression.
- Submits evidence files plus selected model and max workers.
- Backend builds an evidence graph and loads Controls Library graph if present.
- Backend assesses evidence and generates a workbook/report.
- UI tries to generate an executive summary and download the report.
- Download Report button for generated blob.
- New Assessment resets context.
- Evidence assessment reports are saved into the Reports store when backend succeeds.

Navigation:

- Sidebar label is "Final Report".
- Reports page later shows saved evidence assessment records.

Redesign notes:

- The route name and page title do not fully match the workflow: this is evidence assessment plus final report generation.
- Preserve agent progress semantics if redesigning visuals.
- Backend `download-report` only serves PDF files; if backend returns a non-PDF workbook path, UI falls back to JSON blob.

### Control Testing

Route: `/control-testing`

Frontend:

- `kpmg_ui/client/src/pages/control-testing.tsx`
- `kpmg_ui/client/src/pages/control-testing.helpers.ts`
- `kpmg_ui/client/src/contexts/ControlTestingContext.tsx`
- `kpmg_ui/client/src/components/ControlTestingKpis.tsx`

Backend/API used by current page:

- `POST /api/audit/start`
- `POST /api/audit/upload-evidence`
- `POST /api/audit/generate-workpaper`
- `GET /api/audit/download/{session_id}/{filename}`
- `DELETE /api/audit/session/{session_id}`

Backend files used by current page:

- `api/main.py`
- `utils/audit_session_store.py`
- `utils/test_script_parser.py`
- `utils/evidence_validator.py`
- `utils/audit_analyzer.py`
- `utils/workpaper_filler.py`
- `utils/rcm_report_store.py`

Related but not currently wired to this page:

- `api/routers/control_testing.py`
- endpoints under `/control-testing`
- Mongo collection `control_testing_sessions`

Features:

- Three-step audit workflow:
  - Upload script.
  - Validate evidence.
  - Generate workpaper.
- Upload Excel test script: `.xlsx`, `.xlsm`.
- Parses test script and returns checklist.
- Checklist paginated five controls per page.
- Displays parser warnings.
- Upload evidence files through drag/drop.
- Evidence validation results show accepted/rejected files and tagged controls.
- Can generate workpaper when ready.
- Can force-generate with partial evidence.
- Results show:
  - Overall summary.
  - KPI cards.
  - Severity breakdown.
  - Pass/fail/partial/no-evidence.
  - Download workpaper.
  - New audit reset.

Navigation:

- Reports page shows saved control testing workpapers.

Redesign notes:

- Current page uses legacy `/audit/*`, not `/control-testing/*`. Do not switch endpoints in a UI-only redesign.
- Preserve data-testid attributes. There are page helper tests and likely Playwright flows.
- File upload, checklist, validation results, and force-generate need to remain easy to understand.

### Chat

Route: `/chat`

Frontend:

- `kpmg_ui/client/src/pages/chat.tsx`
- `kpmg_ui/client/src/contexts/ChatContext.tsx`
- `kpmg_ui/client/src/components/ChatInput.tsx`
- `kpmg_ui/client/src/components/ChatMessages.tsx`
- `kpmg_ui/client/src/components/ChatMessage.tsx`

Backend/API:

- `POST /api/build-knowledge-base`
- `POST /api/chat`
- Frontend still calls old endpoints:
  - `POST /api/save-vectorstore`
  - `POST /api/load-vectorstore`

Backend files:

- `api/main.py`
- `utils/chat.py`
- `utils/llm_chain.py`
- `utils/graph_rag.py`

Features:

- Empty-state prompt and chat input.
- Message list with markdown rendering for assistant messages.
- Upload attachments into chat.
- Build chat knowledge base from attachments.
- Sends selected model, user input, chat history, and graph paths.
- Clears chat and uploaded files.
- Shows processing and vectorstore-ready badges in input component.

Data semantics:

- Chat history is frontend context state.
- Backend also has session support, but current UI does not explicitly create or pass a session ID.
- Attachment graph path is `chat_attachment_vectorstore`.
- Global and company graph paths are `saved_global_vectorstore`, `saved_company_vectorstore`.

Redesign notes:

- Current vectorstore endpoint mismatch: backend exposes `/save-graph` and `/load-graph`, while Chat calls `/save-vectorstore` and `/load-vectorstore`. Treat vectorstore-ready UI with caution.
- Preserve selected-model requirement and attachment processing feedback.
- Chat is a work tool; avoid decorative chat layouts that reduce transcript readability.

### Issue Management

Route: `/issue-management`

Frontend:

- `kpmg_ui/client/src/pages/issue-management.tsx`
- `kpmg_ui/client/src/contexts/IssueManagementContext.tsx`

Backend/API:

- `GET /api/issues`
- `POST /api/issues`
- `GET /api/issues/{id}`
- `PUT /api/issues/{id}`
- `DELETE /api/issues/{id}`
- `POST /api/issues/{id}/evidence`
- `POST /api/issues/{id}/submit`
- `POST /api/issues/{id}/approve`
- `GET /api/issues/{id}/impact`
- `GET /api/validation-queue`
- `POST /api/validation-queue`
- `GET /api/validation-queue/{id}`
- `POST /api/validation-queue/{id}/accept`
- `POST /api/validation-queue/{id}/dismiss`

Backend files:

- `api/routers/issues.py`
- `api/routers/validation_queue.py`
- `utils/risk_scorer.py`

Features:

- Left issue list with search, severity filter, status filter, and Add Issue modal.
- Tabs:
  - Dashboard.
  - Detail.
  - Remediation tracker.
  - Validation queue.
- Dashboard:
  - Open, critical, pending, overdue KPIs.
  - Selected issue summary.
  - Impact/control effectiveness panel.
- Detail:
  - Issue metadata.
  - Description.
  - Review history.
  - Delete.
- Remediation tracker:
  - Remediation plan.
  - Evidence upload/list.
  - Submit for review.
  - Approve and close.
  - Return for remediation.
  - Status messages.
- Validation queue:
  - Pending system-generated findings.
  - Accept creates an Issue.
  - Dismiss closes queue item.
- Create Issue modal:
  - Title, description, severity, raised by, owner, checker.

Data semantics:

- Backend supports update, but current UI mostly creates, deletes, submits, approves, and returns. Inline edit is not a current feature.
- Validation queue accept requires issue ownership/reviewer fields.

Navigation:

- Controls Library quality findings can flow into validation queue through backend/quality workflow.

Redesign notes:

- Keep the review workflow status obvious.
- Do not remove Validation Queue; it is the bridge from AI findings to tracked issues.
- Evidence attachment UI is part of remediation, not just detail.

### Exception Management

Route: `/exception-management`

Frontend:

- `kpmg_ui/client/src/pages/exception-management.tsx`

Backend/API:

- None currently.

Features:

- Placeholder page.
- Hero says "Exception Management".
- Empty state says under development.

Navigation:

- Route exists in `App.tsx`, but this page is not in the current sidebar helper.

Redesign notes:

- Safe to redesign placeholder visuals.
- Do not invent backend-backed exception workflows unless the scope explicitly includes implementation.

### Settings

Route: `/settings`

Frontend:

- `kpmg_ui/client/src/pages/settings.tsx`
- `kpmg_ui/client/src/components/ContextFileUpload.tsx`
- `kpmg_ui/client/src/lib/modelSelection.ts`
- `kpmg_ui/client/src/lib/queryClient.ts`
- `kpmg_ui/client/src/components/app-layout.helpers.ts`

Backend/API:

- `GET /api/models`
- `POST /api/build-knowledge-base`
- Frontend still calls old endpoints:
  - `POST /api/load-vectorstore`
  - `POST /api/save-vectorstore`
  - `POST /api/vectorstore/load/{type}`

Backend files:

- `api/main.py`
- `utils/llm_chain.py`
- `utils/graph_rag.py`

Features:

- LLM model selector.
- Persists selected model in localStorage key `selectedModel`.
- Resolves stale selected model against fetched model list.
- General Context upload:
  - Builds global knowledge base.
  - Intended path `saved_global_vectorstore`.
  - Shows vectorstore and graph badges if load/check succeeds.
- Company Policy Context upload:
  - Builds company knowledge base.
  - Intended path `saved_company_vectorstore`.
  - Shows vectorstore and graph badges if load/check succeeds.
- Navigation Visibility:
  - Shows every `HIDEABLE_TABS` page.
  - Toggle visible/hidden.
  - Writes localStorage `nav_hidden_pages`.
  - Dispatches `nav_hidden_pages` browser event so AppLayout refreshes.

Redesign notes:

- Current vectorstore endpoint mismatch: backend exposes `/save-graph` and `/load-graph`, not the old vectorstore endpoints used here.
- Preserve model localStorage key because many pages read it directly.
- Preserve navigation visibility behavior and Settings always-visible rule.

### Font Mockup

Route: `/font-mockup`

Frontend:

- `kpmg_ui/client/src/pages/font-mockup.tsx`

Features:

- Standalone unauthenticated design preview.
- Loads Google Fonts.
- Shows mock KPMG TRACE workspace with sidebar, topbar, hero, metrics, module tiles, workflow, table, and typography samples.
- Uses landing module metadata for preview cards.

Navigation:

- Not in the main app sidebar.
- Bypasses auth gate in `App.tsx`.

Redesign notes:

- This is a sandbox/reference page. Safe to modify for design exploration.
- Avoid letting this page's mock content drift into production data assumptions.

### Not Found

Route: fallback

Frontend:

- `kpmg_ui/client/src/pages/not-found.tsx`

Features:

- Basic 404 page.
- Button navigates to `/`.
- Button label currently says "Go to Chat" even though `/` is Dashboard.

Redesign notes:

- Safe to update copy and visual design.
- Keep the fallback route behavior simple.

## 5. Technical UI-To-Backend Map

### Auth And Shell

| UI file | State/API | Backend |
|---|---|---|
| `AuthContext.tsx` | localStorage users/current user | None |
| `App.tsx` | Provider stack, auth gate, route map, permanent mount | None |
| `AppLayout.tsx` | Sidebar, header, theme, logout, hidden tabs | None |
| `ThemeProvider.tsx` | Theme state | None |

### Library Metrics And Cross Navigation

| UI/context | APIs | Backend files |
|---|---|---|
| `LibraryMetricsContext.tsx` | regulatory docs, controls docs, all controls, merged controls | `api/main.py`, `utils/regulatory_library.py`, `utils/controls_library.py` |
| `CrossNavContext.tsx` | no API; stores pending IDs | Used by Dashboard, Regulatory Library, Controls Library |

### Regulatory Library Flow

1. UI uploads files in `regulatory-library.tsx`.
2. UI posts `selected_model` and files to `/api/regulatory-library/ingest`.
3. FastAPI queues background task in `api/main.py`.
4. UI polls `/api/ingest-task/{task_id}`.
5. `utils/regulatory_library.py` extracts obligations and saves a document.
6. Backend rebuilds graph in `data/library_graphs/regulatory`.
7. Backend remaps controls to obligations through `remap_obligations_for_all`.
8. UI refreshes documents/obligations and updates charts.

### Controls Library Flow

1. UI uploads files in `controls-library.tsx`.
2. UI posts to `/api/controls-library/ingest`.
3. Backend extracts controls in `utils/controls_library.py`.
4. Backend saves controls, rebuilds `data/library_graphs/controls`, runs 5W1H quality, and maps obligations.
5. UI polls ingest task, refreshes list, and can run `/quality-analysis`.
6. Quality findings can feed validation queue/issue workflows.

### Frameworks Library Flow

1. UI uploads files in `frameworks-library.tsx`.
2. UI posts to `/api/frameworks-library/ingest`.
3. Backend extracts framework elements in `utils/frameworks_library.py`.
4. Backend saves documents and rebuilds `data/library_graphs/frameworks`.
5. UI can view all elements, merged elements, and graph stats.

### Regulatory Testing Flow

| Mode | UI payload | Endpoint | Result surface |
|---|---|---|---|
| Regulation comparison | Two slots, each upload or library document, selected model, workers | `/api/compare-regulations` | Summary, Frameworks, Controls, Gaps, Report |
| RCM with library regs | `document_ids`, `rcm_file`, `save_report=true`, selected model | `/api/rcm_compliance_v2` | Summary, Executive Report, Domain Reports, saved Reports entry |
| RCM with uploaded regs | `regulation_files`, `rcm_file`, selected model | `/api/rcm_compliance` | Summary, Executive Report, Domain Reports |

### Report Store Flow

| Producer | Store | Reports page behavior |
|---|---|---|
| RCM compliance | `RCMReportStore.save_report` | RCM badge, score, risk level, download RCM |
| Regulatory gap analysis | `RCMReportStore.save_gap_analysis_report` | Gap badge, markdown preview, PDF export |
| Control testing | `RCMReportStore.save_control_testing_report` | AI Control Testing badge, workpaper download |
| Evidence assessment | `RCMReportStore.save_evidence_assessment_report` | Evidence badge, report download |

### Asset, Risk, Issue Flow

| Feature | Context | Router | Store |
|---|---|---|---|
| Asset Registry | `AssetRegistryContext.tsx` | `api/routers/assets.py` | Mongo `assets` |
| Risk Assessment | `RiskAssessmentContext.tsx` | `api/routers/risk_assessment.py` | Mongo `risk_assessments` |
| Issue Management | `IssueManagementContext.tsx` | `api/routers/issues.py` | Mongo `issues` |
| Validation Queue | `IssueManagementContext.tsx` | `api/routers/validation_queue.py` | Mongo `validation_queue` |

### Chat And Knowledge Graph Flow

| UI action | Current UI endpoint | Current backend support |
|---|---|---|
| Build context/attachment graph | `/api/build-knowledge-base` | Exists. Builds `KnowledgeGraph` in `GRAPH_CACHE`. |
| Save graph/vectorstore | `/api/save-vectorstore` | UI calls this, but backend currently exposes `/save-graph`. |
| Load graph/vectorstore | `/api/load-vectorstore` | UI calls this, but backend currently exposes `/load-graph`. |
| Chat response | `/api/chat` | Exists. Loads graphs by path or cache, calls `utils/chat.py`. |

This mismatch is important for a redesign agent: do not spend UI polish effort on vectorstore-ready states without confirming/fixing the backend alias.

## 6. Backend Endpoint Inventory By File

### `api/main.py`

Meta/session/model:

- `GET /`
- `GET /health`
- `GET /models`
- `POST /session/create`
- `GET /session/{session_id}`
- `DELETE /session/{session_id}`
- `GET /session/{session_id}/history`
- `POST /analyze-query`
- `POST /chat`

Knowledge/evidence:

- `POST /build-knowledge-base`
- `POST /assess-evidence`
- `POST /generate-summary`
- `GET /download-report`
- `POST /save-graph`
- `POST /load-graph`

Regulatory testing / RCM:

- `POST /compare-regulations`
- `POST /rcm_compliance`
- `POST /rcm_compliance_v2`

Reports:

- `GET /rcm-reports`
- `GET /rcm-reports/{report_id}`
- `GET /rcm-reports/{report_id}/rcm-file`
- `DELETE /rcm-reports/{report_id}`

Regulatory Library:

- `POST /regulatory-library/ingest`
- `GET /regulatory-library/documents`
- `GET /regulatory-library/documents/{document_id}`
- `DELETE /regulatory-library/documents/{document_id}`
- `DELETE /regulatory-library/all`
- `GET /regulatory-library/search`
- `GET /regulatory-library/all-obligations`
- `GET /regulatory-library/merged-obligations`
- `POST /regulatory-library/gap-analysis`
- `POST /regulatory-library/gap-analysis-pdf`

Controls Library:

- `POST /controls-library/ingest`
- `GET /controls-library/documents`
- `GET /controls-library/documents/{document_id}`
- `DELETE /controls-library/documents/{document_id}`
- `DELETE /controls-library/all`
- `POST /controls-library/remap-obligations`
- `GET /controls-library/all-controls`
- `GET /controls-library/merged`

Frameworks Library:

- `POST /frameworks-library/ingest`
- `GET /frameworks-library/documents`
- `GET /frameworks-library/documents/{document_id}`
- `DELETE /frameworks-library/documents/{document_id}`
- `DELETE /frameworks-library/all`
- `GET /frameworks-library/all-elements`
- `GET /frameworks-library/merged`
- `GET /frameworks-library/graph-stats`

Legacy audit endpoints used by current Control Testing UI:

- `POST /audit/start`
- `POST /audit/upload-evidence`
- `POST /audit/generate-workpaper`
- `GET /audit/download/{session_id}/{filename}`
- `DELETE /audit/session/{session_id}`

### Routers Included By `api/main.py`

| Router file | Prefix/endpoints | UI page |
|---|---|---|
| `api/routers/assets.py` | `/assets` | Asset Registry |
| `api/routers/risk_assessment.py` | `/risk-assessment` | Risk Assessment |
| `api/routers/controls_quality.py` | `/controls-library/quality-analysis` | Controls Library |
| `api/routers/issues.py` | `/issues` | Issue Management |
| `api/routers/validation_queue.py` | `/validation-queue` | Issue Management |
| `api/routers/control_testing.py` | `/control-testing` | Not used by current Control Testing page |

## 7. Data Stores And Persistent Files

MongoDB database: `trace_db`

| Collection / GridFS | Owner | Purpose |
|---|---|---|
| `assets` | `api/routers/assets.py` | Asset Registry data. |
| `risk_assessments` | `api/routers/risk_assessment.py` | Risk assessment sessions, answers, risks, controls, reports. |
| `issues` | `api/routers/issues.py` | Issue records and evidence attachments. |
| `validation_queue` | `api/routers/validation_queue.py` | AI/system findings pending accept/dismiss. |
| `control_testing_sessions` | `api/routers/control_testing.py` | Newer control-testing sessions, currently not used by UI page. |
| `regulatory_library` | `utils/regulatory_library.py` | Regulatory docs and extracted obligations. |
| `controls_library` | `utils/controls_library.py` | Control docs and extracted controls. |
| `frameworks_library` | `utils/frameworks_library.py` | Framework docs and extracted elements. |
| `rcm_reports` | `utils/rcm_report_store.py` | Report metadata. |
| `rcm_files` GridFS | `utils/rcm_report_store.py` | RCM files, workpapers, evidence reports. |

Graph directories:

- `data/library_graphs/regulatory`
- `data/library_graphs/controls`
- `data/library_graphs/frameworks`

Frontend localStorage keys:

- `ct3_users`
- `ct3_current_user`
- `selectedModel`
- `nav_hidden_pages`

## 8. What A UI Redesign Agent Can Touch

Safe to touch for visual/layout redesign:

- `kpmg_ui/client/src/pages/*.tsx` for layout, copy cleanup, view composition, responsive design, and visual treatment.
- `kpmg_ui/client/src/components/AppLayout.tsx` for shell/sidebar/header redesign, as long as route paths, hidden-page behavior, logout, and theme toggle are preserved.
- `kpmg_ui/client/src/components/HeroSection.tsx`, `KpiCard.tsx`, `ControlTestingKpis.tsx`, `CiaRatingWidget.tsx`, chat display components, and upload components for presentation improvements.
- `kpmg_ui/client/src/components/ui/*` if making deliberate design-system changes.
- `kpmg_ui/client/src/styles/kpmg-brand-override.css`, `kpmg_ui/client/src/index.css`, Tailwind config, and theme tokens.
- `kpmg_ui/client/src/pages/landing.helpers.ts` for module card content/order if routes remain valid.
- `kpmg_ui/client/src/components/app-layout.helpers.ts` for labels/icons/order if paths and Settings visibility remain valid.
- `pages/font-mockup.tsx` as a design sandbox.

Touch carefully and coordinate with tests/backend:

- `kpmg_ui/client/src/App.tsx`: provider order, auth gate, and permanent mount behavior are important.
- `kpmg_ui/client/src/contexts/*`: these define API contracts and preserve workflow state.
- `kpmg_ui/client/src/lib/queryClient.ts`: shared fetch behavior.
- `kpmg_ui/server/routes.ts`: proxy semantics, multipart forwarding, and long timeouts are critical.
- Any `data-testid` attributes in pages/components, especially Regulatory Testing, Control Testing, Chat, Settings, and login-related flows.
- Endpoint strings and FormData field names.
- File accept lists, because backend parsers differ by workflow.

Do not touch for a UI-only redesign:

- `api/**`, unless explicitly fixing API contract issues.
- `utils/**`, unless explicitly changing backend behavior.
- `data/seeds/**`.
- `docker-compose.yml` and Dockerfiles, unless deployment/runtime changes are in scope.
- LLM prompt/extraction/risk scoring logic.
- MongoDB database name `trace_db`.
- `utils/llm_provider.py::get_llm()` routing.
- Core scoring logic: CIA 1-5, risk scoring, criticality bands, 5W1H scoring, RCM parsers.
- Generated caches/logs: `__pycache__`, `.pytest_cache`, `.playwright-cli`, `tmp`.
- `docs/restore-points` unless intentionally adding a restore point.

## 9. Redesign Requirements And Constraints

Preserve these behavioral contracts:

- Route paths listed above.
- `/api/*` calls through Express proxy.
- Model selected in Settings and stored as `selectedModel`.
- Sidebar hidden pages localStorage behavior.
- Cross-page deep links between Dashboard, Regulatory Library, and Controls Library.
- Upload/polling flows for library ingestion.
- Long-running loading/progress states for LLM actions.
- Report lazy-loading and download actions.
- Current Control Testing page's legacy `/audit/*` API usage.
- Regulatory Testing mode/source toggles and FormData field names.
- Risk Assessment wizard step order and auto-run steps.
- Validation queue to issue conversion.

Design expectations:

- This is an operational audit workspace. Prefer dense but readable layouts over marketing-style hero pages.
- Preserve high information density for tables, cards, evidence lists, and review queues.
- Make controls, obligations, risks, evidence, and reports traceable.
- Use icons for action buttons where clear.
- Keep filters, tabs, segmented controls, upload states, empty states, and destructive confirmations explicit.
- Make mobile usable, but desktop auditor workflows are primary.
- Keep text within containers. Many current pages have long filenames, control statements, obligation text, and markdown reports.

## 10. Known Contract Cautions

These are not necessarily redesign tasks, but they matter when touching the UI:

1. Vectorstore endpoints are stale in Chat and Settings.
   - UI calls `/api/save-vectorstore`, `/api/load-vectorstore`, and `/api/vectorstore/load/{type}`.
   - Backend currently exposes `/save-graph` and `/load-graph`.
   - Chat still works best when graphs exist on disk or in `GRAPH_CACHE`, but UI status badges may not reflect backend reality.

2. Regulatory Testing PDF export path is inconsistent.
   - `regulatory-testing.tsx` calls `/api/regulatory-library/gap-analysis/pdf`.
   - Backend exposes `/api/regulatory-library/gap-analysis-pdf`.
   - Reports and Regulatory Library use the backend path correctly.

3. Control Testing has two backend implementations.
   - Current UI uses legacy `/audit/*` endpoints in `api/main.py`.
   - `api/routers/control_testing.py` exposes newer `/control-testing/*` endpoints, but the current page does not use them.

4. Auth is local-only.
   - Do not redesign copy to imply enterprise SSO or server sessions.

5. Risk Assessment count can overcount ad hoc apps.
   - Backend merges ad hoc IDs into `asset_ids`.
   - Some UI count logic adds `asset_ids.length + ad_hoc_applications.length`.

6. Existing docs and some source comments contain mojibake.
   - Visible UI copy can be cleaned during redesign.
   - Avoid unrelated source-wide reformatting.

## 11. Suggested Redesign Work Order

1. Establish design tokens and shell layout first:
   - AppLayout, sidebar, header, typography, button density, cards, tables, tabs, upload states.

2. Redesign core shared components:
   - HeroSection, KpiCard, CiaRatingWidget, upload components, chat message/input, report cards.

3. Redesign high-traffic pages in dependency order:
   - Dashboard.
   - Regulatory Library.
   - Controls Library.
   - Reports.
   - Asset Registry.
   - Risk Assessment.
   - Control Testing.
   - Regulatory Testing.
   - Issue Management.
   - Settings.
   - Chat.

4. Then update secondary pages:
   - Landing.
   - Login.
   - Exception placeholder.
   - Not Found.
   - Font Mockup.

5. Verify after each slice:
   - Route renders.
   - Sidebar navigation works.
   - Hidden page toggles still work.
   - Upload controls still pass file lists/FormData fields.
   - Long-running actions show progress and can recover from errors.
   - Cross-page links still select the intended control/obligation/quality tab.

## 12. Verification Checklist For UI Changes

Minimum local verification for a redesign branch:

- `npm run check` from `kpmg_ui` if TypeScript changes were made.
- `npm run build` from `kpmg_ui`.
- Smoke-test `/login`, `/landing`, `/`, and every sidebar route.
- Verify `/api/models` still populates Settings.
- Verify navigation visibility toggles hide/show sidebar pages.
- Verify at least one upload control still opens file picker and displays selected files.
- Verify Regulatory Testing mode/source toggles keep expected enabled/disabled states.
- Verify Control Testing wizard step indicators and upload states still render.
- Verify Reports expansion still lazy-loads detail.
- Verify Chat input, attachment chips, and clear chat still render.

For visual QA:

- Desktop width around 1440px.
- Laptop width around 1280px.
- Tablet/mobile width around 390px.
- Long filename.
- Long control statement.
- Empty states.
- Loading states.
- Error/destructive states.

