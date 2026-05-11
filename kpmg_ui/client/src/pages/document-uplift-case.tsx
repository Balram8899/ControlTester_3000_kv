import { useEffect, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Lock,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import TraceNavBar from "@/components/TraceNavBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type CaseStage =
  | "uploading"
  | "converting"
  | "analyzing"
  | "review_ready"
  | "generating_outputs"
  | "complete"
  | "failed"
  | "partial";

type DocumentTag = "procedure" | "rcm" | "policy" | "process_doc" | "risk_data" | "evidence";
type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";
type SuggestionSeverity = "critical" | "high" | "medium" | "low" | "informational";
type SuggestionTargetType =
  | "procedure_step"
  | "role_responsibility"
  | "raci_matrix"
  | "evidence_requirement"
  | "monitoring_reporting"
  | "document_metadata"
  | "other";

interface CostSummary {
  provider?: string;
  model?: string;
  call_count?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  is_local_provider?: boolean;
}

interface DocumentUpliftStatus {
  stage: CaseStage;
  stage1_cost?: CostSummary | null;
  final_cost?: CostSummary | null;
}

interface DocumentTagEntry {
  file_id: string;
  filename: string;
  tag: DocumentTag;
  conversion_status?: string;
  looks_corrupt?: boolean;
  page_count?: number;
  error?: string | null;
}

interface MarkdownDocument {
  document_id?: string;
  file_id: string;
  filename: string;
  file_type?: string;
  tag?: DocumentTag;
  markdown?: string;
  page_count?: number;
  looks_corrupt?: boolean;
  conversion?: {
    status?: string;
    error?: string | null;
  };
}

interface Anchor {
  anchor_id: string;
  file_id: string;
  section_path?: string;
  heading?: string;
  content?: string;
}

interface SourceReference {
  document_id: string;
  filename?: string | null;
  file_id?: string | null;
  anchor_id?: string | null;
  sheet_name?: string | null;
  row_index?: number | null;
}

interface SuggestionEditTarget {
  target_id: string;
  target_type: SuggestionTargetType;
  title?: string | null;
  detail?: string | null;
  proposed_text: string;
  original_text?: string | null;
  target_anchor_id?: string | null;
  target_text?: string | null;
  target_heading?: string | null;
  review_status?: SuggestionStatus | null;
  edited_proposed_text?: string | null;
  source_references?: SourceReference[];
}

interface Suggestion {
  suggestion_id: string;
  suggestion_type: string;
  severity: SuggestionSeverity;
  title: string;
  detail?: string;
  proposed_text?: string | null;
  original_text?: string | null;
  review_status: SuggestionStatus;
  edited_proposed_text?: string | null;
  reviewer_notes?: string | null;
  source_references?: SourceReference[];
  edit_targets?: SuggestionEditTarget[];
  requires_explicit_review?: boolean;
}

interface OutputItem {
  output_id: string;
  output_type: "docx" | "png_diagram" | "pdf_diagram" | string;
  filename: string;
  output_mode?: string;
  created_at?: string;
}

interface StageCounter {
  total?: number;
  completed?: number;
  failed?: number;
  pending?: number;
}

interface ProcessingState {
  conversion?: StageCounter;
  analysis?: StageCounter;
  pipeline_status?: string;
  pipeline_error?: string | null;
  warnings?: string[];
}

interface SsePipelineEventData {
  stage?: CaseStage | string;
  step?: string;
  doc?: string;
  sheet?: string;
  anchor?: string;
  batch?: number;
  total_batches?: number;
  total_docs?: number;
  completed_docs?: number;
  suggestion_count?: number;
  output_count?: number;
  message?: string;
}

interface DocumentUpliftCase {
  case_id: string;
  title: string;
  process_name?: string | null;
  domain_label?: string | null;
  notes?: string | null;
  status?: DocumentUpliftStatus;
  document_tags?: DocumentTagEntry[];
  suggestions?: Suggestion[];
  outputs?: OutputItem[];
  markdown_documents?: MarkdownDocument[];
  anchors?: Anchor[];
  processing_state?: ProcessingState;
  final_summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface WorkbookSheet {
  name: string;
  rows: string[][];
}

type ActiveTab = "documents" | "processing" | "review" | "export";

type DocxHighlightMatch = {
  term: string;
  suggestion?: Suggestion;
};

const TAG_OPTIONS: Array<{ value: DocumentTag; label: string; tone: string }> = [
  { value: "procedure", label: "Primary SOP", tone: "border-[#C9D7FF] bg-[#EEF2FF] text-[#00338D]" },
  { value: "rcm", label: "RCM", tone: "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]" },
  { value: "risk_data", label: "Risk Register", tone: "border-[#D8C3FF] bg-[#F3F0FF] text-[#7213EA]" },
  { value: "policy", label: "Policy", tone: "border-[#B7D7FF] bg-[#EFF8FF] text-[#005EB8]" },
  { value: "process_doc", label: "Process Document", tone: "border-[#C8D8F0] bg-[#F8FAFD] text-[#5A6478]" },
  { value: "evidence", label: "Evidence", tone: "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]" },
];

const severityStyles: Record<SuggestionSeverity, string> = {
  critical: "border-[#E5001B] bg-[#FEEBED] text-[#9B0018]",
  high: "border-[#E5001B] bg-[#FFF7F8] text-[#E5001B]",
  medium: "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]",
  low: "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]",
  informational: "border-[#B7D7FF] bg-[#F2F8FF] text-[#005EB8]",
};

function caseStage(caseItem?: DocumentUpliftCase | null): CaseStage {
  return caseItem?.status?.stage ?? "uploading";
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTag(tag: string): string {
  return TAG_OPTIONS.find((option) => option.value === tag)?.label ?? formatStage(tag);
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCost(cost?: CostSummary | null): string {
  if (!cost) return "Pending";
  if (cost.is_local_provider) return `${cost.call_count ?? 0} local calls`;
  return `$${Number(cost.estimated_cost_usd ?? 0).toFixed(2)}`;
}

function stageProgress(stage: CaseStage): number {
  if (stage === "failed") return 100;
  if (stage === "partial") return 72;
  const order: CaseStage[] = ["uploading", "converting", "analyzing", "review_ready", "generating_outputs", "complete"];
  const index = Math.max(0, order.indexOf(stage));
  return Math.round(((index + 1) / order.length) * 100);
}

function stageBadgeClass(stage: CaseStage): string {
  if (stage === "complete") return "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]";
  if (stage === "failed") return "border-[#FEEBED] bg-[#FFF7F8] text-[#E5001B]";
  if (stage === "review_ready" || stage === "partial") return "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]";
  if (stage === "converting" || stage === "analyzing" || stage === "generating_outputs") return "border-[#C9D7FF] bg-[#EEF2FF] text-[#00338D]";
  return "border-[#E2E6EF] bg-[#F0F2F7] text-[#5A6478]";
}

function severityRank(severity: SuggestionSeverity): number {
  const rank: Record<SuggestionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
  return rank[severity] ?? 5;
}

function sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const statusRank: Record<SuggestionStatus, number> = { pending: 0, edited: 1, accepted: 2, rejected: 3 };
  return [...suggestions].sort((left, right) => {
    const statusDelta = statusRank[left.review_status] - statusRank[right.review_status];
    if (statusDelta) return statusDelta;
    return severityRank(left.severity) - severityRank(right.severity);
  });
}

function fileExtension(filename?: string): string {
  return (filename || "").split(".").pop()?.toLowerCase() || "";
}

function isDocxFile(filename?: string): boolean {
  return fileExtension(filename) === "docx";
}

function isSpreadsheetFile(filename?: string): boolean {
  return ["xlsx", "xlsm", "xltx", "xltm", "xls"].includes(fileExtension(filename));
}

function normalizeInlineText(value: unknown): string {
  return String(value || "").split(/\s+/).filter(Boolean).join(" ");
}

function cleanSuggestionText(suggestion?: Suggestion): string {
  const text = suggestion?.edited_proposed_text || suggestion?.proposed_text || "";
  return text.replace(/\s*Source text:\s*[\s\S]*$/i, "").trim();
}

function sourceLabel(source: SourceReference): string {
  const parts = [source.filename || source.document_id];
  if (source.sheet_name) parts.push(source.sheet_name);
  if (source.row_index !== undefined && source.row_index !== null) parts.push(`row ${source.row_index}`);
  return parts.join(" - ");
}

function selectedFileFromCase(caseItem?: DocumentUpliftCase | null, selectedId?: string): DocumentTagEntry | undefined {
  const files = caseItem?.document_tags ?? [];
  return files.find((item) => item.file_id === selectedId) || files.find((item) => item.tag === "procedure") || files[0];
}

function markdownForFile(caseItem: DocumentUpliftCase | null, file?: DocumentTagEntry): MarkdownDocument | undefined {
  if (!file) return undefined;
  return caseItem?.markdown_documents?.find((document) => document.file_id === file.file_id);
}

function anchorsForFile(caseItem: DocumentUpliftCase | null, file?: DocumentTagEntry): Anchor[] {
  if (!file) return [];
  return (caseItem?.anchors ?? []).filter((anchor) => anchor.file_id === file.file_id);
}

function suggestionMatchesDocument(suggestion: Suggestion, file?: DocumentTagEntry, markdownDocument?: MarkdownDocument, anchors?: Anchor[]): boolean {
  if (!file && !markdownDocument) return true;
  const anchorIds = new Set((anchors ?? []).map((anchor) => anchor.anchor_id));
  if ((suggestion.edit_targets ?? []).some((target) => target.target_anchor_id && anchorIds.has(target.target_anchor_id))) return true;
  return (suggestion.source_references ?? []).some((source) => {
    return (
      source.file_id === file?.file_id ||
      source.filename === file?.filename ||
      source.document_id === markdownDocument?.document_id ||
      (source.anchor_id ? anchorIds.has(source.anchor_id) : false)
    );
  });
}

function parseSsePipelineEvent(event: MessageEvent): SsePipelineEventData | null {
  try {
    return JSON.parse(event.data) as SsePipelineEventData;
  } catch {
    return null;
  }
}

function formatSseProgressLabel(data: SsePipelineEventData): string {
  const docSuffix = data.doc ? ` - ${data.doc}` : "";
  if (data.step === "section_classification") return `Classifying sections${docSuffix}`;
  if (data.step === "terminology_extraction") return `Extracting terminology${docSuffix}`;
  if (data.step === "extraction_batch") {
    const batchLabel = data.batch && data.total_batches ? ` batch ${data.batch} of ${data.total_batches}` : "";
    return `Extracting content${batchLabel}${docSuffix}`;
  }
  if (data.step === "excel_schema_detection") {
    const sheetLabel = data.sheet ? ` - ${data.sheet}` : "";
    return `Detecting Excel schema${docSuffix}${sheetLabel}`;
  }
  if (data.step === "cross_document_synthesis") return "Synthesizing cross-document gaps";
  if (data.step === "section_rewrite") return `Rewriting section${data.anchor ? ` ${data.anchor}` : ""}`;
  if (data.step === "diagram_render") return "Rendering diagram";
  if (data.step === "word_export") return "Exporting track-changes Word document";
  if (data.step === "doc_conversion") return `Converting documents (${data.completed_docs ?? 0} of ${data.total_docs ?? 0})`;
  if (data.message) return data.message;
  return data.stage ? formatStage(String(data.stage)) : "Waiting for pipeline progress";
}

function sseProgressPercent(data: SsePipelineEventData, fallbackStage: CaseStage): number {
  if (data.total_docs && data.completed_docs !== undefined && data.total_docs > 0) {
    const base = stageProgress((data.stage as CaseStage) || fallbackStage);
    const withinStage = Math.round((data.completed_docs / data.total_docs) * 14);
    return Math.min(98, Math.max(4, base - 10 + withinStage));
  }
  if (data.stage) return stageProgress(data.stage as CaseStage);
  return stageProgress(fallbackStage);
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function parseMarkdownWorkbook(markdown?: string): WorkbookSheet[] {
  const text = markdown || "";
  if (!text.trim()) return [];
  const sections = text.split(/\n(?=##\s+)/);
  const sheets: WorkbookSheet[] = [];
  sections.forEach((section, index) => {
    const lines = section.split(/\r?\n/);
    const heading = lines[0]?.match(/^##\s+(.+)$/);
    const tableLines = lines.filter((line) => line.trim().startsWith("|"));
    if (tableLines.length === 0) return;
    const rows = tableLines
      .filter((line) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim()))
      .map((line) =>
        line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim().replace(/&amp;/g, "&")),
      )
      .filter((row) => row.some(Boolean));
    if (rows.length > 0) sheets.push({ name: heading?.[1]?.trim() || `Sheet ${index + 1}`, rows });
  });
  return sheets;
}

function readWorksheetRows(sheet: XLSX.WorkSheet): string[][] {
  const reference = sheet["!ref"];
  if (!reference) return [];
  const range = XLSX.utils.decode_range(reference);
  const rows: string[][] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      row.push(cell?.w ?? (cell?.v == null ? "" : String(cell.v)));
    }
    rows.push(row);
  }
  return rows;
}

function removeDocxHoverTooltip() {
  document.getElementById("trace-docx-hover-tooltip")?.remove();
}

function positionDocxHoverTooltip(event: MouseEvent) {
  const tooltip = document.getElementById("trace-docx-hover-tooltip");
  if (!tooltip) return;
  const padding = 16;
  const rect = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - padding, Math.max(padding, event.clientX + 14));
  const top = Math.min(window.innerHeight - rect.height - padding, Math.max(padding, event.clientY + 14));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showDocxHoverTooltip(event: MouseEvent, suggestion: Suggestion) {
  removeDocxHoverTooltip();
  const tooltip = document.createElement("div");
  tooltip.id = "trace-docx-hover-tooltip";
  tooltip.className = "trace-docx-floating-tooltip";
  const title = document.createElement("strong");
  title.textContent = suggestion.title;
  const summary = document.createElement("span");
  summary.textContent = suggestion.detail || suggestion.suggestion_type;
  tooltip.appendChild(title);
  tooltip.appendChild(summary);
  const suggestionText = cleanSuggestionText(suggestion);
  if (suggestionText) {
    const example = document.createElement("span");
    example.dataset.label = "Proposed SOP language";
    example.textContent = suggestionText;
    tooltip.appendChild(example);
  }
  document.body.appendChild(tooltip);
  positionDocxHoverTooltip(event);
}

function applyDocxTextHighlights(container: HTMLElement, matches: DocxHighlightMatch[], onSelectSuggestion?: (suggestionId: string) => void) {
  const normalizedMatches = matches
    .map((match) => ({
      term: normalizeInlineText(match.term).slice(0, 120),
      suggestion: match.suggestion,
    }))
    .filter((match) => match.term.length > 18);
  if (normalizedMatches.length === 0) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent && node.textContent.trim().length > 0) textNodes.push(node as Text);
  }
  textNodes.forEach((node) => {
    const original = node.textContent || "";
    const matched = normalizedMatches.find((match) => original.toLowerCase().includes(match.term.toLowerCase().slice(0, Math.min(match.term.length, 80))));
    if (!matched || !node.parentNode) return;
    const span = document.createElement("span");
    span.className = matched.suggestion ? "trace-docx-comment" : "trace-docx-highlight";
    span.textContent = original;
    if (matched.suggestion) {
      span.addEventListener("mouseenter", (event) => showDocxHoverTooltip(event, matched.suggestion as Suggestion));
      span.addEventListener("mousemove", positionDocxHoverTooltip);
      span.addEventListener("mouseleave", removeDocxHoverTooltip);
      span.addEventListener("click", () => onSelectSuggestion?.((matched.suggestion as Suggestion).suggestion_id));
    }
    node.parentNode.replaceChild(span, node);
  });
}

function MarkdownBlock({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs">{children}</table></div>,
        th: ({ children }) => <th className="border border-[#D8E0ED] bg-[#F4F7FB] px-2 py-1 text-left font-semibold text-[#0C233C]">{children}</th>,
        td: ({ children }) => <td className="border border-[#D8E0ED] px-2 py-1 align-top text-[#0C233C]">{children}</td>,
        p: ({ children }) => <p className="my-1 text-sm leading-7 text-[#0C233C]">{children}</p>,
        ul: ({ children }) => <ul className="my-1 list-disc pl-5 text-sm leading-7 text-[#0C233C]">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 list-decimal pl-5 text-sm leading-7 text-[#0C233C]">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function StagePill({ stage }: { stage: CaseStage }) {
  return <span className={cn("inline-flex rounded-full border px-3 py-1 text-[11px] font-bold", stageBadgeClass(stage))}>{formatStage(stage)}</span>;
}

function SeverityBadge({ severity }: { severity: SuggestionSeverity }) {
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", severityStyles[severity])}>{severity}</span>;
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  tone: "primary" | "secondary" | "success" | "danger";
  disabled?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const className =
    tone === "primary" ? "bg-[#7213EA] text-white hover:bg-[#5D0FC3]" :
    tone === "success" ? "border border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D] hover:bg-[#DDF6EA]" :
    tone === "danger" ? "border border-[#F1B8BF] bg-white text-[#E5001B] hover:bg-[#FEEBED]" :
    "border border-[#BFD0E6] bg-white text-[#00338D] hover:bg-[#EEF2FF]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {icon}
      {label}
    </button>
  );
}

function CaseKpi({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="border-l border-white/20 px-4 first:border-l-0">
      <div className={cn("text-[22px] font-bold leading-none", tone)}>{value}</div>
      <div className="mt-1 text-[11px] text-white/65">{label}</div>
    </div>
  );
}

function DocumentNativePreview({
  caseId,
  file,
  markdownDocument,
  anchors,
  suggestions,
  activeSuggestionId,
  onSelectSuggestion,
  onOpenDetachedPreview,
  initialZoom = 90,
}: {
  caseId: string;
  file?: DocumentTagEntry;
  markdownDocument?: MarkdownDocument;
  anchors: Anchor[];
  suggestions: Suggestion[];
  activeSuggestionId?: string;
  onSelectSuggestion: (suggestionId: string) => void;
  onOpenDetachedPreview?: () => void;
  initialZoom?: number;
}) {
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<WorkbookSheet[]>([]);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  const [activeSheetName, setActiveSheetName] = useState("");
  const [zoom, setZoom] = useState(initialZoom);
  const filename = file?.filename || "";
  const isDocx = isDocxFile(filename);
  const isSheet = isSpreadsheetFile(filename);
  const activeSheet = sheets.find((sheet) => sheet.name === activeSheetName) || sheets[0];
  const matchedSuggestion = suggestions.find((item) => item.suggestion_id === activeSuggestionId);
  const showExtractedPreviewFallback = Boolean(error && markdownDocument?.markdown);

  const matchTerms = useMemo(() => {
    return [
      ...anchors.map((item) => item.content || item.heading || ""),
      ...suggestions.map((item) => item.original_text || cleanSuggestionText(item) || item.title),
    ]
      .map((value) => normalizeInlineText(value).toLowerCase().slice(0, 90))
      .filter((value) => value.length > 16);
  }, [anchors, suggestions]);

  const docxHighlightMatches = useMemo(() => {
    return [
      ...anchors.map((anchor) => ({
        term: anchor.content || anchor.heading || "",
        suggestion: suggestions.find((suggestion) => (suggestion.edit_targets ?? []).some((target) => target.target_anchor_id === anchor.anchor_id)),
      })),
      ...suggestions.map((suggestion) => ({
        term: suggestion.original_text || cleanSuggestionText(suggestion) || suggestion.title,
        suggestion,
      })),
    ].filter((match) => normalizeInlineText(match.term).length > 18);
  }, [anchors, suggestions]);

  const showMarkdownWorkbookFallback = () => {
    if (!isSheet) return false;
    const fallbackSheets = parseMarkdownWorkbook(markdownDocument?.markdown);
    if (fallbackSheets.length === 0) return false;
    setSheets(fallbackSheets);
    setActiveSheetName(fallbackSheets[0]?.name || "");
    setError("");
    return true;
  };

  useEffect(() => {
    if (!caseId || !file?.file_id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSheets([]);
    setDocumentBuffer(null);
    setActiveSheetName("");
    if (docxContainerRef.current) docxContainerRef.current.innerHTML = "";

    fetch(`/api/document-uplift/cases/${caseId}/files/${file.file_id}/content`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load uploaded document");
        return response.arrayBuffer();
      })
      .then(async (buffer) => {
        if (cancelled) return;
        if (isDocx) {
          setDocumentBuffer(buffer);
        } else if (isSheet) {
          try {
            const workbook = XLSX.read(buffer, { type: "array" });
            const nextSheets = workbook.SheetNames.map((name) => ({ name, rows: readWorksheetRows(workbook.Sheets[name]) }));
            setSheets(nextSheets);
            setActiveSheetName(nextSheets[0]?.name || "");
          } catch (err) {
            if (!showMarkdownWorkbookFallback()) throw err;
          }
        }
      })
      .catch((err) => {
        if (!cancelled && !showMarkdownWorkbookFallback()) setError(err instanceof Error ? err.message : "Unable to load uploaded document");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, file?.file_id, isDocx, isSheet, markdownDocument?.markdown]);

  useEffect(() => {
    if (!isDocx || loading || !documentBuffer || !docxContainerRef.current) return;
    let cancelled = false;
    const container = docxContainerRef.current;
    container.innerHTML = "";
    renderAsync(documentBuffer, container, undefined, {
      className: "trace-docx-preview",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    })
      .then(() => {
        if (!cancelled) applyDocxTextHighlights(container, docxHighlightMatches, onSelectSuggestion);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to render uploaded document");
      });
    return () => {
      cancelled = true;
    };
  }, [docxHighlightMatches, documentBuffer, isDocx, loading, onSelectSuggestion]);

  const maxColumns = Math.max(1, ...(activeSheet?.rows || []).map((row) => row.length));
  const cellHasComment = (value: string) => {
    const clean = normalizeInlineText(value).toLowerCase();
    if (!clean || clean.length < 4) return false;
    return matchTerms.some((term) => clean.includes(term) || term.includes(clean.slice(0, 40)));
  };

  if (!file) {
    return (
      <div className="grid h-full min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] text-center">
        <div>
          <FileText className="mx-auto h-9 w-9 text-[#8492A6]" />
          <p className="mt-3 text-[15px] font-bold text-[#0C233C]">Select A Document</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E6EF] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {isSheet ? <FileSpreadsheet className="h-4 w-4 text-[#009A44]" /> : <FileText className="h-4 w-4 text-[#1E49E2]" />}
          <span className="truncate text-[13px] font-bold text-[#0C233C]">{filename}</span>
          <span className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#5A6478]">{fileExtension(filename)}</span>
          {matchedSuggestion ? <span className="rounded-full border border-[#C9D7FF] bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-bold text-[#00338D]">Active Comment</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {onOpenDetachedPreview ? (
            <button
              type="button"
              onClick={onOpenDetachedPreview}
              aria-label="Open document preview"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#CAD7E8] bg-white text-[#00338D] transition-colors hover:bg-[#EEF2FF]"
            >
              <Search className="h-4 w-4" />
            </button>
          ) : (
            <Search className="h-4 w-4 text-[#8492A6]" />
          )}
          <select className="h-8 rounded-lg border border-[#CAD7E8] bg-white px-2 text-xs text-[#0C233C]" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {[75, 90, 100, 125, 150].map((value) => <option key={value} value={value}>{value}%</option>)}
          </select>
        </div>
      </div>
      {isSheet && sheets.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E2E6EF] bg-white px-3 py-2">
          <div className="flex min-w-0 gap-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                className={cn("rounded-t px-3 py-1.5 text-xs font-semibold", sheet.name === activeSheet?.name ? "border border-b-white border-[#D8E0ED] bg-white text-[#00338D]" : "bg-[#EEF2FF] text-[#5A6478] hover:bg-[#DCE7FF]")}
                onClick={() => setActiveSheetName(sheet.name)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
          <span className="shrink-0 rounded-full border border-[#E2E6EF] bg-white px-2 py-1 text-[11px] text-[#5A6478]">
            {activeSheet?.rows.length ?? 0} rows x {maxColumns} columns
          </span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-[#EEF3FA] p-5">
        {loading ? <div className="grid h-full place-items-center text-sm text-[#5A6478]">Loading uploaded document...</div> : null}
        {error ? <div className="rounded-xl border border-[#F7E7A8] bg-[#FFFBEB] p-4 text-sm text-[#7A5400]">{error}</div> : null}
        {!loading && showExtractedPreviewFallback ? (
          <article className="mx-auto mt-4 max-w-4xl rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
            <div className="mb-4 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Extracted Preview Fallback</div>
            <MarkdownBlock>{markdownDocument?.markdown || ""}</MarkdownBlock>
          </article>
        ) : null}
        {!loading && !error && isDocx ? (
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
            <div ref={docxContainerRef} className="mx-auto max-w-[900px] bg-white shadow-sm [&_.docx]:mx-auto" />
          </div>
        ) : null}
        {!loading && !error && isSheet && activeSheet ? (
          <div className="inline-block min-w-full rounded-xl border border-[#C8D8F0] bg-white shadow-sm" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}>
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-10 border border-[#D8E0ED] bg-[#F4F7FB]" />
                  {Array.from({ length: maxColumns }).map((_, index) => (
                    <th key={index} className="sticky top-0 z-10 min-w-32 border border-[#D8E0ED] bg-[#F4F7FB] px-2 py-1 text-center font-semibold text-[#5A6478]">{columnLabel(index)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSheet.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th className="sticky left-0 z-10 border border-[#D8E0ED] bg-[#F4F7FB] px-2 py-1 text-right font-semibold text-[#5A6478]">{rowIndex + 1}</th>
                    {Array.from({ length: maxColumns }).map((_, cellIndex) => {
                      const value = row[cellIndex] || "";
                      const matched = cellHasComment(value);
                      return (
                        <td key={cellIndex} className={cn("max-w-72 whitespace-pre-wrap border border-[#D8E0ED] px-2 py-1 align-top text-[#0C233C]", matched ? "bg-[#FFFBEB] ring-1 ring-[#EAAA00]" : "bg-white")}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && !error && !isDocx && !isSheet ? (
          <article className="mx-auto max-w-4xl rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
            {markdownDocument?.markdown ? <MarkdownBlock>{markdownDocument.markdown}</MarkdownBlock> : <p className="text-sm text-[#5A6478]">Preview text is available after the pipeline extracts this document.</p>}
          </article>
        ) : null}
      </div>
    </div>
  );
}

function DocumentPreviewDialog({
  open,
  onOpenChange,
  caseId,
  file,
  markdownDocument,
  anchors,
  suggestions,
  activeSuggestionId,
  onSelectSuggestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  file?: DocumentTagEntry;
  markdownDocument?: MarkdownDocument;
  anchors: Anchor[];
  suggestions: Suggestion[];
  activeSuggestionId?: string;
  onSelectSuggestion: (suggestionId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="trace-white-dialog flex h-[88vh] max-w-[92vw] flex-col overflow-hidden border border-[#E2E6EF] bg-white p-0 text-[#0C233C] shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-[#E2E6EF] px-5 py-4 text-left">
          <DialogTitle className="text-[#0C233C]">Document Preview</DialogTitle>
          <DialogDescription className="truncate text-[#5A6478]">
            {file?.filename || "Select a document to preview"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 bg-[#F0F2F7] p-4">
          <DocumentNativePreview
            caseId={caseId}
            file={file}
            markdownDocument={markdownDocument}
            anchors={anchors}
            suggestions={suggestions}
            activeSuggestionId={activeSuggestionId}
            onSelectSuggestion={onSelectSuggestion}
            initialZoom={100}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MoveToExportDialog({
  open,
  onOpenChange,
  pendingCount,
  acceptedCount,
  rejectedCount,
  deferredCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  deferredCount: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="trace-white-dialog max-w-2xl border border-[#E2E6EF] bg-white text-[#0C233C] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#0C233C]">Move To Export</DialogTitle>
          <DialogDescription className="text-[#5A6478]">This locks the review workspace for this run and unlocks output generation.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[#B8E7D0] bg-[#EDFBF5] p-4 text-center">
            <div className="text-2xl font-bold text-[#007A3D]">{acceptedCount}</div>
            <div className="text-[12px] text-[#5A6478]">Accepted</div>
          </div>
          <div className="rounded-xl border border-[#F7E7A8] bg-[#FFFBEB] p-4 text-center">
            <div className="text-2xl font-bold text-[#7A5400]">{deferredCount}</div>
            <div className="text-[12px] text-[#5A6478]">Edited</div>
          </div>
          <div className="rounded-xl border border-[#F1B8BF] bg-[#FEEBED] p-4 text-center">
            <div className="text-2xl font-bold text-[#E5001B]">{rejectedCount}</div>
            <div className="text-[12px] text-[#5A6478]">Rejected</div>
          </div>
          <div className="rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] p-4 text-center">
            <div className="text-2xl font-bold text-[#00338D]">{pendingCount}</div>
            <div className="text-[12px] text-[#5A6478]">Pending</div>
          </div>
        </div>
        {pendingCount > 0 ? (
          <div className="rounded-xl border border-[#F7E7A8] bg-[#FFFBEB] p-4 text-sm text-[#7A5400]">
            Pending suggestions will remain pending. Generate Outputs may auto-accept eligible pending suggestions according to the existing backend rule.
          </div>
        ) : null}
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-[#CAD7E8] bg-white px-4 py-2 text-[13px] font-bold text-[#0C233C]">
            Go Back And Review
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex items-center gap-2 rounded-lg bg-[#7213EA] px-5 py-2 text-[13px] font-bold text-white">
            <Lock className="h-4 w-4" />
            Continue To Export
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsTab({
  caseItem,
  caseId,
  selectedFileId,
  onSelectFile,
  onPreviewFile,
}: {
  caseItem: DocumentUpliftCase | null;
  caseId: string;
  selectedFileId: string;
  onSelectFile: (fileId: string) => void;
  onPreviewFile: (fileId: string) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTag, setUploadTag] = useState<DocumentTag>("procedure");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const uploadFiles = useMutation({
    mutationFn: async () => {
      if (!caseId || !selectedFiles.length) return [];
      const uploaded: DocumentTagEntry[] = [];
      for (const file of selectedFiles) {
        const form = new FormData();
        form.append("tag", uploadTag);
        form.append("file", file);
        const response = await fetch(`/api/document-uplift/cases/${caseId}/upload`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Failed to upload ${file.name}`);
        }
        uploaded.push(await response.json());
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      toast({ title: "Files uploaded", description: `${uploaded.length} file(s) added to this case.` });
    },
    onError: (error: Error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });

  const documents = caseItem?.document_tags ?? [];

  return (
    <div className="h-full min-h-0">
      <section className="min-h-0 overflow-auto rounded-2xl border border-[#E2E6EF] bg-white p-4 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Documents</div>
            <h2 className="text-[20px] font-bold tracking-tight text-[#0C233C]">Document Library</h2>
            <p className="mt-1 text-[13px] text-[#5A6478]">Upload and tag source documents for this uplift run.</p>
            <span className="sr-only">Upload and Tag Documents</span>
          </div>
          <ActionButton label="Add Documents" tone="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()} />
        </div>

        <div
          className="mb-4 cursor-pointer rounded-2xl border border-dashed border-[#1E49E2] bg-[#F8FAFD] p-5 text-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-8 w-8 text-[#1E49E2]" />
          <div className="mt-2 text-[14px] font-bold text-[#0C233C]">Drag and drop files here or click to browse</div>
          <div className="mt-1 text-[12px] text-[#8492A6]">PDF, DOCX, XLSX, PPTX, TXT</div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} />
        </div>

        {selectedFiles.length ? (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] p-3">
            <label className="min-w-[220px]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#00338D]">Document Role</span>
              <select value={uploadTag} onChange={(event) => setUploadTag(event.target.value as DocumentTag)} className="mt-1 h-9 w-full rounded-lg border border-[#CAD7E8] bg-white px-3 text-sm text-[#0C233C]">
                {TAG_OPTIONS.map((tag) => <option key={tag.value} value={tag.value}>{tag.label}</option>)}
              </select>
            </label>
            <div className="min-w-0 flex-1 text-[12px] text-[#5A6478]">{selectedFiles.length} selected: {selectedFiles.map((file) => file.name).join(", ")}</div>
            <ActionButton label="Upload Files" tone="primary" disabled={uploadFiles.isPending} icon={uploadFiles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} onClick={() => uploadFiles.mutate()} />
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-[#E2E6EF]">
          <div className="grid grid-cols-[minmax(0,1fr)_160px_160px_90px] bg-[#F8FAFD] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#5A6478]">
            <div>Document</div>
            <div>Role</div>
            <div>Status</div>
            <div className="text-center">Preview</div>
          </div>
          {documents.map((file) => {
            const tag = TAG_OPTIONS.find((option) => option.value === file.tag);
            return (
              <div
                key={file.file_id}
                onClick={() => onSelectFile(file.file_id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectFile(file.file_id);
                }}
                role="button"
                tabIndex={0}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_160px_160px_90px] items-center border-t border-[#E2E6EF] px-4 py-3 text-left transition-colors",
                  selectedFileId === file.file_id ? "bg-[#EEF2FF]" : "bg-white hover:bg-[#F8FAFD]",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isSpreadsheetFile(file.filename) ? <FileSpreadsheet className="h-5 w-5 text-[#009A44]" /> : <FileText className="h-5 w-5 text-[#1E49E2]" />}
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[#0C233C]">{file.filename}</div>
                    <div className="text-[11px] text-[#8492A6]">{fileExtension(file.filename).toUpperCase()} · {file.page_count ? `${file.page_count} pages` : "Uploaded"}</div>
                  </div>
                </div>
                <div><span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", tag?.tone)}>{formatTag(file.tag)}</span></div>
                <div className="flex items-center gap-2 text-[12px] text-[#5A6478]">
                  <CheckCircle2 className="h-4 w-4 text-[#009A44]" />
                  {file.conversion_status || "Uploaded"}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPreviewFile(file.file_id);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#1E49E2] transition-colors hover:bg-[#EEF2FF]"
                    aria-label={`Preview ${file.filename}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {!documents.length ? <div className="border-t border-[#E2E6EF] p-8 text-center text-sm text-[#5A6478]">No documents uploaded yet.</div> : null}
        </div>
      </section>
    </div>
  );
}

function ProcessingTab({
  caseItem,
  progress,
  progressLabel,
  onRunPipeline,
  runPending,
}: {
  caseItem: DocumentUpliftCase | null;
  progress: number;
  progressLabel: string;
  onRunPipeline: () => void;
  runPending: boolean;
}) {
  const conversion = caseItem?.processing_state?.conversion ?? {};
  const analysis = caseItem?.processing_state?.analysis ?? {};
  const pipelineError = caseItem?.processing_state?.pipeline_error;
  const stage = caseStage(caseItem);
  const stages = [
    { title: "Parse & Classify Documents", detail: `${conversion.completed ?? 0}/${conversion.total ?? caseItem?.document_tags?.length ?? 0} documents parsed`, done: (conversion.completed ?? 0) > 0 && (conversion.pending ?? 0) === 0, active: stage === "converting" },
    { title: "Cross-Document Analysis", detail: `${analysis.completed ?? 0}/${analysis.total ?? 1} analysis jobs complete`, done: (analysis.completed ?? 0) > 0, active: stage === "analyzing" },
    { title: "Draft Suggestions", detail: `${caseItem?.suggestions?.length ?? 0} suggestions drafted`, done: ["review_ready", "partial", "generating_outputs", "complete"].includes(stage), active: false },
  ];

  return (
    <div className="h-full min-h-0">
      <section className="min-h-0 overflow-auto rounded-2xl border border-[#E2E6EF] bg-white p-4 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Pipeline</div>
            <h2 className="text-[20px] font-bold tracking-tight text-[#0C233C]">Processing Status</h2>
            <p className="mt-1 text-[13px] text-[#5A6478]">{progressLabel || formatStage(stage)}</p>
          </div>
          <ActionButton label="Run Pipeline" tone="secondary" disabled={runPending} icon={runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} onClick={onRunPipeline} />
        </div>
        <div className="mb-5 grid overflow-hidden rounded-2xl border border-[#E2E6EF] md:grid-cols-4">
          {[
            ["Extraction", `${conversion.completed ?? 0}/${conversion.total ?? 0}`],
            ["Analysis", `${analysis.completed ?? 0}/${analysis.total ?? 1}`],
            ["Suggestions", caseItem?.suggestions?.length ?? 0],
            ["Progress", `${progress}%`],
          ].map(([label, value]) => (
            <div key={label} className="border-[#E2E6EF] bg-[#F8FAFD] p-4 md:border-r md:last:border-r-0">
              <div className="text-[24px] font-bold text-[#00338D]">{value}</div>
              <div className="mt-1 text-[12px] text-[#5A6478]">{label}</div>
            </div>
          ))}
        </div>
        <div className="space-y-0 overflow-hidden rounded-2xl border border-[#E2E6EF]">
          {stages.map((item, index) => (
            <div key={item.title} className={cn("grid gap-4 border-t border-[#E2E6EF] p-5 first:border-t-0 md:grid-cols-[260px_minmax(0,1fr)_120px]", item.active && "bg-[#EEF2FF]")}>
              <div className="flex items-center gap-4">
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-full border", item.done ? "border-[#009A44] bg-[#EDFBF5] text-[#009A44]" : item.active ? "border-[#1E49E2] bg-white text-[#1E49E2]" : "border-[#CAD7E8] bg-white text-[#8492A6]")}>
                  {item.done ? <CheckCircle2 className="h-6 w-6" /> : index + 1}
                </div>
                <div>
                  <div className="text-[13px] font-bold text-[#8492A6]">Stage {index + 1}</div>
                  <div className="text-[17px] font-bold text-[#0C233C]">{item.title}</div>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[13px] text-[#5A6478]">{item.detail}</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E2E6EF]">
                  <div className="h-full rounded-full bg-[#1E49E2]" style={{ width: item.done ? "100%" : item.active ? `${Math.max(12, progress)}%` : "0%" }} />
                </div>
              </div>
              <div className="flex items-center justify-end">
                <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", item.done ? "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]" : item.active ? "border-[#C9D7FF] bg-white text-[#00338D]" : "border-[#E2E6EF] bg-white text-[#8492A6]")}>
                  {item.done ? "Complete" : item.active ? "In Progress" : "Waiting"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {pipelineError ? (
          <div className="mt-4 rounded-2xl border border-[#F1B8BF] bg-[#FEEBED] p-4 text-[#8A0010] shadow-sm">
            <div className="flex gap-2 text-[14px] font-bold"><AlertTriangle className="h-5 w-5" />Pipeline Failed</div>
            <p className="mt-2 text-[12px] leading-relaxed">{pipelineError}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReviewTab({
  caseId,
  caseItem,
  suggestions,
  selectedFile,
  markdownDocument,
  anchors,
  activeSuggestionId,
  setActiveSuggestionId,
  selectedFileId,
  setSelectedFileId,
  onMoveToExport,
}: {
  caseId: string;
  caseItem: DocumentUpliftCase | null;
  suggestions: Suggestion[];
  selectedFile?: DocumentTagEntry;
  markdownDocument?: MarkdownDocument;
  anchors: Anchor[];
  activeSuggestionId: string;
  setActiveSuggestionId: (id: string) => void;
  selectedFileId: string;
  setSelectedFileId: (id: string) => void;
  onMoveToExport: () => void;
}) {
  const { toast } = useToast();
  const [severityFilter, setSeverityFilter] = useState<SuggestionSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [editedText, setEditedText] = useState("");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const documents = caseItem?.document_tags ?? [];
  const documentSuggestions = suggestions.filter((suggestion) => suggestionMatchesDocument(suggestion, selectedFile, markdownDocument, anchors));
  const categories = Array.from(new Set(suggestions.map((item) => item.suggestion_type))).sort();
  const filteredSuggestions = sortSuggestions(documentSuggestions.filter((suggestion) => {
    return (severityFilter === "all" || suggestion.severity === severityFilter) && (categoryFilter === "all" || suggestion.suggestion_type === categoryFilter);
  }));
  const activeSuggestion = filteredSuggestions.find((item) => item.suggestion_id === activeSuggestionId) || filteredSuggestions[0];

  useEffect(() => {
    if (activeSuggestion && activeSuggestion.suggestion_id !== activeSuggestionId) setActiveSuggestionId(activeSuggestion.suggestion_id);
  }, [activeSuggestion?.suggestion_id, activeSuggestionId, setActiveSuggestionId]);

  useEffect(() => {
    setReviewerNotes(activeSuggestion?.reviewer_notes || "");
    setEditedText(activeSuggestion?.edited_proposed_text || cleanSuggestionText(activeSuggestion) || "");
    setEditPanelOpen(false);
  }, [activeSuggestion?.suggestion_id]);

  const updateSuggestion = useMutation({
    mutationFn: async ({
      suggestionId,
      reviewStatus,
      editedProposedText,
      notes,
    }: {
      suggestionId: string;
      reviewStatus: SuggestionStatus;
      editedProposedText?: string;
      notes?: string;
    }) => {
      const response = await apiRequest("PATCH", `/api/document-uplift/cases/${caseId}/suggestions/${suggestionId}`, {
        review_status: reviewStatus,
        edited_proposed_text: editedProposedText,
        reviewer_notes: notes,
      });
      return response.json() as Promise<Suggestion>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}/suggestions`] });
      toast({ title: "Suggestion updated" });
    },
    onError: (error: Error) => toast({ title: "Suggestion update failed", description: error.message, variant: "destructive" }),
  });

  const bulkReview = useMutation({
    mutationFn: async ({ action }: { action: "accept_all" | "reject_all" }) => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${caseId}/suggestions/bulk-review`, {
        action,
        confirmation_token: action === "reject_all" ? "REJECT_ALL" : undefined,
      });
      return response.json() as Promise<{ updated_count: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}/suggestions`] });
      toast({ title: "Bulk review complete", description: `${result.updated_count} suggestion(s) updated.` });
    },
    onError: (error: Error) => toast({ title: "Bulk review failed", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-2xl border border-[#E2E6EF] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#B8E7D0] bg-[#EDFBF5] px-3 py-1 text-[12px] font-bold text-[#007A3D]">Accepted {suggestions.filter((item) => item.review_status === "accepted").length}</span>
            <span className="rounded-full border border-[#F1B8BF] bg-[#FEEBED] px-3 py-1 text-[12px] font-bold text-[#E5001B]">Rejected {suggestions.filter((item) => item.review_status === "rejected").length}</span>
            <span className="rounded-full border border-[#C9D7FF] bg-[#EEF2FF] px-3 py-1 text-[12px] font-bold text-[#00338D]">Pending {suggestions.filter((item) => item.review_status === "pending").length}</span>
          </div>
          <div className="h-8 w-px bg-[#E2E6EF]" />
          <ActionButton label="Accept All" tone="success" disabled={!suggestions.length || bulkReview.isPending} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => bulkReview.mutate({ action: "accept_all" })} />
          <ActionButton label="Reject All" tone="danger" disabled={!suggestions.length || bulkReview.isPending} icon={<XCircle className="h-4 w-4" />} onClick={() => bulkReview.mutate({ action: "reject_all" })} />
          <select className="h-10 rounded-xl border border-[#CAD7E8] bg-white px-3 text-[13px] text-[#0C233C]" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as SuggestionSeverity | "all")}>
            <option value="all">Severity: All</option>
            {(["critical", "high", "medium", "low", "informational"] as SuggestionSeverity[]).map((severity) => <option key={severity} value={severity}>{formatStage(severity)}</option>)}
          </select>
          <select className="h-10 rounded-xl border border-[#CAD7E8] bg-white px-3 text-[13px] text-[#0C233C]" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">Category: All</option>
            {categories.map((category) => <option key={category} value={category}>{formatStage(category)}</option>)}
          </select>
          <div className="ml-auto">
            <ActionButton label="Move To Export" tone="primary" disabled={!suggestions.length} icon={<Lock className="h-4 w-4" />} onClick={onMoveToExport} />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-h-0 grid-cols-[160px_minmax(0,1fr)] gap-4">
          <aside className="min-h-0 overflow-auto rounded-2xl border border-[#E2E6EF] bg-white p-3 shadow-sm">
            <div className="mb-3 text-[13px] font-bold text-[#0C233C]">Sections</div>
            <select className="mb-3 h-9 w-full rounded-lg border border-[#CAD7E8] bg-white px-2 text-xs text-[#0C233C]" value={selectedFileId} onChange={(event) => setSelectedFileId(event.target.value)}>
              {documents.map((file) => <option key={file.file_id} value={file.file_id}>{file.filename}</option>)}
            </select>
            <div className="space-y-1">
              {anchors.map((anchor, index) => (
                <button key={anchor.anchor_id} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[12px] text-[#00338D] hover:bg-[#EEF2FF]">
                  {index + 1}. {anchor.heading || anchor.section_path || "Document Section"}
                </button>
              ))}
              {!anchors.length ? <p className="text-[12px] text-[#8492A6]">Anchors appear after the pipeline runs.</p> : null}
            </div>
          </aside>
          <DocumentNativePreview
            caseId={caseId}
            file={selectedFile}
            markdownDocument={markdownDocument}
            anchors={anchors}
            suggestions={documentSuggestions}
            activeSuggestionId={activeSuggestionId}
            onSelectSuggestion={setActiveSuggestionId}
            onOpenDetachedPreview={() => setPreviewDialogOpen(true)}
            initialZoom={75}
          />
        </div>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
          <div className="shrink-0 border-b border-[#E2E6EF] p-3">
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Suggestions ({filteredSuggestions.length})</div>
            <h3 className="mt-1 text-[18px] font-bold tracking-tight text-[#0C233C]">Decision Queue</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
              {filteredSuggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.suggestion_id}
                  onClick={() => setActiveSuggestionId(suggestion.suggestion_id)}
                  className={cn(
                    "block w-full rounded-xl border p-3 text-left transition-colors",
                    activeSuggestion?.suggestion_id === suggestion.suggestion_id ? "border-[#1E49E2] bg-[#EEF2FF] ring-2 ring-[#C9D7FF]" : "border-[#E2E6EF] bg-white hover:bg-[#F8FAFD]",
                    suggestion.review_status === "accepted" && "border-[#B8E7D0] bg-[#EDFBF5]",
                    suggestion.review_status === "rejected" && "border-[#F1B8BF] bg-[#FFF7F8] opacity-80",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SeverityBadge severity={suggestion.severity} />
                    <span className="text-[11px] font-bold capitalize text-[#5A6478]">{suggestion.review_status}</span>
                  </div>
                  <div className="text-[14px] font-bold text-[#0C233C]">{suggestion.title}</div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#5A6478]">{suggestion.detail || formatStage(suggestion.suggestion_type)}</p>
                  {cleanSuggestionText(suggestion) ? (
                    <div className="mt-3 border-l-2 border-[#009A44] bg-white/70 px-3 py-2 text-[12px] leading-5 text-[#0C233C]">
                      {cleanSuggestionText(suggestion)}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#8492A6]">
                    {(suggestion.source_references ?? []).slice(0, 2).map((source, index) => <span key={`${source.document_id}-${index}`} className="rounded-full border border-[#E2E6EF] bg-white px-2 py-1">{sourceLabel(source)}</span>)}
                  </div>
                </button>
              ))}
              {!filteredSuggestions.length ? <div className="rounded-xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] p-8 text-center text-sm text-[#5A6478]">No suggestions match this view.</div> : null}
            </div>
          </div>
          <div className="shrink-0 border-t border-[#E2E6EF] bg-[#F8FAFD] p-3">
            {activeSuggestion ? (
              <div className="space-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <ActionButton label="Accept" tone="success" disabled={updateSuggestion.isPending} onClick={() => updateSuggestion.mutate({ suggestionId: activeSuggestion.suggestion_id, reviewStatus: "accepted", notes: reviewerNotes })} />
                  <ActionButton
                    label={editPanelOpen ? "Save Edit" : "Edit Text"}
                    tone="secondary"
                    disabled={updateSuggestion.isPending || (editPanelOpen && !editedText.trim())}
                    onClick={() => {
                      if (!editPanelOpen) {
                        setEditPanelOpen(true);
                        return;
                      }
                      updateSuggestion.mutate({ suggestionId: activeSuggestion.suggestion_id, reviewStatus: "edited", editedProposedText: editedText, notes: reviewerNotes });
                    }}
                  />
                  <ActionButton label="Reject" tone="danger" disabled={updateSuggestion.isPending} onClick={() => updateSuggestion.mutate({ suggestionId: activeSuggestion.suggestion_id, reviewStatus: "rejected", notes: reviewerNotes })} />
                </div>
                {editPanelOpen ? (
                  <div className="max-h-[180px] space-y-2 overflow-auto">
                    <Textarea value={editedText} onChange={(event) => setEditedText(event.target.value)} className="min-h-16 border-[#CAD7E8] bg-white text-xs text-[#0C233C]" placeholder="Edited proposed text" />
                    <Textarea value={reviewerNotes} onChange={(event) => setReviewerNotes(event.target.value)} className="min-h-12 border-[#CAD7E8] bg-white text-xs text-[#0C233C]" placeholder="Reviewer notes" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
      <DocumentPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        caseId={caseId}
        file={selectedFile}
        markdownDocument={markdownDocument}
        anchors={anchors}
        suggestions={documentSuggestions}
        activeSuggestionId={activeSuggestionId}
        onSelectSuggestion={setActiveSuggestionId}
      />
    </div>
  );
}

function ExportTab({
  caseId,
  caseItem,
  onGenerateOutputs,
  generating,
}: {
  caseId: string;
  caseItem: DocumentUpliftCase | null;
  onGenerateOutputs: () => void;
  generating: boolean;
}) {
  const suggestions = caseItem?.suggestions ?? [];
  const outputs = caseItem?.outputs ?? [];
  const accepted = suggestions.filter((item) => item.review_status === "accepted").length;
  const rejected = suggestions.filter((item) => item.review_status === "rejected").length;
  const edited = suggestions.filter((item) => item.review_status === "edited").length;
  const pending = suggestions.filter((item) => item.review_status === "pending").length;
  return (
    <div className="h-full min-h-0">
      <section className="min-h-0 overflow-auto space-y-4">
        <div className="rounded-2xl border border-[#B8E7D0] bg-[#EDFBF5] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#009A44] text-white"><CheckCircle2 className="h-7 w-7" /></div>
              <div>
                <h2 className="text-[20px] font-bold text-[#0C233C]">Export Workspace Ready</h2>
                <p className="mt-1 text-[13px] text-[#5A6478]">Generate or download tracked outputs for this case.</p>
              </div>
            </div>
            <ActionButton label="Generate Outputs" tone="primary" disabled={generating} icon={generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} onClick={onGenerateOutputs} />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
          <div className="border-b border-[#E2E6EF] px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Downloads</div>
            <h3 className="mt-1 text-[20px] font-bold tracking-tight text-[#0C233C]">Generated Outputs</h3>
          </div>
          {outputs.length ? (
            outputs.map((output) => (
              <div key={output.output_id} className="grid gap-4 border-t border-[#E2E6EF] px-5 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_140px]">
                <div className="flex min-w-0 items-center gap-3">
                  <FileArchive className="h-6 w-6 text-[#1E49E2]" />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-[#0C233C]">{output.filename}</div>
                    <div className="mt-1 text-[12px] text-[#5A6478]">{formatStage(output.output_type)} · {formatDate(output.created_at)}</div>
                  </div>
                </div>
                <a href={`/api/document-uplift/cases/${caseId}/outputs/${output.output_id}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] px-4 py-2 text-[13px] font-bold text-[#00338D]">
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-sm text-[#5A6478]">Generated files will appear here after output generation completes.</div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
          <div className="border-b border-[#E2E6EF] px-5 py-4">
            <h3 className="text-[17px] font-bold text-[#0C233C]">Change Summary By Status</h3>
          </div>
          {[
            ["Accepted", accepted, "#009A44"],
            ["Edited", edited, "#1E49E2"],
            ["Rejected", rejected, "#E5001B"],
            ["Pending", pending, "#EAAA00"],
          ].map(([label, value, color]) => (
            <div key={label} className="grid grid-cols-[1fr_120px] border-t border-[#E2E6EF] px-5 py-3 text-[13px] first:border-t-0">
              <span className="text-[#5A6478]">{label}</span>
              <span className="font-bold" style={{ color: String(color) }}>{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DocumentUpliftCasePage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const caseId = decodeURIComponent(location.split("/document-uplift/")[1]?.split("?")[0] || "");
  const [activeTab, setActiveTab] = useState<ActiveTab>("documents");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [activeSuggestionId, setActiveSuggestionId] = useState("");
  const [exportUnlocked, setExportUnlocked] = useState(false);
  const [moveExportOpen, setMoveExportOpen] = useState(false);
  const [documentUpliftProgressLabel, setDocumentUpliftProgressLabel] = useState("");
  const [sseProgress, setSseProgress] = useState<number | null>(null);

  const caseQuery = useQuery<DocumentUpliftCase>({
    queryKey: [`/api/document-uplift/cases/${caseId}`],
    enabled: !!caseId,
    refetchInterval: (query) => {
      const stage = caseStage(query.state.data);
      return ["converting", "analyzing", "generating_outputs"].includes(stage) ? 5000 : false;
    },
  });

  const suggestionsQuery = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: [`/api/document-uplift/cases/${caseId}/suggestions`],
    enabled: !!caseId,
  });

  const caseItem = caseQuery.data ?? null;
  const suggestions = suggestionsQuery.data?.suggestions ?? caseItem?.suggestions ?? [];
  const sortedSuggestions = useMemo(() => sortSuggestions(suggestions), [suggestions]);
  const stage = caseStage(caseItem);
  const canReview = ["review_ready", "partial", "generating_outputs", "complete"].includes(stage) || suggestions.length > 0;
  const canExport = exportUnlocked || stage === "complete" || stage === "generating_outputs";
  const selectedFile = selectedFileFromCase(caseItem, selectedFileId);
  const selectedMarkdown = markdownForFile(caseItem, selectedFile);
  const selectedAnchors = anchorsForFile(caseItem, selectedFile);
  const pendingCount = suggestions.filter((item) => item.review_status === "pending").length;
  const acceptedCount = suggestions.filter((item) => item.review_status === "accepted").length;
  const rejectedCount = suggestions.filter((item) => item.review_status === "rejected").length;
  const editedCount = suggestions.filter((item) => item.review_status === "edited").length;
  const costSummary = caseItem?.status?.final_cost ?? caseItem?.status?.stage1_cost;
  const progress = sseProgress ?? stageProgress(stage);

  useEffect(() => {
    if (!selectedFileId && selectedFile) setSelectedFileId(selectedFile.file_id);
  }, [selectedFile?.file_id, selectedFileId]);

  useEffect(() => {
    if (!activeSuggestionId && sortedSuggestions[0]) setActiveSuggestionId(sortedSuggestions[0].suggestion_id);
  }, [activeSuggestionId, sortedSuggestions]);

  useEffect(() => {
    if (!caseId) return;
    const eventSource = new EventSource(`/api/document-uplift/cases/${caseId}/pipeline/stream`);

    const updateFromEvent = (event: MessageEvent) => {
      const data = parseSsePipelineEvent(event);
      if (!data) return;
      setDocumentUpliftProgressLabel(formatSseProgressLabel(data));
      setSseProgress((current) => Math.max(current ?? 0, sseProgressPercent(data, caseStage(caseItem))));
    };

    const handleStage = (event: MessageEvent) => {
      updateFromEvent(event);
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
    };

    const handleProgress = (event: MessageEvent) => {
      updateFromEvent(event);
    };

    const handleComplete = (event: MessageEvent) => {
      updateFromEvent(event);
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}/suggestions`] });
      eventSource.close();
    };

    const handleStreamError = (event: Event) => {
      const data = "data" in event ? parseSsePipelineEvent(event as MessageEvent) : null;
      if (data) {
        setDocumentUpliftProgressLabel(formatSseProgressLabel(data));
        setSseProgress(sseProgressPercent(data, caseStage(caseItem)));
      } else {
        setDocumentUpliftProgressLabel("Live progress stream unavailable; polling status instead.");
      }
      if (data?.stage === "failed") eventSource.close();
    };

    eventSource.addEventListener("stage", handleStage);
    eventSource.addEventListener("progress", handleProgress);
    eventSource.addEventListener("complete", handleComplete);
    eventSource.addEventListener("error", handleStreamError);

    return () => {
      eventSource.close();
    };
  }, [caseId, caseItem?.status?.stage]);

  const runPipeline = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${caseId}/run-pipeline`);
      return response.json();
    },
    onSuccess: () => {
      setActiveTab("processing");
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      toast({ title: "Pipeline started", description: "Document Uplift analysis is running." });
    },
    onError: (error: Error) => toast({ title: "Run failed", description: error.message, variant: "destructive" }),
  });

  const generateOutputs = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${caseId}/generate-outputs`);
      return response.json() as Promise<{ warnings?: string[]; auto_accepted_count?: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${caseId}/suggestions`] });
      toast({
        title: "Output generation started",
        description: result.warnings?.[0] || "Track-changes Word and supporting outputs are being generated.",
      });
    },
    onError: (error: Error) => toast({ title: "Generate outputs failed", description: error.message, variant: "destructive" }),
  });

  const tabs: Array<{ id: ActiveTab; label: string; locked?: boolean; count?: number }> = [
    { id: "documents", label: "Documents" },
    { id: "processing", label: "Processing" },
    { id: "review", label: "Review Suggestions", locked: !canReview, count: pendingCount },
    { id: "export", label: "Export", locked: !canExport },
  ];

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#F0F2F7] text-[#0C233C]" data-testid="document-uplift-case-page">
      <div className="flex h-full min-h-0 flex-col">
        <TraceNavBar breadcrumb={caseItem?.title || "Document Uplift"} />

        <section className="shrink-0 border-b border-[#D8E0ED] bg-[#0C233C] px-5 py-4 text-white lg:px-8" data-testid="document-uplift-compact-header">
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#00B8F5] sm:flex">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-3 text-[12px] text-white/65">
                  <button type="button" onClick={() => setLocation("/document-uplift")} className="text-white/80 hover:text-white">Back To Cases</button>
                  <StagePill stage={stage} />
                  <span>{caseItem?.domain_label || caseItem?.process_name || "Document Uplift"}</span>
                </div>
                <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight text-white lg:text-[28px]">{caseItem?.title || "Document Uplift Case"}</h1>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/65">
                  <span>Primary SOP: {selectedFileFromCase(caseItem)?.filename || "-"}</span>
                  <span>Model: {costSummary?.model || "Configured Default"}</span>
                  <span>Last run: {formatDate(caseItem?.updated_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-0">
              <CaseKpi label="Suggestions" value={suggestions.length} tone="text-white" />
              <CaseKpi label="Pending" value={pendingCount} tone="text-[#EAAA00]" />
              <CaseKpi label="Outputs" value={caseItem?.outputs?.length ?? 0} tone="text-white" />
              <CaseKpi label="Cost" value={formatCost(costSummary)} tone="text-white" />
            </div>
          </div>
        </section>

        <nav className="shrink-0 border-b border-[#D8E0ED] bg-white px-5 lg:px-8">
          <div className="flex w-full max-w-none gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                disabled={tab.locked}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex h-12 items-center gap-2 border-b-2 px-4 text-[14px] font-bold transition-colors",
                  activeTab === tab.id ? "border-[#1E49E2] text-[#00338D]" : "border-transparent text-[#5A6478] hover:text-[#00338D]",
                  tab.locked && "cursor-not-allowed text-[#B5C0D1] hover:text-[#B5C0D1]",
                )}
              >
                {tab.locked ? <Lock className="h-4 w-4" /> : null}
                {tab.label}
                {tab.count ? <span className="rounded-full bg-[#1E49E2] px-2 py-0.5 text-[10px] text-white">{tab.count}</span> : null}
              </button>
            ))}
          </div>
        </nav>

        <main className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="h-full w-full max-w-none">
            {caseQuery.isError ? (
              <div className="rounded-2xl border border-[#F7E7A8] bg-[#FFFBEB] p-5 text-[#7A5400]">Unable to load this case.</div>
            ) : null}
            {activeTab === "documents" ? (
              <DocumentsTab
                caseItem={caseItem}
                caseId={caseId}
                selectedFileId={selectedFile?.file_id || selectedFileId}
                onSelectFile={setSelectedFileId}
                onPreviewFile={(fileId) => {
                  setSelectedFileId(fileId);
                  setActiveTab("review");
                }}
              />
            ) : null}
            {activeTab === "processing" ? (
              <ProcessingTab caseItem={caseItem} progress={progress} progressLabel={documentUpliftProgressLabel} onRunPipeline={() => runPipeline.mutate()} runPending={runPipeline.isPending} />
            ) : null}
            {activeTab === "review" ? (
              canReview ? (
                <ReviewTab
                  caseId={caseId}
                  caseItem={caseItem}
                  suggestions={sortedSuggestions}
                  selectedFile={selectedFile}
                  markdownDocument={selectedMarkdown}
                  anchors={selectedAnchors}
                  activeSuggestionId={activeSuggestionId}
                  setActiveSuggestionId={setActiveSuggestionId}
                  selectedFileId={selectedFile?.file_id || selectedFileId}
                  setSelectedFileId={setSelectedFileId}
                  onMoveToExport={() => setMoveExportOpen(true)}
                />
              ) : (
                <div className="grid h-full place-items-center rounded-2xl border border-[#E2E6EF] bg-white">
                  <div className="text-center">
                    <Lock className="mx-auto h-10 w-10 text-[#8492A6]" />
                    <h2 className="mt-3 text-[20px] font-bold text-[#0C233C]">Review Suggestions Are Locked</h2>
                    <p className="mt-1 text-sm text-[#5A6478]">Complete a successful pipeline run to unlock review.</p>
                  </div>
                </div>
              )
            ) : null}
            {activeTab === "export" ? (
              canExport ? (
                <ExportTab caseId={caseId} caseItem={caseItem} onGenerateOutputs={() => generateOutputs.mutate()} generating={generateOutputs.isPending} />
              ) : (
                <div className="grid h-full place-items-center rounded-2xl border border-[#E2E6EF] bg-white">
                  <div className="text-center">
                    <Lock className="mx-auto h-10 w-10 text-[#8492A6]" />
                    <h2 className="mt-3 text-[20px] font-bold text-[#0C233C]">Export Is Locked</h2>
                    <p className="mt-1 text-sm text-[#5A6478]">Move the case from Review Suggestions to Export first.</p>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </main>
      </div>

      <MoveToExportDialog
        open={moveExportOpen}
        onOpenChange={setMoveExportOpen}
        pendingCount={pendingCount}
        acceptedCount={acceptedCount}
        rejectedCount={rejectedCount}
        deferredCount={editedCount}
        onConfirm={() => {
          setMoveExportOpen(false);
          setExportUnlocked(true);
          setActiveTab("export");
        }}
      />
    </div>
  );
}
