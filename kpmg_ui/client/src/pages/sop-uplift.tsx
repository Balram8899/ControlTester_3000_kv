import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CaseChatPanel } from "./sop-uplift/CaseChatPanel";
import { DocumentTagReviewTable } from "./sop-uplift/DocumentTagReviewTable";
import { SopCasePanel } from "./sop-uplift/SopCasePanel";
import { SopOutputPanel } from "./sop-uplift/SopOutputPanel";
import { SopPreview } from "./sop-uplift/SopPreview";
import { SopReadinessCard } from "./sop-uplift/SopReadinessCard";
import { SopUploadBuckets } from "./sop-uplift/SopUploadBuckets";
import { SopUpliftHeader } from "./sop-uplift/SopUpliftHeader";
import { SuggestionQueue } from "./sop-uplift/SuggestionQueue";
import { SwimlanePreview } from "./sop-uplift/SwimlanePreview";

const API_BASE = "/api/sop-uplift/cases";

const uploadBuckets = [
  { key: "sops", label: "SOPs", icon: FileText, accent: "#005EB8" },
  { key: "procedures", label: "Policies & Procedures", icon: FileText, accent: "#1E49E2" },
  { key: "risk_control_matrices", label: "Risk / Control Matrices", icon: ShieldCheck, accent: "#009A44" },
  { key: "risk_registers", label: "Risk Registers", icon: AlertTriangle, accent: "#EAAA00" },
  { key: "control_inventories", label: "Control Inventories", icon: Database, accent: "#7213EA" },
  { key: "evidence", label: "Evidence", icon: FileCheck2, accent: "#00B8F5" },
  { key: "diagrams", label: "Diagrams", icon: Workflow, accent: "#00B8F5" },
  { key: "audit_reports", label: "Audit Reports / Issues", icon: FileSpreadsheet, accent: "#E5001B" },
];

const documentTagOptions = [
  "sop",
  "policy",
  "risk_control_matrix",
  "risk_register",
  "control_inventory",
  "evidence",
  "process_diagram",
  "audit_report",
  "supporting_material",
];

const workflowSteps = [
  { key: "upload", label: "Case setup & upload", helper: "Upload & Tag Documents" },
  { key: "review", label: "Review Suggestions", helper: "Review uplift" },
  { key: "outputs", label: "Generate Outputs", helper: "Download artifacts" },
] as const;

type WorkflowKey = (typeof workflowSteps)[number]["key"];

type SopCase = {
  case_id: string;
  title: string;
  process_name: string;
  domain_label?: string;
  notes?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  uploaded_files?: UploadedFile[];
  document_tags?: DocumentTag[];
  suggestions?: Suggestion[];
  outputs?: SopOutput[];
  case_chat?: ChatMessage[];
  diagram_model?: DiagramModel;
  processing_state?: Record<string, unknown>;
};

type Readiness = {
  status: string;
  message: string;
  missing_recommended_inputs: string[];
  can_analyze: boolean;
};

type UploadedFile = {
  file_id: string;
  filename: string;
  bucket: string;
  content_type?: string;
  conversion?: { status?: string; converter?: string; warnings?: string[] };
};

type DocumentTag = {
  file_id: string;
  filename?: string;
  suggested_tag?: string;
  confirmed_tag: string;
  confidence: "high" | "medium" | "low";
};

type ChatMessage = {
  message_id?: string;
  role: "agent" | "user";
  content: string;
  context_snapshot?: Record<string, unknown>;
  linked_suggestion_ids?: string[];
  captured_context?: { type?: string; value?: string; confidence?: string } | null;
};

type Suggestion = {
  suggestion_id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  anchor_id?: string;
  type?: string;
  original_text?: string;
  rationale?: string;
  impact?: string;
  suggested_text?: string;
  user_text?: string;
  style_match_notes?: string;
  created_from?: string;
  source_references?: unknown[];
};

type WorkbookSheet = {
  name: string;
  rows: string[][];
};

type SopOutput = {
  output_id: string;
  type: string;
  filename: string;
  status: string;
};

type PipelineProgress = {
  status?: string;
  phase?: string;
  message?: string;
  total?: number;
  completed?: number;
  pending?: number;
  failed?: number;
  percent?: number;
  error?: string;
  warnings?: string[];
};

type CaseIndexStats = {
  entries?: number;
  chunks?: number;
  anchors?: number;
  chat_messages?: number;
  suggestions?: number;
};

type CaseIndexResult = {
  entry_id: string;
  source_type: string;
  source_id: string;
  text: string;
};

type FollowUpQuestion = {
  question_id: string;
  question: string;
  priority?: string;
  why_it_matters?: string;
};

type PreviewHighlight = {
  anchor_id: string;
  document_id?: string;
  file_id?: string;
  section_path?: string[];
  block_type?: string;
  text: string;
  suggestions: Suggestion[];
};

type MarkdownDocument = {
  document_id: string;
  file_id: string;
  filename: string;
  markdown: string;
  conversion?: { status?: string; converter?: string; warnings?: string[] };
};

type PreviewModel = {
  documents?: MarkdownDocument[];
  highlights: PreviewHighlight[];
};

type DiagramModel = {
  lanes?: { lane_id: string; name: string; order: number }[];
  nodes?: { node_id: string; lane_id: string; type: string; shape?: string; label: string; column?: number; badge?: string }[];
  edges?: { edge_id: string; from_node_id: string; to_node_id: string; label?: string }[];
  warnings?: string[];
};

function prettyTag(value?: string) {
  return (value || "unmapped").replace(/_/g, " ");
}

function outputLabel(type: string) {
  const labels: Record<string, string> = {
    docx: "Updated SOP (DOCX)",
    drawio: "Diagram (Draw.io)",
    mermaid: "Diagram (Mermaid)",
    diagram_png: "Diagram (PNG)",
    diagram_pdf: "Diagram (PDF)",
    svg: "Diagram (SVG)",
    vsdx: "Process Diagram (VSDX)",
    changelog_markdown: "Change Log (Markdown)",
    changelog_json: "Audit Log (JSON)",
  };
  return labels[type] ?? prettyTag(type);
}

function severityClass(severity?: string) {
  if (severity === "high" || severity === "critical") return "border-[#F5B5B5] bg-[#FFF5F5] text-[#B00020]";
  if (severity === "medium") return "border-[#F5D58A] bg-[#FFF8E1] text-[#7A4D00]";
  return "border-[#B7D9FF] bg-[#F4FAFF] text-[#00338D]";
}

function statusTone(status?: string) {
  if (status === "accepted") return "text-[#009A44]";
  if (status === "rejected") return "text-[#E5001B]";
  if (status === "edited") return "text-[#1E49E2]";
  return "text-[#0C233C]";
}

function originLabelForSuggestion(suggestion?: Suggestion) {
  if (!suggestion) return "";
  const origin = suggestion.created_from;
  if (origin === "llm") return "AI";
  if (origin === "rule_fallback") return "Rule fallback";
  if (origin === "user" || origin === "case_chat") return "User";
  if (origin === "analysis") return "Legacy";
  return origin ? prettyTag(origin) : "";
}

const RULE_FALLBACK_RERUN_MESSAGE = "Suggestions were generated without AI. Rerun this analysis.";

function hasRuleFallbackSuggestions(suggestions?: Suggestion[]) {
  return (suggestions ?? []).some((suggestion) => suggestion.created_from === "rule_fallback");
}

function caseNeedsAiRerun(item?: Pick<SopCase, "suggestions">) {
  return hasRuleFallbackSuggestions(item?.suggestions);
}

function fileExtension(filename?: string) {
  return (filename || "").split(".").pop()?.toLowerCase() || "";
}

function isDocxFile(filename?: string) {
  return fileExtension(filename) === "docx";
}

function isSpreadsheetFile(filename?: string) {
  return ["xlsx", "xlsm", "xltx", "xltm", "xls"].includes(fileExtension(filename));
}

function columnLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function cleanSuggestionText(suggestion?: Suggestion) {
  const text = suggestion?.user_text || suggestion?.suggested_text || "";
  return text.replace(/\s*Source text:\s*[\s\S]*$/i, "").trim();
}

function suggestionReason(suggestion?: Suggestion) {
  return normalizeInlineText(suggestion?.rationale || suggestion?.impact || suggestion?.summary || "");
}

function suggestionWhyRecommended(suggestion?: Suggestion) {
  const summary = normalizeInlineText(suggestion?.summary || "");
  const impact = normalizeInlineText(suggestion?.impact || "");
  if (impact && impact !== summary) return impact;
  return summary;
}

function normalizeInlineText(value: unknown) {
  return String(value || "").split(/\s+/).filter(Boolean).join(" ");
}

function formatSectionPath(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => normalizeInlineText(item)).filter(Boolean).join(" > ");
  return normalizeInlineText(value);
}

function cleanSourceExcerpt(value: unknown) {
  const text = normalizeInlineText(String(value || "").replace(/&amp;/g, "&"));
  if (!text) return "";
  if (text.includes("| ---") || (text.match(/\|/g) || []).length >= 4) return "";
  return text.slice(0, 80);
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

function sourceLabel(reference: unknown, fallbackFile?: string) {
  if (typeof reference === "string") return reference.replace(/[{}"]/g, "");
  if (!reference || typeof reference !== "object") return fallbackFile || "Case context";
  const data = reference as Record<string, unknown>;
  const sectionPath = formatSectionPath(data.section_path);
  const section = sectionPath ? ` / ${sectionPath}` : "";
  const sheet = typeof data.sheet === "string" ? ` / ${data.sheet}` : "";
  const cell = typeof data.cell === "string" ? `!${data.cell}` : "";
  const cleanExcerpt = cleanSourceExcerpt(data.excerpt);
  const excerpt = cleanExcerpt ? ` / ${cleanExcerpt}` : "";
  const doc = typeof data.filename === "string" ? data.filename : typeof data.document_id === "string" ? "Supporting document" : fallbackFile || "Case context";
  return `${doc}${sheet}${cell}${section}${excerpt}`;
}

function sourceLabelsForSuggestion(suggestion: Suggestion, fallbackFile?: string) {
  const labels = (suggestion.source_references || []).map((reference) => sourceLabel(reference, fallbackFile));
  return Array.from(new Set(labels.filter(Boolean))).slice(0, 3);
}

function suggestionMatchesSelectedDocument(
  suggestion: Suggestion,
  selectedAnchorIds: Set<string>,
  document?: MarkdownDocument,
  file?: UploadedFile,
) {
  if (!document && !file) return true;
  if (suggestion.anchor_id && selectedAnchorIds.has(suggestion.anchor_id)) return true;
  const references = suggestion.source_references || [];
  const hasMatchingReference = references.some((reference) => {
    if (!reference || typeof reference !== "object") return false;
    const data = reference as Record<string, unknown>;
    return (
      (document?.document_id && data.document_id === document.document_id) ||
      (document?.file_id && data.file_id === document.file_id) ||
      (file?.file_id && data.file_id === file.file_id) ||
      (file?.filename && data.filename === file.filename)
    );
  });
  if (hasMatchingReference) return true;
  return !suggestion.anchor_id && references.length === 0;
}

type DocxHighlightMatch = {
  term: string;
  suggestion?: Suggestion;
};

function removeDocxHoverTooltip() {
  document.getElementById("trace-docx-hover-tooltip")?.remove();
}

function showDocxHoverTooltip(event: MouseEvent, suggestion: Suggestion) {
  removeDocxHoverTooltip();
  const tooltip = document.createElement("div");
  tooltip.id = "trace-docx-hover-tooltip";
  tooltip.className = "trace-docx-floating-tooltip";
  const title = document.createElement("strong");
  title.textContent = suggestion.title;
  const summary = document.createElement("span");
  summary.textContent = suggestion.summary;
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

function emptyReadiness(): Readiness {
  return {
    status: "not_ready",
    message: "Upload and convert at least one SOP or procedure before analysis.",
    missing_recommended_inputs: ["risk_control_matrix", "risk_register", "control_inventory", "process_diagram"],
    can_analyze: false,
  };
}

const lightFieldClass = "border-[#C8D8F0] bg-white text-[#0C233C] placeholder:text-slate-400 focus-visible:ring-[#00B8F5]";

function looksCorruptPreviewText(text?: string) {
  const sample = (text || "").slice(0, 1200);
  const replacementCount = (sample.match(/\uFFFD|�/g) || []).length;
  return sample.startsWith("PK") || sample.includes("word/styles.xml") || replacementCount > 10;
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

function OfficeDocumentSurface({
  caseId,
  file,
  markdownDocument,
  highlights,
  suggestions,
  fullscreen = false,
  onSelectSuggestion,
}: {
  caseId: string;
  file?: UploadedFile;
  markdownDocument?: MarkdownDocument;
  highlights: PreviewHighlight[];
  suggestions: Suggestion[];
  fullscreen?: boolean;
  onSelectSuggestion?: (suggestionId: string) => void;
}) {
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<WorkbookSheet[]>([]);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | null>(null);
  const [activeSheetName, setActiveSheetName] = useState("");
  const [zoom, setZoom] = useState(100);
  const filename = file?.filename || "";
  const isDocx = isDocxFile(filename);
  const isSheet = isSpreadsheetFile(filename);
  const activeSheet = sheets.find((sheet) => sheet.name === activeSheetName) || sheets[0];
  const matchTerms = useMemo(() => {
    return [...highlights.map((item) => item.text), ...suggestions.map((item) => item.original_text || item.summary || item.title)]
      .map((value) => normalizeInlineText(value).toLowerCase().slice(0, 90))
      .filter((value) => value.length > 16);
  }, [highlights, suggestions]);
  const docxHighlightMatches = useMemo(() => {
    const suggestionsByAnchor = new Map(suggestions.map((suggestion) => [suggestion.anchor_id, suggestion]));
    return [
      ...highlights.map((highlight) => ({
        term: highlight.text,
        suggestion: suggestionsByAnchor.get(highlight.anchor_id) || highlight.suggestions?.[0],
      })),
      ...suggestions.map((suggestion) => ({
        term: suggestion.original_text || suggestion.summary || suggestion.title,
        suggestion,
      })),
    ].filter((match) => normalizeInlineText(match.term).length > 18);
  }, [highlights, suggestions]);

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

    fetch(`${API_BASE}/${caseId}/files/${file.file_id}/content`)
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
            const nextSheets = workbook.SheetNames.map((name) => {
              const rows = readWorksheetRows(workbook.Sheets[name]);
              return { name, rows };
            });
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
  const activeSheetRowCount = activeSheet?.rows.length ?? 0;
  const cellHasComment = (value: string) => {
    const clean = normalizeInlineText(value).toLowerCase();
    if (!clean || clean.length < 4) return false;
    return matchTerms.some((term) => clean.includes(term) || term.includes(clean.slice(0, 40)));
  };

  if (!file) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] text-center">
        <div>
          <FileText className="mx-auto h-8 w-8 text-[#8AA2C0]" />
          <p className="mt-3 text-sm font-semibold text-[#0C233C]">Select a document</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#D8E0ED] bg-[#F7FAFE]">
      <div className="flex items-center justify-between gap-3 border-b border-[#D8E0ED] bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isSheet ? <FileSpreadsheet className="h-4 w-4 text-[#009A44]" /> : <FileText className="h-4 w-4 text-[#005EB8]" />}
          <span className="truncate text-xs font-semibold text-[#0C233C]">{filename}</span>
          <Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">{fileExtension(filename).toUpperCase()}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" title="Search document"><Search className="h-3.5 w-3.5" /></Button>
          <select className={`h-8 rounded-md border px-2 text-xs ${lightFieldClass}`} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {[75, 90, 100, 125, 150].map((value) => <option key={value} value={value}>{value}%</option>)}
          </select>
        </div>
      </div>
      {isSheet && sheets.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-[#D8E0ED] bg-white px-3 py-2">
          <div className="flex min-w-0 gap-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                className={`rounded-t px-3 py-1.5 text-xs font-semibold ${sheet.name === activeSheet?.name ? "border border-b-white border-[#D8E0ED] bg-white text-[#00338D]" : "bg-[#EEF3FA] text-slate-600 hover:bg-[#E8F8FD]"}`}
                onClick={() => setActiveSheetName(sheet.name)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="shrink-0 bg-white text-[11px] text-slate-600">
            {activeSheetRowCount} rows x {maxColumns} columns
          </Badge>
        </div>
      )}
      <div className={`${fullscreen ? "h-[calc(100vh-190px)]" : "h-[520px]"} overflow-auto bg-[#EEF3FA] p-5`}>
        {loading && <div className="grid h-full place-items-center text-sm text-slate-500">Loading uploaded document...</div>}
        {error && <div className="rounded-md border border-[#F5D58A] bg-[#FFF8E1] p-4 text-sm text-[#7A4D00]">{error}</div>}
        {!loading && !error && isDocx && (
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
            <div ref={docxContainerRef} className="mx-auto max-w-[900px] bg-white shadow-sm [&_.docx]:mx-auto" />
          </div>
        )}
        {!loading && !error && isSheet && activeSheet && (
          <div className="inline-block min-w-full rounded-md border border-[#C8D8F0] bg-white shadow-sm" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}>
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-10 border border-[#D8E0ED] bg-[#F4F7FB]" />
                  {Array.from({ length: maxColumns }).map((_, index) => (
                    <th key={index} className="sticky top-0 z-10 min-w-32 border border-[#D8E0ED] bg-[#F4F7FB] px-2 py-1 text-center font-semibold text-slate-500">{columnLabel(index)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSheet.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th className="sticky left-0 z-10 border border-[#D8E0ED] bg-[#F4F7FB] px-2 py-1 text-right font-semibold text-slate-500">{rowIndex + 1}</th>
                    {Array.from({ length: maxColumns }).map((_, cellIndex) => {
                      const value = row[cellIndex] || "";
                      const matched = cellHasComment(value);
                      return (
                        <td key={cellIndex} className={`max-w-72 whitespace-pre-wrap border border-[#D8E0ED] px-2 py-1 align-top text-[#0C233C] ${matched ? "bg-[#FFF8E1] ring-1 ring-[#EAAA00]" : "bg-white"}`}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && !isDocx && !isSheet && (
          <div className="rounded-md border border-[#D8E0ED] bg-white p-8 text-sm text-slate-600">Native preview is available for DOCX and XLSX files. Use extracted review text for this file type.</div>
        )}
      </div>
    </div>
  );
}

type NativeDocumentViewerProps = {
  caseId: string;
  file?: UploadedFile;
  markdownDocument?: MarkdownDocument;
  highlights: PreviewHighlight[];
  suggestions: Suggestion[];
  hasCorruptText: boolean;
  canAnalyze: boolean;
  onAnalyzeSection: (anchorId: string) => void;
  onRepairPreview: () => void;
};

function NativeDocumentViewer({
  caseId,
  file,
  markdownDocument,
  highlights,
  suggestions,
  hasCorruptText,
  canAnalyze,
  onAnalyzeSection,
  onRepairPreview,
}: NativeDocumentViewerProps) {
  const filename = file?.filename || markdownDocument?.filename || "Document";
  const conversionWarnings = file?.conversion?.warnings ?? markdownDocument?.conversion?.warnings ?? [];
  const conversionFailed = file?.conversion?.status === "failed" || markdownDocument?.conversion?.status === "failed";
  const openSuggestions = suggestions.filter((item) => item.status === "open");
  const suggestionByAnchor = new Map(openSuggestions.map((suggestion) => [suggestion.anchor_id, suggestion]));
  const colorForSuggestion = (suggestion?: Suggestion) => {
    if (!suggestion) return "border-transparent bg-white";
    if (suggestion.severity === "high" || suggestion.severity === "critical" || suggestion.type === "missing_control") return "border-[#F5B5B5] bg-[#FFF5F5]";
    if (suggestion.type === "evidence_gap" || suggestion.type === "frequency_gap") return "border-[#F5D58A] bg-[#FFF8E1]";
    if (suggestion.status === "accepted") return "border-[#A9DCB8] bg-[#EAF7EF]";
    return "border-[#B7D9FF] bg-[#E8F8FD]";
  };

  return (
    <section className="max-h-[620px] overflow-y-auto bg-[#F7FAFE] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#D8E0ED] bg-white px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Uploaded document preview</p>
            <h2 className="text-base font-semibold text-[#0C233C]">{filename}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">{openSuggestions.length} comments</Badge>
            <Button variant="outline" className="h-8 text-xs" onClick={onRepairPreview}>Repair preview</Button>
          </div>
        </div>

        {(hasCorruptText || conversionFailed || conversionWarnings.length > 0) && (
          <div className="mb-3 rounded-md border border-[#F5D58A] bg-[#FFF8E1] p-4 text-sm text-[#7A4D00]">
            <p className="font-semibold">Text extraction needs attention.</p>
            <p className="mt-1 text-xs leading-5">TRACE is showing extracted review text only and excluding corrupt Office package text from the review body.</p>
            {conversionWarnings.slice(0, 3).map((warning) => <p key={warning} className="mt-1 text-xs leading-5">{warning}</p>)}
          </div>
        )}

        <OfficeDocumentSurface caseId={caseId} file={file} markdownDocument={markdownDocument} highlights={highlights} suggestions={suggestions} />

        <article className="mt-3 min-h-[220px] rounded-md border border-[#D8E0ED] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Extracted analysis markers</p>
            <Badge variant="outline">{highlights.length} sections</Badge>
          </div>
          {highlights.length === 0 ? (
            <div className="grid min-h-[160px] place-items-center text-center">
              <div className="max-w-md rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-6">
                <FileText className="mx-auto h-8 w-8 text-[#8AA2C0]" />
                <p className="mt-3 text-sm font-semibold text-[#0C233C]">No review text yet</p>
                <p className="mt-1 text-xs text-slate-500">Run conversion or repair preview to build clean extracted text.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {highlights.map((highlight, index) => {
                const suggestion = suggestionByAnchor.get(highlight.anchor_id) || highlight.suggestions?.[0];
                const heading = formatSectionPath(highlight.section_path) || `${index + 1}. Document section`;
                return (
                  <section key={highlight.anchor_id || index} id={`anchor-${highlight.anchor_id}`} className="group relative">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{heading}</h3>
                    <div className={`rounded border-l-4 px-3 py-2 text-sm leading-7 text-[#0C233C] ${colorForSuggestion(suggestion)}`}>
                      <MarkdownBlock>{highlight.text}</MarkdownBlock>
                    </div>
                    {suggestion && (
                      <div className="pointer-events-none absolute left-8 top-full z-20 mt-2 hidden w-80 rounded-md border border-[#D8E0ED] bg-white p-3 text-xs shadow-lg group-hover:block">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0C233C]">{suggestion.title}</span>
                          <Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">{prettyTag(suggestion.type)}</Badge>
                        </div>
                        <p className="leading-5 text-slate-600">{suggestion.summary}</p>
                        {cleanSuggestionText(suggestion) && <p className="mt-2 border-t border-[#E6ECF5] pt-2 leading-5 text-[#0C233C]">{cleanSuggestionText(suggestion)}</p>}
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="mt-2 h-7 text-[11px] opacity-0 transition-opacity group-hover:opacity-100" onClick={() => onAnalyzeSection(highlight.anchor_id)} disabled={!canAnalyze}>Analyze this section</Button>
                  </section>
                );
              })}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

export default function SopUpliftPage() {
  const [cases, setCases] = useState<SopCase[]>([]);
  const [activeStep, setActiveStep] = useState<WorkflowKey>("upload");
  const [caseId, setCaseId] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [processName, setProcessName] = useState("");
  const [caseDomain, setCaseDomain] = useState("");
  const [caseNotes, setCaseNotes] = useState("");
  const [readiness, setReadiness] = useState<Readiness>(emptyReadiness);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [documentTags, setDocumentTags] = useState<DocumentTag[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [outputs, setOutputs] = useState<SopOutput[]>([]);
  const [previewModel, setPreviewModel] = useState<PreviewModel>({ highlights: [] });
  const [diagramModel, setDiagramModel] = useState<DiagramModel>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editableStages, setEditableStages] = useState<Record<WorkflowKey, boolean>>({
    upload: true,
    review: true,
    outputs: true,
  });
  const [selectedUploadBucket, setSelectedUploadBucket] = useState(uploadBuckets[0].key);
  const [uploadContext, setUploadContext] = useState("");
  const [uploadStatus, setUploadStatus] = useState<Record<string, "success" | "error" | "uploading">>({});
  const [useLlm, setUseLlm] = useState(true);
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>({});
  const [analysisPending, setAnalysisPending] = useState(0);
  const [agentFollowUpQuestions, setAgentFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [caseIndexStats, setCaseIndexStats] = useState<CaseIndexStats>({});
  const [caseIndexResults, setCaseIndexResults] = useState<CaseIndexResult[]>([]);
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [hubCaseSearch, setHubCaseSearch] = useState("");
  const [selectedReviewFileId, setSelectedReviewFileId] = useState("");
  const [expandedReviewBuckets, setExpandedReviewBuckets] = useState<Record<string, boolean>>({ sops: true });
  const [casePendingDelete, setCasePendingDelete] = useState<SopCase | null>(null);
  const [extractionDialogOpen, setExtractionDialogOpen] = useState(false);
  const [extractionTaskId, setExtractionTaskId] = useState("");
  const [reviewProceedDialogOpen, setReviewProceedDialogOpen] = useState(false);
  const [documentViewOpen, setDocumentViewOpen] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState("");
  const [busy, setBusy] = useState("");

  const previewHighlights = previewModel.highlights ?? [];
  const reviewDocuments = previewModel.documents ?? [];
  const selectedReviewFile = uploadedFiles.find((file) => file.file_id === selectedReviewFileId) ?? uploadedFiles[0];
  const selectedReviewDocument = reviewDocuments.find((document) => document.file_id === (selectedReviewFile?.file_id || selectedReviewFileId)) ?? reviewDocuments[0];
  const selectedReviewHighlights = selectedReviewDocument
    ? previewHighlights.filter((highlight) => highlight.file_id === selectedReviewDocument.file_id || highlight.document_id === selectedReviewDocument.document_id)
    : previewHighlights;
  const selectedReviewHasCorruptText = selectedReviewHighlights.some((highlight) => looksCorruptPreviewText(highlight.text)) || looksCorruptPreviewText(selectedReviewDocument?.markdown);
  const selectedReviewAnchorIds = new Set(selectedReviewHighlights.map((highlight) => highlight.anchor_id));
  const selectedReviewSuggestions = selectedReviewFile || selectedReviewDocument
    ? suggestions.filter((suggestion) => suggestionMatchesSelectedDocument(suggestion, selectedReviewAnchorIds, selectedReviewDocument, selectedReviewFile))
    : suggestions;
  const selectedSuggestion = selectedReviewSuggestions.find((item) => item.suggestion_id === selectedSuggestionId) || selectedReviewSuggestions[0];
  const selectedReviewHasRuleFallback = selectedReviewSuggestions.some((item) => item.created_from === "rule_fallback");
  const caseHasRuleFallback = hasRuleFallbackSuggestions(suggestions);
  const activeChatContext = useMemo(() => ({
    case_id: caseId,
    workflow_step: activeStep,
    case_title: caseTitle,
    process_name: processName,
    readiness_status: readiness.status,
    document_file_id: selectedReviewFile?.file_id || "",
    document_filename: selectedReviewFile?.filename || selectedReviewDocument?.filename || "",
    suggestion_id: selectedReviewSuggestions[0]?.suggestion_id || "",
    suggestion_title: selectedReviewSuggestions[0]?.title || "",
    open_suggestion_count: selectedReviewSuggestions.filter((item) => item.status === "open").length,
  }), [activeStep, caseId, caseTitle, processName, readiness.status, selectedReviewDocument?.filename, selectedReviewFile?.file_id, selectedReviewFile?.filename, selectedReviewSuggestions]);
  const suggestionCounts = useMemo(() => ({
    total: suggestions.length,
    accepted: suggestions.filter((item) => item.status === "accepted").length,
    edited: suggestions.filter((item) => item.status === "edited").length,
    rejected: suggestions.filter((item) => item.status === "rejected").length,
    open: suggestions.filter((item) => item.status === "open").length,
  }), [suggestions]);
  const hubStats = useMemo(() => {
    const readyStatuses = new Set(["review_ready", "full_ready", "ready_with_warnings", "outputs_ready"]);
    const draftStatuses = new Set(["draft", "tagging", "minimum_ready", "not_ready"]);
    return {
      active: cases.length,
      ready: cases.filter((item) => readyStatuses.has(item.status ?? "") || (item.suggestions?.length ?? 0) > 0).length,
      draft: cases.filter((item) => draftStatuses.has(item.status ?? "draft")).length,
      outputs: cases.reduce((total, item) => total + (item.outputs?.length ?? 0), 0),
      chatInputs: cases.reduce((total, item) => total + (item.case_chat?.length ?? 0), 0),
    };
  }, [cases]);
  const filteredHubCases = useMemo(() => {
    const query = hubCaseSearch.trim().toLowerCase();
    if (!query) return cases;
    return cases.filter((item) => [
      item.title,
      item.process_name,
      item.domain_label,
      item.status,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [cases, hubCaseSearch]);

  const uploadStageComplete = useMemo(() => {
    return uploadedFiles.some((file) => {
      const isSopMaterial = ["sops", "procedures"].includes(file.bucket);
      const tag = documentTags.find((item) => item.file_id === file.file_id);
      const tagged = tag && ["sop", "policy"].includes(tag.confirmed_tag);
      return isSopMaterial && tagged;
    });
  }, [documentTags, uploadedFiles]);

  const extractionComplete = suggestions.length > 0 || pipelineProgress.status === "complete";
  const reviewStageComplete = suggestions.length > 0 && suggestions.every((item) => item.status !== "open");
  const outputsStageComplete = outputs.some((item) => item.status === "generated");

  const stageComplete: Record<WorkflowKey, boolean> = {
    upload: uploadStageComplete,
    review: reviewStageComplete,
    outputs: outputsStageComplete,
  };

  const canOpenStep = (step: WorkflowKey) => {
    const targetIndex = workflowSteps.findIndex((item) => item.key === step);
    const activeIndex = workflowSteps.findIndex((item) => item.key === activeStep);
    if (targetIndex <= activeIndex) return true;
    if (step === "review") return uploadStageComplete && extractionComplete;
    if (step === "outputs") return extractionComplete;
    return workflowSteps.slice(0, targetIndex).every((item) => stageComplete[item.key]);
  };

  const goToStep = (step: WorkflowKey) => {
    if (step === "outputs" && extractionComplete && suggestionCounts.open > 0 && activeStep !== "outputs") {
      setReviewProceedDialogOpen(true);
      return;
    }
    if (canOpenStep(step)) {
      setActiveStep(step);
      setEditableStages((current) => ({ ...current, [step]: !stageComplete[step] }));
    }
  };

  const isStageReadOnly = (step: WorkflowKey) => stageComplete[step] && !editableStages[step];

  const flowNodes = useMemo<Node[]>(() => {
    const lanes = diagramModel.lanes?.length
      ? [...diagramModel.lanes].sort((a, b) => a.order - b.order)
      : [
        { lane_id: "business_owner", name: "Business Owner", order: 1 },
        { lane_id: "operations_risk", name: "Operations Risk", order: 2 },
        { lane_id: "compliance", name: "Compliance", order: 3 },
        { lane_id: "control_testing", name: "Control Testing", order: 4 },
      ];
    const laneNodes = lanes.map((lane, index) => ({
      id: `lane-${lane.lane_id}`,
      type: "default",
      position: { x: 0, y: index * 82 },
      data: { label: lane.name },
      draggable: false,
      style: { width: 145, height: 46, background: "#00338D", color: "white", border: 0, borderRadius: 2, fontWeight: 700, fontSize: 11 },
    }));
    const stepNodes = (diagramModel.nodes ?? []).map((node, index) => {
      const laneIndex = Math.max(0, lanes.findIndex((lane) => lane.lane_id === node.lane_id));
      const stepIndex = typeof node.column === "number" ? node.column : (diagramModel.nodes ?? []).filter((candidate, candidateIndex) => candidateIndex < index && candidate.lane_id === node.lane_id).length;
      const shape = node.shape ?? (node.type === "decision" || /approve|risk|\?/i.test(node.label) ? "decision" : "process");
      const isDecision = shape === "decision";
      const isStartEnd = shape === "start_end";
      const isDataStore = shape === "data_store";
      const borderColor = node.type === "risk" ? "#C00000" : node.type === "evidence" ? "#EAAA00" : node.type === "control" ? "#00338D" : isDecision ? "#EAAA00" : "#005EB8";
      const badgeColor = node.badge?.startsWith("R") ? "#C00000" : node.badge?.startsWith("E") ? "#EAAA00" : "#00338D";
      return {
        id: node.node_id,
        position: { x: 190 + stepIndex * 170, y: laneIndex * 82 + 4 },
        data: {
          label: (
            <div className="flex items-center justify-center gap-1 text-center">
              {node.badge ? <span className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: badgeColor }}>{node.badge}</span> : null}
              <span>{node.label}</span>
            </div>
          ),
        },
        style: {
          width: isDecision ? 118 : isStartEnd ? 126 : 148,
          minHeight: 42,
          borderColor,
          color: "#00338D",
          background: isDecision ? "#FFF8E1" : isDataStore ? "#EFF8FC" : "#FFFFFF",
          borderRadius: isStartEnd || isDataStore ? 999 : 2,
          clipPath: isDecision ? "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" : undefined,
          fontSize: 11,
        },
      };
    });
    return [...laneNodes, ...stepNodes];
  }, [diagramModel]);

  const flowEdges = useMemo<Edge[]>(() => {
    return (diagramModel.edges ?? []).map((edge) => ({
      id: edge.edge_id,
      source: edge.from_node_id,
      target: edge.to_node_id,
      label: edge.label,
      animated: true,
      style: { stroke: "#00338D" },
    }));
  }, [diagramModel]);

  const refreshCases = async () => {
    const response = await fetch(API_BASE);
    if (response.ok) {
      const data = await response.json();
      setCases(data.cases ?? []);
    }
  };

  const refreshCaseDetails = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}`);
    if (response.ok) {
      const data = await response.json();
      hydrateCase(data);
    }
  };

  const hydrateCase = (data: SopCase) => {
    setCaseId(data.case_id);
    setCaseTitle(data.title ?? "");
    setProcessName(data.process_name ?? "");
    setCaseDomain(data.domain_label ?? "");
    setCaseNotes(data.notes ?? "");
    setUploadedFiles(data.uploaded_files ?? []);
    setDocumentTags(data.document_tags ?? []);
    setMessages(data.case_chat ?? []);
    setSuggestions(data.suggestions ?? []);
    setOutputs(data.outputs ?? []);
    setDiagramModel(data.diagram_model ?? {});
    setPipelineProgress((data.processing_state?.pipeline as PipelineProgress) ?? {});
    setPipelineWarnings((data.processing_state?.pipeline as PipelineProgress)?.warnings ?? []);
  };

  const selectCase = async (selected: SopCase) => {
    await refreshCaseDetails(selected.case_id);
    await refreshReadiness(selected.case_id);
    await refreshPreview(selected.case_id);
    await refreshCaseIndex(selected.case_id);
    setActiveStep("upload");
    setEditableStages({ upload: false, review: false, outputs: false });
  };

  const deleteCase = async (targetCase: SopCase) => {
    setCasePendingDelete(targetCase);
  };

  const confirmDeleteCase = async () => {
    const targetCase = casePendingDelete;
    if (!targetCase) return;
    setBusy(`delete-case-${targetCase.case_id}`);
    try {
      const response = await fetch(`${API_BASE}/${targetCase.case_id}`, { method: "DELETE" });
      if (response.ok) {
        if (caseId === targetCase.case_id) clearSelectedCase();
        setCasePendingDelete(null);
        await refreshCases();
      }
    } finally {
      setBusy("");
    }
  };

  const clearSelectedCase = () => {
    setCaseId("");
    setCaseTitle("");
    setProcessName("");
    setCaseDomain("");
    setCaseNotes("");
    setUploadedFiles([]);
    setDocumentTags([]);
    setMessages([]);
    setSuggestions([]);
    setOutputs([]);
    setPreviewModel({ highlights: [] });
    setDiagramModel({});
    setPipelineWarnings([]);
    setSelectedReviewFileId("");
    setExpandedReviewBuckets({ sops: true });
    setReadiness(emptyReadiness());
    setActiveStep("upload");
    setEditableStages({ upload: true, review: true, outputs: true });
  };

  const createCase = async () => {
    if (!caseTitle.trim() || !processName.trim()) return;
    setBusy("case");
    try {
      const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: caseTitle, process_name: processName, domain_label: caseDomain, notes: caseNotes }),
      });
      if (response.ok) {
        const data = await response.json();
        hydrateCase(data);
        setEditableStages({ upload: true, review: true, outputs: true });
        await refreshCases();
      }
    } finally {
      setBusy("");
    }
  };

  const saveCaseDetails = async () => {
    if (!caseId) return;
    setBusy("case");
    try {
      const response = await fetch(`${API_BASE}/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: caseTitle, process_name: processName, domain_label: caseDomain, notes: caseNotes }),
      });
      if (response.ok) {
        hydrateCase(await response.json());
        setEditableStages((current) => ({ ...current, upload: false }));
        await refreshCases();
      }
    } finally {
      setBusy("");
    }
  };

  const refreshReadiness = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/readiness`);
    if (response.ok) setReadiness(await response.json());
  };

  const refreshFiles = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/files`);
    if (response.ok) {
      const data = await response.json();
      setUploadedFiles(data.files ?? []);
    }
  };

  const refreshDocumentTags = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/documents/tags`);
    if (response.ok) {
      const data = await response.json();
      setDocumentTags(data.document_tags ?? []);
    }
  };

  const refreshPreview = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/preview`);
    if (response.ok) {
      const data = await response.json();
      const nextPreview = data.preview_model ?? { highlights: [] };
      setPreviewModel(nextPreview);
      setDiagramModel(data.diagram_model ?? {});
      setSuggestions(data.suggestions ?? []);
      setSelectedReviewFileId((current) => current || nextPreview.documents?.[0]?.file_id || uploadedFiles[0]?.file_id || "");
    }
  };

  const refreshCaseIndex = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/index`);
    if (response.ok) {
      const data = await response.json();
      setCaseIndexStats(data.case_index?.stats ?? {});
    }
  };

  const buildCaseIndex = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/build-index`, { method: "POST" });
    if (response.ok) {
      const data = await response.json();
      setCaseIndexStats(data.case_index?.stats ?? {});
    }
  };

  const searchCaseIndex = async () => {
    const query = caseSearchQuery.trim();
    if (!caseId || !query) {
      setCaseIndexResults([]);
      return;
    }
    const response = await fetch(`${API_BASE}/${caseId}/index/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5 }),
    });
    if (response.ok) {
      const data = await response.json();
      setCaseIndexResults(data.results ?? []);
    }
  };

  const convertDocuments = async (id = caseId) => {
    if (!id) return;
    await fetch(`${API_BASE}/${id}/convert`, { method: "POST" });
  };

  const repairPreview = async (id = caseId) => {
    if (!id) return;
    setBusy("repair-preview");
    try {
      await convertDocuments(id);
      await tagDocuments(id);
      await buildCaseIndex(id);
      await refreshFiles(id);
      await refreshDocumentTags(id);
      await refreshReadiness(id);
      await refreshPreview(id);
    } finally {
      setBusy("");
    }
  };

  const tagDocuments = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/tag-documents`, { method: "POST" });
    if (response.ok) {
      const data = await response.json();
      setDocumentTags(data.document_tags ?? []);
    }
  };

  const uploadFile = async (bucket: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).slice(0, 5);
    event.currentTarget.value = "";
    if (!caseId || files.length === 0 || isStageReadOnly("upload")) return;
    setBusy(`upload-${bucket}`);
    setUploadStatus((current) => ({ ...current, [bucket]: "uploading" }));
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        body.append("bucket", bucket);
        body.append("user_description", uploadContext);
        const response = await fetch(`${API_BASE}/${caseId}/upload`, { method: "POST", body });
        if (!response.ok) throw new Error("Upload failed");
      }
      await tagDocuments(caseId);
      await refreshFiles(caseId);
      await refreshDocumentTags(caseId);
      await refreshReadiness(caseId);
      await refreshPreview(caseId);
      await refreshCases();
      setUploadStatus((current) => ({ ...current, [bucket]: "success" }));
    } catch {
      setUploadStatus((current) => ({ ...current, [bucket]: "error" }));
    } finally {
      setBusy("");
    }
  };

  const deleteUploadedFile = async (fileId: string) => {
    if (!caseId) return;
    setBusy(`delete-${fileId}`);
    try {
      await fetch(`${API_BASE}/${caseId}/files/${fileId}`, { method: "DELETE" });
      await refreshFiles(caseId);
      await refreshDocumentTags(caseId);
      await refreshReadiness(caseId);
      await refreshPreview(caseId);
      await buildCaseIndex(caseId);
    } finally {
      setBusy("");
    }
  };

  const updateDocumentTag = async (tag: DocumentTag, confirmedTag: string) => {
    if (!caseId) return;
    const response = await fetch(`${API_BASE}/${caseId}/documents/${tag.file_id}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggested_tag: tag.suggested_tag, confirmed_tag: confirmedTag, confidence: tag.confidence ?? "medium" }),
    });
    if (response.ok) {
      await refreshFiles(caseId);
      await refreshDocumentTags(caseId);
      await refreshReadiness(caseId);
      await refreshPreview(caseId);
      await buildCaseIndex(caseId);
    }
  };

  const continueAnalysis = async (sectionIds?: string[]) => {
    if (!caseId || !uploadStageComplete) return;
    setBusy("analysis");
    try {
      const response = await fetch(`${API_BASE}/${caseId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: sectionIds ? 1 : 5, section_ids: sectionIds ?? [], use_llm: useLlm }),
      });
      const data = await response.json();
      setSuggestions(data.suggestions ?? []);
      setAnalysisPending(data.processing_state?.analysis?.pending ?? 0);
      setPipelineProgress(data.processing_state?.analysis ?? {});
      await refreshPreview(caseId);
      await buildCaseIndex(caseId);
    } finally {
      setBusy("");
    }
  };

  const refreshAnalysisTask = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/tasks/analysis`);
    if (!response.ok) return;
    const data = await response.json();
    const state = data.processing_state ?? {};
    setPipelineProgress(state);
    setAnalysisPending(state.pending ?? 0);
    if (data.status === "done") {
      const suggestionsResponse = await fetch(`${API_BASE}/${id}/suggestions`);
      if (suggestionsResponse.ok) setSuggestions((await suggestionsResponse.json()).suggestions ?? []);
      await refreshPreview(id);
    }
  };

  const refreshPipelineTask = async (id = caseId, taskId = extractionTaskId || "pipeline") => {
    if (!id || !taskId) return;
    const response = await fetch(`${API_BASE}/${id}/tasks/${taskId}`);
    if (!response.ok) return;
    const data = await response.json();
    const state = (data.processing_state ?? {}) as PipelineProgress;
    setPipelineProgress(state);
    setPipelineWarnings(state.warnings ?? []);
    if (data.status === "done") {
      setExtractionTaskId("");
      setExtractionDialogOpen(false);
      setBusy("");
      await refreshCaseDetails(id);
      await refreshReadiness(id);
      await refreshPreview(id);
      await buildCaseIndex(id);
      setEditableStages((current) => ({ ...current, review: false }));
      setActiveStep("review");
    } else if (data.status === "failed") {
      setExtractionTaskId("");
      setBusy("");
      setExtractionDialogOpen(true);
    }
  };

  const runFullPipeline = async (options: { forceUseLlm?: boolean; openProgressDialog?: boolean; busyKey?: string } = {}) => {
    if (!caseId || !uploadStageComplete) return;
    setBusy(options.busyKey ?? "pipeline");
    if (options.openProgressDialog ?? true) setExtractionDialogOpen(true);
    try {
      setPipelineProgress({
        status: "running",
        phase: "starting",
        message: "TRACE is reviewing case files...",
        completed: 0,
        total: 100,
        percent: 1,
      });
      const response = await fetch(`${API_BASE}/${caseId}/run-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_llm: options.forceUseLlm ?? useLlm }),
      });
      const data = await response.json();
      const state = data.processing_state ?? {};
      setPipelineProgress(state);
      setPipelineWarnings(state.warnings ?? []);
      setExtractionTaskId(data.task_id ?? "pipeline");
      if (data.status === "complete" || state.status === "complete") {
        await refreshPipelineTask(caseId, data.task_id ?? "pipeline");
      }
    } catch (error) {
      setPipelineProgress({
        status: "failed",
        phase: "failed",
        message: "Extraction failed.",
        error: error instanceof Error ? error.message : "Unable to start extraction.",
        percent: 0,
      });
      setBusy("");
    }
  };

  const rerunCurrentCaseAnalysis = async () => {
    setUseLlm(true);
    await runFullPipeline({ forceUseLlm: true, busyKey: "rerun-analysis" });
  };

  const rerunSuggestions = async () => {
    setUseLlm(true);
    await runFullPipeline({ forceUseLlm: true, openProgressDialog: false, busyKey: "rerun-suggestions" });
  };

  const generateOutputs = async (options: { allowPending?: boolean } = {}) => {
    if (!caseId || !extractionComplete) return;
    if (suggestionCounts.open > 0 && !options.allowPending) {
      setReviewProceedDialogOpen(true);
      return;
    }
    setBusy("outputs");
    try {
      const response = await fetch(`${API_BASE}/${caseId}/generate-outputs`, { method: "POST" });
      const data = await response.json();
      setOutputs(data.outputs ?? []);
      setEditableStages((current) => ({ ...current, outputs: false }));
      setReviewProceedDialogOpen(false);
      setActiveStep("outputs");
    } finally {
      setBusy("");
    }
  };

  const downloadOutput = async (output: SopOutput) => {
    if (!caseId || output.status !== "generated") return;
    const response = await fetch(`${API_BASE}/${caseId}/outputs/${output.output_id}`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = output.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const decideSuggestion = async (suggestionId: string, status: "accepted" | "edited" | "rejected") => {
    if (!caseId) return;
    const response = await fetch(`${API_BASE}/${caseId}/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, user_text: status === "edited" ? editDrafts[suggestionId] : undefined }),
    });
    if (response.ok) {
      const updated = await response.json();
      setSuggestions((current) => current.map((item) => item.suggestion_id === suggestionId ? updated : item));
    }
  };

  const acceptAllOpenSuggestions = async () => {
    if (!caseId || suggestionCounts.open === 0) return;
    setBusy("bulk-accept");
    try {
      const updates = suggestions
        .filter((suggestion) => suggestion.status === "open")
        .map((suggestion) => ({ suggestion_id: suggestion.suggestion_id, status: "accepted" }));
      const response = await fetch(`${API_BASE}/${caseId}/suggestions/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions ?? suggestions);
        await refreshPreview(caseId);
      }
    } finally {
      setBusy("");
    }
  };

  const refreshFollowUpQuestions = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/follow-up-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_llm: useLlm }),
    });
    if (response.ok) {
      const data = await response.json();
      setAgentFollowUpQuestions(data.agent_follow_up_questions ?? []);
    }
  };

  const sendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    if (caseId) {
      const response = await fetch(`${API_BASE}/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content, context_snapshot: activeChatContext }),
      });
      if (response.ok) {
        const message = await response.json();
        setMessages((current) => [...current, message, ...(message.agent_message ? [message.agent_message] : [])]);
        await buildCaseIndex(caseId);
        await refreshFollowUpQuestions(caseId);
      }
    }
    setChatInput("");
  };

  const askQuickQuestion = (question: string) => {
    setChatInput(question);
    setChatOpen(true);
  };

  const convertChatToSuggestion = async (message: ChatMessage) => {
    if (!caseId || !message.message_id) return;
    const response = await fetch(`${API_BASE}/${caseId}/chat/${message.message_id}/convert-to-suggestion`, { method: "POST" });
    if (response.ok) {
      const suggestion = await response.json();
      setSuggestions((current) => [...current.filter((item) => item.suggestion_id !== suggestion.suggestion_id), suggestion]);
      await refreshPreview(caseId);
      await buildCaseIndex(caseId);
    }
  };

  useEffect(() => {
    refreshCases();
  }, []);

  useEffect(() => {
    if (!caseId || analysisPending <= 0) return;
    const interval = window.setInterval(() => refreshAnalysisTask(caseId), 2000);
    return () => window.clearInterval(interval);
  }, [caseId, analysisPending]);

  useEffect(() => {
    if (!caseId || !extractionTaskId) return;
    refreshPipelineTask(caseId, extractionTaskId);
    const interval = window.setInterval(() => refreshPipelineTask(caseId, extractionTaskId), 1500);
    return () => window.clearInterval(interval);
  }, [caseId, extractionTaskId]);

  const bucketCount = (bucket: string) => uploadedFiles.filter((file) => file.bucket === bucket).length;
  const readinessPct = Math.min(100, Math.round(pipelineProgress.percent ?? (((pipelineProgress.completed ?? 0) / Math.max(1, pipelineProgress.total ?? 1)) * 100)));

  const renderCaseDeleteDialog = () => (
    <AlertDialog open={!!casePendingDelete} onOpenChange={(open) => { if (!open) setCasePendingDelete(null); }}>
      <AlertDialogContent className="border-[#D8E0ED] bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#0C233C]">Delete SOP Uplift case?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600">
            This will remove {casePendingDelete?.title ? `"${casePendingDelete.title}"` : "this case"} with its uploaded documents, suggestions, chat history, and generated outputs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[#C8D8F0]">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#E5001B] text-white hover:bg-[#B00020]"
            onClick={(event) => {
              event.preventDefault();
              confirmDeleteCase();
            }}
            disabled={!!casePendingDelete && busy === `delete-case-${casePendingDelete.case_id}`}
          >
            Delete case
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const renderExtractionDialog = () => {
    const progressPercent = Math.max(0, Math.min(100, readinessPct || pipelineProgress.percent || 1));
    const failed = pipelineProgress.status === "failed";
    const message = pipelineProgress.message || (failed ? "Extraction failed." : "TRACE is reviewing case files...");
    return (
    <Dialog open={extractionDialogOpen}>
      <DialogContent className="sm:max-w-md border-[#D8E0ED] bg-white [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="text-[#0C233C]">Running extraction</DialogTitle>
          <DialogDescription className="text-slate-600">
            TRACE is reviewing case files....
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-md border border-[#D8E0ED] bg-[#F8FCFF] p-4">
            <span className={`grid h-10 w-10 place-items-center rounded-full ${failed ? "bg-[#FFF1F2] text-[#E5001B]" : "bg-[#E8F8FD] text-[#005EB8]"}`}>
              {failed ? <AlertTriangle className="h-5 w-5" /> : <RefreshCw className="h-5 w-5 animate-spin" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0C233C]">{message}</p>
              <p className="mt-1 text-xs text-slate-500">
                {failed ? "Review the error below and retry extraction." : `${progressPercent}% complete`}
              </p>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#E6ECF5]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-[#E5001B]" : "bg-[#005EB8]"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {failed && (
            <div className="rounded-md border border-[#F5C2C7] bg-[#FFF5F6] p-3 text-sm text-[#8A0010]">
              {pipelineProgress.error || "The extraction pipeline stopped before completion."}
            </div>
          )}
          {failed && (
            <div className="flex justify-end">
              <Button variant="outline" className="h-8 border-[#C8D8F0] text-xs" onClick={() => setExtractionDialogOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
  };

  const renderCaseHub = () => (
    <div className="flex h-full flex-col bg-[#F5F7FB] text-[#0C233C]">
      <HeroSection
        title="SOP Uplift"
        subtitle="Create, reopen, and govern SOP uplift work from one controlled case portfolio."
        icon={FilePenLine}
        actions={
          <div className="flex items-center gap-2">
            <Badge className="hidden bg-white/12 text-white hover:bg-white/12 sm:inline-flex">{hubStats.active} active cases</Badge>
            <Button variant="ghost" size="icon" onClick={refreshCases} className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white" title="Refresh cases">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />
      <TracePageBody width="wide" contentClassName="space-y-5 py-5">
        <SopUpliftHeader className="overflow-hidden rounded-md border border-[#D8E0ED] bg-white">
          <div className="grid divide-y divide-[#E6ECF5] md:grid-cols-5 md:divide-x md:divide-y-0">
            {[
              ["Active cases", hubStats.active, "#005EB8"],
              ["Ready for review", hubStats.ready, "#009A44"],
              ["Draft / setup", hubStats.draft, "#EAAA00"],
              ["Outputs generated", hubStats.outputs, "#00338D"],
              ["Chat inputs captured", hubStats.chatInputs, "#00B8F5"],
            ].map(([label, value, accent]) => (
              <div key={String(label)} className="p-4">
                <div className="mb-3 h-1 w-10 rounded-full" style={{ background: String(accent) }} />
                <p className="text-2xl font-semibold text-[#0C233C]">{value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </SopUpliftHeader>

        <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-5">
          <SopCasePanel className="overflow-hidden rounded-md border border-[#D8E0ED] bg-white">
            <div className="border-b border-[#E6ECF5] bg-[#F8FCFF] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#005EB8]">Start a case</p>
              <h2 className="mt-1 text-base font-semibold text-[#0C233C]">Create new case</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Set the case shell first, then upload SOP and supporting documents.</p>
            </div>
            <div className="space-y-3 p-5">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Case name</span>
                <Input value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} placeholder="e.g. Wealth onboarding SOP uplift" className={`mt-1 h-9 text-xs ${lightFieldClass}`} />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Process</span>
                <Input value={processName} onChange={(event) => setProcessName(event.target.value)} placeholder="Process under review" className={`mt-1 h-9 text-xs ${lightFieldClass}`} />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Framework / domain</span>
                <Input value={caseDomain} onChange={(event) => setCaseDomain(event.target.value)} placeholder="Business unit, framework, or domain" className={`mt-1 h-9 text-xs ${lightFieldClass}`} />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Notes</span>
                <Textarea value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} placeholder="Optional case context for the agent" className={`mt-1 min-h-20 text-xs ${lightFieldClass}`} />
              </label>
              <Button className="h-9 w-full bg-[#005EB8] text-xs hover:bg-[#00338D]" onClick={createCase} disabled={busy === "case" || !caseTitle.trim() || !processName.trim()}>
                Create case
              </Button>
            </div>
          </SopCasePanel>

          <section className="overflow-hidden rounded-md border border-[#D8E0ED] bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-[#E6ECF5] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#005EB8]">Case portfolio</p>
                <h2 className="mt-1 text-base font-semibold text-[#0C233C]">Existing SOP Uplift cases</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8AA2C0]" />
                  <Input value={hubCaseSearch} onChange={(event) => setHubCaseSearch(event.target.value)} placeholder="Search cases..." className={`h-8 w-64 pl-8 text-xs ${lightFieldClass}`} />
                </div>
                <Button variant="outline" className="h-8 gap-2 text-xs" onClick={refreshCases}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {filteredHubCases.length === 0 && (
                <div className="rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-8 text-center">
                  <FolderOpen className="mx-auto h-8 w-8 text-[#8AA2C0]" />
                  <p className="mt-3 text-sm font-semibold text-[#0C233C]">No SOP Uplift cases found</p>
                  <p className="mt-1 text-xs text-slate-500">Create a case or adjust the search to continue.</p>
                </div>
              )}
              {filteredHubCases.map((item) => {
                const filesCount = item.uploaded_files?.length ?? 0;
                const tagsCount = item.document_tags?.length ?? 0;
                const outputsCount = item.outputs?.length ?? 0;
                const progress = Math.min(100, (filesCount ? 25 : 0) + (tagsCount ? 25 : 0) + ((item.suggestions?.length ?? 0) ? 25 : 0) + (outputsCount ? 25 : 0));
                const status = item.status || "draft";
                return (
                  <article key={item.case_id} className="group rounded-md border border-[#D8E0ED] bg-white p-4 transition-colors hover:border-[#00B8F5] hover:bg-[#F8FCFF]">
                    <div className="flex items-start justify-between gap-4">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => selectCase(item)}>
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#0C233C]">{item.title || "Untitled SOP case"}</h3>
                          <Badge className={status.includes("ready") ? "bg-[#EAF7EF] text-[#007A3D] hover:bg-[#EAF7EF]" : "bg-[#FFF8E1] text-[#7A4D00] hover:bg-[#FFF8E1]"}>{status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{item.process_name || "Process not set"}{item.domain_label ? ` / ${item.domain_label}` : ""}</p>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" className="h-8 text-xs" onClick={() => selectCase(item)}>Open workspace</Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 border-[#F3B6B6] text-[#E5001B] hover:bg-[#FFF1F1] hover:text-[#B00020]"
                          title="Delete case"
                          onClick={() => deleteCase(item)}
                          disabled={busy === `delete-case-${item.case_id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-[repeat(3,minmax(0,1fr))_160px] items-end gap-4 text-xs">
                      <div><p className="text-slate-500">Files</p><p className="font-semibold text-[#00338D]">{filesCount}</p></div>
                      <div><p className="text-slate-500">Tags</p><p className="font-semibold text-[#00338D]">{tagsCount}</p></div>
                      <div><p className="text-slate-500">Outputs</p><p className="font-semibold text-[#00338D]">{outputsCount}</p></div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500"><span>Progress</span><span>{progress}%</span></div>
                        <div className="h-1.5 rounded-full bg-[#E6ECF5]"><div className="h-1.5 rounded-full bg-[#005EB8]" style={{ width: `${progress}%` }} /></div>
                      </div>
                    </div>
                    {caseNeedsAiRerun(item) && (
                      <div className="mt-3 flex items-center gap-2 rounded border border-[#F5D58A] bg-[#FFF8E1] px-3 py-2 text-xs text-[#7A4D00]">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{RULE_FALLBACK_RERUN_MESSAGE}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </TracePageBody>
      {renderCaseDeleteDialog()}
      {renderExtractionDialog()}
    </div>
  );

  const renderStageHeader = () => (
    <SopUpliftHeader className="rounded-md border border-[#D8E0ED] bg-white">
      <div className="flex items-center justify-between border-b border-[#E6ECF5] px-5 py-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
            <button type="button" className="text-[#005EB8]" onClick={clearSelectedCase}>Back to cases</button>
            <span>/</span>
            <span>{caseTitle || "SOP case"}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[#0C233C]">{caseTitle || "SOP Uplift"}</h1>
            <Badge className={outputsStageComplete ? "bg-[#EAF7EF] text-[#007A3D] hover:bg-[#EAF7EF]" : "bg-[#FFF8E1] text-[#7A4D00] hover:bg-[#FFF8E1]"}>{outputsStageComplete ? "Completed" : "In progress"}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-9 gap-2 bg-[#005EB8] text-xs hover:bg-[#00338D] disabled:bg-[#D8E0ED] disabled:text-slate-500"
            onClick={() => runFullPipeline()}
            disabled={extractionComplete || !readiness.can_analyze || !uploadStageComplete || busy === "pipeline"}
          >
            <Play className="h-3.5 w-3.5" />
            {extractionComplete ? "Extraction complete" : "Run Extraction"}
          </Button>
          <Button
            className="h-9 gap-2 bg-[#005EB8] text-xs hover:bg-[#00338D] disabled:bg-[#D8E0ED] disabled:text-slate-500"
            onClick={() => generateOutputs()}
            disabled={activeStep !== "review" || !extractionComplete || busy === "outputs"}
          >
            Proceed to Outputs
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 px-5 py-3">
        {workflowSteps.map((step, index) => {
          const active = activeStep === step.key;
          const complete = stageComplete[step.key];
          const locked = !canOpenStep(step.key);
          return (
            <button
              key={step.key}
              type="button"
              className={`relative flex h-12 items-center gap-3 border px-4 text-left text-xs font-semibold transition-colors ${active ? "border-[#005EB8] bg-[#005EB8] text-white" : locked ? "border-[#E6ECF5] bg-[#F7FAFE] text-slate-400" : "border-[#D8E0ED] bg-white text-[#0C233C] hover:bg-[#F7FAFE]"}`}
              onClick={() => goToStep(step.key)}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${active ? "bg-white text-[#005EB8]" : complete ? "bg-[#009A44] text-white" : "bg-[#EEF3FA] text-[#00338D]"}`}>{complete ? "✓" : index + 1}</span>
              <span><span className="block">{step.label}</span><span className="block text-[10px] font-normal opacity-80">{step.helper}</span></span>
            </button>
          );
        })}
      </div>
    </SopUpliftHeader>
  );

  const renderCaseDetails = () => (
    <SopCasePanel className="rounded-md border border-[#D8E0ED] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0C233C]">Case details</h3>
        {isStageReadOnly("upload") ? (
          <Button variant="outline" className="h-7 text-xs" onClick={() => setEditableStages((current) => ({ ...current, upload: true }))}>Edit case</Button>
        ) : (
          <Button variant="outline" className="h-7 text-xs" onClick={saveCaseDetails} disabled={!caseTitle.trim() || !processName.trim()}>Save</Button>
        )}
      </div>
      <div className="space-y-3">
        <label className="block"><span className="text-[11px] font-semibold text-slate-500">Case name</span><Input readOnly={isStageReadOnly("upload")} value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} className={`mt-1 h-8 text-xs ${lightFieldClass}`} /></label>
        <label className="block"><span className="text-[11px] font-semibold text-slate-500">Process</span><Input readOnly={isStageReadOnly("upload")} value={processName} onChange={(event) => setProcessName(event.target.value)} className={`mt-1 h-8 text-xs ${lightFieldClass}`} /></label>
        <label className="block"><span className="text-[11px] font-semibold text-slate-500">Framework / domain</span><Input readOnly={isStageReadOnly("upload")} value={caseDomain} onChange={(event) => setCaseDomain(event.target.value)} className={`mt-1 h-8 text-xs ${lightFieldClass}`} /></label>
        <label className="block"><span className="text-[11px] font-semibold text-slate-500">Notes</span><Textarea readOnly={isStageReadOnly("upload")} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} className={`mt-1 min-h-16 text-xs ${lightFieldClass}`} /></label>
      </div>
    </SopCasePanel>
  );

  const renderProgress = () => (
    <SopReadinessCard className="rounded-md border border-[#D8E0ED] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#0C233C]">Overall progress</h3>
      <div className="space-y-3 text-xs">
        {[
          ["Files uploaded", uploadedFiles.length, uploadedFiles.length > 0],
          ["Converted to Markdown", uploadedFiles.filter((file) => file.conversion?.status === "converted").length, uploadedFiles.some((file) => file.conversion?.status === "converted")],
          ["Tagged", documentTags.length, documentTags.length > 0],
          ["Extraction", pipelineProgress.status || "not started", extractionComplete],
          ["Analysis", analysisPending ? `${analysisPending} pending` : (extractionComplete ? "done" : "not started"), extractionComplete],
          ["Outputs", outputs.length || "not started", outputsStageComplete],
        ].map(([label, value, complete]) => (
          <div key={String(label)} className="flex items-center gap-2">
            {complete ? <CheckCircle2 className="h-4 w-4 text-[#009A44]" /> : <span className="h-4 w-4 rounded-full border border-[#A7B3C5]" />}
            <span className="flex-1 text-slate-600">{label}</span>
            <span className="font-medium text-[#0C233C]">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
          <span>{readiness.status.replace(/_/g, " ")}</span>
          <span>{readinessPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#D8E0ED]">
          <div className="h-full rounded-full bg-[#005EB8]" style={{ width: `${readinessPct}%` }} />
        </div>
      </div>
    </SopReadinessCard>
  );

  const renderFloatingCaseChat = () => {
    const contextLabel = activeStep === "review" && activeChatContext.document_filename
      ? `Using ${activeChatContext.document_filename}`
      : `Using ${workflowSteps.find((step) => step.key === activeStep)?.label || "case context"}`;
    const quickActions = activeStep === "review"
      ? ["Explain this suggestion", "Find supporting evidence", "Rewrite this more formally"]
      : activeStep === "upload"
        ? ["What documents are missing?", "Explain these tags", "Summarize upload readiness"]
        : activeStep === "outputs"
          ? ["Summarize accepted changes", "Explain these artifacts", "What should I download?"]
          : ["Why is analysis blocked?", "Summarize open gaps", "What should I do next?"];

    return (
      <div className="fixed bottom-5 right-5 z-50">
        {chatOpen ? (
          <CaseChatPanel className="flex h-[560px] w-[390px] flex-col overflow-hidden rounded-md border border-[#D8E0ED] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E6ECF5] bg-[#00338D] px-4 py-3 text-white">
              <div>
                <h3 className="text-sm font-semibold">TRACE case assistant</h3>
                <p className="text-[11px] text-white/75">Case-scoped chat. {contextLabel}</p>
              </div>
              <Button variant="ghost" className="h-8 px-2 text-xs text-white hover:bg-white/10" onClick={() => setChatOpen(false)}>Minimize</Button>
            </div>
            <div className="border-b border-[#E6ECF5] bg-[#F7FAFE] px-3 py-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">{prettyTag(activeStep)}</Badge>
                {activeChatContext.document_filename && <Badge variant="outline" className="max-w-[250px] truncate bg-white">{String(activeChatContext.document_filename)}</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickActions.map((action) => (
                  <button key={action} type="button" className="rounded border border-[#D8E0ED] bg-white px-2 py-1 text-[11px] text-[#00338D] hover:border-[#00B8F5]" onClick={() => askQuickQuestion(action)}>
                    {action}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && agentFollowUpQuestions.length === 0 && (
                <div className="rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-4 text-xs leading-5 text-slate-600">
                  Ask about this case, the active stage, selected document, or current suggestion. TRACE keeps this conversation with the case.
                </div>
              )}
              {messages.slice(-8).map((message, index) => (
                <div key={`${message.message_id || index}`} className={message.role === "user" ? "ml-8 rounded-md bg-[#005EB8] p-3 text-white" : "mr-8 rounded-md bg-[#F4F7FB] p-3 text-[#0C233C]"}>
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold">
                    {message.role === "agent" ? <Bot className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    {message.role === "agent" ? "TRACE Agent" : "You"}
                  </div>
                  <p className="text-xs leading-5">{message.content}</p>
                  {typeof message.context_snapshot?.workflow_step === "string" && <p className="mt-2 text-[10px] opacity-75">Context: {prettyTag(message.context_snapshot.workflow_step)}</p>}
                  {message.role === "user" && message.message_id && (
                    <Button variant="ghost" className="mt-2 h-7 px-2 text-[11px] text-white hover:bg-white/10" onClick={() => convertChatToSuggestion(message)}>
                      Convert to suggestion
                    </Button>
                  )}
                </div>
              ))}
              {agentFollowUpQuestions.length > 0 && (
                <div className="space-y-2 border-t border-[#E6ECF5] pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Agent questions</p>
                    <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => refreshFollowUpQuestions()}>Refresh</Button>
                  </div>
                  {agentFollowUpQuestions.map((question) => (
                    <button key={question.question_id} type="button" className="w-full rounded-md border border-[#D8E0ED] bg-white p-3 text-left hover:border-[#00B8F5]" onClick={() => askQuickQuestion(question.question)}>
                      <p className="text-xs leading-5 text-[#0C233C]">{question.question}</p>
                      {question.why_it_matters && <p className="mt-1 text-[11px] text-slate-500">{question.why_it_matters}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-[#E6ECF5] p-3">
              <div className="flex gap-2">
                <Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendChat(); }} placeholder="Ask TRACE about this case..." className={`h-9 text-xs ${lightFieldClass}`} />
                <Button size="icon" className="h-9 w-9 bg-[#005EB8] hover:bg-[#00338D]" onClick={sendChat}><Send className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </CaseChatPanel>
        ) : (
          <button type="button" className="flex h-14 w-14 items-center justify-center rounded-full bg-[#005EB8] text-white shadow-xl ring-4 ring-white hover:bg-[#00338D]" onClick={() => setChatOpen(true)} aria-label="Open TRACE case assistant">
            <MessageSquare className="h-6 w-6" />
            {messages.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#E5001B] px-1 text-[10px] font-semibold text-white">{Math.min(messages.length, 9)}</span>}
          </button>
        )}
      </div>
    );
  };

  const renderUpload = () => (
    <div className="grid min-h-[620px] grid-cols-[270px_minmax(0,1fr)] gap-4">
      <aside className="space-y-4">
        {renderCaseDetails()}
        {renderProgress()}
      </aside>
      <main className="space-y-4">
        <SopUploadBuckets className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0C233C]">Upload documents</h3>
              <p className="text-[11px] text-slate-500">Choose a bucket, add upload context, then select the document.</p>
            </div>
            {isStageReadOnly("upload") && <Button variant="outline" className="h-8 text-xs" onClick={() => setEditableStages((current) => ({ ...current, upload: true }))}>Edit uploads</Button>}
          </div>
          <div className="mb-4 rounded-md border border-[#C8D8F0] bg-[#FAFCFF] p-4">
            <div className="grid items-end gap-3 lg:grid-cols-[200px_minmax(0,1fr)_150px]">
              <label className="block min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Document bucket</span>
                <select
                  className={`mt-1 h-9 w-full rounded-md border px-3 text-xs ${lightFieldClass}`}
                  disabled={isStageReadOnly("upload")}
                  value={selectedUploadBucket}
                  onChange={(event) => setSelectedUploadBucket(event.target.value)}
                >
                  {uploadBuckets.map((bucket) => <option key={bucket.key} value={bucket.key}>{bucket.label}</option>)}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Additional context for this upload</span>
                <Input
                  className={`mt-1 h-9 text-xs ${lightFieldClass}`}
                  disabled={isStageReadOnly("upload")}
                  placeholder="Example: Source SOP from Compliance, FY2026 refresh, supersedes old procedure"
                  value={uploadContext}
                  onChange={(event) => setUploadContext(event.target.value)}
                />
              </label>
              <label className={`inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md bg-[#005EB8] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#00338D] ${isStageReadOnly("upload") ? "pointer-events-none opacity-60" : ""}`}>
                <UploadCloud className="mr-2 h-3.5 w-3.5" />
                Upload files
                <input type="file" multiple className="sr-only" disabled={!caseId || isStageReadOnly("upload") || busy === `upload-${selectedUploadBucket}`} onChange={(event) => uploadFile(selectedUploadBucket, event)} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {uploadBuckets.map((bucket) => {
              const Icon = bucket.icon;
              const status = uploadStatus[bucket.key];
              const selected = selectedUploadBucket === bucket.key;
              return (
                <div key={bucket.key}>
                  <button
                    type="button"
                    className={`w-full rounded-md border bg-white p-3 text-left transition-colors ${selected ? "ring-2 ring-[#00B8F5]" : ""} ${isStageReadOnly("upload") ? "opacity-70" : "hover:border-[#00B8F5] hover:bg-[#F8FCFF]"}`}
                    style={{ borderColor: status === "error" ? "#E5001B" : status === "success" ? "#009A44" : selected ? "#00B8F5" : "#D8E0ED" }}
                    disabled={isStageReadOnly("upload")}
                    onClick={() => setSelectedUploadBucket(bucket.key)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded bg-[#E8F8FD]" style={{ color: bucket.accent }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[#0C233C]">{bucket.label}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{bucketCount(bucket.key)} files</p>
                        {status && <p className={`mt-1 text-[10px] ${status === "error" ? "text-[#E5001B]" : status === "success" ? "text-[#009A44]" : "text-[#7A4D00]"}`}>{status}</p>}
                      </div>
                    </div>
                  </button>
                  <input type="file" multiple className="sr-only" disabled={!caseId || isStageReadOnly("upload") || busy === `upload-${bucket.key}`} onChange={(event) => uploadFile(bucket.key, event)} />
                </div>
              );
            })}
          </div>
        </SopUploadBuckets>

        <DocumentTagReviewTable className="rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0C233C]">Uploaded documents</h3>
              <p className="text-[11px] text-slate-500">{uploadedFiles.length} documents ready for tagging</p>
            </div>
            <div className="flex items-center gap-2">
              <Input className={`h-8 w-64 text-xs ${lightFieldClass}`} placeholder="Search documents..." />
              <Button variant="outline" className="h-8 text-xs" disabled>Filter</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAFE] text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Bucket</th>
                  <th className="px-4 py-3">AI tag</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">User override</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploadedFiles.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No uploaded documents yet</td></tr>
                ) : uploadedFiles.map((file) => {
                  const tag = documentTags.find((item) => item.file_id === file.file_id);
                  return (
                    <tr key={file.file_id} className="border-t border-[#E6ECF5]">
                      <td className="px-4 py-3 font-medium text-[#0C233C]">{file.filename}</td>
                      <td className="px-4 py-3">{prettyTag(file.bucket)}</td>
                      <td className="px-4 py-3"><Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">{tag?.confirmed_tag || "pending"}</Badge></td>
                      <td className="px-4 py-3"><span className={tag?.confidence === "high" ? "text-[#009A44]" : "text-[#EAAA00]"}>{tag?.confidence || "-"}</span></td>
                      <td className="px-4 py-3">
                        <select className={`h-8 rounded border px-2 text-xs ${lightFieldClass}`} value={tag?.confirmed_tag || ""} onChange={(event) => updateDocumentTag(tag || { file_id: file.file_id, confirmed_tag: event.target.value, confidence: "medium" }, event.target.value)}>
                          <option value="">Select tag</option>
                          {documentTagOptions.map((option) => <option key={option} value={option}>{prettyTag(option)}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3"><span className={file.conversion?.status === "converted" ? "text-[#009A44]" : "text-[#7A4D00]"}>{file.conversion?.status || "queued"}</span></td>
                      <td className="px-4 py-3"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteUploadedFile(file.file_id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DocumentTagReviewTable>
      </main>
    </div>
  );

  const renderReview = () => (
    <div className="grid min-h-[680px] grid-cols-[265px_minmax(0,1fr)_350px] gap-4">
      <aside className="rounded-md border border-[#D8E0ED] bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-[#0C233C]">Case explorer</h3>
        <Input className={`mt-3 h-8 text-xs ${lightFieldClass}`} placeholder="Search files..." />
        <div className="mt-4 space-y-2">
          {uploadBuckets.map((bucket) => {
            const bucketFiles = uploadedFiles.filter((file) => file.bucket === bucket.key);
            const expanded = expandedReviewBuckets[bucket.key] ?? false;
            return (
              <div key={bucket.key} className="rounded-md border border-[#E6ECF5]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-[#0C233C]"
                  onClick={() => setExpandedReviewBuckets((current) => ({ ...current, [bucket.key]: !expanded }))}
                >
                  <span>{bucket.label}</span>
                  <span className="text-slate-500">{bucketFiles.length}</span>
                </button>
                {expanded && (
                  <div className="border-t border-[#E6ECF5] p-2">
                    {bucketFiles.length === 0 ? (
                      <p className="px-2 py-1 text-slate-400">No documents</p>
                    ) : bucketFiles.map((file) => (
                      <button
                        key={file.file_id}
                        type="button"
                        className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-[11px] ${selectedReviewFile?.file_id === file.file_id ? "bg-[#E8F8FD] font-semibold text-[#00338D]" : "text-slate-600 hover:bg-[#F7FAFE]"}`}
                        onClick={() => setSelectedReviewFileId(file.file_id)}
                      >
                        {file.filename}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      <SopPreview className="rounded-md border border-[#D8E0ED] bg-white">
        <div className="flex items-center justify-between border-b border-[#E6ECF5] px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Document Review</p>
            <h3 className="text-sm font-semibold text-[#0C233C]">{selectedReviewFile?.filename || selectedReviewDocument?.filename || caseTitle}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => setDocumentViewOpen(true)}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open document view
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs"
              onClick={rerunCurrentCaseAnalysis}
              disabled={!uploadStageComplete || busy === "rerun-analysis" || pipelineProgress.status === "running"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "rerun-analysis" ? "animate-spin" : ""}`} />
              Rerun analysis
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => continueAnalysis()} disabled={!readiness.can_analyze || !uploadStageComplete || busy === "analysis"}>Continue Analysis</Button>
          </div>
        </div>
        <NativeDocumentViewer
          caseId={caseId}
          file={selectedReviewFile}
          markdownDocument={selectedReviewDocument}
          highlights={selectedReviewHighlights}
          suggestions={selectedReviewSuggestions}
          hasCorruptText={selectedReviewHasCorruptText}
          canAnalyze={readiness.can_analyze && uploadStageComplete && busy !== "analysis"}
          onAnalyzeSection={(anchorId) => continueAnalysis([anchorId])}
          onRepairPreview={() => repairPreview()}
        />
      </SopPreview>
      <aside className="min-h-0">
        <SuggestionQueue className="min-h-0 rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#0C233C]">Suggestion Queue ({selectedReviewSuggestions.length})</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-7 text-[11px]" onClick={acceptAllOpenSuggestions} disabled={suggestionCounts.open === 0 || busy === "bulk-accept"}>Accept all open</Button>
              <Badge variant="outline">{selectedReviewSuggestions.filter((item) => item.status === "open").length} open</Badge>
            </div>
          </div>
          {caseHasRuleFallback && (
            <div className="m-4 mb-0 rounded-md border border-[#F5D58A] bg-[#FFF8E1] p-3 text-xs text-[#7A4D00]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{RULE_FALLBACK_RERUN_MESSAGE}</p>
                  <Button variant="outline" className="mt-2 h-7 border-[#EAAA00] bg-white text-[11px] text-[#7A4D00]" onClick={rerunCurrentCaseAnalysis} disabled={busy === "rerun-analysis" || pipelineProgress.status === "running"}>
                    Rerun analysis
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="max-h-[380px] space-y-3 overflow-y-auto p-4">
            {selectedReviewSuggestions.length === 0 && <div className="rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-5 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-[#8AA2C0]" /><p className="mt-3 text-sm font-semibold text-[#0C233C]">No suggestions yet</p></div>}
            {selectedReviewSuggestions.map((suggestion) => {
              const sourceLabels = sourceLabelsForSuggestion(suggestion, selectedReviewFile?.filename || selectedReviewDocument?.filename);
              const exampleLanguage = cleanSuggestionText(suggestion);
              return (
                <button key={suggestion.suggestion_id} type="button" className={`block w-full rounded-md border p-3 text-left ${severityClass(suggestion.severity)}`} onClick={() => setSelectedSuggestionId(suggestion.suggestion_id)}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[#0C233C]">{suggestion.title}</h4>
                    <div className="flex shrink-0 items-center gap-1">
                      {originLabelForSuggestion(suggestion) && <Badge variant="outline" className="bg-white text-[10px] text-[#00338D]">{originLabelForSuggestion(suggestion)}</Badge>}
                      <span className={`text-[11px] font-semibold capitalize ${statusTone(suggestion.status)}`}>{suggestion.status}</span>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-[#0C233C]">What to uplift</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{suggestion.summary}</p>
                  {(suggestion.rationale || suggestion.impact) && <p className="mt-2 text-xs leading-5 text-slate-600">{suggestion.rationale || suggestion.impact}</p>}
                  {exampleLanguage && (
                    <div className="mt-3 rounded border border-[#D8E0ED] bg-white p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proposed SOP language</p>
                      <p className="mt-1 text-xs leading-5 text-[#0C233C]">{exampleLanguage}</p>
                      {suggestion.style_match_notes && <p className="mt-2 border-t border-[#E6ECF5] pt-2 text-[11px] leading-4 text-slate-500">{suggestion.style_match_notes}</p>}
                    </div>
                  )}
                  {sourceLabels.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{sourceLabels.map((label) => <Badge key={label} variant="outline" className="bg-white text-[10px] text-[#00338D]">{label}</Badge>)}</div>}
                  <Textarea value={editDrafts[suggestion.suggestion_id] ?? exampleLanguage} onChange={(event) => setEditDrafts((current) => ({ ...current, [suggestion.suggestion_id]: event.target.value }))} className={`mt-3 min-h-14 text-xs ${lightFieldClass}`} placeholder="User override / edited recommendation" onClick={(event) => event.stopPropagation()} />
                  <div className="mt-3 flex gap-2"><Button size="sm" className="h-7 bg-[#009A44] px-3 text-[11px] hover:bg-[#007A3D]" onClick={(event) => { event.stopPropagation(); decideSuggestion(suggestion.suggestion_id, "accepted"); }}>Accept</Button><Button size="sm" variant="outline" className="h-7 px-3 text-[11px]" onClick={(event) => { event.stopPropagation(); decideSuggestion(suggestion.suggestion_id, "edited"); }}>Edit</Button><Button size="sm" variant="outline" className="h-7 border-[#F5B5B5] px-3 text-[11px] text-[#B00020]" onClick={(event) => { event.stopPropagation(); decideSuggestion(suggestion.suggestion_id, "rejected"); }}>Reject</Button></div>
                </button>
              );
            })}
          </div>
        </SuggestionQueue>
      </aside>
    </div>
  );

  const renderOpenDocumentView = () => (
    <Dialog open={documentViewOpen} onOpenChange={setDocumentViewOpen}>
      <DialogContent className="h-[94vh] max-w-[94vw] gap-0 overflow-hidden border-[#D8E0ED] bg-white p-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#D8E0ED] px-5 py-3">
            <div>
              <DialogTitle className="text-base font-semibold text-[#0C233C]">Document view</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Suggestions are based on all case documents.</DialogDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-[#C8D8F0] text-[#0C233C] hover:bg-[#F4F7FB]"
              onClick={() => setDocumentViewOpen(false)}
              aria-label="Close document view"
              title="Close document view"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-0 overflow-x-auto border-b border-[#D8E0ED] bg-[#F7FAFE]">
            {uploadedFiles.map((file) => (
              <button
                key={file.file_id}
                type="button"
                className={`flex min-w-56 items-center gap-2 border-r border-[#D8E0ED] px-4 py-3 text-left text-xs font-semibold ${selectedReviewFile?.file_id === file.file_id ? "bg-white text-[#00338D] shadow-[inset_0_-3px_0_#005EB8]" : "text-slate-600 hover:bg-white"}`}
                onClick={() => setSelectedReviewFileId(file.file_id)}
              >
                {isSpreadsheetFile(file.filename) ? <FileSpreadsheet className="h-4 w-4 text-[#009A44]" /> : <FileText className="h-4 w-4 text-[#005EB8]" />}
                <span className="truncate">{file.filename}</span>
              </button>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_430px]">
            <main className="min-w-0 overflow-hidden border-r border-[#D8E0ED] bg-[#EEF3FA] p-4">
              <OfficeDocumentSurface
                caseId={caseId}
                file={selectedReviewFile}
                markdownDocument={selectedReviewDocument}
                highlights={selectedReviewHighlights}
                suggestions={selectedReviewSuggestions}
                fullscreen
                onSelectSuggestion={setSelectedSuggestionId}
              />
            </main>
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
              <div className="shrink-0 border-b border-[#D8E0ED] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comments in this document</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0C233C]">{selectedReviewSuggestions.length} suggestions</h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={rerunSuggestions} disabled={!uploadStageComplete || busy === "rerun-suggestions" || pipelineProgress.status === "running"}>
                      <RefreshCw className={`h-3 w-3 ${busy === "rerun-suggestions" || pipelineProgress.status === "running" ? "animate-spin" : ""}`} />
                      Rerun suggestions
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={acceptAllOpenSuggestions} disabled={suggestionCounts.open === 0 || busy === "bulk-accept"}>Accept all open</Button>
                  </div>
                </div>
                {(selectedReviewHasRuleFallback || pipelineWarnings.length > 0) && (
                  <div className="mt-3 rounded-md border border-[#F5D58A] bg-[#FFF8E1] px-3 py-2 text-xs leading-5 text-[#7A4D00]">
                    {selectedReviewHasRuleFallback ? "These suggestions include rule fallback results. Use Rerun suggestions to retry AI generation. If the rerun fails, Check LLM settings." : "Pipeline warnings are available for this run."}
                    {pipelineWarnings.length > 0 && <p className="mt-1 text-[11px] text-[#7A4D00]">{pipelineWarnings[0]}</p>}
                  </div>
                )}
              </div>
              <div className="max-h-[30vh] shrink-0 space-y-2 overflow-y-auto border-b border-[#D8E0ED] p-4">
                {selectedReviewSuggestions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-4 text-center text-sm text-slate-500">No suggestions for this document yet.</div>
                ) : (
                  selectedReviewSuggestions.map((suggestion) => {
                    const proposedText = cleanSuggestionText(suggestion);
                    return (
                      <button
                        key={suggestion.suggestion_id}
                        type="button"
                        className={`block w-full rounded-md border px-3 py-2 text-left text-xs transition-colors hover:border-[#00B8F5] ${selectedSuggestion?.suggestion_id === suggestion.suggestion_id ? "border-[#00B8F5] bg-[#F8FCFF]" : "border-[#E6ECF5] bg-white"}`}
                        onClick={() => setSelectedSuggestionId(suggestion.suggestion_id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-[#0C233C]">{suggestion.title}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {originLabelForSuggestion(suggestion) && <Badge variant="outline" className="bg-white text-[10px] text-[#00338D]">{originLabelForSuggestion(suggestion)}</Badge>}
                            <span className={`text-[10px] font-semibold capitalize ${statusTone(suggestion.status)}`}>{suggestion.status}</span>
                          </div>
                        </div>
                        {proposedText && <p className="mt-1 line-clamp-2 leading-5 text-[#0C233C]">{proposedText}</p>}
                        <p className="mt-1 line-clamp-2 leading-5 text-slate-600">{suggestionWhyRecommended(suggestion)}</p>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="shrink-0 border-b border-[#D8E0ED] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selected comment</p>
                <h3 className="mt-1 text-sm font-semibold text-[#0C233C]">{selectedSuggestion?.title || "No comment selected"}</h3>
              </div>
              {selectedSuggestion ? (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-[#FFF8E1] text-[#7A4D00] hover:bg-[#FFF8E1]">{prettyTag(selectedSuggestion.severity)}</Badge>
                    {originLabelForSuggestion(selectedSuggestion) && <Badge variant="outline" className="bg-white text-[#00338D]">{originLabelForSuggestion(selectedSuggestion)}</Badge>}
                  </div>
                  {cleanSuggestionText(selectedSuggestion) && (
                    <div className="rounded-md border border-[#B7D9FF] bg-[#F4FAFF] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proposed SOP language</p>
                      <p className="mt-2 text-sm leading-6 text-[#0C233C]">{cleanSuggestionText(selectedSuggestion)}</p>
                    </div>
                  )}
                  <div className="rounded-md border border-[#D8E0ED] bg-white p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why this change</p>
                    <p className="mt-2 text-xs leading-5 text-slate-700">{suggestionReason(selectedSuggestion) || "TRACE identified this as an improvement to make the SOP section more reviewable."}</p>
                  </div>
                  <div className="rounded-md border border-[#D8E0ED] bg-white p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Why TRACE recommends it</p>
                    <p className="mt-2 text-xs leading-5 text-slate-700">{suggestionWhyRecommended(selectedSuggestion) || "The recommendation is based on the selected SOP text and supporting case documents."}</p>
                    {selectedSuggestion.style_match_notes && (
                      <div className="mt-3 border-t border-[#E6ECF5] pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tone match</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedSuggestion.style_match_notes}</p>
                      </div>
                    )}
                  </div>
                  {selectedSuggestion.original_text && (
                    <div className="rounded-md border border-[#E6ECF5] bg-[#FAFCFF] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Current SOP text</p>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{selectedSuggestion.original_text}</p>
                    </div>
                  )}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Source references</p>
                    <div className="space-y-2">
                      {sourceLabelsForSuggestion(selectedSuggestion, selectedReviewFile?.filename).map((label) => <div key={label} className="rounded border border-[#D8E0ED] bg-white p-2 text-xs text-[#00338D]">{label}</div>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2"><Button size="sm" className="h-8 bg-[#009A44] text-xs hover:bg-[#007A3D]" onClick={() => decideSuggestion(selectedSuggestion.suggestion_id, "accepted")}>Accept</Button><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => decideSuggestion(selectedSuggestion.suggestion_id, "edited")}>Edit</Button><Button size="sm" variant="outline" className="h-8 border-[#F5B5B5] text-xs text-[#B00020]" onClick={() => decideSuggestion(selectedSuggestion.suggestion_id, "rejected")}>Reject</Button></div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 p-6 text-center text-sm text-slate-500">Select a suggestion to review details.</div>
              )}
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderReviewProceedDialog = () => (
    <AlertDialog open={reviewProceedDialogOpen} onOpenChange={setReviewProceedDialogOpen}>
      <AlertDialogContent className="border-[#D8E0ED] bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#0C233C]">Proceed with pending suggestions?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600">
            {suggestionCounts.open} suggestions are still pending for review. Proceeding will generate outputs using the current case state and will not accept, reject, or edit those suggestions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[#C8D8F0]">Stay in review</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#005EB8] text-white hover:bg-[#00338D]"
            onClick={(event) => {
              event.preventDefault();
              generateOutputs({ allowPending: true });
            }}
            disabled={busy === "outputs"}
          >
            Proceed without accepting
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const renderOutputs = () => (
    <div className="grid min-h-[650px] grid-cols-[minmax(0,1fr)_310px] gap-4">
      <main className="space-y-4">
        <SopOutputPanel className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-[#0C233C]">Outputs & Reports</h3><p className="text-xs text-slate-500">Generate and download uplifted deliverables.</p></div><Button className="h-9 gap-2 bg-[#005EB8] text-xs hover:bg-[#00338D]" onClick={() => generateOutputs()} disabled={!extractionComplete || busy === "outputs"}>Generate Outputs<ChevronDown className="h-3.5 w-3.5" /></Button></div>
          <div className="mt-5 grid grid-cols-5 divide-x divide-[#E6ECF5] rounded-md border border-[#E6ECF5]">{[["SOP Uplift", "Status"], [suggestionCounts.total, "Total suggestions"], [suggestionCounts.accepted, "Accepted"], [suggestionCounts.edited, "Edited"], [suggestionCounts.rejected, "Rejected"]].map(([value, label]) => <div key={String(label)} className="p-4"><p className="text-xl font-semibold text-[#00338D]">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}</div>
        </SopOutputPanel>
        <section className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#0C233C]">Generated artifacts</h3>
          {outputs.length === 0 ? <div className="rounded-md border border-dashed border-[#C8D8F0] bg-[#FAFCFF] p-8 text-center"><Download className="mx-auto h-8 w-8 text-[#8AA2C0]" /><p className="mt-3 text-sm font-semibold text-[#0C233C]">No generated artifacts yet</p></div> : <div className="grid grid-cols-4 gap-4">{outputs.map((output) => <div key={output.output_id} className="rounded-md border border-[#D8E0ED] bg-white p-4"><p className="text-sm font-semibold text-[#0C233C]">{outputLabel(output.type)}</p><p className="mt-1 text-[11px] text-slate-500">{output.filename}</p><Button variant="outline" className="mt-4 h-8 w-full text-xs" onClick={() => downloadOutput(output)}>Download</Button></div>)}</div>}
        </section>
        <SwimlanePreview className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#0C233C]">Swimlane preview</h3>
          {diagramModel.warnings?.some((warning) => /fallback|repair|repaired/i.test(warning)) ? (
            <div data-testid="diagram-fallback-warning" className="mb-3 flex items-start gap-2 rounded border border-[#F5D58A] bg-[#FFF8E1] px-3 py-2 text-xs text-[#7A4D00]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Diagram generated with repaired layout. Review lane placement and badges before using externally.</span>
            </div>
          ) : null}
          <div className="h-[310px] overflow-hidden rounded border border-[#D8E0ED] bg-[#FAFCFF]">
            {diagramModel.nodes?.length ? <ReactFlow nodes={flowNodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}><Background /><Controls showInteractive={false} /></ReactFlow> : <div className="grid h-full place-items-center text-center"><div><Workflow className="mx-auto h-8 w-8 text-[#8AA2C0]" /><p className="mt-3 text-sm font-semibold text-[#0C233C]">No swimlane preview yet</p></div></div>}
          </div>
        </SwimlanePreview>
      </main>
      <aside className="space-y-4">
        {renderProgress()}
      </aside>
    </div>
  );

  if (!caseId) return renderCaseHub();

  return (
    <div className="flex h-full flex-col bg-[#F5F7FB] text-[#0C233C]">
      <HeroSection
        title="SOP Uplift"
        subtitle={caseTitle ? `${caseTitle} / ${workflowSteps.find((step) => step.key === activeStep)?.label ?? "Workspace"}` : "Locked workflow for SOP upload, analysis, review, and output generation."}
        icon={FilePenLine}
        actions={
          <div className="flex items-center gap-2">
            <Badge className={outputsStageComplete ? "bg-[#EAF7EF] text-[#007A3D] hover:bg-[#EAF7EF]" : "bg-[#FFF8E1] text-[#7A4D00] hover:bg-[#FFF8E1]"}>
              {outputsStageComplete ? "Completed" : "In progress"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => refreshCaseDetails()} className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white" title="Refresh case">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />
      <TracePageBody width="wide" contentClassName="space-y-4 py-4">
        {renderStageHeader()}
        {activeStep === "upload" && renderUpload()}
        {activeStep === "review" && renderReview()}
        {activeStep === "outputs" && renderOutputs()}
      </TracePageBody>
      {renderFloatingCaseChat()}
      {renderCaseDeleteDialog()}
      {renderReviewProceedDialog()}
      {renderExtractionDialog()}
      {renderOpenDocumentView()}
    </div>
  );
}
