import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type CtStage =
  | "input"
  | "analysing"
  | "population"
  | "evidence"
  | "testing"
  | "workbook"
  | "complete"
  | "failed";

export interface SignOffEntry {
  name: string;
  initials: string;
  date: string | null;
}

export interface OverrideEntry {
  timestamp?: string;
  override_type: string;
  control_id: string;
  evidence_filename?: string | null;
  original_value?: string;
  override_value?: string;
  reason: string;
  updated_at?: string;
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
  controls?: CtControl[];
}

export interface CtSessionSummary {
  id: string;
  title: string;
  entity: string;
  framework: string;
  stage: CtStage;
  control_count: number;
  created_at: string;
  updated_at: string;
}

export interface CaVerification {
  completeness_passed: boolean | null;
  accuracy_passed: boolean | null;
  issues: Array<{ check: string; finding: string; severity: string }>;
  overridden: boolean;
  override_reason: string | null;
}

export interface CtSupportFile {
  gridfs_id: string;
  filename: string;
  file_type: string;
  support_type: string;
  comments: string;
  reconciliation: {
    unique_key_columns: string[];
    expected_count: number | null;
  };
  created_at?: string;
}

export interface EvidenceFile {
  gridfs_id: string;
  filename: string;
  file_type: string;
  mapped_step_labels: string[];
  identified_value: string;
  annotation_regions: unknown[];
  support_files?: CtSupportFile[];
  ca_verification: CaVerification;
}

export interface TestStep {
  step_id?: string;
  label: string;
  description: string;
  evidence_required: string;
}

export interface StepResult {
  label: string;
  tickmark: string;
  notes: string;
}

export interface SampleResult {
  sample_num: number;
  application: string;
  item_reference: string;
  step_results: StepResult[];
}

export interface CtException {
  ref: string;
  sample_num: number | null;
  description: string;
  root_cause: string;
  auditor_disposition: string;
  issues_log_ref?: string | null;
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
  risk: string;
  test_steps: TestStep[];
  sampling: {
    mode: string;
    population_description: string;
    population_file_id: string | null;
    population_filename?: string | null;
    population_file_type?: string | null;
    population_count: number;
    sample_period: string;
    llm_suggested_strategy: string | null;
    llm_suggested_size: number;
    selection_strategy: string | null;
    selected_size: number;
    selected_items: Array<Record<string, unknown> | number | string>;
    population_support_files?: CtSupportFile[];
    population_ca_verification: CaVerification;
  };
  evidence_files: EvidenceFile[];
  todi_results: Record<string, unknown>;
  sample_results: SampleResult[];
  exceptions: CtException[];
  conclusions: {
    d_and_i: string | null;
    oe: string | null;
    deficiencies_noted: boolean;
    issues_log_refs: string[];
    rationale: string;
    testing_summary: string;
    d_and_i_statement?: string;
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
  severity: string;
  summary: string;
  detail: string;
  root_cause: string;
  recommendation: string;
  issues_log_ref: string;
  pushed_to_issues: boolean;
  issues_module_id: string | null;
}

export interface CreateSessionBody {
  title: string;
  description?: string;
  entity: string;
  framework?: string;
  preparer?: string;
  testing_period: { from: string; to: string };
}

export interface CreateControlBody {
  control_id: string;
  control_name: string;
  control_type: string;
  domain?: string;
  framework_reference?: string;
  inherent_risk_rating?: string;
  control_owner?: string;
  frequency?: string;
  prior_period_result?: string;
  walkthrough_performed?: boolean;
  risk?: string;
  sampling_mode?: string;
  test_steps: TestStep[];
}

export interface SupportUploadBody {
  files: File[];
  support_type?: string;
  comments?: string;
  unique_key_columns?: string;
  expected_count?: number | string | null;
}

export const ctKeys = {
  sessions: () => ["/api/ct/sessions"] as const,
  session: (id: string) => [`/api/ct/sessions/${id}`] as const,
  controls: (sessionId: string) => [`/api/ct/sessions/${sessionId}/controls`] as const,
  control: (sessionId: string, controlId: string) =>
    [`/api/ct/sessions/${sessionId}/controls/${controlId}`] as const,
  suggestions: (sessionId: string) => [`/api/ct/sessions/${sessionId}/suggestions`] as const,
  issues: (sessionId: string) => [`/api/ct/sessions/${sessionId}/issues`] as const,
};

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function uploadForm<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    body,
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

function appendSupportFields(body: FormData, payload: SupportUploadBody) {
  payload.files.forEach((file) => body.append("files", file));
  body.append("support_type", payload.support_type || "source_support");
  body.append("comments", payload.comments || "");
  body.append("unique_key_columns", payload.unique_key_columns || "");
  if (payload.expected_count !== undefined && payload.expected_count !== null && String(payload.expected_count).trim()) {
    body.append("expected_count", String(payload.expected_count));
  }
}

function invalidateSessionSet(qc: ReturnType<typeof useQueryClient>, sessionId: string) {
  qc.invalidateQueries({ queryKey: ctKeys.sessions() });
  qc.invalidateQueries({ queryKey: ctKeys.session(sessionId) });
  qc.invalidateQueries({ queryKey: ctKeys.controls(sessionId) });
  qc.invalidateQueries({ queryKey: ctKeys.issues(sessionId) });
}

export function useCtSessions() {
  return useQuery<CtSessionSummary[]>({
    queryKey: ctKeys.sessions(),
    staleTime: 30_000,
  });
}

export function useCtSession(sessionId: string | undefined) {
  return useQuery<CtSession>({
    queryKey: ctKeys.session(sessionId ?? ""),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const data = query.state.data as CtSession | undefined;
      if (!data || data.stage === "complete" || data.stage === "failed") return false;
      return 4000;
    },
  });
}

export function useCtControls(sessionId: string | undefined) {
  return useQuery<{ controls: CtControl[] }>({
    queryKey: ctKeys.controls(sessionId ?? ""),
    enabled: Boolean(sessionId),
  });
}

export function useCtSuggestions(sessionId: string | undefined) {
  return useQuery<{ suggestions: CtSuggestion[]; questions: CtQuestion[] }>({
    queryKey: ctKeys.suggestions(sessionId ?? ""),
    enabled: Boolean(sessionId),
  });
}

export function useCtIssues(sessionId: string | undefined) {
  return useQuery<{ issues: CtIssue[] }>({
    queryKey: ctKeys.issues(sessionId ?? ""),
    enabled: Boolean(sessionId),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSessionBody) =>
      json<CtSession>(await apiRequest("POST", "/api/ct/sessions", body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ctKeys.sessions() }),
  });
}

export function useAddControls(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (controls: CreateControlBody[]) => addCtControls(sessionId, controls),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export async function addCtControls(sessionId: string, controls: CreateControlBody[]) {
  return json<CtControl[]>(await apiRequest("POST", `/api/ct/sessions/${sessionId}/controls`, controls));
}

export function useUploadTemplate(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadCtTemplate(sessionId, file),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function uploadCtTemplate(sessionId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return uploadForm<{ gridfs_id: string; celery_task_id: string; status: string }>(
    `/api/ct/sessions/${sessionId}/upload-template`,
    body,
  );
}

export function useBeginAnalysis(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      json<{ celery_task_id: string; status: string }>(
        await apiRequest("POST", `/api/ct/sessions/${sessionId}/begin-analysis`),
      ),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUpdateSuggestion(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ suggestionId, status }: { suggestionId: string; status: string }) =>
      json(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/suggestions/${suggestionId}`, { status })),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useAnswerQuestion(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: string; answer: string }) =>
      json(await apiRequest("POST", `/api/ct/sessions/${sessionId}/questions/${questionId}/answer`, { answer })),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useConfirmReview(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      json<{ celery_task_id: string; status: string }>(
        await apiRequest("POST", `/api/ct/sessions/${sessionId}/confirm-review`),
      ),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUploadPopulation(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return uploadForm<{ gridfs_id: string; filename: string; file_type: string; status: string }>(
        `/api/ct/sessions/${sessionId}/controls/${controlId}/population`,
        body,
      );
    },
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUploadPopulationSupport(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupportUploadBody) => {
      const body = new FormData();
      appendSupportFields(body, payload);
      return uploadForm<CtSupportFile[]>(
        `/api/ct/sessions/${sessionId}/controls/${controlId}/population/support-files`,
        body,
      );
    },
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUploadEvidence(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      return uploadForm<EvidenceFile[]>(`/api/ct/sessions/${sessionId}/controls/${controlId}/evidence`, body);
    },
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUploadEvidenceSupport(sessionId: string, controlId: string, evidenceGridfsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupportUploadBody) => {
      const body = new FormData();
      appendSupportFields(body, payload);
      return uploadForm<CtSupportFile[]>(
        `/api/ct/sessions/${sessionId}/controls/${controlId}/evidence/${evidenceGridfsId}/support-files`,
        body,
      );
    },
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useDeleteEvidence(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gridfsId: string) =>
      apiRequest("DELETE", `/api/ct/sessions/${sessionId}/controls/${controlId}/evidence/${gridfsId}`),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useMappingOverride(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { file_gridfs_id: string; mapped_step_labels: string[]; reason: string }) =>
      json(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/controls/${controlId}/mapping`, body)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useCaOverride(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { file_gridfs_id?: string; population?: boolean; reason: string }) =>
      json(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/controls/${controlId}/ca-override`, body)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUpdateSampling(sessionId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      json(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/controls/${controlId}/sampling`, body)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useConfirmMapping(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      json<{ celery_task_id: string; status: string }>(
        await apiRequest("POST", `/api/ct/sessions/${sessionId}/confirm-mapping`),
      ),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUpdateCtIssue(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, body }: { issueId: string; body: Partial<CtIssue> }) =>
      json<CtIssue>(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/issues/${issueId}`, body)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function usePushCtIssue(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) =>
      json<CtIssue>(await apiRequest("POST", `/api/ct/sessions/${sessionId}/issues/${issueId}/push`)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function usePushAllCtIssues(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      json<{ pushed_count: number; issues: CtIssue[] }>(
        await apiRequest("POST", `/api/ct/sessions/${sessionId}/issues/push-all`),
      ),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export function useUpdateSignOff(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<CtSession["sign_off"]>) =>
      json(await apiRequest("PATCH", `/api/ct/sessions/${sessionId}/sign-off`, body)),
    onSuccess: () => invalidateSessionSet(qc, sessionId),
  });
}

export const STAGE_LABEL: Record<CtStage, string> = {
  input: "Case Setup",
  analysing: "Case Analysis",
  population: "Population",
  evidence: "Evidence",
  testing: "Testing",
  workbook: "Workbook",
  complete: "Complete",
  failed: "Failed",
};

export const STAGE_TAB: Record<CtStage, string> = {
  input: "case",
  analysing: "case",
  population: "population",
  evidence: "evidence",
  testing: "testing",
  workbook: "testing",
  complete: "results",
  failed: "case",
};

export function caResolved(ca?: CaVerification): boolean {
  if (!ca) return false;
  if (ca.overridden) return true;
  return ca.completeness_passed === true && ca.accuracy_passed === true;
}
