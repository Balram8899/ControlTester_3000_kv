import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import Footer from "@/components/Footer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  STAGE_LABEL,
  STAGE_TAB,
  caResolved,
  useAnswerQuestion,
  useBeginAnalysis,
  useCaOverride,
  useConfirmMapping,
  useConfirmReview,
  useCtControls,
  useCtIssues,
  useCtSession,
  useCtSuggestions,
  useDeleteEvidence,
  useMappingOverride,
  usePushAllCtIssues,
  usePushCtIssue,
  useUpdateCtIssue,
  useUpdateSampling,
  useUpdateSignOff,
  useUpdateSuggestion,
  useUploadEvidence,
  useUploadEvidenceSupport,
  useUploadPopulation,
  useUploadPopulationSupport,
  useUploadTemplate,
  type CtControl,
  type CtIssue,
  type CtSupportFile,
  type EvidenceFile,
  type SupportUploadBody,
} from "@/hooks/useControlTesting";

const TABS = ["Case Analysis", "Population", "Evidence", "Testing", "Results"] as const;
type TabLabel = (typeof TABS)[number];

const TAB_STAGE: Record<TabLabel, number> = {
  "Case Analysis": 0,
  Population: 1,
  Evidence: 2,
  Testing: 3,
  Results: 4,
};

const STAGE_ORDER: Record<string, number> = {
  input: 0,
  analysing: 0,
  population: 1,
  evidence: 2,
  testing: 3,
  workbook: 3,
  complete: 4,
  failed: 0,
};

const supportedEvidenceAccept = ".xlsx,.xls,.csv,.pdf,.docx,.txt,.conf,.zip,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.webp";

function sessionIdFromPath(pathname: string) {
  return pathname.split("/controls-assurance/")[1]?.split("/")[0] ?? "";
}

function tabLabelForStage(stage?: string): TabLabel {
  const tabKey = stage ? STAGE_TAB[stage as keyof typeof STAGE_TAB] : "case";
  switch (tabKey) {
    case "population":
      return "Population";
    case "evidence":
      return "Evidence";
    case "testing":
      return "Testing";
    case "results":
      return "Results";
    default:
      return "Case Analysis";
  }
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#E2E6EF] pb-4 text-left">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{label}</div>
      <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">{children}</section>;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
      style={{
        color: ok ? "#009A44" : "#EAAA00",
        background: ok ? "#EDFBF5" : "#FFFBEB",
        borderColor: ok ? "#009A4433" : "#EAAA0033",
      }}
    >
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {label}
    </span>
  );
}

function extractGateMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const unresolved = parsed.detail?.unresolved ?? [];
      const names = unresolved
        .flatMap((item: { unresolved_files?: Array<{ filename?: string }> }) => item.unresolved_files ?? [])
        .map((file: { filename?: string }) => file.filename)
        .filter(Boolean);
      // unresolved_files are returned by the backend gate response.
      if (names.length) return `Resolve: ${names.join(", ")}`;
    } catch {
      return raw;
    }
  }
  return raw;
}

function OverrideDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [overrideReason, setOverrideReason] = useState("");
  const invalid = overrideReason.trim().length < 10;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#0C233C]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-[12px] font-bold text-[#0C233C]">Override Reason</Label>
          <Textarea
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            className="min-h-[110px] border-[#DCE3EE]"
          />
          <div className="text-[12px] text-[#8492A6]">Minimum 10 characters required.</div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg bg-[#F0F2F7] px-4 py-2 text-[13px] font-semibold text-[#5A6478]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => {
              onConfirm(overrideReason);
              setOverrideReason("");
            }}
            className="rounded-lg bg-[#7213EA] px-4 py-2 text-[13px] font-semibold text-white disabled:bg-[#8492A6]"
          >
            Override And Accept
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CaseAnalysisTab({ sessionId }: { sessionId: string }) {
  const { toast } = useToast();
  const { data } = useCtSuggestions(sessionId);
  const uploadTemplate = useUploadTemplate(sessionId);
  const beginAnalysis = useBeginAnalysis(sessionId);
  const updateSuggestion = useUpdateSuggestion(sessionId);
  const answerQuestion = useAnswerQuestion(sessionId);
  const confirmReview = useConfirmReview(sessionId);
  const suggestions = data?.suggestions ?? [];
  const questions = data?.questions ?? [];

  async function handleConfirmReview() {
    try {
      await confirmReview.mutateAsync();
      toast({ title: "Review Confirmed", description: "Population and evidence checks are queued." });
    } catch (error) {
      toast({
        title: "Review Gate Blocked",
        description: error instanceof Error ? error.message : "Answer all questions first.",
        variant: "destructive",
      });
    }
  }

  async function handleBeginAnalysis() {
    try {
      await beginAnalysis.mutateAsync();
      toast({ title: "Analysis Started", description: "The LLM review is now queued." });
    } catch (error) {
      toast({
        title: "Analysis Not Started",
        description: error instanceof Error ? error.message : "Add controls or upload a template first.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[17px] font-bold text-[#0C233C]">Input Template</div>
            <p className="mt-1 text-[13px] text-[#5A6478]">Upload the CT input workbook or start analysis after adding manual controls.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBeginAnalysis}
              className="inline-flex items-center gap-2 rounded-lg bg-[#7213EA] px-4 py-2 text-[13px] font-semibold text-white"
            >
              {beginAnalysis.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Begin Analysis
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#1E49E2]">
              <Upload size={16} />
              Upload .xlsx template
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  await uploadTemplate.mutateAsync(file);
                  toast({ title: "Template Uploaded", description: "Parsing has started." });
                }}
              />
            </label>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeader label="LLM Review" title="Suggestions And Questions" />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-[15px] font-bold text-[#0C233C]">Suggestions</div>
            {suggestions.length === 0 ? <p className="text-[13px] text-[#5A6478]">No suggestions yet.</p> : null}
            {suggestions.map((suggestion) => (
              <div key={suggestion.suggestion_id} className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                <p className="text-[13px] leading-relaxed text-[#0C233C]">{suggestion.text}</p>
                <div className="mt-3 flex gap-2">
                  {["accepted", "dismissed"].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateSuggestion.mutate({ suggestionId: suggestion.suggestion_id, status })}
                      className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#1E49E2]"
                    >
                      {status === "accepted" ? "Accept" : "Dismiss"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="text-[15px] font-bold text-[#0C233C]">Questions</div>
            {questions.length === 0 ? <p className="text-[13px] text-[#5A6478]">No open questions.</p> : null}
            {questions.map((question) => (
              <QuestionAnswer key={question.question_id} question={question} onAnswer={(answer) => answerQuestion.mutate({ questionId: question.question_id, answer })} />
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleConfirmReview}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7213EA] px-6 py-3 text-[14px] font-bold text-white"
          >
            {confirmReview.isPending ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Confirm Case Analysis
          </button>
        </div>
      </Panel>
    </div>
  );
}

function QuestionAnswer({
  question,
  onAnswer,
}: {
  question: { question_id: string; question: string; answer: string; answered: boolean };
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  return (
    <div className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
      <p className="text-[13px] font-semibold text-[#0C233C]">{question.question}</p>
      <div className="mt-3 flex gap-2">
        <Input className="h-9 border-[#DCE3EE] bg-white text-[13px]" value={answer} onChange={(event) => setAnswer(event.target.value)} />
        <button
          type="button"
          onClick={() => onAnswer(answer)}
          className="rounded-lg bg-[#E6F4F2] px-3 py-2 text-[12px] font-semibold text-[#098E7E]"
        >
          Save
        </button>
      </div>
      {question.answered ? <div className="mt-2 text-[12px] font-semibold text-[#009A44]">Answered</div> : null}
    </div>
  );
}

function SourceSupportUploader({
  files = [],
  onUpload,
}: {
  files?: CtSupportFile[];
  onUpload: (payload: SupportUploadBody) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [comments, setComments] = useState("");
  const [uniqueKeyColumns, setUniqueKeyColumns] = useState("");
  const [expectedCount, setExpectedCount] = useState("");

  return (
    <div className="mt-4 rounded-xl border border-[#E2E6EF] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-[#0C233C]">Source / Query Support</div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#5A6478]">
            Attach SQL screenshots, SAP SUIM parameter screens, run timestamps, record counts, or source report PDFs for C&A reconciliation.
          </p>
        </div>
        <span className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-3 py-1 text-[11px] font-semibold text-[#8492A6]">
          {files.length} attached
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px]">
        <div>
          <Label className="text-[12px] font-bold text-[#0C233C]">Unique Key Columns</Label>
          <Input
            className="mt-2 h-10 border-[#DCE3EE] bg-white text-[13px]"
            placeholder="USER_ID or DOCUMENT_ID,COMPANY_CODE"
            value={uniqueKeyColumns}
            onChange={(event) => setUniqueKeyColumns(event.target.value)}
          />
        </div>
        <div>
          <Label className="text-[12px] font-bold text-[#0C233C]">Expected Count</Label>
          <Input
            className="mt-2 h-10 border-[#DCE3EE] bg-white text-[13px]"
            placeholder="128"
            value={expectedCount}
            onChange={(event) => setExpectedCount(event.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label className="text-[12px] font-bold text-[#0C233C]">Reviewer Comments</Label>
        <Textarea
          className="mt-2 min-h-[72px] border-[#DCE3EE] bg-white text-[13px]"
          placeholder="Example: Match unique USER_ID count in export to Rows returned on the query screenshot."
          value={comments}
          onChange={(event) => setComments(event.target.value)}
        />
      </div>
      {files.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((file) => (
            <span key={file.gridfs_id} className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-3 py-1 text-[11px] font-semibold text-[#5A6478]">
              {file.filename}
            </span>
          ))}
        </div>
      ) : null}
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[12px] font-semibold text-[#1E49E2]">
        <Upload size={14} />
        Upload Source Support
        <input
          type="file"
          multiple
          accept={supportedEvidenceAccept}
          className="hidden"
          onChange={async (event) => {
            const selected = Array.from(event.target.files ?? []);
            if (!selected.length) return;
            await onUpload({
              files: selected,
              support_type: "query_screenshot",
              comments,
              unique_key_columns: uniqueKeyColumns,
              expected_count: expectedCount,
            });
            toast({ title: "Source Support Uploaded", description: `${selected.length} support file(s) attached.` });
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function PopulationControl({ sessionId, control }: { sessionId: string; control: CtControl }) {
  const { toast } = useToast();
  const uploadPopulation = useUploadPopulation(sessionId, control.id);
  const uploadPopulationSupport = useUploadPopulationSupport(sessionId, control.id);
  const updateSampling = useUpdateSampling(sessionId, control.id);
  const caOverride = useCaOverride(sessionId, control.id);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const ca = control.sampling.population_ca_verification;
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[17px] font-bold text-[#0C233C]">{control.control_id} - {control.control_name}</div>
          <p className="mt-1 text-[13px] text-[#5A6478]">Sampling mode: {control.sampling.mode}</p>
        </div>
        <StatusPill ok={caResolved(ca)} label={caResolved(ca) ? "Population Resolved" : "Population Pending"} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-[#1E49E2]">
          <Upload size={16} />
          Upload Population
          <input
            type="file"
            accept={supportedEvidenceAccept}
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await uploadPopulation.mutateAsync(file);
              toast({ title: "Population Uploaded" });
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => updateSampling.mutate({ selection_strategy: "full", reason: "Reviewer selected full population from UI." })}
          className="rounded-lg bg-[#E6F4F2] px-4 py-3 text-[13px] font-semibold text-[#098E7E]"
        >
          Use Full Population
        </button>
        <button
          type="button"
          onClick={() => setOverrideOpen(true)}
          className="rounded-lg bg-[#F3F0FF] px-4 py-3 text-[13px] font-semibold text-[#7213EA]"
        >
          Override Population C&A
        </button>
      </div>
      <div className="mt-4 text-[12px] text-[#5A6478]">
        File {control.sampling.population_filename ?? "not uploaded"} | Type {control.sampling.population_file_type ?? "pending"} | Count {control.sampling.population_count || 0} | Suggested {control.sampling.llm_suggested_strategy ?? "pending"} / {control.sampling.llm_suggested_size || 0}
      </div>
      <SourceSupportUploader
        files={control.sampling.population_support_files}
        onUpload={(payload) => uploadPopulationSupport.mutateAsync(payload)}
      />
      <OverrideDialog
        open={overrideOpen}
        title="Override Population C&A"
        onOpenChange={setOverrideOpen}
        onConfirm={(reason) => {
          caOverride.mutate({ population: true, reason });
          setOverrideOpen(false);
        }}
      />
    </Panel>
  );
}

function PopulationTab({ sessionId, controls }: { sessionId: string; controls: CtControl[] }) {
  return <div className="space-y-5">{controls.map((control) => <PopulationControl key={control.id} sessionId={sessionId} control={control} />)}</div>;
}

function EvidenceControl({ sessionId, control }: { sessionId: string; control: CtControl }) {
  const { toast } = useToast();
  const uploadEvidence = useUploadEvidence(sessionId, control.id);
  const deleteEvidence = useDeleteEvidence(sessionId, control.id);
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[17px] font-bold text-[#0C233C]">{control.control_id} Evidence</div>
          <p className="mt-1 text-[13px] text-[#5A6478]">{control.evidence_files.length} file(s) attached.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#1E49E2]">
          <Upload size={16} />
          Upload Evidence
          <input
            type="file"
            multiple
            accept={supportedEvidenceAccept}
            className="hidden"
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              if (!files.length) return;
              await uploadEvidence.mutateAsync(files);
              toast({ title: "Evidence Uploaded", description: `${files.length} file(s) added.` });
            }}
          />
        </label>
      </div>
      <div className="mt-5 space-y-3">
        {control.evidence_files.length === 0 ? <p className="text-[13px] text-[#5A6478]">No evidence files uploaded.</p> : null}
        {control.evidence_files.map((file) => (
          <EvidenceFileRow
            key={file.gridfs_id}
            sessionId={sessionId}
            control={control}
            file={file}
            onDelete={() => deleteEvidence.mutate(file.gridfs_id)}
          />
        ))}
      </div>
    </Panel>
  );
}

function EvidenceFileRow({
  sessionId,
  control,
  file,
  onDelete,
}: {
  sessionId: string;
  control: CtControl;
  file: EvidenceFile;
  onDelete: () => void;
}) {
  const caOverride = useCaOverride(sessionId, control.id);
  const mappingOverride = useMappingOverride(sessionId, control.id);
  const uploadEvidenceSupport = useUploadEvidenceSupport(sessionId, control.id, file.gridfs_id);
  const [overrideOpen, setOverrideOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-bold text-[#0C233C]">{file.filename}</div>
          <div className="mt-1 text-[12px] text-[#5A6478]">Mapped steps: {file.mapped_step_labels.join(", ") || "None"}</div>
        </div>
        <StatusPill ok={caResolved(file.ca_verification)} label={caResolved(file.ca_verification) ? "C&A Resolved" : "C&A Pending"} />
      </div>
      {file.ca_verification.issues?.length ? (
        <div className="mt-3 rounded-lg bg-[#FFFBEB] p-3 text-[12px] text-[#5A6478]">
          {file.ca_verification.issues.map((issue, index) => (
            <div key={index}>{issue.finding || issue.check}</div>
          ))}
        </div>
      ) : null}
      <SourceSupportUploader
        files={file.support_files}
        onUpload={(payload) => uploadEvidenceSupport.mutateAsync(payload)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => mappingOverride.mutate({ file_gridfs_id: file.gridfs_id, mapped_step_labels: control.test_steps.map((step) => step.label), reason: "Reviewer mapped evidence to listed test steps." })}
          className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#1E49E2]"
        >
          Map To All Steps
        </button>
        <button type="button" onClick={() => setOverrideOpen(true)} className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#7213EA]">
          Override C&A
        </button>
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#E5001B]">
          <Trash2 size={14} />
          Remove File
        </button>
      </div>
      <OverrideDialog
        open={overrideOpen}
        title="Override Evidence C&A"
        onOpenChange={setOverrideOpen}
        onConfirm={(reason) => {
          caOverride.mutate({ file_gridfs_id: file.gridfs_id, reason });
          setOverrideOpen(false);
        }}
      />
    </div>
  );
}

function EvidenceTab({ sessionId, controls }: { sessionId: string; controls: CtControl[] }) {
  const { toast } = useToast();
  const confirmMapping = useConfirmMapping(sessionId);
  const unresolvedCount = controls.reduce((count, control) => {
    const populationBlocked = ["sample", "both"].includes(control.sampling.mode) && !caResolved(control.sampling.population_ca_verification);
    const evidenceBlocked = control.evidence_files.length === 0 || control.evidence_files.some((file) => !caResolved(file.ca_verification));
    return count + (populationBlocked || evidenceBlocked ? 1 : 0);
  }, 0);
  async function confirmGate() {
    try {
      await confirmMapping.mutateAsync();
      toast({ title: "C&A Gate Confirmed", description: "Control testing has been queued." });
    } catch (error) {
      toast({ title: "C&A Gate Blocked", description: extractGateMessage(error), variant: "destructive" });
    }
  }
  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 rounded-2xl border border-[#EAAA0033] bg-[#FFFBEB] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-[13px] font-semibold text-[#0C233C]">
            {unresolvedCount ? `${unresolvedCount} control(s) still have unresolved C&A items.` : "All visible C&A checks are resolved."}
          </div>
          <button
            type="button"
            onClick={confirmGate}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7213EA] px-4 py-2 text-[13px] font-bold text-white"
          >
            {confirmMapping.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Confirm Mapping Gate
          </button>
        </div>
      </div>
      {controls.map((control) => <EvidenceControl key={control.id} sessionId={sessionId} control={control} />)}
    </div>
  );
}

function TestingTab({ controls }: { controls: CtControl[] }) {
  return (
    <div className="space-y-5">
      {controls.map((control) => (
        <Panel key={control.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[17px] font-bold text-[#0C233C]">{control.control_id} Testing</div>
              <p className="mt-1 text-[13px] text-[#5A6478]">{control.conclusions.rationale || "Testing results will appear after Stage 4 completes."}</p>
            </div>
            <StatusPill ok={control.status === "complete"} label={control.status === "complete" ? "Complete" : "Pending"} />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-[#5A6478]">
                <tr className="border-b border-[#E2E6EF]">
                  <th className="py-2">Sample</th>
                  <th>Application</th>
                  <th>Item Reference</th>
                  <th>Step</th>
                  <th>Tickmark</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {control.sample_results.map((sample) =>
                  sample.step_results.map((step) => (
                    <tr key={`${sample.sample_num}-${step.label}`} className="border-b border-[#F0F2F7]">
                      <td className="py-2">{sample.sample_num}</td>
                      <td>{sample.application}</td>
                      <td>{sample.item_reference}</td>
                      <td>{step.label}</td>
                      <td className={step.tickmark.startsWith("X") ? "font-bold text-[#E5001B]" : "font-bold text-[#009A44]"}>{step.tickmark}</td>
                      <td>{step.notes}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {control.exceptions.length ? (
            <div className="mt-5 space-y-2">
              <div className="text-[14px] font-bold text-[#0C233C]">Exceptions</div>
              {control.exceptions.map((exception) => (
                <div key={exception.ref} className="rounded-lg bg-[#FEEBED] p-3 text-[12px] text-[#5A6478]">
                  <span className="font-bold text-[#E5001B]">{exception.ref}</span> {exception.description}
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function IssueCard({ sessionId, issue }: { sessionId: string; issue: CtIssue }) {
  const updateIssue = useUpdateCtIssue(sessionId);
  const pushIssue = usePushCtIssue(sessionId);
  const [recommendation, setRecommendation] = useState(issue.recommendation);
  return (
    <div className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-[#0C233C]">{issue.title}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#5A6478]">{issue.summary}</p>
        </div>
        <span className="rounded-full border border-[#E2E6EF] bg-white px-3 py-1 text-[11px] font-semibold text-[#5A6478]">{issue.severity}</span>
      </div>
      <Textarea className="mt-4 min-h-[78px] border-[#DCE3EE] bg-white text-[13px]" value={recommendation} onChange={(event) => setRecommendation(event.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => updateIssue.mutate({ issueId: issue.id, body: { recommendation } })} className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-[#1E49E2]">
          Save Issue
        </button>
        <button type="button" onClick={() => pushIssue.mutate(issue.id)} className="inline-flex items-center gap-2 rounded-lg bg-[#7213EA] px-3 py-2 text-[12px] font-semibold text-white">
          <Send size={14} />
          {issue.pushed_to_issues ? "Already Pushed" : "Push To Issue Management"}
        </button>
      </div>
    </div>
  );
}

function ResultsTab({ sessionId, controls, issues }: { sessionId: string; controls: CtControl[]; issues: CtIssue[] }) {
  const pushAll = usePushAllCtIssues(sessionId);
  const updateSignOff = useUpdateSignOff(sessionId);
  const [reviewer, setReviewer] = useState({ name: "", initials: "", date: "" });
  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeader label="Workpapers" title="Workbook Outputs" />
        <div className="grid gap-3 md:grid-cols-2">
          {controls.map((control) => (
            <a
              key={control.id}
              href={`/api/ct/sessions/${sessionId}/controls/${control.id}/workbook`}
              className={`flex items-center justify-between rounded-xl border border-[#E2E6EF] p-4 text-[13px] font-semibold ${control.workbook_output_id ? "bg-white text-[#1E49E2]" : "pointer-events-none bg-[#F0F2F7] text-[#8492A6]"}`}
            >
              <span>{control.control_id} Workpaper</span>
              <Download size={16} />
            </a>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#E2E6EF] pb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Issues</div>
            <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">Drafted Exceptions</div>
          </div>
          <button type="button" onClick={() => pushAll.mutate()} className="rounded-lg bg-[#7213EA] px-4 py-2 text-[13px] font-bold text-white">
            Push All Issues
          </button>
        </div>
        <div className="space-y-3">
          {issues.length === 0 ? <p className="text-[13px] text-[#5A6478]">No issues drafted.</p> : null}
          {issues.map((issue) => <IssueCard key={issue.id} sessionId={sessionId} issue={issue} />)}
        </div>
      </Panel>
      <Panel>
        <SectionHeader label="Sign-Off" title="Reviewer Sign-Off" />
        <div className="grid gap-4 md:grid-cols-3">
          <Input className="h-10 border-[#DCE3EE]" placeholder="Reviewer name" value={reviewer.name} onChange={(event) => setReviewer((prev) => ({ ...prev, name: event.target.value }))} />
          <Input className="h-10 border-[#DCE3EE]" placeholder="Initials" value={reviewer.initials} onChange={(event) => setReviewer((prev) => ({ ...prev, initials: event.target.value }))} />
          <Input className="h-10 border-[#DCE3EE]" type="date" value={reviewer.date} onChange={(event) => setReviewer((prev) => ({ ...prev, date: event.target.value }))} />
        </div>
        <button type="button" onClick={() => updateSignOff.mutate({ reviewer })} className="mt-4 rounded-lg bg-[#098E7E] px-4 py-2 text-[13px] font-bold text-white">
          Save Sign-Off
        </button>
      </Panel>
    </div>
  );
}

export default function ControlsAssuranceDetailPage() {
  const [location, navigate] = useLocation();
  const sessionId = sessionIdFromPath(location);
  const { data: session, isLoading } = useCtSession(sessionId);
  const { data: controlData } = useCtControls(sessionId);
  const { data: issueData } = useCtIssues(sessionId);
  const controls = controlData?.controls ?? session?.controls ?? [];
  const issues = issueData?.issues ?? [];
  const [activeTab, setActiveTab] = useState<TabLabel>("Case Analysis");
  const currentStageRank = STAGE_ORDER[session?.stage ?? "input"] ?? 0;

  useEffect(() => {
    setActiveTab(tabLabelForStage(session?.stage));
  }, [session?.stage]);

  function isLocked(tab: TabLabel) {
    return TAB_STAGE[tab] > currentStageRank;
  }

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7]">
      <section className="relative overflow-hidden" style={{ background: "#0C233C", padding: "52px 0 56px" }}>
        <div
          className="pointer-events-none absolute rounded-full blur-3xl"
          style={{ width: 420, height: 420, background: "rgba(30,73,226,0.34)", right: -130, top: -190 }}
        />
        <div className="relative mx-auto max-w-[1100px] px-8 md:px-12">
          <button type="button" onClick={() => navigate("/controls-assurance")} className="mb-5 inline-flex items-center gap-2 text-[13px] font-bold text-white/70">
            <ArrowLeft size={16} />
            Back To Assessments
          </button>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[2.5px] text-white/55">Controls Assurance Workspace</div>
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-bold leading-tight text-white" style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>
                {session?.title ?? "Controls Assurance Case"}
              </h1>
              <p className="mt-4 max-w-2xl text-[16px] leading-[1.75] text-white/65">
                {session?.entity ?? "Loading entity"} | {session?.framework ?? "Framework"}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/75">
              {session && !["complete", "failed", "input"].includes(session.stage) ? <Loader2 size={14} className="animate-spin" /> : null}
              {session ? STAGE_LABEL[session.stage] : "Loading"}
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-8 py-12 pb-24 md:px-12">
        {isLoading ? (
          <Panel>
            <div className="flex items-center gap-3 text-[13px] font-semibold text-[#5A6478]">
              <Loader2 size={18} className="animate-spin" />
              Loading assessment
            </div>
          </Panel>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  disabled={isLocked(tab)}
                  title={isLocked(tab) ? "Complete prior stage first" : tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl border px-4 py-2 text-[13px] font-bold transition-colors ${
                    activeTab === tab
                      ? "border-[#1E49E2] bg-[#EEF2FF] text-[#1E49E2]"
                      : "border-[#E2E6EF] bg-white text-[#5A6478]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Case Analysis" ? <CaseAnalysisTab sessionId={sessionId} /> : null}
            {activeTab === "Population" ? <PopulationTab sessionId={sessionId} controls={controls} /> : null}
            {activeTab === "Evidence" ? <EvidenceTab sessionId={sessionId} controls={controls} /> : null}
            {activeTab === "Testing" ? <TestingTab controls={controls} /> : null}
            {activeTab === "Results" ? <ResultsTab sessionId={sessionId} controls={controls} issues={issues} /> : null}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
