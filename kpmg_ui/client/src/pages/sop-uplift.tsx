import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  Download,
  FileCheck2,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Play,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Workflow,
  XCircle,
} from "lucide-react";
import TracePageBody from "@/components/TracePageBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const uploadBuckets = [
  { key: "sops", label: "SOPs", icon: FileText, accent: "#1E49E2" },
  { key: "procedures", label: "Policies & Procedures", icon: ClipboardList, accent: "#1E49E2" },
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
  { key: "upload", label: "Upload & Tag Documents" },
  { key: "extract", label: "Extract & Analyze" },
  { key: "review", label: "Review Suggestions" },
  { key: "outputs", label: "Generate Outputs" },
] as const;

const starterSuggestions = [
  {
    id: "ownership-gap",
    title: "Clarify exception approval owner",
    severity: "medium",
    summary: "Name the accountable owner for exception approvals and define review cadence.",
    source: "Case chat and SOP section context",
  },
  {
    id: "evidence-gap",
    title: "Add evidence retention instruction",
    severity: "high",
    summary: "Specify the evidence record retained after quarterly control performance.",
    source: "Evidence bucket pending",
  },
  {
    id: "testability-gap",
    title: "Make the reconciliation step testable",
    severity: "medium",
    summary: "Replace broad activity language with an observable performer, frequency, and artifact.",
    source: "SOP clarity analysis",
  },
];

const fallbackSwimlanes = [
  { lane: "Business Owner", steps: ["Submit onboarding request", "Check completeness", "High risk?"] },
  { lane: "Operations Risk", steps: ["Perform due diligence", "Exception approval", "Compliance review"] },
  { lane: "Compliance", steps: ["Retain evidence", "Repository control"] },
  { lane: "Control Testing", steps: ["Select test sample", "Record testing outcome"] },
];

type Readiness = {
  status: string;
  message: string;
  missing_recommended_inputs: string[];
  can_analyze: boolean;
};

type ChatMessage = {
  message_id?: string;
  role: "agent" | "user";
  content: string;
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
  suggested_text?: string;
  user_text?: string;
  source_references?: unknown[];
};

type UploadedFile = {
  file_id: string;
  filename: string;
  bucket: string;
  conversion?: { status?: string };
};

type DocumentTag = {
  file_id: string;
  filename?: string;
  suggested_tag?: string;
  confirmed_tag: string;
  confidence: "high" | "medium" | "low";
};

type SopOutput = {
  output_id: string;
  type: string;
  filename: string;
  status: string;
};

type PipelineProgress = {
  status?: string;
  total?: number;
  completed?: number;
  pending?: number;
  failed?: number;
};

type FollowUpQuestion = {
  question_id: string;
  question: string;
  priority?: string;
  why_it_matters?: string;
};

type PreviewHighlight = {
  anchor_id: string;
  text: string;
  suggestions: Suggestion[];
};

type PreviewModel = {
  highlights: PreviewHighlight[];
};

type DiagramModel = {
  lanes?: { lane_id: string; name: string; order: number }[];
  nodes?: { node_id: string; lane_id: string; type: string; label: string }[];
  edges?: { edge_id: string; from_node_id: string; to_node_id: string; label?: string }[];
};

type WorkflowKey = (typeof workflowSteps)[number]["key"];

const API_BASE = "/api/sop-uplift/cases";

function prettyTag(value?: string) {
  return (value || "unmapped").replace(/_/g, " ");
}

function outputLabel(type: string) {
  const labels: Record<string, string> = {
    docx: "Uplifted SOP (DOCX)",
    drawio: "Process Diagram (DRAWIO)",
    diagram_pdf: "Swimlane Diagram (PDF)",
    diagram_svg: "Swimlane Diagram (SVG)",
    vsdx: "Process Diagram (VSDX)",
    changelog_markdown: "Change Log (Markdown)",
    changelog_json: "Audit Log (JSON)",
  };
  return labels[type] ?? prettyTag(type);
}

function severityClass(severity?: string) {
  if (severity === "high") return "border-[#F5B5B5] bg-[#FFF5F5] text-[#B00020]";
  if (severity === "medium") return "border-[#F5D58A] bg-[#FFF8E1] text-[#7A4D00]";
  return "border-[#B7D9FF] bg-[#F4FAFF] text-[#00338D]";
}

function statusTone(status?: string) {
  if (status === "accepted") return "text-[#009A44]";
  if (status === "rejected") return "text-[#E5001B]";
  if (status === "edited") return "text-[#1E49E2]";
  return "text-[#0C233C]";
}

export default function SopUpliftPage() {
  const [activeStep, setActiveStep] = useState<WorkflowKey>("upload");
  const [caseTitle, setCaseTitle] = useState("Vendor Onboarding - SOP Uplift");
  const [processName, setProcessName] = useState("Vendor Onboarding");
  const [caseId, setCaseId] = useState<string>("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", content: "Confirm the process owner for exception approvals?" },
    { role: "user", content: "Operations Risk reviews exceptions weekly." },
    { role: "agent", content: "Should Compliance be an approver for high-risk exceptions?" },
  ]);
  const [readiness, setReadiness] = useState<Readiness>({
    status: "not_ready",
    message: "Create a case and upload at least one SOP or procedure document before analysis.",
    missing_recommended_inputs: ["risk_control_matrix", "risk_register", "control_inventory", "process_diagram"],
    can_analyze: false,
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>(starterSuggestions.map((item) => ({
    suggestion_id: item.id,
    title: item.title,
    summary: item.summary,
    severity: item.severity,
    status: "open",
    source_references: [item.source],
  })));
  const [outputs, setOutputs] = useState<SopOutput[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [documentTags, setDocumentTags] = useState<DocumentTag[]>([]);
  const [previewModel, setPreviewModel] = useState<PreviewModel>({ highlights: [] });
  const [diagramModel, setDiagramModel] = useState<DiagramModel>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [useLlm, setUseLlm] = useState(false);
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>({});
  const [agentFollowUpQuestions, setAgentFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [analysisPending, setAnalysisPending] = useState<number>(0);
  const [busy, setBusy] = useState<string>("");

  const suggestionCounts = useMemo(() => ({
    total: suggestions.length,
    accepted: suggestions.filter((item) => item.status === "accepted").length,
    edited: suggestions.filter((item) => item.status === "edited").length,
    rejected: suggestions.filter((item) => item.status === "rejected").length,
    open: suggestions.filter((item) => item.status === "open").length,
  }), [suggestions]);

  const previewHighlights = previewModel.highlights?.length
    ? previewModel.highlights
    : [
      { anchor_id: "section-3-1", text: "The Business Owner submits a vendor onboarding request and provides core vendor information.", suggestions: [] },
      { anchor_id: "section-3-2", text: "Due diligence includes financial stability analysis, compliance checks, sanctions screening, and reference verification.", suggestions: suggestions.filter((item) => item.status === "open").slice(0, 1) },
      { anchor_id: "section-3-3", text: "High-risk vendors require approval from the third-party risk committee prior to onboarding.", suggestions: suggestions.filter((item) => item.status === "open").slice(1, 2) },
      { anchor_id: "section-3-4", text: "Contracts must include confidentiality, data protection, and right-to-audit clauses as per the standard template.", suggestions: [] },
      { anchor_id: "section-3-5", text: "Monitor vendor performance at least annually, including financial health, service quality, and compliance status.", suggestions: suggestions.filter((item) => item.status === "open").slice(2, 3) },
    ];

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
      position: { x: 0, y: index * 86 },
      data: { label: lane.name },
      draggable: false,
      style: { width: 150, height: 52, background: "#00338D", color: "white", borderRadius: 2, border: "0", fontWeight: 700, fontSize: 12 },
    }));
    const sourceNodes = diagramModel.nodes?.length
      ? diagramModel.nodes
      : fallbackSwimlanes.flatMap((lane, laneIndex) =>
        lane.steps.map((step, stepIndex) => ({
          node_id: `${laneIndex}-${stepIndex}`,
          lane_id: lanes[laneIndex]?.lane_id ?? "business_owner",
          type: "activity",
          label: step,
        })),
      );
    const stepNodes = sourceNodes.map((node, index) => {
      const laneIndex = Math.max(0, lanes.findIndex((lane) => lane.lane_id === node.lane_id));
      const stepIndex = sourceNodes.filter((candidate, candidateIndex) => candidateIndex < index && candidate.lane_id === node.lane_id).length;
      const isDecision = /risk|approve|\?/i.test(node.label) || node.type === "decision";
      return {
        id: node.node_id,
        position: { x: 200 + stepIndex * 178, y: laneIndex * 86 + 6 },
        data: { label: node.label },
        style: {
          width: isDecision ? 128 : 150,
          minHeight: 46,
          borderColor: isDecision ? "#0086A8" : "#00338D",
          borderWidth: 1.5,
          borderRadius: isDecision ? 2 : 3,
          color: "#00338D",
          background: isDecision ? "#F7FDFF" : "white",
          fontSize: 11,
          transform: isDecision ? "rotate(0deg)" : undefined,
        },
      };
    });
    return [...laneNodes, ...stepNodes];
  }, [diagramModel]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (diagramModel.edges?.length) {
      return diagramModel.edges.map((edge) => ({
        id: edge.edge_id,
        source: edge.from_node_id,
        target: edge.to_node_id,
        label: edge.label,
        animated: true,
        style: { stroke: "#0C233C" },
      }));
    }
    return [
      { id: "e-0-1", source: "0-0", target: "0-1", animated: true, style: { stroke: "#0C233C" } },
      { id: "e-1-2", source: "0-1", target: "0-2", animated: true, style: { stroke: "#0C233C" } },
      { id: "e-2-3", source: "0-2", target: "1-0", animated: true, style: { stroke: "#0C233C" } },
      { id: "e-3-4", source: "1-0", target: "1-1", animated: true, style: { stroke: "#0C233C" } },
      { id: "e-4-5", source: "1-1", target: "1-2", animated: true, style: { stroke: "#0C233C" } },
    ];
  }, [diagramModel]);

  const outputCards = outputs.length ? outputs : [
    { output_id: "docx", type: "docx", filename: "Vendor_Onboarding_SOP_Uplifted.docx", status: "pending" },
    { output_id: "vsdx", type: "vsdx", filename: "Vendor_Onboarding_Swimlane.vsdx", status: "pending" },
    { output_id: "md", type: "changelog_markdown", filename: "Vendor_Onboarding_ChangeLog.md", status: "pending" },
    { output_id: "json", type: "changelog_json", filename: "Vendor_Onboarding_AuditLog.json", status: "pending" },
  ];

  const createCase = async () => {
    setBusy("case");
    try {
      const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: caseTitle, process_name: processName }),
      });
      const data = await response.json();
      if (data.case_id) {
        setCaseId(data.case_id);
      }
    } finally {
      setBusy("");
    }
  };

  const refreshReadiness = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/readiness`);
    if (response.ok) {
      setReadiness(await response.json());
    }
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
      setPreviewModel(data.preview_model ?? { highlights: [] });
      setDiagramModel(data.diagram_model ?? {});
      if (data.suggestions?.length) setSuggestions(data.suggestions);
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

  const convertDocuments = async (id = caseId) => {
    if (!id) return;
    await fetch(`${API_BASE}/${id}/convert`, { method: "POST" });
  };

  const uploadFile = async (bucket: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!caseId || !file) return;
    setBusy(`upload-${bucket}`);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("bucket", bucket);
      await fetch(`${API_BASE}/${caseId}/upload`, { method: "POST", body });
      await convertDocuments(caseId);
      await tagDocuments(caseId);
      await refreshFiles(caseId);
      await refreshReadiness(caseId);
      await refreshPreview(caseId);
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
    } finally {
      setBusy("");
    }
  };

  const updateDocumentTag = async (tag: DocumentTag, confirmedTag: string) => {
    if (!caseId) return;
    const response = await fetch(`${API_BASE}/${caseId}/documents/${tag.file_id}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggested_tag: tag.suggested_tag,
        confirmed_tag: confirmedTag,
        confidence: tag.confidence ?? "medium",
      }),
    });
    if (response.ok) refreshDocumentTags();
  };

  const refreshSuggestions = async (id = caseId) => {
    if (!id) return;
    const response = await fetch(`${API_BASE}/${id}/suggestions`);
    if (response.ok) {
      const data = await response.json();
      if (data.suggestions?.length) setSuggestions(data.suggestions);
    }
  };

  const continueAnalysis = async (sectionIds?: string[]) => {
    if (!caseId) return;
    setBusy("analysis");
    try {
      const response = await fetch(`${API_BASE}/${caseId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: sectionIds ? 1 : 5, section_ids: sectionIds ?? [] }),
      });
      const data = await response.json();
      if (data.suggestions) setSuggestions(data.suggestions);
      setAnalysisPending(data.processing_state?.analysis?.pending ?? 0);
      setPipelineProgress(data.processing_state?.analysis ?? {});
      await refreshPreview(caseId);
    } finally {
      setBusy("");
    }
  };

  const runFullPipeline = async () => {
    if (!caseId) return;
    setBusy("pipeline");
    try {
      const response = await fetch(`${API_BASE}/${caseId}/run-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_llm: useLlm }),
      });
      const data = await response.json();
      if (data.suggestions) setSuggestions(data.suggestions);
      if (data.preview_model) setPreviewModel(data.preview_model);
      if (data.diagram_model) setDiagramModel(data.diagram_model);
      setPipelineWarnings(data.processing_state?.pipeline?.warnings ?? []);
      setPipelineProgress(data.processing_state?.pipeline ?? {});
      setAgentFollowUpQuestions(data.agent_follow_up_questions ?? []);
      setAnalysisPending(data.processing_state?.analysis?.pending ?? 0);
      await refreshReadiness(caseId);
      setActiveStep("review");
    } finally {
      setBusy("");
    }
  };

  const generateOutputs = async () => {
    if (!caseId) return;
    setBusy("outputs");
    try {
      const response = await fetch(`${API_BASE}/${caseId}/generate-outputs`, { method: "POST" });
      const data = await response.json();
      setOutputs(data.outputs ?? []);
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
    const userText = editDrafts[suggestionId];
    if (!caseId) {
      setSuggestions((current) => current.map((item) => item.suggestion_id === suggestionId ? { ...item, status, user_text: userText } : item));
      return;
    }
    const response = await fetch(`${API_BASE}/${caseId}/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, user_text: status === "edited" ? userText : undefined }),
    });
    if (response.ok) {
      await refreshSuggestions();
      await refreshPreview();
    }
  };

  const sendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    if (caseId) {
      const response = await fetch(`${API_BASE}/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
      const data = await response.json();
      setMessages((current) => [...current, data]);
    } else {
      setMessages((current) => [...current, { role: "user", content }]);
    }
    setChatInput("");
  };

  const convertChatToSuggestion = async (message: ChatMessage) => {
    if (!caseId || !message.message_id) return;
    const response = await fetch(`${API_BASE}/${caseId}/chat/${message.message_id}/convert-to-suggestion`, { method: "POST" });
    if (response.ok) {
      const suggestion = await response.json();
      setSuggestions((current) => [...current.filter((item) => item.suggestion_id !== suggestion.suggestion_id), suggestion]);
      await refreshPreview();
    }
  };

  useEffect(() => {
    if (caseId) {
      refreshReadiness(caseId);
      refreshFiles(caseId);
      refreshDocumentTags(caseId);
      refreshPreview(caseId);
    }
  }, [caseId]);

  const bucketCount = (bucket: string) => uploadedFiles.filter((file) => file.bucket === bucket).length;
  const readinessPct = Math.min(100, Math.round(((pipelineProgress.completed ?? 0) / Math.max(1, pipelineProgress.total ?? 1)) * 100));

  const renderCaseDetails = () => (
    <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0C233C]">Case details</h3>
        <Badge className="bg-[#EAF7EF] text-[#007A3D] hover:bg-[#EAF7EF]">In progress</Badge>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Case name</span>
          <Input value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} className="mt-1 h-8 text-xs" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Process</span>
          <Input value={processName} onChange={(event) => setProcessName(event.target.value)} className="mt-1 h-8 text-xs" />
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-500">Case ID</p>
            <p className="font-medium text-[#0C233C]">{caseId || "SOPU-2025-0007"}</p>
          </div>
          <div>
            <p className="text-slate-500">Owner</p>
            <p className="font-medium text-[#0C233C]">Admin Analyst</p>
          </div>
          <div>
            <p className="text-slate-500">Framework</p>
            <p className="font-medium text-[#0C233C]">Internal Control Framework</p>
          </div>
          <div>
            <p className="text-slate-500">Business unit</p>
            <p className="font-medium text-[#0C233C]">Third Party Risk</p>
          </div>
        </div>
        <Button className="h-8 w-full bg-[#1E49E2] text-xs hover:bg-[#00338D]" onClick={createCase} disabled={busy === "case"}>
          {caseId ? "Edit case details" : "Create case"}
        </Button>
      </div>
    </section>
  );

  const renderProgress = () => (
    <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#0C233C]">Overall progress</h3>
      <div className="space-y-3 text-xs">
        {[
          ["Files uploaded", uploadedFiles.length > 0 ? `${uploadedFiles.length}/18` : "0/18", uploadedFiles.length > 0],
          ["Converted to Markdown", `${uploadedFiles.filter((file) => file.conversion?.status === "converted").length}/${Math.max(1, uploadedFiles.length)}`, uploadedFiles.some((file) => file.conversion?.status === "converted")],
          ["Tagged", `${documentTags.length}/${Math.max(1, uploadedFiles.length)}`, documentTags.length > 0],
          ["Extraction", pipelineProgress.status || "queued", Boolean(pipelineProgress.status)],
          ["Analysis", analysisPending ? `${analysisPending} pending` : "ready", suggestionCounts.total > 0],
          ["Outputs", outputs.length ? "generated" : "not started", outputs.length > 0],
        ].map(([label, value, complete]) => (
          <div key={String(label)} className="flex items-center gap-2">
            {complete ? <CheckCircle2 className="h-4 w-4 text-[#009A44]" /> : <span className="h-4 w-4 rounded-full border border-[#A7B3C5]" />}
            <span className="flex-1 text-slate-600">{label}</span>
            <span className="font-medium text-[#0C233C]">{value}</span>
          </div>
        ))}
      </div>
      {pipelineProgress.status && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span className="capitalize">{pipelineProgress.status}</span>
            <span>{readinessPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#D8E0ED]">
            <div className="h-full rounded-full bg-[#1E49E2]" style={{ width: `${readinessPct}%` }} />
          </div>
        </div>
      )}
    </section>
  );

  const renderCaseChat = (compact = false) => (
    <section className={`flex min-h-0 flex-col rounded-md border border-[#D8E0ED] bg-white ${compact ? "h-full" : ""}`}>
      <div className="flex items-center justify-between border-b border-[#E6ECF5] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0C233C]">Case chat</h3>
          <p className="text-[11px] text-slate-500">Scoped to this case only</p>
        </div>
        <Badge className="bg-[#E8F8FD] text-[#00338D] hover:bg-[#E8F8FD]">BETA</Badge>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.slice(-5).map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-md bg-[#005EB8] p-3 text-white" : "mr-8 rounded-md bg-[#F4F7FB] p-3 text-[#0C233C]"}>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold">
              {message.role === "agent" ? <Bot className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
              {message.role === "agent" ? "Trace Agent" : "You"}
            </div>
            <p className="text-xs leading-5">{message.content}</p>
            {message.role === "user" && message.message_id && (
              <Button variant="ghost" className="mt-2 h-7 px-2 text-[11px] text-white hover:bg-white/10" onClick={() => convertChatToSuggestion(message)}>
                Convert to suggestion
              </Button>
            )}
          </div>
        ))}
        {agentFollowUpQuestions.length > 0 && (
          <div className="space-y-2 border-t border-[#E6ECF5] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Agent Questions</p>
            {agentFollowUpQuestions.map((question) => (
              <div key={question.question_id} className="rounded-md border border-[#D8E0ED] bg-white p-3">
                <p className="text-xs leading-5 text-[#0C233C]">{question.question}</p>
                {question.why_it_matters && <p className="mt-1 text-[11px] text-slate-500">{question.why_it_matters}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-[#E6ECF5] p-3">
        <div className="flex gap-2">
          <Input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") sendChat(); }}
            placeholder="Add case context for the agent..."
            className="h-9 text-xs"
          />
          <Button size="icon" className="h-9 w-9 bg-[#1E49E2] hover:bg-[#00338D]" onClick={sendChat}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );

  const renderUpload = () => (
    <div className="grid min-h-[620px] grid-cols-[270px_minmax(0,1fr)_320px] gap-4">
      <aside className="space-y-4">
        {renderCaseDetails()}
        {renderProgress()}
      </aside>
      <main className="space-y-4">
        <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0C233C]">Upload documents</h3>
              <p className="text-[11px] text-slate-500">Drag-and-drop equivalent buckets with explicit file tagging.</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!caseId}>
              <UploadCloud className="h-3.5 w-3.5" />
              Upload files
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {uploadBuckets.map((bucket) => {
              const Icon = bucket.icon;
              return (
                <label key={bucket.key} className="cursor-pointer rounded-md border border-[#D8E0ED] bg-white p-3 transition-colors hover:border-[#00B8F5] hover:bg-[#F8FCFF]">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded bg-[#F2F6FC]" style={{ color: bucket.accent }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#0C233C]">{bucket.label}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{bucketCount(bucket.key)} files</p>
                    </div>
                  </div>
                  <input type="file" className="sr-only" disabled={!caseId || busy === `upload-${bucket.key}`} onChange={(event) => uploadFile(bucket.key, event)} />
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0C233C]">Uploaded documents</h3>
              <p className="text-[11px] text-slate-500">{uploadedFiles.length || 5} documents ready for tagging</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input className="h-8 w-52 pl-7 text-xs" placeholder="Search documents..." />
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => tagDocuments()} disabled={!caseId}>Filter</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Bucket</th>
                  <th className="px-4 py-3">AI tag</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">User override / notes</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6ECF5]">
                {(uploadedFiles.length ? uploadedFiles : [
                  { file_id: "sample-1", filename: "Vendor_Onboarding_SOP_v2.3.docx", bucket: "sops", conversion: { status: "converted" } },
                  { file_id: "sample-2", filename: "Risk_Control_Matrix.xlsx", bucket: "risk_control_matrices", conversion: { status: "converted" } },
                  { file_id: "sample-3", filename: "Faird_KYC_Events.csv", bucket: "risk_registers", conversion: { status: "converted" } },
                  { file_id: "sample-4", filename: "Control_Test_Evidence_Q1.pdf", bucket: "evidence", conversion: { status: "queued" } },
                  { file_id: "sample-5", filename: "Vendor_Onboarding_Flow.pdf", bucket: "diagrams", conversion: { status: "converted" } },
                ]).map((file, index) => {
                  const tag = documentTags.find((item) => item.file_id === file.file_id) ?? {
                    file_id: file.file_id,
                    confirmed_tag: documentTagOptions[index % documentTagOptions.length],
                    suggested_tag: documentTagOptions[index % documentTagOptions.length],
                    confidence: index > 2 ? "medium" : "high",
                  } as DocumentTag;
                  return (
                    <tr key={file.file_id} className="hover:bg-[#FAFCFF]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#1E49E2]" />
                          <span className="font-medium text-[#0C233C]">{file.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{prettyTag(file.bucket)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-[#C8D8F0] bg-[#F3F7FD] text-[#00338D]">{prettyTag(tag.suggested_tag ?? tag.confirmed_tag)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={tag.confidence === "high" ? "text-[#009A44]" : "text-[#B58300]"}>{tag.confidence}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={tag.confirmed_tag}
                          className="h-8 w-44 rounded border border-[#D8E0ED] bg-white px-2 text-xs text-[#0C233C]"
                          onChange={(event) => updateDocumentTag(tag, event.target.value)}
                          disabled={!caseId}
                        >
                          {documentTagOptions.map((option) => (
                            <option key={option} value={option}>{prettyTag(option)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[#009A44]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {file.conversion?.status ?? "converted"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" onClick={() => deleteUploadedFile(file.file_id)} disabled={!caseId || busy === `delete-${file.file_id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {renderCaseChat(true)}
    </div>
  );

  const renderExtract = () => (
    <div className="grid min-h-[620px] grid-cols-[310px_minmax(0,1fr)] gap-4">
      <aside className="space-y-4">
        {renderProgress()}
        <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0C233C]">Pipeline settings</h3>
          <label className="flex items-center justify-between rounded-md border border-[#E6ECF5] bg-[#FAFCFF] px-3 py-2 text-xs font-medium text-[#0C233C]">
            LLM-assisted extraction
            <input type="checkbox" checked={useLlm} onChange={(event) => setUseLlm(event.target.checked)} className="h-4 w-4 accent-[#1E49E2]" />
          </label>
          <Button className="mt-3 h-9 w-full gap-2 bg-[#1E49E2] text-xs hover:bg-[#00338D]" onClick={runFullPipeline} disabled={!caseId || busy === "pipeline"}>
            <Play className="h-3.5 w-3.5" />
            {analysisPending > 0 ? "Continue Analysis" : "Run Extraction"}
          </Button>
        </section>
      </aside>
      <main className="grid grid-cols-3 gap-4">
        {[
          ["Document conversion", uploadedFiles.length || 5, "Converted source files to Markdown and anchor map."],
          ["Corpus map", documentTags.length || 8, "Grouped SOPs, risks, controls, evidence, diagrams, and audit issues."],
          ["Suggestion generation", suggestionCounts.total, "Created anchored recommendations ready for review."],
        ].map(([title, value, detail]) => (
          <section key={String(title)} className="rounded-md border border-[#D8E0ED] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
            <p className="mt-4 text-4xl font-semibold text-[#00338D]">{value}</p>
            <p className="mt-3 text-xs leading-5 text-slate-600">{detail}</p>
          </section>
        ))}
        <section className="col-span-3 rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0C233C]">Extraction workflow</h3>
              <p className="text-[11px] text-slate-500">Case documents move from tagging into analysis, preview, and output generation.</p>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => continueAnalysis()} disabled={!caseId || busy === "analysis"}>
              Continue Analysis
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-0 p-5">
            {workflowSteps.map((step, index) => (
              <div key={step.key} className="relative border-y border-r border-[#D8E0ED] px-4 py-5 first:border-l">
                <Badge className={index <= workflowSteps.findIndex((candidate) => candidate.key === activeStep) ? "bg-[#1E49E2] text-white" : "bg-[#F3F6FA] text-[#0C233C] hover:bg-[#F3F6FA]"}>{index + 1}</Badge>
                <h4 className="mt-3 text-sm font-semibold text-[#0C233C]">{step.label}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {index === 0 ? "Files bucketed and tags confirmed." : index === 1 ? "Markdown, anchors, corpus map, and suggestions produced." : index === 2 ? "Analyst accepts, edits, or rejects anchored recommendations." : "DOCX, diagram, change log, and audit log generated."}
                </p>
              </div>
            ))}
          </div>
          {pipelineWarnings.length > 0 && (
            <div className="mx-5 mb-5 rounded-md border border-[#F5D58A] bg-[#FFF8E1] p-3">
              <p className="mb-2 text-xs font-semibold text-[#7A4D00]">Pipeline warnings</p>
              {pipelineWarnings.slice(0, 5).map((warning, index) => (
                <p key={`${warning}-${index}`} className="text-xs leading-5 text-[#7A4D00]">{warning}</p>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );

  const renderReview = () => (
    <div className="grid min-h-[680px] grid-cols-[265px_minmax(0,1fr)_350px] gap-4">
      <aside className="rounded-md border border-[#D8E0ED] bg-white">
        <div className="border-b border-[#E6ECF5] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0C233C]">Case explorer</h3>
          <Input className="mt-3 h-8 text-xs" placeholder="Search files..." />
        </div>
        <div className="space-y-4 p-4 text-xs">
          {[
            ["SOPs", uploadedFiles.filter((file) => file.bucket === "sops").length || 1],
            ["Policies & Procedures", uploadedFiles.filter((file) => file.bucket === "procedures").length || 2],
            ["Risk / Control Matrices", uploadedFiles.filter((file) => file.bucket === "risk_control_matrices").length || 2],
            ["Risk Registers", uploadedFiles.filter((file) => file.bucket === "risk_registers").length || 1],
            ["Evidence", uploadedFiles.filter((file) => file.bucket === "evidence").length || 5],
            ["Diagrams", uploadedFiles.filter((file) => file.bucket === "diagrams").length || 2],
            ["Audit Reports", uploadedFiles.filter((file) => file.bucket === "audit_reports").length || 1],
          ].map(([label, count]) => (
            <div key={String(label)}>
              <div className="flex items-center justify-between font-semibold text-[#0C233C]">
                <span>{label}</span>
                <span>{count}</span>
              </div>
              <div className="mt-2 h-px bg-[#E6ECF5]" />
            </div>
          ))}
          <div className="rounded-md bg-[#F3F7FD] p-3">
            <p className="font-semibold text-[#0C233C]">Filters</p>
            <label className="mt-3 flex items-center justify-between text-slate-600">
              Show only mapped
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#1E49E2]" />
            </label>
            {[
              ["Clarity / Improvement", 6, "#1E49E2"],
              ["Ownership / Evidence Gap", 5, "#EAAA00"],
              ["Missing Control / Risk Gap", 4, "#E5001B"],
              ["Accepted", suggestionCounts.accepted, "#009A44"],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="mt-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: String(color) }} />
                <span className="flex-1 text-slate-600">{label}</span>
                <span className="text-[#0C233C]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="rounded-md border border-[#D8E0ED] bg-white">
        <div className="flex items-center justify-between border-b border-[#E6ECF5] px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">SOP Review</p>
            <h3 className="text-sm font-semibold text-[#0C233C]">{caseTitle}</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => continueAnalysis()} disabled={!caseId || busy === "analysis"}>Continue Analysis</Button>
            <span>100%</span>
            <Search className="h-4 w-4" />
          </div>
        </div>
        <section className="max-h-[620px] overflow-y-auto p-8">
          <article className="mx-auto max-w-3xl space-y-6 border border-[#D8E0ED] bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0C233C]">3.0 Vendor Due Diligence</h2>
            <p className="text-sm leading-7 text-slate-700">The purpose of vendor due diligence is to ensure that third-party vendors meet our risk, compliance, and operational requirements.</p>
            {previewHighlights.map((highlight, index) => {
              const hasSuggestions = highlight.suggestions?.length > 0;
              const accent = index % 3 === 0 ? "bg-[#E8F8FD]" : index % 3 === 1 ? "bg-[#FFF1D1]" : "bg-[#FFE2E2]";
              return (
                <div key={highlight.anchor_id || index} id={`anchor-${highlight.anchor_id}`} className="group relative">
                  <h3 className="mb-1 text-base font-semibold text-[#0C233C]">3.{index + 1} {index === 0 ? "Initial screening" : index === 1 ? "Risk assessment" : index === 2 ? "Contracting & approval" : index === 3 ? "Ongoing monitoring" : "Offboarding"}</h3>
                  <div className="flex items-start justify-between gap-4">
                    <p className={`text-sm leading-7 text-slate-700 ${hasSuggestions ? `${accent} px-1` : ""}`}>{highlight.text}</p>
                    <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs opacity-0 transition-opacity group-hover:opacity-100" onClick={() => continueAnalysis([highlight.anchor_id])} disabled={!caseId || busy === "analysis"}>
                      Analyze this section
                    </Button>
                  </div>
                  {hasSuggestions && (
                    <div className="mt-2 rounded-md border border-[#D8E0ED] bg-[#FAFCFF] p-3 text-xs text-[#00338D]">
                      {highlight.suggestions.map((suggestion) => (
                        <p key={suggestion.suggestion_id} className="font-semibold">{suggestion.title}: <span className="font-normal">{suggestion.summary}</span></p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </article>
        </section>
      </main>

      <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_280px] gap-4">
        <section className="min-h-0 rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#0C233C]">Suggestion Queue ({suggestionCounts.total})</h3>
            <Badge variant="outline">{suggestionCounts.open} open</Badge>
          </div>
          <div className="max-h-[380px] space-y-3 overflow-y-auto p-4">
            {suggestions.map((suggestion) => (
              <div key={suggestion.suggestion_id} className={`rounded-md border p-3 ${severityClass(suggestion.severity)}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="mb-2 bg-white/70 text-[10px]">{prettyTag(suggestion.severity)}</Badge>
                    <h4 className="text-sm font-semibold text-[#0C233C]">{suggestion.title}</h4>
                  </div>
                  <span className={`text-[11px] font-semibold capitalize ${statusTone(suggestion.status)}`}>{suggestion.status}</span>
                </div>
                <p className="text-xs leading-5 text-slate-700">{suggestion.summary}</p>
                {suggestion.source_references?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {suggestion.source_references.slice(0, 2).map((reference, index) => (
                      <Badge key={index} variant="outline" className="bg-white text-[10px] text-[#00338D]">
                        {typeof reference === "string" ? reference : JSON.stringify(reference)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <Textarea
                  value={editDrafts[suggestion.suggestion_id] ?? suggestion.user_text ?? suggestion.suggested_text ?? ""}
                  onChange={(event) => setEditDrafts((current) => ({ ...current, [suggestion.suggestion_id]: event.target.value }))}
                  className="mt-3 min-h-14 bg-white text-xs"
                  placeholder="User override / edited recommendation"
                />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="h-7 bg-[#009A44] px-3 text-[11px] hover:bg-[#007A3D]" onClick={() => decideSuggestion(suggestion.suggestion_id, "accepted")}>Accept</Button>
                  <Button size="sm" variant="outline" className="h-7 px-3 text-[11px]" onClick={() => decideSuggestion(suggestion.suggestion_id, "edited")}>Edit</Button>
                  <Button size="sm" variant="outline" className="h-7 border-[#F5B5B5] px-3 text-[11px] text-[#B00020]" onClick={() => decideSuggestion(suggestion.suggestion_id, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
        {renderCaseChat(true)}
      </aside>
    </div>
  );

  const renderOutputs = () => (
    <div className="grid min-h-[650px] grid-cols-[minmax(0,1fr)_310px] gap-4">
      <main className="space-y-4">
        <section className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#0C233C]">Outputs & Reports</h3>
              <p className="text-xs text-slate-500">Generate and download uplifted deliverables.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button className="h-9 gap-2 bg-[#1E49E2] text-xs hover:bg-[#00338D]" onClick={generateOutputs} disabled={!caseId || busy === "outputs"}>
                Generate Outputs
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" className="h-9 gap-2 text-xs">
                <Download className="h-3.5 w-3.5" />
                Download All
              </Button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-5 divide-x divide-[#E6ECF5] rounded-md border border-[#E6ECF5]">
            {[
              ["SOP Uplift", "Completed"],
              [suggestionCounts.total, "Total suggestions"],
              [suggestionCounts.accepted, "Accepted"],
              [suggestionCounts.edited, "Edited"],
              [suggestionCounts.rejected, "Rejected"],
            ].map(([value, label]) => (
              <div key={String(label)} className="p-4">
                <p className="text-xl font-semibold text-[#00338D]">{value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#0C233C]">Generated artifacts</h3>
          <div className="grid grid-cols-4 gap-4">
            {outputCards.map((output) => (
              <div key={output.output_id} className="rounded-md border border-[#D8E0ED] bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded bg-[#E8F8FD] text-[#1E49E2]">
                    {output.type.includes("json") ? <Database className="h-5 w-5" /> : output.type.includes("diagram") || output.type === "vsdx" || output.type === "drawio" ? <Workflow className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#0C233C]">{outputLabel(output.type)}</p>
                    <p className="text-[11px] text-slate-500">{output.filename}</p>
                  </div>
                </div>
                <div className="space-y-1 text-[11px] text-slate-500">
                  <p>Generated on</p>
                  <p className="text-[#0C233C]">27 Apr 2026, 02:45 PM</p>
                  <p>Status: <span className={output.status === "generated" ? "text-[#009A44]" : "text-[#B58300]"}>{output.status}</span></p>
                </div>
                <Button variant="outline" className="mt-4 h-8 w-full text-xs" onClick={() => downloadOutput(output)}>
                  {output.status === "generated" ? "Download" : output.type.includes("markdown") ? "View change log" : "Preview"}
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[#D8E0ED] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0C233C]">Swimlane preview</h3>
            <Button variant="ghost" className="h-8 text-xs text-[#1E49E2]">Open full diagram in Visio</Button>
          </div>
          <div className="h-[310px] overflow-hidden rounded border border-[#D8E0ED] bg-[#FAFCFF]">
            <ReactFlow nodes={flowNodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </section>
      </main>

      <aside className="space-y-4">
        <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0C233C]">Document information</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Document ID</span><span className="font-medium text-[#0C233C]">SOP-VENDOR-ONBOARD-UPLIFT</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Process owner</span><span className="font-medium text-[#0C233C]">Business Owner</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Effective date</span><span className="font-medium text-[#0C233C]">27 Apr 2026</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Review date</span><span className="font-medium text-[#0C233C]">27 Apr 2027</span></div>
          </div>
        </section>
        <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0C233C]">Control summary</h3>
          {["C1 - Completeness check", "C2 - Weekly exception approval", "C3 - Evidence retention", "C4 - Test sample review"].map((control) => (
            <p key={control} className="mb-2 text-xs text-[#0C233C]">{control}</p>
          ))}
        </section>
        <section className="rounded-md border border-[#D8E0ED] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#E5001B]">Risk summary</h3>
          {["R1 - Incomplete onboarding may lead to vendor risk exposure", "R2 - Unapproved exception may result in compliance breach"].map((risk) => (
            <p key={risk} className="mb-2 text-xs text-[#0C233C]">{risk}</p>
          ))}
        </section>
        {renderCaseChat(false)}
      </aside>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[#F5F7FB] text-[#0C233C]">
      <TracePageBody width="wide" contentClassName="space-y-4 py-4">
        <header className="rounded-md border border-[#D8E0ED] bg-white">
          <div className="flex items-center justify-between border-b border-[#E6ECF5] px-5 py-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span>SOP Uplift</span>
                <span>/</span>
                <span>Cases</span>
                <span>/</span>
                <span>{processName}</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-[#0C233C]">{caseTitle}</h1>
                <Badge className="bg-[#FFF1D1] text-[#7A4D00] hover:bg-[#FFF1D1]">Case status: In progress</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button className="h-9 gap-2 bg-[#1E49E2] text-xs hover:bg-[#00338D]" onClick={runFullPipeline} disabled={!caseId || busy === "pipeline"}>
                <Play className="h-3.5 w-3.5" />
                Run Extraction
              </Button>
              <Button variant="outline" className="h-9 gap-2 text-xs">
                Case Actions
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 px-5 py-3">
            {workflowSteps.map((step, index) => {
              const active = activeStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  className={`relative flex h-10 items-center gap-3 border px-4 text-left text-xs font-semibold transition-colors ${active ? "border-[#1E49E2] bg-[#1E49E2] text-white" : "border-[#D8E0ED] bg-white text-[#0C233C] hover:bg-[#F7FAFE]"}`}
                  onClick={() => setActiveStep(step.key)}
                >
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${active ? "bg-white text-[#1E49E2]" : "bg-[#EEF3FA] text-[#00338D]"}`}>{index + 1}</span>
                  {step.label}
                </button>
              );
            })}
          </div>
        </header>

        {activeStep === "upload" && renderUpload()}
        {activeStep === "extract" && renderExtract()}
        {activeStep === "review" && renderReview()}
        {activeStep === "outputs" && renderOutputs()}
      </TracePageBody>
    </div>
  );
}
