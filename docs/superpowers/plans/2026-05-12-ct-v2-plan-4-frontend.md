# Control Testing V2 — Plan 4: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the CT V2 frontend — a TanStack Query hooks layer, an assessment list/landing page, a create-assessment page, and a five-tab detail page covering the full pipeline lifecycle from case setup through workpaper download and sign-off.


NOTE: USE Frontend design and KPMG-Trace-style skills for ui design. Also read the plan and make image mockups for each page, dialog box and get user confirmation on design/ User journey.

**Architecture:**
- **No new React Context** for CT V2. All server state via TanStack Query hooks in `useControlTesting.ts`.
- The existing `ControlTestingProvider` and `ControlTestingContext.tsx` remain untouched — they back the legacy `/audit/*` wizard which is still registered at `/control-testing` until this plan replaces it.
- The new pages reuse TRACE design system primitives: `HeroSection`, `TracePageBody`, shadcn `Card`, `Badge`, `Button`, `Tabs`, `Dialog`, `Progress`.
- Routing follows the same CSS-hidden permanently-mounted pattern used by the rest of the app (wouter + `location.startsWith`). New sub-routes (`/control-testing/new`, `/control-testing/:id`) are handled inside `AppLayout` analogously to the document-uplift case page.
- `apiRequest` from `lib/queryClient.ts` is used for all mutations. File uploads use raw `fetch` with `FormData` (no `Content-Type` header — browser sets boundary automatically).
- Polling uses `refetchInterval: 4000` on the session query while `stage` is not `complete` or `failed`.

**Tech Stack:** React 18, TanStack Query v5, wouter, shadcn/ui, Lucide icons, TypeScript

**Prerequisite:** Plans 1–3 complete — `/ct/*` FastAPI router registered, all Celery tasks active.

---

## Spec Alignment Update

Apply these corrections before executing any task in this plan:

- Match the corrected API contract from Plans 1–3. `GET /ct/sessions` returns a raw array unless the backend is intentionally changed. Evidence upload must send files under the multipart field name `files`, because the backend endpoint accepts `files: list[UploadFile]`.
- The create page must support both spec input paths: download/upload Excel template and manual control entry. Manual controls must include all control fields, add/remove Steps A–F, sampling mode, and a visible “Begin Analysis” path once controls are saved.
- The detail page must keep five tabs exactly as specified: Case Analysis, Population, Evidence, Testing, Results. Population and Evidence are separate tabs. Population owns population upload, sampling recommendation, sampling override, and manual selected-items flow. Evidence owns per-control evidence files, C&A issues, mapping override, remove file, and the final C&A gate.
- The Evidence tab must implement the sticky gate banner, file-level issue expansion, override modal with minimum 10-character reason, remove-file action, and a red 409 error toast that lists unresolved filenames returned by the API.
- Results must include both per-issue push and `Push All Issues -> Issue Management`, matching `POST /ct/sessions/:id/issues/push-all`.
- Page-level UI must follow the local KPMG Trace page-style skill, not the older mixed style in the draft snippets. New pages use the `controls-diagnostics.tsx` style: page root `h-full overflow-auto bg-[#F0F2F7]`, inline dark hero, `max-w-[1200px]` main, section labels, literal KPMG hex colors, inline button patterns, `Footer`, and no page-level shadcn `Button`, `HeroSection`, `TracePageBody`, or `Skeleton`.
- Treat the large code snippets below as structural drafts. Before implementation, rewrite the page markup to the Trace canonical style while preserving the data-flow requirements above.

## Shared Build Log

All four CT V2 plans share one handoff log: `docs/superpowers/plans/2026-05-12-ct-v2-build-log.md`.

Before starting a task, append a short entry with the task name, planned files, and current status. After completing or pausing a task, append what changed, verification run, blockers, and the exact next step. Keep entries brief but specific enough that another engineer can resume without rereading the whole thread.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `kpmg_ui/client/src/hooks/useControlTesting.ts` | All TanStack Query hooks for CT V2 |
| Replace | `kpmg_ui/client/src/pages/control-testing.tsx` | New CT V2 assessment list + landing page |
| Create | `kpmg_ui/client/src/pages/control-testing-new.tsx` | Create assessment wizard |
| Create | `kpmg_ui/client/src/pages/control-testing-detail.tsx` | 5-tab detail page |
| Modify | `kpmg_ui/client/src/App.tsx` | Route `/control-testing/new` and `/control-testing/:id` sub-pages |

---

### Task 1: TanStack Query Hooks

**Files:**
- Create: `kpmg_ui/client/src/hooks/useControlTesting.ts`

This file is the single API boundary for all CT V2 data. Pages import only from here — never `fetch` directly.

- [ ] **Step 1: Write the hooks file**

```typescript
// kpmg_ui/client/src/hooks/useControlTesting.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CtStage =
  | "input"
  | "analysing"
  | "population"
  | "evidence"
  | "testing"
  | "complete"
  | "failed";

export interface CtSession {
  id: string;
  title: string;
  description: string;
  entity: string;
  testing_period: { from: string; to: string };
  framework: string;
  stage: CtStage;
  stage_checkpoint: Record<string, unknown> | null;
  celery_task_id: string | null;
  llm_suggestions: CtSuggestion[];
  llm_questions: CtQuestion[];
  sign_off: {
    preparer: SignOffEntry;
    reviewer: SignOffEntry;
    manager: SignOffEntry;
  };
  override_log: OverrideEntry[];
  created_at: string;
  updated_at: string;
}

export interface SignOffEntry {
  name: string;
  initials: string;
  date: string | null;
}

export interface OverrideEntry {
  timestamp: string;
  override_type: string;
  control_id: string;
  evidence_filename: string | null;
  original_value: string;
  override_value: string;
  reason: string;
}

export interface CtSuggestion {
  suggestion_id: string;
  control_id: string | null;
  text: string;
  status: "pending" | "accepted" | "dismissed";
}

export interface CtQuestion {
  question_id: string;
  level: "case" | "control";
  control_id: string | null;
  question: string;
  answer: string;
  answered: boolean;
}

export interface CaVerification {
  completeness_passed: boolean | null;
  accuracy_passed: boolean | null;
  issues: Array<{ check: string; finding: string; severity: string }>;
  overridden: boolean;
  override_reason: string | null;
}

export interface EvidenceFile {
  gridfs_id: string;
  filename: string;
  file_type: string;
  mapped_step_labels: string[];
  identified_value: string;
  annotation_regions: unknown[];
  ca_verification: CaVerification;
}

export interface TestStep {
  step_id: string;
  label: string;
  description: string;
  evidence_required: string;
}

export interface SampleResult {
  sample_num: number;
  application: string;
  item_reference: string;
  step_results: Record<string, string>;
}

export interface CtException {
  ref: string;
  sample_num: number | null;
  description: string;
  root_cause: string;
  auditor_disposition: string;
  issues_log_ref?: string;
}

export interface CtControl {
  id: string;
  session_id: string;
  control_id: string;
  control_name: string;
  control_type: string;
  domain: string;
  framework_reference: string;
  inherent_risk_rating: string;
  control_owner: string;
  frequency: string;
  prior_period_result: string;
  walkthrough_performed: boolean;
  test_steps: TestStep[];
  sampling: {
    mode: string;
    population_description: string;
    population_file_id: string | null;
    population_count: number;
    sample_period: string;
    llm_suggested_strategy: string | null;
    llm_suggested_size: number;
    selection_strategy: string | null;
    selected_size: number;
    selected_items: string[];
    population_ca_verification: CaVerification;
  };
  evidence_files: EvidenceFile[];
  sample_results: SampleResult[];
  exceptions: CtException[];
  conclusions: {
    d_and_i: string | null;
    oe: string | null;
    deficiencies_noted: boolean;
    issues_log_refs: string[];
    rationale: string;
    testing_summary: string;
  };
  testing_methods: Record<string, boolean>;
  workbook_output_id: string | null;
  status: string;
}

export interface CtIssue {
  id: string;
  session_id: string;
  control_id: string;
  control_name: string;
  exception_refs: string[];
  title: string;
  summary: string;
  detail: string;
  root_cause: string;
  recommendation: string;
  issues_log_ref: string;
  severity: string;
  pushed_to_issues: boolean;
  issues_module_id: string | null;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const ctKeys = {
  sessions: () => ["/api/ct/sessions"],
  session: (id: string) => [`/api/ct/sessions/${id}`],
  controls: (sessionId: string) => [`/api/ct/sessions/${sessionId}/controls`],
  control: (sessionId: string, controlId: string) => [
    `/api/ct/sessions/${sessionId}/controls/${controlId}`,
  ],
  suggestions: (sessionId: string) => [`/api/ct/sessions/${sessionId}/suggestions`],
  issues: (sessionId: string) => [`/api/ct/sessions/${sessionId}/issues`],
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCtSessions() {
  return useQuery<CtSession[]>({
    queryKey: ctKeys.sessions(),
    staleTime: 30_000,
  });
}

export function useCtSession(id: string, poll = false) {
  return useQuery<CtSession>({
    queryKey: ctKeys.session(id),
    enabled: !!id,
    refetchInterval: poll ? 4_000 : false,
    staleTime: poll ? 0 : 30_000,
  });
}

export function useCtControls(sessionId: string) {
  return useQuery<{ controls: CtControl[] }>({
    queryKey: ctKeys.controls(sessionId),
    enabled: !!sessionId,
    staleTime: 20_000,
  });
}

export function useCtSuggestions(sessionId: string) {
  return useQuery<{ suggestions: CtSuggestion[]; questions: CtQuestion[] }>({
    queryKey: ctKeys.suggestions(sessionId),
    enabled: !!sessionId,
    staleTime: 10_000,
  });
}

export function useCtIssues(sessionId: string) {
  return useQuery<{ issues: CtIssue[] }>({
    queryKey: ctKeys.issues(sessionId),
    enabled: !!sessionId,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      description: string;
      entity: string;
      testing_period: { from: string; to: string };
      framework: string;
    }) => {
      const res = await apiRequest("POST", "/api/ct/sessions", body);
      return res.json() as Promise<CtSession>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ctKeys.sessions() }),
  });
}

export function useUploadTemplate(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/ct/sessions/${sessionId}/upload-template`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ctKeys.session(sessionId) });
      qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) });
    },
  });
}

export function useUploadEvidence(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch(
        `/api/ct/sessions/${sessionId}/controls/${controlId}/evidence`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) }),
  });
}

export function useUploadPopulation(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/ct/sessions/${sessionId}/controls/${controlId}/population`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) }),
  });
}

export function useUpdateSuggestion(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      suggestionId,
      status,
    }: {
      suggestionId: string;
      status: "accepted" | "dismissed";
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/ct/sessions/${sessionId}/suggestions/${suggestionId}`,
        { status }
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.suggestions(sessionId) }),
  });
}

export function useAnswerQuestion(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      questionId,
      answer,
    }: {
      questionId: string;
      answer: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/ct/sessions/${sessionId}/questions/${questionId}/answer`,
        { answer }
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.suggestions(sessionId) }),
  });
}

export function useConfirmReview(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/ct/sessions/${sessionId}/confirm-review`
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.session(sessionId) }),
  });
}

export function useCaOverride(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      reason: string;
      population?: boolean;
      file_gridfs_id?: string;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/ct/sessions/${sessionId}/controls/${controlId}/ca-override`,
        body
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) }),
  });
}

export function useUpdateSampling(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/ct/sessions/${sessionId}/controls/${controlId}/sampling`,
        body
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) }),
  });
}

export function useConfirmMapping(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/ct/sessions/${sessionId}/confirm-mapping`
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.session(sessionId) }),
  });
}

export function useUpdateCtIssue(sessionId: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<CtIssue>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/ct/sessions/${sessionId}/issues/${issueId}`,
        body
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.issues(sessionId) }),
  });
}

export function usePushCtIssue(sessionId: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/ct/sessions/${sessionId}/issues/${issueId}/push`
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.issues(sessionId) }),
  });
}

export function useUpdateSignOff(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, Partial<SignOffEntry>>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/ct/sessions/${sessionId}/sign-off`,
        body
      );
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ctKeys.session(sessionId) }),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const STAGE_TAB: Record<CtStage, string> = {
  input:     "setup",
  analysing: "review",
  population: "evidence",
  evidence:  "evidence",
  testing:   "testing",
  complete:  "results",
  failed:    "setup",
};

export const STAGE_LABEL: Record<CtStage, string> = {
  input:     "Case Setup",
  analysing: "LLM Review",
  population: "Evidence & C&A",
  evidence:  "Evidence & C&A",
  testing:   "Testing in progress…",
  complete:  "Complete",
  failed:    "Failed",
};

export function caResolved(ca: CaVerification): boolean {
  if (ca.overridden) return true;
  return ca.completeness_passed === true && ca.accuracy_passed === true;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Expected: no errors in `useControlTesting.ts`.

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/hooks/useControlTesting.ts
git commit -m "feat(ct-v2): TanStack Query hooks layer for CT V2 API"
```

---

### Task 2: Assessment List Page

**Files:**
- Replace: `kpmg_ui/client/src/pages/control-testing.tsx`

This replaces the legacy wizard page with a session-list landing page. The legacy wizard code is deleted — it called `/audit/*` endpoints which are still live for backward compatibility but no longer served through the UI.

- [ ] **Step 1: Write the new control-testing.tsx**

```tsx
// kpmg_ui/client/src/pages/control-testing.tsx
import { useLocation } from "wouter";
import {
  ClipboardCheck, Plus, Clock, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCtSessions, type CtSession, type CtStage } from "@/hooks/useControlTesting";

const STAGE_BADGE: Record<
  CtStage,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  input:      { label: "Draft",          variant: "outline"     },
  analysing:  { label: "LLM Review",     variant: "secondary"   },
  population: { label: "Evidence",       variant: "secondary"   },
  evidence:   { label: "Evidence",       variant: "secondary"   },
  testing:    { label: "Testing",        variant: "secondary"   },
  complete:   { label: "Complete",       variant: "default"     },
  failed:     { label: "Failed",         variant: "destructive" },
};

const STAGE_ICON: Record<CtStage, React.ComponentType<{ className?: string }>> = {
  input:      Clock,
  analysing:  Loader2,
  population: Loader2,
  evidence:   Loader2,
  testing:    Loader2,
  complete:   CheckCircle2,
  failed:     AlertCircle,
};

function SessionCard({ session }: { session: CtSession }) {
  const [, navigate] = useLocation();
  const badge = STAGE_BADGE[session.stage];
  const Icon = STAGE_ICON[session.stage];
  const isActive = !["complete", "failed", "input"].includes(session.stage);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-border"
      onClick={() => navigate(`/control-testing/${session.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon
              className={`h-4 w-4 shrink-0 ${isActive ? "animate-spin" : ""} text-muted-foreground`}
            />
            <CardTitle className="text-base truncate">{session.title}</CardTitle>
          </div>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <span>
            <span className="font-medium text-foreground">Entity:</span> {session.entity || "—"}
          </span>
          <span>
            <span className="font-medium text-foreground">Framework:</span>{" "}
            {session.framework || "—"}
          </span>
        </div>
        <div>
          <span className="font-medium text-foreground">Period:</span>{" "}
          {session.testing_period?.from} → {session.testing_period?.to}
        </div>
        <div className="text-xs text-muted-foreground/70">
          Created {new Date(session.created_at).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ControlTestingPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useCtSessions();

  const sessions = data ?? [];
  const active = sessions.filter((s) => !["complete", "failed"].includes(s.stage));
  const completed = sessions.filter((s) => s.stage === "complete");
  const failed = sessions.filter((s) => s.stage === "failed");

  const kpis = [
    { label: "Total",     value: sessions.length },
    { label: "Active",    value: active.length   },
    { label: "Complete",  value: completed.length },
    { label: "Failed",    value: failed.length   },
  ];

  return (
    <>
      <HeroSection
        icon={ClipboardCheck}
        title="Control Testing"
        subtitle="AI-assisted SOX ITGC testing with evidence C&A verification and workpaper generation"
        actions={
          <Button onClick={() => navigate("/control-testing/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Assessment
          </Button>
        }
      />
      <TracePageBody>
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load assessments. Is the API running?</span>
          </div>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No assessments yet.</p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={() => navigate("/control-testing/new")}
            >
              <Plus className="h-4 w-4" /> Create your first assessment
            </Button>
          </div>
        )}

        {active.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              In Progress
            </h2>
            <div className="space-y-3">
              {active.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Completed
            </h2>
            <div className="space-y-3">
              {completed.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {failed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Failed
            </h2>
            <div className="space-y-3">
              {failed.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}
      </TracePageBody>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/pages/control-testing.tsx
git commit -m "feat(ct-v2): assessment list page with TanStack Query"
```

---

### Task 3: Create Assessment Page

**Files:**
- Create: `kpmg_ui/client/src/pages/control-testing-new.tsx`

A short wizard: fill session metadata → optionally upload Excel template → submit. On success, navigates to `/control-testing/:id`.

- [ ] **Step 1: Write control-testing-new.tsx**

```tsx
// kpmg_ui/client/src/pages/control-testing-new.tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateSession, useUploadTemplate } from "@/hooks/useControlTesting";

const FRAMEWORKS = ["SOX s.404", "ISO 27001", "NIST CSF", "CIS Controls", "PCI-DSS", "Other"];

interface FormState {
  title: string;
  description: string;
  entity: string;
  framework: string;
  period_from: string;
  period_to: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  entity: "",
  framework: "SOX s.404",
  period_from: "",
  period_to: "",
};

export default function ControlTestingNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [templateFile, setTemplateFile] = useState<File | null>(null);

  const createSession = useCreateSession();

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const valid =
    form.title.trim() &&
    form.entity.trim() &&
    form.framework &&
    form.period_from &&
    form.period_to;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;

    try {
      const session = await createSession.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        entity: form.entity.trim(),
        framework: form.framework,
        testing_period: { from: form.period_from, to: form.period_to },
      });

      if (templateFile) {
        const uploadTemplate = useUploadTemplate(session.id);
        try {
          await uploadTemplate.mutateAsync(templateFile);
          toast({ title: "Template uploaded", description: "Parsing controls in background…" });
        } catch {
          toast({
            title: "Template upload failed",
            description: "You can upload it from the assessment detail page.",
            variant: "destructive",
          });
        }
      }

      navigate(`/control-testing/${session.id}`);
    } catch (err: unknown) {
      toast({
        title: "Failed to create assessment",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/control-testing")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">New Assessment</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assessment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Assessment Title *</Label>
              <Input
                id="title"
                placeholder="e.g. Q1 2026 ITGC Assessment"
                value={form.title}
                onChange={set("title")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity">Entity / Business Unit *</Label>
              <Input
                id="entity"
                placeholder="e.g. Technology & Operations"
                value={form.entity}
                onChange={set("entity")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Framework *</Label>
              <Select
                value={form.framework}
                onValueChange={(v) => setForm((prev) => ({ ...prev, framework: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAMEWORKS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="period_from">Testing Period From *</Label>
                <Input
                  id="period_from"
                  type="date"
                  value={form.period_from}
                  onChange={set("period_from")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period_to">Testing Period To *</Label>
                <Input
                  id="period_to"
                  type="date"
                  value={form.period_to}
                  onChange={set("period_to")}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Brief scope or notes"
                value={form.description}
                onChange={set("description")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input Template (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a completed .xlsx template to pre-populate controls. You can also upload it later
              from the assessment detail page.
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => document.getElementById("template-upload")?.click()}
              >
                <Upload className="h-4 w-4" />
                {templateFile ? "Change file" : "Choose .xlsx"}
              </Button>
              {templateFile && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  {templateFile.name}
                </div>
              )}
              <input
                id="template-upload"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/control-testing")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || createSession.isPending} className="gap-2">
            {createSession.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Assessment
          </Button>
        </div>
      </form>
    </div>
  );
}
```

**Note on the `useUploadTemplate` call inside `handleSubmit`:** React hooks cannot be called conditionally. Move the `useUploadTemplate` call to component-level (outside `handleSubmit`) and pass the session id after creation. The correct pattern:

```tsx
// At component level (before JSX):
const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
const uploadTemplate = useUploadTemplate(pendingSessionId ?? "");

// In handleSubmit, after createSession:
setPendingSessionId(session.id);
if (templateFile) {
  await uploadTemplate.mutateAsync(templateFile);
}
navigate(`/control-testing/${session.id}`);
```

Update the file to use this pattern.

- [ ] **Step 2: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/pages/control-testing-new.tsx
git commit -m "feat(ct-v2): create assessment page"
```

---

### Task 4: Assessment Detail Page — 5 Tabs

**Files:**
- Create: `kpmg_ui/client/src/pages/control-testing-detail.tsx`

This is the main workspace. It reads the session id from the URL, polls for stage transitions, and displays the appropriate tab. Tabs are always rendered but locked (disabled + tooltip) when the session hasn't reached that stage yet.

- [ ] **Step 1: Write control-testing-detail.tsx**

The file is large — implement it section by section exactly as specified below.

```tsx
// kpmg_ui/client/src/pages/control-testing-detail.tsx
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Download, FileSpreadsheet, Upload, CheckCircle2,
  AlertCircle, Loader2, ChevronDown, ChevronRight, Send, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useCtSession,
  useCtControls,
  useCtSuggestions,
  useCtIssues,
  useUploadTemplate,
  useUpdateSuggestion,
  useAnswerQuestion,
  useConfirmReview,
  useUploadEvidence,
  useUploadPopulation,
  useCaOverride,
  useUpdateSampling,
  useConfirmMapping,
  useUpdateCtIssue,
  usePushCtIssue,
  useUpdateSignOff,
  caResolved,
  STAGE_LABEL,
  type CtControl,
  type CtIssue,
  type EvidenceFile,
} from "@/hooks/useControlTesting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StagePill({ stage }: { stage: string }) {
  const isActive = !["complete", "failed", "input"].includes(stage);
  const color =
    stage === "complete"
      ? "bg-emerald-100 text-emerald-700"
      : stage === "failed"
      ? "bg-red-100 text-red-700"
      : "bg-blue-100 text-blue-700";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${color}`}
    >
      {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
      {STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}
    </span>
  );
}

function CaStatusIcon({ passed }: { passed: boolean | null }) {
  if (passed === null) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return passed ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  ) : (
    <AlertCircle className="h-4 w-4 text-red-500" />
  );
}

// ---------------------------------------------------------------------------
// Override Dialog
// ---------------------------------------------------------------------------

function CaOverrideDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override C&A Verification</DialogTitle>
          <DialogDescription>
            Provide a documented reason for overriding the failed C&A checks. This will be recorded
            in the audit override log and included in the workpaper.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Reason for override *</Label>
          <Textarea
            rows={4}
            placeholder="Describe why this evidence should be accepted despite the C&A findings…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {tooShort && reason.length > 0 && (
            <p className="text-xs text-red-500">Minimum 10 characters required.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(reason.trim())}
            disabled={tooShort || isLoading}
            className="gap-2"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Override & Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — Case Setup
// ---------------------------------------------------------------------------

function TabSetup({ sessionId, stage }: { sessionId: string; stage: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTemplate = useUploadTemplate(sessionId);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx")) {
      toast({ title: "Only .xlsx files accepted", variant: "destructive" });
      return;
    }
    try {
      await uploadTemplate.mutateAsync(file);
      toast({ title: "Template uploaded", description: "Parsing controls in background…" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const canUpload = stage === "input";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upload Input Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload your completed .xlsx template containing control IDs, test steps, sampling
            methodology, and evidence requirements. The LLM will analyse the case once parsing
            completes.
          </p>
          {canUpload ? (
            <div>
              <Button
                variant="outline"
                className="gap-2"
                disabled={uploadTemplate.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadTemplate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadTemplate.isPending ? "Uploading…" : "Upload .xlsx template"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Template uploaded and parsed successfully.
            </div>
          )}
        </CardContent>
      </Card>

      {stage !== "input" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StagePill stage={stage} />
            <p className="text-sm text-muted-foreground mt-2">
              Template parsed. Move to the{" "}
              <span className="font-medium">LLM Review</span> tab to review suggestions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — LLM Review
// ---------------------------------------------------------------------------

function TabReview({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useCtSuggestions(sessionId);
  const updateSuggestion = useUpdateSuggestion(sessionId);
  const answerQuestion = useAnswerQuestion(sessionId);
  const confirmReview = useConfirmReview(sessionId);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const suggestions = data?.suggestions ?? [];
  const questions = data?.questions ?? [];
  const allAnswered = questions.every((q) => q.answered || answers[q.question_id]?.trim());

  async function handleAnswer(qid: string) {
    const answer = answers[qid]?.trim();
    if (!answer) return;
    try {
      await answerQuestion.mutateAsync({ questionId: qid, answer });
      setAnswers((prev) => ({ ...prev, [qid]: "" }));
    } catch {
      toast({ title: "Failed to save answer", variant: "destructive" });
    }
  }

  async function handleConfirm() {
    try {
      await confirmReview.mutateAsync();
      toast({ title: "Review confirmed", description: "Evidence mapping has started…" });
    } catch (err: unknown) {
      toast({
        title: "Cannot confirm",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  return (
    <div className="space-y-5">
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              LLM Suggestions ({suggestions.filter((s) => s.status === "pending").length} pending)
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {suggestions.map((s) => (
              <div key={s.suggestion_id} className="py-3 flex items-start justify-between gap-3">
                <p className="text-sm">{s.text}</p>
                {s.status === "pending" ? (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-300"
                      onClick={() =>
                        updateSuggestion.mutate({ suggestionId: s.suggestion_id, status: "accepted" })
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateSuggestion.mutate({ suggestionId: s.suggestion_id, status: "dismissed" })
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant={s.status === "accepted" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {s.status}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Questions ({questions.filter((q) => !q.answered).length} unanswered)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((q) => (
              <div key={q.question_id} className="space-y-2">
                <p className="text-sm font-medium">{q.question}</p>
                {q.answered ? (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {q.answer}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your answer…"
                      value={answers[q.question_id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.question_id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleAnswer(q.question_id)}
                    />
                    <Button
                      size="sm"
                      disabled={!answers[q.question_id]?.trim()}
                      onClick={() => handleAnswer(q.question_id)}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleConfirm}
          disabled={!allAnswered || confirmReview.isPending}
          className="gap-2"
        >
          {confirmReview.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm Review & Start Evidence Mapping
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Evidence & C&A
// ---------------------------------------------------------------------------

function EvidenceFileRow({
  ev,
  sessionId,
  controlId,
}: {
  ev: EvidenceFile;
  sessionId: string;
  controlId: string;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const caOverride = useCaOverride(sessionId, controlId);
  const { toast } = useToast();
  const resolved = caResolved(ev.ca_verification);
  const failed =
    ev.ca_verification.completeness_passed === false ||
    ev.ca_verification.accuracy_passed === false;

  async function handleOverride(reason: string) {
    try {
      await caOverride.mutateAsync({ reason, file_gridfs_id: ev.gridfs_id });
      toast({ title: "Override recorded" });
      setOverrideOpen(false);
    } catch {
      toast({ title: "Override failed", variant: "destructive" });
    }
  }

  return (
    <>
      <div className="py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{ev.filename}</span>
          {ev.mapped_step_labels.length > 0 && (
            <div className="flex gap-1">
              {ev.mapped_step_labels.map((l) => (
                <Badge key={l} variant="secondary" className="text-xs">
                  Step {l}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CaStatusIcon passed={ev.ca_verification.completeness_passed} />
          <span className="text-xs text-muted-foreground">C</span>
          <CaStatusIcon passed={ev.ca_verification.accuracy_passed} />
          <span className="text-xs text-muted-foreground">A</span>
          {ev.ca_verification.overridden && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              Overridden
            </Badge>
          )}
          {failed && !ev.ca_verification.overridden && (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-300 text-xs"
              onClick={() => setOverrideOpen(true)}
            >
              Override
            </Button>
          )}
        </div>
      </div>
      <CaOverrideDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onConfirm={handleOverride}
        isLoading={caOverride.isPending}
      />
    </>
  );
}

function ControlEvidenceCard({
  control,
  sessionId,
}: {
  control: CtControl;
  sessionId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const uploadEvidence = useUploadEvidence(sessionId, control.id);
  const uploadPopulation = useUploadPopulation(sessionId, control.id);
  const evRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLInputElement>(null);

  const allCaResolved = control.evidence_files.every((ev) => caResolved(ev.ca_verification));
  const needsPopulation = ["sample", "both"].includes(control.sampling.mode);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer py-3 px-4"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">
              {control.control_id} — {control.control_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {control.sampling.mode}
            </Badge>
            {allCaResolved && control.evidence_files.length > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {needsPopulation && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Population File
              </p>
              {control.sampling.population_file_id ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Population uploaded ({control.sampling.population_count} rows)</span>
                  <CaStatusIcon
                    passed={control.sampling.population_ca_verification.completeness_passed}
                  />
                  <span className="text-xs text-muted-foreground">C</span>
                  <CaStatusIcon
                    passed={control.sampling.population_ca_verification.accuracy_passed}
                  />
                  <span className="text-xs text-muted-foreground">A</span>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={uploadPopulation.isPending}
                  onClick={() => popRef.current?.click()}
                >
                  {uploadPopulation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Upload population .xlsx
                </Button>
              )}
              <input
                ref={popRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPopulation.mutate(f);
                }}
              />
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence Files
            </p>
            <div className="divide-y">
              {control.evidence_files.map((ev) => (
                <EvidenceFileRow
                  key={ev.gridfs_id}
                  ev={ev}
                  sessionId={sessionId}
                  controlId={control.id}
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 mt-2"
              disabled={uploadEvidence.isPending}
              onClick={() => evRef.current?.click()}
            >
              {uploadEvidence.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Add evidence file
            </Button>
            <input
              ref={evRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadEvidence.mutate(f);
              }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function TabEvidence({ sessionId, stage }: { sessionId: string; stage: string }) {
  const { toast } = useToast();
  const { data } = useCtControls(sessionId);
  const confirmMapping = useConfirmMapping(sessionId);
  const controls = data?.controls ?? [];

  async function handleConfirm() {
    try {
      await confirmMapping.mutateAsync();
      toast({ title: "Mapping confirmed", description: "Testing has been queued…" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("409") || msg.includes("C&A")) {
        toast({
          title: "C&A gate not cleared",
          description: "Resolve or override all failed C&A checks before proceeding.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to confirm", description: msg, variant: "destructive" });
      }
    }
  }

  const isProcessing = ["testing", "complete"].includes(stage);

  return (
    <div className="space-y-4">
      {controls.map((ctrl) => (
        <ControlEvidenceCard key={ctrl.id} control={ctrl} sessionId={sessionId} />
      ))}
      {!isProcessing && (
        <div className="flex justify-end">
          <Button
            onClick={handleConfirm}
            disabled={confirmMapping.isPending}
            className="gap-2"
          >
            {confirmMapping.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Evidence Mapping & Start Testing
          </Button>
        </div>
      )}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Testing is running in the background…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — Testing Results
// ---------------------------------------------------------------------------

const TICKMARK_CLASS: Record<string, string> = {
  "√":  "text-emerald-600 font-bold",
  "NA": "text-muted-foreground",
  "W":  "text-blue-600 font-medium",
};

function TabTesting({ sessionId, stage }: { sessionId: string; stage: string }) {
  const { data } = useCtControls(sessionId);
  const controls = data?.controls ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (stage === "testing") {
    return (
      <div className="flex items-center gap-3 py-10 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Testing in progress — this may take several minutes…</span>
      </div>
    );
  }

  const done = controls.filter((c) => c.status === "complete");

  return (
    <div className="space-y-4">
      {done.map((ctrl) => {
        const isOpen = expanded[ctrl.id];
        const hasFail = ctrl.exceptions.length > 0;
        return (
          <Card key={ctrl.id}>
            <CardHeader
              className="cursor-pointer py-3 px-4"
              onClick={() => setExpanded((p) => ({ ...p, [ctrl.id]: !p[ctrl.id] }))}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="text-sm font-medium">
                    {ctrl.control_id} — {ctrl.control_name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ctrl.conclusions.d_and_i && (
                    <Badge
                      variant={ctrl.conclusions.d_and_i === "Effective" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      D&I: {ctrl.conclusions.d_and_i}
                    </Badge>
                  )}
                  {ctrl.conclusions.oe && (
                    <Badge
                      variant={ctrl.conclusions.oe === "Effective" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      OE: {ctrl.conclusions.oe}
                    </Badge>
                  )}
                  {hasFail && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="pt-0 space-y-4">
                {ctrl.sample_results.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="border px-2 py-1 text-left bg-muted">Sample</th>
                          {ctrl.test_steps.map((s) => (
                            <th key={s.label} className="border px-2 py-1 bg-muted">
                              Step {s.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ctrl.sample_results.map((r) => (
                          <tr key={r.sample_num}>
                            <td className="border px-2 py-1">
                              {r.sample_num} — {r.item_reference}
                            </td>
                            {ctrl.test_steps.map((s) => {
                              const mark = r.step_results[s.label] ?? "—";
                              const cls =
                                TICKMARK_CLASS[mark] ??
                                "text-red-600 font-bold";
                              return (
                                <td
                                  key={s.label}
                                  className={`border px-2 py-1 text-center ${cls}`}
                                >
                                  {mark}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {ctrl.exceptions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Exceptions ({ctrl.exceptions.length})
                    </p>
                    <div className="space-y-2">
                      {ctrl.exceptions.map((ex) => (
                        <div
                          key={ex.ref}
                          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
                        >
                          <span className="font-bold text-red-700">{ex.ref}</span>{" "}
                          — Sample {ex.sample_num ?? "N/A"}:{" "}
                          {ex.description}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({ex.root_cause})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ctrl.conclusions.rationale && (
                  <p className="text-sm text-muted-foreground italic">
                    {ctrl.conclusions.rationale}
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5 — Results & Workpapers
// ---------------------------------------------------------------------------

function IssueCard({
  issue,
  sessionId,
}: {
  issue: CtIssue;
  sessionId: string;
}) {
  const { toast } = useToast();
  const updateIssue = useUpdateCtIssue(sessionId, issue.id);
  const pushIssue = usePushCtIssue(sessionId, issue.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: issue.title,
    recommendation: issue.recommendation,
    severity: issue.severity,
  });

  async function handleSave() {
    try {
      await updateIssue.mutateAsync(form);
      setEditing(false);
      toast({ title: "Issue updated" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  async function handlePush() {
    try {
      await pushIssue.mutateAsync();
      toast({ title: "Issue pushed to Issues module" });
    } catch {
      toast({ title: "Push failed", variant: "destructive" });
    }
  }

  const SEV_COLOR: Record<string, string> = {
    Critical: "bg-red-100 text-red-700",
    High:     "bg-orange-100 text-orange-700",
    Medium:   "bg-yellow-100 text-yellow-700",
    Low:      "bg-emerald-100 text-emerald-700",
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {editing ? (
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="font-semibold"
              />
            ) : (
              <p className="text-sm font-semibold">{issue.title}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{issue.control_name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEV_COLOR[issue.severity] ?? ""}`}
            >
              {issue.severity}
            </span>
            {issue.pushed_to_issues ? (
              <Badge variant="default" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Pushed
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                disabled={pushIssue.isPending}
                onClick={handlePush}
              >
                <Send className="h-3 w-3" /> Push to Issues
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2 text-sm">
        <div>
          <span className="font-medium">Summary: </span>
          {issue.summary}
        </div>
        <div>
          <span className="font-medium">Recommendation: </span>
          {editing ? (
            <Textarea
              value={form.recommendation}
              onChange={(e) => setForm((p) => ({ ...p, recommendation: e.target.value }))}
              rows={2}
              className="mt-1"
            />
          ) : (
            issue.recommendation
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={updateIssue.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TabResults({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const { data: controlsData } = useCtControls(sessionId);
  const { data: issuesData } = useCtIssues(sessionId);
  const { data: session } = useCtSession(sessionId);
  const updateSignOff = useUpdateSignOff(sessionId);

  const controls = controlsData?.controls ?? [];
  const issues = issuesData?.issues ?? [];
  const signOff = session?.sign_off ?? {
    preparer: { name: "", initials: "", date: null },
    reviewer: { name: "", initials: "", date: null },
    manager:  { name: "", initials: "", date: null },
  };

  const [signOffForm, setSignOffForm] = useState(signOff);

  async function handleSignOff(role: "preparer" | "reviewer" | "manager") {
    try {
      await updateSignOff.mutateAsync({ [role]: signOffForm[role] });
      toast({ title: "Sign-off saved" });
    } catch {
      toast({ title: "Sign-off failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Conclusions summary */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Control Conclusions
        </h2>
        <div className="space-y-2">
          {controls.map((ctrl) => (
            <div
              key={ctrl.id}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{ctrl.control_id} — {ctrl.control_name}</p>
                {ctrl.conclusions.testing_summary && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ctrl.conclusions.testing_summary}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={ctrl.conclusions.oe === "Effective" ? "default" : "destructive"}
                  className="text-xs"
                >
                  OE: {ctrl.conclusions.oe ?? "—"}
                </Badge>
                {ctrl.workbook_output_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() =>
                      window.open(
                        `/api/ct/sessions/${sessionId}/controls/${ctrl.id}/workbook`,
                        "_blank"
                      )
                    }
                  >
                    <Download className="h-3 w-3" /> Workbook
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Drafted issues */}
      {issues.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Drafted Issues ({issues.length})
          </h2>
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} sessionId={sessionId} />
            ))}
          </div>
        </section>
      )}

      {/* Sign-off */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Sign-Off
        </h2>
        <Card>
          <CardContent className="pt-4 space-y-4">
            {(["preparer", "reviewer", "manager"] as const).map((role) => (
              <div key={role} className="grid grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="capitalize">{role}</Label>
                  <Input
                    placeholder="Full name"
                    value={signOffForm[role]?.name ?? ""}
                    onChange={(e) =>
                      setSignOffForm((p) => ({
                        ...p,
                        [role]: { ...p[role], name: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Initials</Label>
                  <Input
                    placeholder="AB"
                    maxLength={4}
                    value={signOffForm[role]?.initials ?? ""}
                    onChange={(e) =>
                      setSignOffForm((p) => ({
                        ...p,
                        [role]: { ...p[role], initials: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1 flex-1">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={signOffForm[role]?.date ?? ""}
                      onChange={(e) =>
                        setSignOffForm((p) => ({
                          ...p,
                          [role]: { ...p[role], date: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={updateSignOff.isPending}
                    onClick={() => handleSignOff(role)}
                  >
                    <ShieldCheck className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main detail page
// ---------------------------------------------------------------------------

export default function ControlTestingDetailPage() {
  const [location, navigate] = useLocation();
  const sessionId = location.split("/").pop() ?? "";

  const isPolling =
    !["complete", "failed", "input", "analysing"].includes(
      // we read stage below; pre-check to trigger polling only during active stages
      "polling_check"
    );

  const { data: session, isLoading } = useCtSession(sessionId, true);
  const stage = session?.stage ?? "input";

  const shouldPoll = !["complete", "failed"].includes(stage);
  // Re-fetch with polling if active — the hook already has refetchInterval on poll=true
  // We pass poll=true always; the refetchInterval of 4000ms is cheap when complete.

  const TABS = [
    { value: "setup",    label: "1. Case Setup"     },
    { value: "review",   label: "2. LLM Review"     },
    { value: "evidence", label: "3. Evidence & C&A" },
    { value: "testing",  label: "4. Testing"        },
    { value: "results",  label: "5. Results"        },
  ];

  const STAGE_TAB_MAP: Record<string, string> = {
    input:      "setup",
    analysing:  "review",
    population: "evidence",
    evidence:   "evidence",
    testing:    "testing",
    complete:   "results",
    failed:     "setup",
  };

  const defaultTab = STAGE_TAB_MAP[stage] ?? "setup";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabReachable = (tab: string): boolean => {
    const order = ["setup", "review", "evidence", "testing", "results"];
    const current = order.indexOf(defaultTab);
    const target = order.indexOf(tab);
    return target <= current;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <p>Assessment not found.</p>
        <Button
          variant="link"
          onClick={() => navigate("/control-testing")}
          className="mt-2"
        >
          Back to assessments
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/control-testing")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Assessments
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{session.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <StagePill stage={stage} />
            <span className="text-xs text-muted-foreground">
              {session.entity} · {session.testing_period.from} → {session.testing_period.to}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              disabled={!tabReachable(t.value)}
              className="shrink-0"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="setup" className="mt-4">
          <TabSetup sessionId={sessionId} stage={stage} />
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <TabReview sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <TabEvidence sessionId={sessionId} stage={stage} />
        </TabsContent>

        <TabsContent value="testing" className="mt-4">
          <TabTesting sessionId={sessionId} stage={stage} />
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <TabResults sessionId={sessionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Fix any type errors — common ones:
- `useLocation` returns `[string, (to: string) => void]` — destructure as `const [location, navigate] = useLocation()`
- `Textarea` import from `@/components/ui/textarea`
- `Label` import from `@/components/ui/label`

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/pages/control-testing-detail.tsx
git commit -m "feat(ct-v2): 5-tab assessment detail page"
```

---

### Task 5: App.tsx Routing

**Files:**
- Modify: `kpmg_ui/client/src/App.tsx`

Add routing for the two new CT sub-pages, mirroring the document-uplift case page pattern.

- [ ] **Step 1: Add imports at top of App.tsx**

After the existing `ControlTestingPage` import line, add:

```tsx
import ControlTestingNewPage from "@/pages/control-testing-new";
import ControlTestingDetailPage from "@/pages/control-testing-detail";
```

- [ ] **Step 2: Update Router function**

Inside `Router`, find the block that handles `location.startsWith("/document-uplift/")` inside `AppLayout`. Extend the condition to also handle CT sub-routes:

```tsx
return (
  <AppLayout>
    {location.startsWith("/document-uplift/") ? (
      <div className="h-full min-h-0 overflow-hidden">
        <DocumentUpliftCasePage />
      </div>
    ) : location === "/control-testing/new" ? (
      <div className="h-full min-h-0 overflow-y-auto">
        <ControlTestingNewPage />
      </div>
    ) : location.startsWith("/control-testing/") ? (
      <div className="h-full min-h-0 overflow-y-auto">
        <ControlTestingDetailPage />
      </div>
    ) : (
      PAGES.map(({ path, Page }) => (
        <div key={path} className={location === path ? "h-full min-h-0 overflow-hidden" : "hidden"}>
          <Page />
        </div>
      ))
    )}
  </AppLayout>
);
```

- [ ] **Step 3: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add kpmg_ui/client/src/App.tsx
git commit -m "feat(ct-v2): add /control-testing/new and /control-testing/:id routes to App router"
```

---

### Task 6: Express BFF Verification

The Express BFF in `kpmg_ui/server/routes.ts` already proxies all `/api/*` routes to FastAPI by stripping the `/api` prefix. No changes are needed — `/api/ct/*` → `/ct/*` on FastAPI automatically.

- [ ] **Step 1: Verify proxy covers /api/ct routes**

Confirm `proxyToFastAPI` is registered for all methods under `/api`:

```bash
grep -n "proxyToFastAPI\|router.use\|app.use" kpmg_ui/server/routes.ts
```

Expected: a wildcard `app.all("/api/*", proxyToFastAPI)` or equivalent catch-all.

If a more specific registration is needed, add to routes.ts:

```typescript
app.all("/api/ct/*", proxyToFastAPI);
```

Place it before any existing catch-all to ensure it is reached.

- [ ] **Step 2: Commit if routes.ts was modified**

```bash
git add kpmg_ui/server/routes.ts
git commit -m "fix(bff): ensure /api/ct/* proxy route is registered"
```

---

### Task 7: End-to-End Smoke Test

- [ ] **Step 1: Start services**

```bash
docker compose up --build -d
```

- [ ] **Step 2: Verify pages load**

Open browser to `http://localhost:5000/control-testing`:

1. List page renders with KPI cards (all zeros on fresh environment)
2. "New Assessment" button navigates to `/control-testing/new`
3. Fill form → Create Assessment → redirected to `/control-testing/:id`
4. Tab 1 is active and "Upload .xlsx template" button is present
5. After uploading a template, stage transitions to `analysing` (verify by refreshing)
6. Tab 2 becomes active with suggestions and questions
7. After answering all questions and confirming, stage transitions to `population`
8. Tab 3 becomes active

- [ ] **Step 3: TypeScript final check**

```bash
cd kpmg_ui && npm run check
```

Expected: no errors across all new files.

- [ ] **Step 4: Update HANDOFF.md**

Append to `docs/HANDOFF.md`:

```markdown
## CT V2 — Sub-plan 4: Frontend (2026-05-12)

**Status:** Complete

- `kpmg_ui/client/src/hooks/useControlTesting.ts` — TanStack Query hooks: 6 queries + 12 mutations + type definitions for all CT V2 entities
- `kpmg_ui/client/src/pages/control-testing.tsx` — Replaced legacy wizard with session list page (KPI strip + active/completed/failed sections)
- `kpmg_ui/client/src/pages/control-testing-new.tsx` — Create assessment page with optional template upload
- `kpmg_ui/client/src/pages/control-testing-detail.tsx` — 5-tab detail page:
  - Tab 1 (Case Setup): template upload, stage status
  - Tab 2 (LLM Review): suggestions accept/dismiss, Q&A, confirm-review gate
  - Tab 3 (Evidence & C&A): per-control population + evidence upload, C&A status, override modal, confirm-mapping gate
  - Tab 4 (Testing): per-control tickmark grid, exceptions list, conclusions
  - Tab 5 (Results): workbook downloads, issue cards with edit + push-to-module, sign-off form
- `kpmg_ui/client/src/App.tsx` — CT sub-routes (`/control-testing/new`, `/control-testing/:id`) added analogously to document-uplift case page

**CT V2 implementation is complete across all 4 sub-plans.**
```

- [ ] **Step 5: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: HANDOFF updated, CT V2 Sub-plan 4 (frontend) complete — all 4 plans done"
```
