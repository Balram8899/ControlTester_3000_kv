import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, Download, RotateCcw, Scale, FileCheck, ChevronRight, AlertCircle, CheckCircle2, GitMerge, Library, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import HowItWorks from "@/components/HowItWorks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, ComparisonResultsData } from "@/contexts/RegulatoryTestingContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canRunRcmComparison as canRunRcmComparisonForSource,
  getRcmComparisonEndpoint,
  getRcmProcessingDescription,
} from "./regulatory-testing.helpers";

type RegulationSlotSource = "upload" | "library";
type RegulatoryResultView = "summary" | "domain-drilldown" | "gap-analysis" | "report";

type RegulationComparisonSlot = {
  source: RegulationSlotSource;
  file: File | null;
  libraryDocumentId: string | null;
};

const INITIAL_REGULATION_SLOT: RegulationComparisonSlot = {
  source: "upload",
  file: null,
  libraryDocumentId: null,
};

const REGULATION_FILE_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt", ".md", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

const pageFontStyle = { fontFamily: "Arial, sans-serif" } as const;
const surfaceCardClass = "border-[#00338D]/12 bg-white/95 shadow-[0_24px_70px_-36px_rgba(12,35,60,0.42)] backdrop-blur";
const elevatedCardClass = "border border-[#E2E6EF] bg-white shadow-[0_8px_24px_-12px_rgba(12,35,60,0.12)] rounded-[18px]";
const statCardClass = "rounded-2xl border border-[#00338D]/10 bg-[linear-gradient(180deg,rgba(248,250,255,0.98)_0%,rgba(238,244,255,0.95)_100%)] p-4 text-center shadow-sm";
const tabListClass = "grid w-full rounded-2xl border border-[#00338D]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(242,247,255,0.95)_100%)] p-1.5 shadow-sm";
const tabTriggerClass = "rounded-xl text-[#0C233C] data-[state=active]:bg-[#00338D] data-[state=active]:text-white data-[state=active]:shadow-[0_12px_32px_-20px_rgba(0,51,141,0.8)]";
const markdownClass = "prose prose-sm max-w-none pr-4 text-[#0C233C] prose-headings:text-[#0C233C] prose-headings:font-semibold prose-h1:text-2xl prose-h1:border-b prose-h1:border-[#00338D]/15 prose-h1:pb-2 prose-h1:mb-4 prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2 prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-[#0C233C] prose-strong:font-semibold prose-ul:my-2 prose-li:text-slate-600 prose-li:my-1 prose-ol:my-2 prose-table:border-collapse prose-table:w-full prose-table:my-4 prose-th:border prose-th:border-[#00338D]/12 prose-th:bg-[#F3F7FF] prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-[#0C233C] prose-td:border prose-td:border-[#00338D]/10 prose-td:px-3 prose-td:py-2 prose-td:text-slate-600 prose-tr:even:bg-[#F8FAFF] prose-a:text-[#00338D] prose-a:no-underline hover:prose-a:underline prose-code:bg-[#EEF4FF] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-[#00338D] prose-code:font-mono prose-blockquote:border-l-4 prose-blockquote:border-[#1E49E2] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-600 prose-hr:border-[#00338D]/12 prose-hr:my-6";
const primaryButtonClass = "border-0 bg-[linear-gradient(135deg,#00338D_0%,#1E49E2_100%)] text-white shadow-[0_18px_40px_-20px_rgba(0,51,141,0.7)] hover:brightness-105";
const secondaryButtonClass = "border border-[#00338D]/12 bg-white text-[#00338D] shadow-sm hover:bg-[#F3F7FF]";
const outlineButtonClass = "border border-[#00338D]/18 bg-[rgba(255,255,255,0.85)] text-[#0C233C] hover:bg-[#F7FAFF]";

export default function RegulatoryTestingPage() {
  const { toast } = useToast();
  const {
    mode,
    setMode,
    regulationFiles,
    setRegulationFiles,
    addRegulationFiles,
    rcmFile,
    setRcmFile,
    isProcessing,
    setIsProcessing,
    comparisonResults,
    setComparisonResults,
    resetForNewComparison,
    libraryDocuments,
    setLibraryDocuments,
    selectedLibraryDocIds,
    toggleLibraryDoc,
    setSelectedLibraryDocIds,
  } = useRegulatoryTesting();
  const [regulationSlotA, setRegulationSlotA] = useState<RegulationComparisonSlot>(INITIAL_REGULATION_SLOT);
  const [regulationSlotB, setRegulationSlotB] = useState<RegulationComparisonSlot>(INITIAL_REGULATION_SLOT);
  const [rcmRegulationSource, setRcmRegulationSource] = useState<RegulationSlotSource>("library");
  const [resultView, setResultView] = useState<RegulatoryResultView>("summary");

  // Fetch library documents for RCM mode selection
  const [libraryFetched, setLibraryFetched] = useState(false);
  useEffect(() => {
    if ((mode === "rcm" || mode === "regulation") && !libraryFetched && libraryDocuments.length === 0) {
      fetch("/api/regulatory-library/documents")
        .then(r => r.json())
        .then(data => {
          if (data.success && data.documents) {
            setLibraryDocuments(data.documents);
          }
          setLibraryFetched(true);
        })
        .catch(() => setLibraryFetched(true));
    }
  }, [mode, libraryFetched, libraryDocuments.length, setLibraryDocuments]);

  const updateRegulationSlot = useCallback(
    (
      slotKey: "a" | "b",
      updater: (previous: RegulationComparisonSlot) => RegulationComparisonSlot,
    ) => {
      const setter = slotKey === "a" ? setRegulationSlotA : setRegulationSlotB;
      setter(previous => updater(previous));
    },
    []
  );

  const setRegulationSlotSource = useCallback(
    (slotKey: "a" | "b", source: RegulationSlotSource) => {
      updateRegulationSlot(slotKey, previous => ({
        source,
        file: source === "upload" ? previous.file : null,
        libraryDocumentId: source === "library" ? previous.libraryDocumentId : null,
      }));
    },
    [updateRegulationSlot]
  );

  const setRegulationSlotFile = useCallback(
    (slotKey: "a" | "b", file: File | null) => {
      updateRegulationSlot(slotKey, previous => ({
        ...previous,
        source: "upload",
        file,
        libraryDocumentId: null,
      }));
    },
    [updateRegulationSlot]
  );

  const setRegulationSlotLibraryDocument = useCallback(
    (slotKey: "a" | "b", documentId: string) => {
      updateRegulationSlot(slotKey, previous => ({
        ...previous,
        source: "library",
        libraryDocumentId: documentId,
        file: null,
      }));
    },
    [updateRegulationSlot]
  );

  const removeRegulationSlotFile = useCallback(
    (slotKey: "a" | "b") => {
      setRegulationSlotFile(slotKey, null);
    },
    [setRegulationSlotFile]
  );

  const onDropRcm = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setRcmFile(acceptedFiles[0]);
        toast({
          title: "RCM uploaded",
          description: `${acceptedFiles[0].name} added`,
        });
      }
    },
    [setRcmFile, toast]
  );

  const onDropRcmRegulations = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        addRegulationFiles(acceptedFiles);
        toast({
          title: "Regulations uploaded",
          description: `${acceptedFiles.length} regulation document${acceptedFiles.length !== 1 ? "s" : ""} added`,
        });
      }
    },
    [addRegulationFiles, toast]
  );

  const {
    getRootProps: getRegulationARootProps,
    getInputProps: getRegulationAInputProps,
    isDragActive: isRegulationADragActive,
  } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setRegulationSlotFile("a", file);
        toast({
          title: "Regulation A uploaded",
          description: `${file.name} added`,
        });
      }
    },
    multiple: false,
    accept: REGULATION_FILE_ACCEPT,
  });

  const {
    getRootProps: getRegulationBRootProps,
    getInputProps: getRegulationBInputProps,
    isDragActive: isRegulationBDragActive,
  } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setRegulationSlotFile("b", file);
        toast({
          title: "Regulation B uploaded",
          description: `${file.name} added`,
        });
      }
    },
    multiple: false,
    accept: REGULATION_FILE_ACCEPT,
  });

  const {
    getRootProps: getRcmRootProps,
    getInputProps: getRcmInputProps,
    isDragActive: isRcmDragActive,
  } = useDropzone({
    onDrop: onDropRcm,
    multiple: false,
  });

  const {
    getRootProps: getRcmRegulationsRootProps,
    getInputProps: getRcmRegulationsInputProps,
    isDragActive: isRcmRegulationsDragActive,
  } = useDropzone({
    onDrop: onDropRcmRegulations,
    multiple: true,
    accept: REGULATION_FILE_ACCEPT,
  });

  const removeRcmFile = () => {
    setRcmFile(null);
  };

  const removeUploadedRcmRegulationFile = useCallback(
    (index: number) => {
      setRegulationFiles(regulationFiles.filter((_, fileIndex) => fileIndex !== index));
    },
    [regulationFiles, setRegulationFiles]
  );

  const canRunRegulationComparison =
    (regulationSlotA.source === "upload" ? regulationSlotA.file !== null : regulationSlotA.libraryDocumentId !== null) &&
    (regulationSlotB.source === "upload" ? regulationSlotB.file !== null : regulationSlotB.libraryDocumentId !== null);
  const canRunRcmComparison = canRunRcmComparisonForSource(
    rcmRegulationSource,
    selectedLibraryDocIds,
    regulationFiles,
    rcmFile
  );

  const getLibraryDocumentName = useCallback(
    (documentId: string | null) => {
      if (!documentId) return null;
      return libraryDocuments.find(doc => doc.document_id === documentId)?.framework_name ?? null;
    },
    [libraryDocuments]
  );

  const getRegulationSlotSummary = useCallback(
    (slot: RegulationComparisonSlot, fallbackLabel: string) => {
      if (slot.source === "upload") {
        return slot.file?.name ?? fallbackLabel;
      }
      return getLibraryDocumentName(slot.libraryDocumentId) ?? fallbackLabel;
    },
    [getLibraryDocumentName]
  );

  const handleRunComparison = async () => {
    if (mode === "regulation" && !canRunRegulationComparison) {
      toast({
        title: "Incomplete comparison",
        description: "Please configure both Regulation A and Regulation B before running the comparison",
        variant: "destructive",
      });
      return;
    }

    if (mode === "rcm" && !canRunRcmComparison) {
      toast({
        title: "Insufficient input",
        description:
          rcmRegulationSource === "library"
            ? "Please select at least one regulation from the library and upload an RCM document"
            : "Please upload at least one regulation and an RCM document",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setComparisonResults(null);

    try {
      const actionText = mode === "regulation" ? "regulatory comparison" : "RCM assessment";
      toast({
        title: "Processing",
        description: `Running ${actionText}...`,
      });

      const selectedModel = localStorage.getItem("selectedModel") || "llama3";
      const formData = new FormData();
      formData.append("selected_model", selectedModel);

      let endpoint: string;

      if (mode === "rcm") {
        endpoint = getRcmComparisonEndpoint(rcmRegulationSource);

        if (rcmRegulationSource === "library") {
          formData.append("document_ids", JSON.stringify(selectedLibraryDocIds));
          formData.append("save_report", "true");
        } else {
          formData.append("save_artifacts", "false");
          formData.append("output_format", "json");
          regulationFiles.forEach(file => {
            formData.append("regulation_files", file);
          });
        }

        if (rcmFile) {
          formData.append("rcm_file", rcmFile);
        }
      } else {
        endpoint = `/api/compare-regulations`;
        formData.append("save_artifacts", "false");
        formData.append("output_format", "json");
        formData.append("max_workers", "4");
        formData.append("regulation_a_source", regulationSlotA.source);
        formData.append("regulation_b_source", regulationSlotB.source);

        if (regulationSlotA.source === "upload" && regulationSlotA.file) {
          formData.append("regulation_a_file", regulationSlotA.file);
        }
        if (regulationSlotA.source === "library" && regulationSlotA.libraryDocumentId) {
          formData.append("regulation_a_document_id", regulationSlotA.libraryDocumentId);
        }

        if (regulationSlotB.source === "upload" && regulationSlotB.file) {
          formData.append("regulation_b_file", regulationSlotB.file);
        }
        if (regulationSlotB.source === "library" && regulationSlotB.libraryDocumentId) {
          formData.append("regulation_b_document_id", regulationSlotB.libraryDocumentId);
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const result: ComparisonResultsData = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to run ${mode === "regulation" ? "regulatory comparison" : "RCM compliance analysis"}`);
      }

      setComparisonResults(result);
      setResultView("summary");

      if (mode === "rcm") {
        toast({
          title: "Analysis Complete",
          description: `RCM compliance analysis finished. ${Object.keys(result.domain_reports || {}).length} domain reports generated.`,
        });
      } else {
        toast({
          title: "Analysis Complete",
          description: `Regulatory comparison finished successfully. Found ${result.extracted_controls || 0} controls in ${result.control_groups || 0} groups.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to run analysis";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setComparisonResults({
        success: false,
        request_id: "error",
        error: errorMessage,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportResults = () => {
    if (!comparisonResults) return;

    const jsonString = JSON.stringify(comparisonResults, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "regulation" ? "regulatory_comparison.json" : "rcm_assessment.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Results downloaded as JSON",
    });
  };

  const getReportMarkdown = () => {
    if (mode === "rcm") {
      if (!comparisonResults?.executive_summary && !comparisonResults?.domain_reports) return "";
      const parts: string[] = [];
      if (comparisonResults.executive_summary) {
        parts.push("# Executive Summary\n\n" + comparisonResults.executive_summary);
      }
      if (comparisonResults.domain_reports) {
        Object.entries(comparisonResults.domain_reports).forEach(([domain, report]) => {
          parts.push(`# Domain: ${domain.replace(/_/g, " ")}\n\n${report}`);
        });
      }
      return parts.join("\n\n---\n\n");
    } else {
      return comparisonResults?.final_report ?? "";
    }
  };

  const handleExportMarkdown = () => {
    const markdownContent = getReportMarkdown();
    if (!markdownContent) return;

    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "regulation" ? "regulatory_comparison.md" : "rcm_compliance_report.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Report downloaded as Markdown",
    });
  };

  const handleExportPdf = async () => {
    const markdownContent = getReportMarkdown();
    if (!markdownContent) return;

    try {
      const response = await fetch("/api/regulatory-library/gap-analysis/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          final_report: markdownContent,
          title: mode === "regulation" ? "Regulatory Comparison Report" : "RCM Compliance Report",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to export PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = mode === "regulation" ? "regulatory_comparison.pdf" : "rcm_compliance_report.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Exported",
        description: "Report downloaded as PDF",
      });
    } catch (error) {
      toast({
        title: "PDF export failed",
        description: error instanceof Error ? error.message : "Unable to generate PDF",
        variant: "destructive",
      });
    }
  };

  const handleNewComparison = () => {
    resetForNewComparison();
    setRegulationSlotA(INITIAL_REGULATION_SLOT);
    setRegulationSlotB(INITIAL_REGULATION_SLOT);
    setRcmRegulationSource("library");
    setResultView("summary");
    toast({
      title: "Reset",
      description: "Ready for new comparison",
    });
  };

  const handleModeSwitch = (newMode: "regulation" | "rcm") => {
    if (newMode !== mode) {
      setMode(newMode);
      setResultView("summary");
    }
  };

  const renderRegulationSlot = (
    slotKey: "a" | "b",
    title: string,
    slot: RegulationComparisonSlot,
    dropzone: {
      getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
      getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
      isDragActive: boolean;
    }
  ) => (
    <div
      className="min-w-0 overflow-hidden rounded-xl border border-[#00338D]/15 bg-gradient-to-b from-[#00338D]/[0.03] to-white p-4 space-y-3"
      data-regulatory-testing-source-card="true"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#00338D]">{title}</h3>
          <p className="text-sm leading-snug text-[#8492A6]">
            Choose an uploaded document or a regulation already stored in the library
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2 rounded-xl border border-[#E2E6EF] bg-[#F0F2F7] p-1"
        data-regulatory-testing-source-picker="true"
      >
        <button
          type="button"
          className={sourcePickerButtonClass(slot.source === "upload")}
          aria-pressed={slot.source === "upload"}
          onClick={() => setRegulationSlotSource(slotKey, "upload")}
        >
          Upload
        </button>
        <button
          type="button"
          className={sourcePickerButtonClass(slot.source === "library")}
          aria-pressed={slot.source === "library"}
          onClick={() => setRegulationSlotSource(slotKey, "library")}
        >
          Library
        </button>
      </div>

      {slot.source === "upload" ? (
        <div className="space-y-3">
          <div
            {...dropzone.getRootProps()}
            className={`min-h-[150px] rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
              dropzone.isDragActive
                ? "border-[#00338D] bg-[#00338D]/5"
                : "border-[#00338D]/20 hover:border-[#00338D]/45"
            }`}
            data-testid={`dropzone-regulation-${slotKey}`}
          >
            <input {...dropzone.getInputProps()} data-testid={`input-regulation-${slotKey}`} />
            <Upload className="mx-auto mb-3 h-9 w-9 text-[#8492A6]" />
            <p className="text-sm font-bold text-[#0C233C]">
              {dropzone.isDragActive ? `Drop ${title} here...` : `Upload ${title}`}
            </p>
            <p className="mt-1 text-xs leading-snug text-[#8492A6]">
              PDF, DOCX, TXT, MD, CSV, XLSX, XLS, PNG, JPG
            </p>
          </div>

          {slot.file && (
            <div
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              data-testid={`regulation-slot-file-${slotKey}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-[#00338D]" />
                <span className="text-sm truncate">{slot.file.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {(slot.file.size / 1024).toFixed(1)} KB
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRegulationSlotFile(slotKey)}
                data-testid={`button-remove-regulation-${slotKey}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {libraryDocuments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-5 text-center">
              <Library className="h-8 w-8 mx-auto text-muted-foreground/35 mb-2" />
              <p className="text-sm text-muted-foreground">
                No library regulations available yet. Ingest regulations first to select them here.
              </p>
            </div>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-auto pr-1" data-regulatory-testing-library-list={slotKey}>
              {libraryDocuments.map((doc) => {
                const isSelected = slot.libraryDocumentId === doc.document_id;
                return (
                  <button
                    key={`${slotKey}-${doc.document_id}`}
                    type="button"
                    onClick={() => setRegulationSlotLibraryDocument(slotKey, doc.document_id)}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                      isSelected
                        ? "border border-[#1E49E2]/45 bg-[#EEF2FF]"
                        : "border border-[#E2E6EF] bg-white hover:border-[#1E49E2]/30 hover:bg-[#F8FAFF]"
                    }`}
                    data-testid={`button-library-regulation-${slotKey}-${doc.document_id}`}
                  >
                    <div className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-[#00338D] border-[#00338D]" : "border-muted-foreground/40"
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-bold text-[#0C233C]">{doc.framework_name}</p>
                      <p className="truncate text-xs text-[#5A6478]">
                        {doc.issuing_authority} &middot; {doc.total_obligations} obligations
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                      {doc.total_obligations}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const sectionHeader = (label: string, title: string, description?: string) => (
    <div className="border-b-2 border-[#E2E6EF] pb-4">
      <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">{label}</div>
      <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">{title}</div>
      {description && <p className="mt-2 text-[13px] leading-relaxed text-[#5A6478]">{description}</p>}
    </div>
  );

  const formatDomain = (value: string) =>
    value
      .replace(/_/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase());

  const displayMetric = (value: number | string | undefined | null) =>
    value === undefined || value === null || value === "" ? "Data not available" : String(value);

  const titleCaseText = (value: string) =>
    value
      .split(" ")
      .map(word => {
        if (/^[A-Z0-9]{2,}$/.test(word)) return word;
        if (/^v(?:s\.?|s)$/i.test(word)) return "vs.";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");

  const formatReportMarkdown = (markdown: string) =>
    markdown
      .split("\n")
      .map(line => {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (!headingMatch) return line;
        return `${headingMatch[1]} ${titleCaseText(headingMatch[2])}`;
      })
      .join("\n");

  const formatSourceName = (value: string | undefined | null) => {
    const name = (value ?? "").trim();
    if (!name) return "Data not available";
    if (/reserve bank of india|rbi/i.test(name)) return "RBI IT Governance";
    if (/hkma|hong kong monetary|trm|tm-g-1/i.test(name)) return "HKMA TRM";
    const withoutExtension = name.replace(/\.(pdf|docx?|xlsx?|csv|txt|md)$/i, "");
    const withoutParentheticals = withoutExtension.replace(/\s*\([^)]{18,}\)\s*/g, " ");
    const compact = withoutParentheticals.replace(/\s+/g, " ").trim();
    return compact.length > 34 ? `${compact.slice(0, 31).trim()}...` : compact;
  };

  const sourcePickerButtonClass = (isActive: boolean) =>
    [
      "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-bold transition-all",
      "focus:outline-none focus:ring-2 focus:ring-[#1E49E2]/35",
      isActive
        ? "bg-[#00338D] text-white shadow-[0_10px_24px_-18px_rgba(0,51,141,0.9)]"
        : "border border-[#CCD6E8] bg-white text-[#0C233C] hover:border-[#1E49E2]/45 hover:bg-[#EEF2FF]",
    ].join(" ");

  const resultDocuments = comparisonResults?.documents ?? comparisonResults?.filenames ?? [];
  const sourceAName = resultDocuments[0] ?? getRegulationSlotSummary(regulationSlotA, "Regulation A");
  const sourceBName = resultDocuments[1] ?? getRegulationSlotSummary(regulationSlotB, "Regulation B");
  const sourceALabel = formatSourceName(sourceAName);
  const sourceBLabel = formatSourceName(sourceBName);
  const gapSummary = comparisonResults?.gap_analysis?.gap_summary;
  const domainCoverage = comparisonResults?.gap_analysis?.domain_coverage ?? {};
  const documentGaps = comparisonResults?.gap_analysis?.document_gaps ?? {};
  const domainAnalysis = comparisonResults?.stringency_analysis?.domain_analysis ?? {};
  const domainCoverageEntries = Object.entries(domainCoverage);
  const domainAnalysisEntries = Object.entries(domainAnalysis);
  const overallStringencyEntries = Object.entries(comparisonResults?.stringency_analysis?.overall_stringency ?? {});
  const domainReportEntries = Object.entries(comparisonResults?.domain_reports ?? {});
  const suggestionEntries = Object.entries(comparisonResults?.suggestions_summary_counts ?? {});
  const reportMarkdown = getReportMarkdown();
  const formattedReportMarkdown = formatReportMarkdown(reportMarkdown);
  const hasReportExport = Boolean(reportMarkdown);
  const totalDomains = gapSummary?.total_domains_found ?? domainCoverageEntries.length;
  const sharedDomainCount = gapSummary?.domains_with_universal_coverage.length ?? 0;
  const firstDocGap = sourceAName ? documentGaps[sourceAName] : undefined;
  const secondDocGap = sourceBName ? documentGaps[sourceBName] : undefined;
  const sourceAGapCount = firstDocGap?.missing_domains.length ?? 0;
  const sourceBGapCount = secondDocGap?.missing_domains.length ?? 0;
  const sourceAOnlyCount = sourceBGapCount;
  const sourceBOnlyCount = sourceAGapCount;
  const comparedControlCount =
    comparisonResults?.extracted_controls ??
    comparisonResults?.stringency_analysis?.total_controls ??
    "Data not available";
  const sortedStringency = [...overallStringencyEntries].sort(
    ([, first], [, second]) => second.average_stringency - first.average_stringency,
  );
  const strongestSource = sortedStringency[0];
  const runnerUpSource = sortedStringency[1];
  const stringencyDelta =
    strongestSource && runnerUpSource
      ? Math.abs(strongestSource[1].average_stringency - runnerUpSource[1].average_stringency)
      : 0;
  const comparisonInsight = strongestSource
    ? stringencyDelta < 1
      ? "The selected sources have similar overall stringency."
      : `${formatSourceName(strongestSource[0])} is more stringent overall.`
    : "Data not available";

  const renderMetricCard = (title: string, value: number | string | undefined | null, detail: string, accent: string) => (
    <div className="relative min-h-[155px] overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      <div className="text-[11px] font-bold uppercase tracking-[2px] text-[#8492A6]">{title}</div>
      <div
        className={`${String(displayMetric(value)).length > 12 ? "text-[21px] leading-tight" : "text-[34px] leading-none"} mt-3 font-bold tracking-tight`}
        style={{ color: accent }}
      >
        {displayMetric(value)}
      </div>
      <div className="mt-3 text-[13px] leading-relaxed text-[#5A6478]">{detail}</div>
    </div>
  );

  const renderPathSelector = () => (
    <div data-regulatory-testing-paths="true" className="grid gap-4 md:grid-cols-2">
      <button
        type="button"
        onClick={() => handleModeSwitch("regulation")}
        className={`rounded-2xl border p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
          mode === "regulation"
            ? "border-[#1E49E2] bg-white"
            : "border-[#E2E6EF] bg-white"
        }`}
        data-testid="button-regulation-mode"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Comparison Path</div>
            <div className="mt-2 text-[20px] font-bold text-[#0C233C]">Regulation vs Regulation</div>
          </div>
          <div className="rounded-xl bg-[#EEF2FF] p-3 text-[#1E49E2]">
            <Scale className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[#5A6478]">
          Compare two regulatory sources to identify shared domains, divergent requirements, and gaps.
        </p>
      </button>

      <button
        type="button"
        onClick={() => handleModeSwitch("rcm")}
        className={`rounded-2xl border p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
          mode === "rcm"
            ? "border-[#7213EA] bg-white"
            : "border-[#E2E6EF] bg-white"
        }`}
        data-testid="button-rcm-mode"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Assessment Path</div>
            <div className="mt-2 text-[20px] font-bold text-[#0C233C]">RCM vs Regulation</div>
          </div>
          <div className="rounded-xl bg-[#F3F0FF] p-3 text-[#7213EA]">
            <FileCheck className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[#5A6478]">
          Assess a control matrix against selected regulations and review the compliance gaps by domain.
        </p>
      </button>
    </div>
  );

  const renderReadinessCard = () => {
    const sourceALabel = mode === "regulation" ? getRegulationSlotSummary(regulationSlotA, "Data not available") : rcmFile?.name ?? "Data not available";
    const sourceBLabel =
      mode === "regulation"
        ? getRegulationSlotSummary(regulationSlotB, "Data not available")
        : rcmRegulationSource === "library"
          ? `${selectedLibraryDocIds.length} library regulation(s)`
          : `${regulationFiles.length} uploaded regulation(s)`;
    const ready = mode === "regulation" ? canRunRegulationComparison : canRunRcmComparison;

    return (
      <div data-regulatory-testing-readiness="true" className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Run Readiness</div>
        <div className="mt-4 space-y-3">
          {[
            ["Source A", sourceALabel],
            ["Source B", sourceBLabel],
            ["Analysis", ready ? "Ready to run" : "Data not available"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-[#F0F2F7] px-4 py-3">
              <span className="text-[12px] font-semibold uppercase tracking-[1.5px] text-[#8492A6]">{label}</span>
              <span className="max-w-[220px] truncate text-right text-[13px] font-semibold text-[#0C233C]" title={value}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRcmRegulationPicker = () => (
    <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Regulatory Baseline</div>
          <h3 className="mt-1 text-[17px] font-bold text-[#0C233C]">Select Regulation Source</h3>
        </div>
        <div className="flex rounded-xl border border-[#E2E6EF] bg-[#F0F2F7] p-1">
          <button
            type="button"
            onClick={() => setRcmRegulationSource("library")}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold ${rcmRegulationSource === "library" ? "bg-[#00338D] text-white" : "text-[#0C233C]"}`}
            data-testid="button-rcm-source-library"
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setRcmRegulationSource("upload")}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold ${rcmRegulationSource === "upload" ? "bg-[#00338D] text-white" : "text-[#0C233C]"}`}
            data-testid="button-rcm-source-upload"
          >
            Upload
          </button>
        </div>
      </div>

      {rcmRegulationSource === "library" ? (
        <div className="mt-5 space-y-3">
          {libraryDocuments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E2E6EF] p-6 text-center text-[13px] text-[#5A6478]">
              No regulations in library. Ingest documents in the Regulatory Library or switch to upload.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[12px] text-[#8492A6]">
                <span>{libraryDocuments.length} document{libraryDocuments.length !== 1 ? "s" : ""} available</span>
                {selectedLibraryDocIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLibraryDocIds([])}
                    className="font-semibold text-[#00338D] hover:underline"
                    data-testid="button-clear-rcm-library-selection"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {libraryDocuments.map(doc => {
                  const isSelected = selectedLibraryDocIds.includes(doc.document_id);
                  return (
                    <button
                      key={doc.document_id}
                      type="button"
                      onClick={() => toggleLibraryDoc(doc.document_id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        isSelected ? "border-[#00338D] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white hover:bg-[#F0F2F7]"
                      }`}
                      data-testid={`button-rcm-library-doc-${doc.document_id}`}
                    >
                      <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${isSelected ? "border-[#00338D] bg-[#00338D]" : "border-[#8492A6]"}`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#0C233C]">{doc.framework_name}</p>
                        <p className="truncate text-[12px] text-[#8492A6]">{doc.issuing_authority} - {doc.total_obligations} obligations</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div
            {...getRcmRegulationsRootProps()}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              isRcmRegulationsDragActive ? "border-[#00338D] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white hover:border-[#1E49E2]"
            }`}
            data-testid="dropzone-rcm-regulations"
          >
            <input {...getRcmRegulationsInputProps()} data-testid="input-rcm-regulations" />
            <Upload className="mx-auto mb-3 h-10 w-10 text-[#1E49E2]" />
            <p className="text-[13px] font-bold text-[#0C233C]">Upload Regulation Files</p>
            <p className="mt-1 text-[12px] text-[#8492A6]">PDF, DOCX, TXT, MD, CSV, XLSX, XLS, PNG, JPG</p>
          </div>
          {regulationFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px] text-[#8492A6]">
                <span>Uploaded regulations</span>
                <button
                  type="button"
                  onClick={() => setRegulationFiles([])}
                  className="font-semibold text-[#00338D] hover:underline"
                  data-testid="button-clear-rcm-uploaded-regulations"
                >
                  Clear all
                </button>
              </div>
              {regulationFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded-xl border border-[#E2E6EF] px-4 py-3" data-testid={`rcm-regulation-file-${index}`}>
                  <span className="truncate text-[13px] font-semibold text-[#0C233C]">{file.name}</span>
                  <button type="button" onClick={() => removeUploadedRcmRegulationFile(index)} className="text-[#E5001B]" data-testid={`button-remove-rcm-regulation-${index}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderRcmDocumentPicker = () => (
    <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">RCM Document</div>
      <h3 className="mt-1 text-[17px] font-bold text-[#0C233C]">Upload Control Matrix</h3>
      <div
        {...getRcmRootProps()}
        className={`mt-5 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          isRcmDragActive ? "border-[#00338D] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white hover:border-[#1E49E2]"
        }`}
        data-testid="dropzone-rcm"
      >
        <input {...getRcmInputProps()} data-testid="input-rcm-file" />
        <Upload className="mx-auto mb-3 h-10 w-10 text-[#1E49E2]" />
        <p className="text-[13px] font-bold text-[#0C233C]">Upload RCM Document</p>
        <p className="mt-1 text-[12px] text-[#8492A6]">PDF, DOCX, XLSX</p>
      </div>
      {rcmFile && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#E2E6EF] px-4 py-3" data-testid="rcm-file-item">
          <span className="truncate text-[13px] font-semibold text-[#0C233C]">{rcmFile.name}</span>
          <button type="button" onClick={removeRcmFile} className="text-[#E5001B]" data-testid="button-remove-rcm">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  const renderLanding = () => (
    <div data-regulatory-testing-landing="true" className="space-y-9">
      <section className="space-y-5">
        {sectionHeader(
          "Process",
          "Comparison Workspace",
          "Choose a comparison path, select source documents, and run one analysis without adding any synthetic data.",
        )}
        {renderPathSelector()}
      </section>

      <section className="space-y-5" data-regulatory-testing-reg-setup="true">
        {sectionHeader("Analysis Setup", mode === "regulation" ? "Regulation vs Regulation" : "RCM vs Regulation")}
        {mode === "regulation" ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
              <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
                {renderRegulationSlot("a", "Regulation A", regulationSlotA, {
                  getRootProps: getRegulationARootProps,
                  getInputProps: getRegulationAInputProps,
                  isDragActive: isRegulationADragActive,
                })}
                <div className="hidden items-center justify-center lg:flex">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#1E49E2]">
                    <GitMerge className="h-5 w-5" />
                  </div>
                </div>
                {renderRegulationSlot("b", "Regulation B", regulationSlotB, {
                  getRootProps: getRegulationBRootProps,
                  getInputProps: getRegulationBInputProps,
                  isDragActive: isRegulationBDragActive,
                })}
              </div>
            </div>
            {renderReadinessCard()}
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]" data-regulatory-testing-rcm-setup="true">
            <div className="grid min-w-0 gap-5 lg:grid-cols-2">
              {renderRcmDocumentPicker()}
              {renderRcmRegulationPicker()}
            </div>
            {renderReadinessCard()}
          </div>
        )}

        <button
          type="button"
          onClick={handleRunComparison}
          disabled={mode === "regulation" ? !canRunRegulationComparison : !canRunRcmComparison}
          className={`inline-flex w-full items-center justify-center gap-3 rounded-xl px-8 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#8492A6] disabled:hover:translate-y-0 ${
            mode === "regulation" ? "bg-[#7213EA]" : "bg-[#1E49E2]"
          }`}
          data-testid="button-run-comparison"
        >
          <Play className="h-5 w-5" />
          {mode === "regulation" ? "Run Regulatory Comparison" : "Run RCM Assessment"}
        </button>
      </section>
    </div>
  );

  const renderSourceStrip = () => (
    <div data-regulatory-testing-source-strip="true" className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Analysis Complete</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[15px] font-bold text-[#0C233C]">
            <span className="max-w-[320px] truncate" title={sourceAName}>{sourceALabel}</span>
            <span className="text-[#8492A6]">vs</span>
            <span className="max-w-[320px] truncate" title={sourceBName}>{sourceBLabel}</span>
          </div>
          <p className="mt-1 text-[12px] text-[#8492A6]">
            Request ID: {comparisonResults?.request_id ?? "Data not available"} {comparisonResults?.model_used ? `- Model: ${comparisonResults.model_used}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleNewComparison} className="inline-flex items-center gap-2 rounded-lg bg-[#F0F2F7] px-4 py-2 text-[13px] font-semibold text-[#0C233C]" data-testid="button-new-comparison">
            <RotateCcw className="h-4 w-4" />
            Run Again
          </button>
          <button type="button" onClick={handleExportResults} className="inline-flex items-center gap-2 rounded-lg bg-[#00338D] px-4 py-2 text-[13px] font-semibold text-white" data-testid="button-export-results">
            <Download className="h-4 w-4" />
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );

  const renderCoverageBalance = () => {
    const shared = Math.max(sharedDomainCount, 0);
    const firstOnly = Math.max(sourceAOnlyCount, 0);
    const secondOnly = Math.max(sourceBOnlyCount, 0);
    const total = Math.max(shared + firstOnly + secondOnly, 1);

    return (
      <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
        <div className="text-[15px] font-bold text-[#0C233C]">Coverage Balance</div>
        <p className="mt-1 text-[13px] text-[#5A6478]">How many domains are shared versus only present in one source.</p>
        <div className="mt-5 flex h-10 overflow-hidden rounded-lg bg-[#F0F2F7]">
          <div className="bg-[#009A44]" style={{ width: `${(shared / total) * 100}%` }} title={`Shared: ${shared}`} />
          <div className="bg-[#1E49E2]" style={{ width: `${(firstOnly / total) * 100}%` }} title={`${sourceALabel} only: ${firstOnly}`} />
          <div className="bg-[#7213EA]" style={{ width: `${(secondOnly / total) * 100}%` }} title={`${sourceBLabel} only: ${secondOnly}`} />
        </div>
        <div className="mt-4 grid gap-3 text-[12px] text-[#5A6478] md:grid-cols-3">
          <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#009A44]" />Shared: <strong className="text-[#0C233C]">{shared || "Data not available"}</strong></span>
          <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#1E49E2]" />Only In {sourceALabel}: <strong className="text-[#0C233C]">{firstOnly || "Data not available"}</strong></span>
          <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#7213EA]" />Only In {sourceBLabel}: <strong className="text-[#0C233C]">{secondOnly || "Data not available"}</strong></span>
        </div>
      </div>
    );
  };

  const renderDifferenceRows = () => {
    const entries = domainAnalysisEntries.length > 0
      ? domainAnalysisEntries.slice(0, 7)
      : domainCoverageEntries.slice(0, 7).map(([domain]) => [domain, null] as const);

    if (entries.length === 0) {
      return <div className="rounded-xl border border-dashed border-[#E2E6EF] p-6 text-center text-[13px] text-[#5A6478]">Data not available</div>;
    }

    return (
      <div className="space-y-3">
        {entries.map(([domain, analysis]) => {
          const rawFirstScore = analysis?.source_scores?.[sourceAName] ?? 0;
          const rawSecondScore = analysis?.source_scores?.[sourceBName] ?? 0;
          const firstScore = Math.max(0, Math.min(100, rawFirstScore));
          const secondScore = Math.max(0, Math.min(100, rawSecondScore));
          const coverage = domainCoverage[domain];
          const status = analysis
            ? firstScore === secondScore
              ? "Aligned"
              : firstScore > secondScore
                ? `${sourceALabel} Stronger`
                : `${sourceBLabel} Stronger`
            : coverage?.coverage_pct === 100
              ? "Aligned"
              : "Coverage Gap";
          return (
            <div key={domain} className="rounded-xl border border-[#E2E6EF] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[13px] font-bold text-[#0C233C]">{formatDomain(domain)}</div>
                <span className="rounded-full bg-[#F0F2F7] px-3 py-1 text-[11px] font-semibold text-[#0C233C]">{status}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[12px] text-[#5A6478]">
                    <span>{sourceALabel}</span>
                    <span>{analysis ? `${firstScore.toFixed(0)}` : coverage?.present_in.includes(sourceAName) ? "Covered" : "Missing"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F0F2F7]">
                    <div className="h-2 rounded-full bg-[#1E49E2]" style={{ width: `${analysis ? firstScore : coverage?.present_in.includes(sourceAName) ? 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[12px] text-[#5A6478]">
                    <span>{sourceBLabel}</span>
                    <span>{analysis ? `${secondScore.toFixed(0)}` : coverage?.present_in.includes(sourceBName) ? "Covered" : "Missing"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F0F2F7]">
                    <div className="h-2 rounded-full bg-[#7213EA]" style={{ width: `${analysis ? secondScore : coverage?.present_in.includes(sourceBName) ? 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPriorityAreas = () => {
    const priorities = Object.entries(documentGaps)
      .flatMap(([doc, info]) => info.missing_domains.map(domain => ({ doc: formatSourceName(doc), domain, type: "Missing Coverage" })))
      .slice(0, 6);

    const rcmPriorities = suggestionEntries.slice(0, 6).map(([domain, count]) => ({
      doc: "RCM",
      domain,
      type: `${count} Suggestion${count === 1 ? "" : "s"}`,
    }));

    const rows = mode === "rcm" ? rcmPriorities : priorities;

    if (rows.length === 0) {
      return <div className="rounded-xl border border-dashed border-[#E2E6EF] p-6 text-center text-[13px] text-[#5A6478]">Data not available</div>;
    }

    return (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={`${row.doc}-${row.domain}-${index}`} className="rounded-xl border border-[#E2E6EF] p-4">
            <div className="text-[13px] font-bold text-[#0C233C]">{formatDomain(row.domain)}</div>
            <div className="mt-1 text-[12px] text-[#5A6478]">{row.type} in {row.doc}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderComparisonOverview = () => (
    <div data-regulatory-testing-comparison-overview="true" className="space-y-5">
      {sectionHeader("Analysis Results", "Comparison Overview")}
      <div className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
        <div className="text-[15px] font-bold text-[#0C233C]">What This Means</div>
        <p className="mt-2 text-[13px] leading-relaxed text-[#5A6478]">
          {comparisonInsight}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {renderMetricCard("Requirements Analysed", comparedControlCount, "Requirement statements extracted from the selected sources.", "#1E49E2")}
        {renderMetricCard("Domains Compared", totalDomains || "Data not available", "Total domains identified across both sources.", "#00338D")}
        {renderMetricCard("Shared Domains", sharedDomainCount || "Data not available", "Domains covered by both selected sources.", "#009A44")}
        {renderMetricCard(`${sourceALabel} Gaps`, sourceAGapCount || "Data not available", `Domains missing from ${sourceALabel}.`, "#EAAA00")}
        {renderMetricCard(`${sourceBLabel} Gaps`, sourceBGapCount || "Data not available", `Domains missing from ${sourceBLabel}.`, "#7213EA")}
      </div>
      {renderCoverageBalance()}
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Where The Differences Are</div>
          <div className="mt-5">{renderDifferenceRows()}</div>
        </div>
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Priority Review Areas</div>
          <div className="mt-5">{renderPriorityAreas()}</div>
        </div>
      </div>
    </div>
  );

  const renderCoverageByDomain = () => (
    <div data-regulatory-testing-domain-drilldown="true" className="space-y-5">
      {sectionHeader("Control Detail", "Coverage By Domain", "See which domains are covered by each selected source.")}
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Domain List</div>
          <div className="mt-4 space-y-2">
            {(domainCoverageEntries.length > 0 ? domainCoverageEntries : domainAnalysisEntries).slice(0, 12).map(([domain]) => (
              <div key={domain} className="rounded-xl border border-[#E2E6EF] px-3 py-2 text-[13px] font-semibold text-[#0C233C]">
                {formatDomain(domain)}
              </div>
            ))}
            {domainCoverageEntries.length === 0 && domainAnalysisEntries.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#E2E6EF] p-4 text-[13px] text-[#5A6478]">Data not available</div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Coverage Table</div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E6EF] text-[11px] uppercase tracking-[2px] text-[#8492A6]">
                  <th className="py-3 pr-4">Domain</th>
                  <th className="py-3 pr-4">{sourceALabel}</th>
                  <th className="py-3 pr-4">{sourceBLabel}</th>
                  <th className="py-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {domainCoverageEntries.slice(0, 10).map(([domain, info]) => (
                  <tr key={domain} className="border-b border-[#E2E6EF]">
                    <td className="py-4 pr-4 font-semibold text-[#0C233C]">{formatDomain(domain)}</td>
                    <td className="py-4 pr-4 text-[#5A6478]">{info.present_in.includes(sourceAName) ? "Covered" : "Not identified"}</td>
                    <td className="py-4 pr-4 text-[#5A6478]">{info.present_in.includes(sourceBName) ? "Covered" : "Not identified"}</td>
                    <td className="py-4 pr-4">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${info.coverage_pct === 100 ? "bg-[#EDFBF5] text-[#009A44]" : "bg-[#FFFBEB] text-[#0C233C]"}`}>
                        {info.coverage_pct === 100 ? "Match" : "Partial"}
                      </span>
                    </td>
                  </tr>
                ))}
                {domainCoverageEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#5A6478]">Data not available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGapMatrix = () => (
    <div data-regulatory-testing-gap-workbench="true" className="space-y-5">
      {sectionHeader("Gap Analysis", "Gap Matrix", "Review missing domains by source. A check means the source covers the domain.")}
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Source Coverage</div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E6EF] text-[11px] uppercase tracking-[2px] text-[#8492A6]">
                  <th className="py-3 pr-4">Domain</th>
                  <th className="py-3 pr-4">{sourceALabel}</th>
                  <th className="py-3 pr-4">{sourceBLabel}</th>
                  <th className="py-3 pr-4">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {domainCoverageEntries.slice(0, 14).map(([domain, info]) => (
                  <tr key={domain} className="border-b border-[#E2E6EF]">
                    <td className="py-4 pr-4 font-semibold text-[#0C233C]">{formatDomain(domain)}</td>
                    <td className="py-4 pr-4">{info.present_in.includes(sourceAName) ? <CheckCircle2 className="h-4 w-4 text-[#009A44]" /> : <X className="h-4 w-4 text-[#E5001B]" />}</td>
                    <td className="py-4 pr-4">{info.present_in.includes(sourceBName) ? <CheckCircle2 className="h-4 w-4 text-[#009A44]" /> : <X className="h-4 w-4 text-[#E5001B]" />}</td>
                    <td className="py-4 pr-4 text-[#5A6478]">{info.coverage_pct.toFixed(0)}%</td>
                  </tr>
                ))}
                {domainCoverageEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#5A6478]">Data not available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <div className="text-[15px] font-bold text-[#0C233C]">Priority Gaps</div>
          <div className="mt-5">{renderPriorityAreas()}</div>
        </div>
      </div>
    </div>
  );

  const renderFormattedReport = () => (
    <div data-regulatory-testing-report-preview="true" className="space-y-5">
      {sectionHeader("Report", "Formatted Report", "Preview the generated markdown report with TRACE report styling.")}
      <div className="rounded-2xl border border-[#E2E6EF] bg-white p-8 shadow-sm">
        {reportMarkdown ? (
          <div className="mx-auto max-w-[980px] rounded-xl border border-[#D9E2F2] bg-white p-8 shadow-sm">
            <div className="mb-6 border-b border-[#E2E6EF] pb-4">
              <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Regulatory Comparison Report</div>
              <div className="mt-2 text-[20px] font-bold text-[#0C233C]">{sourceALabel} vs. {sourceBLabel}</div>
              <div className="mt-1 text-[12px] text-[#8492A6]">Request ID: {comparisonResults?.request_id ?? "Data not available"}</div>
            </div>
            <ScrollArea className="h-[620px] pr-4">
              <div className={markdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{formattedReportMarkdown}</ReactMarkdown>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="py-12 text-center text-[13px] text-[#5A6478]">Data not available</div>
        )}
      </div>
    </div>
  );

  const renderResultWorkbench = () => (
    <div className="space-y-6">
      {renderSourceStrip()}
      <div className="grid gap-2 rounded-2xl border border-[#E2E6EF] bg-white p-2 shadow-sm md:grid-cols-4">
        {[
          ["summary", "Summary"],
          ["domain-drilldown", "Coverage By Domain"],
          ["gap-analysis", "Gap Analysis"],
          ["report", "Report"],
        ].map(([view, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => setResultView(view as RegulatoryResultView)}
            className={`rounded-xl px-4 py-3 text-[13px] font-bold transition-colors ${
              resultView === view ? "bg-[#00338D] text-white" : "text-[#0C233C] hover:bg-[#F0F2F7]"
            }`}
            data-testid={`tab-${view}`}
          >
            {label}
          </button>
        ))}
      </div>

      {resultView === "summary" && renderComparisonOverview()}
      {resultView === "domain-drilldown" && renderCoverageByDomain()}
      {resultView === "gap-analysis" && renderGapMatrix()}
      {resultView === "report" && renderFormattedReport()}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={handleExportResults} className="inline-flex items-center gap-2 rounded-xl bg-[#00338D] px-5 py-3 text-[13px] font-bold text-white" data-testid="button-export-results">
          <Download className="h-4 w-4" />
          Export JSON
        </button>
        {hasReportExport && (
          <>
            <button type="button" onClick={handleExportMarkdown} className="inline-flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-5 py-3 text-[13px] font-bold text-[#00338D]" data-testid="button-export-markdown">
              <Download className="h-4 w-4" />
              Export Report
            </button>
            <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-5 py-3 text-[13px] font-bold text-[#00338D]" data-testid="button-export-pdf">
              <Download className="h-4 w-4" />
              Export PDF
            </button>
          </>
        )}
        <button type="button" onClick={handleNewComparison} className="inline-flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-5 py-3 text-[13px] font-bold text-[#0C233C]" data-testid="button-new-comparison">
          <RotateCcw className="h-4 w-4" />
          New Comparison
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7]" style={pageFontStyle}>
      <HeroSection title="Regulatory Testing" subtitle="Compare regulations or assess RCM documents against regulatory requirements" icon={Scale} />
      <TracePageBody width="wide" tint contentClassName="space-y-9">
        {!comparisonResults && (
          <HowItWorks
            steps={[
              { number: 1, title: "Select Sources", desc: "Choose Regulation vs Regulation or RCM vs Regulation and select uploaded or library-backed source documents.", color: "#7213EA" },
              { number: 2, title: "Run Analysis", desc: "TRACE extracts obligations, aligns domains, and identifies differences using the existing comparison services.", color: "#1E49E2" },
              { number: 3, title: "Review Output", desc: "Scan the comparison overview, drill into domain gaps, and export the evidence-backed report.", color: "#098E7E" },
            ]}
          />
        )}

        {!isProcessing && !comparisonResults && renderLanding()}

        {isProcessing && (
          <div className="rounded-2xl border border-[#E2E6EF] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#E2E6EF] border-t-[#1E49E2]" />
            <p className="mt-5 text-[17px] font-bold text-[#0C233C]">
              {mode === "regulation" ? "Comparing regulations..." : "Assessing RCM document..."}
            </p>
            <p className="mt-2 text-[13px] text-[#5A6478]">
              {mode === "regulation"
                ? `Comparing ${getRegulationSlotSummary(regulationSlotA, "Regulation A")} vs ${getRegulationSlotSummary(regulationSlotB, "Regulation B")}`
                : getRcmProcessingDescription(rcmRegulationSource, selectedLibraryDocIds, regulationFiles)}
            </p>
          </div>
        )}

        {comparisonResults && (
          !comparisonResults.success ? (
            <div className="rounded-2xl border border-[#FEEBED] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[17px] font-bold text-[#E5001B]">
                <AlertCircle className="h-5 w-5" />
                Analysis Failed
              </div>
              <p className="mt-3 text-[13px] text-[#5A6478]">{comparisonResults.error || "Unknown error occurred"}</p>
            </div>
          ) : (
            renderResultWorkbench()
          )
        )}
      </TracePageBody>
    </div>
  );
}
