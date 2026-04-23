import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, Download, RotateCcw, Scale, FileCheck, ChevronRight, AlertCircle, CheckCircle2, GitMerge, Library, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
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
    toast({
      title: "Reset",
      description: "Ready for new comparison",
    });
  };

  const handleModeSwitch = (newMode: "regulation" | "rcm") => {
    if (newMode !== mode) {
      setMode(newMode);
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
    <div className="rounded-xl border border-[#00338D]/15 bg-gradient-to-b from-[#00338D]/[0.03] to-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#00338D]">{title}</h3>
          <p className="text-sm text-muted-foreground">
            Choose an uploaded document or a regulation already stored in the library
          </p>
        </div>
        <Badge variant="secondary">{slot.source === "upload" ? "Upload" : "Library"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={slot.source === "upload" ? "default" : "outline"}
          className={slot.source === "upload" ? "bg-[#00338D] hover:bg-[#002970]" : "border-[#00338D]/20"}
          onClick={() => setRegulationSlotSource(slotKey, "upload")}
        >
          Upload
        </Button>
        <Button
          type="button"
          variant={slot.source === "library" ? "default" : "outline"}
          className={slot.source === "library" ? "bg-[#00338D] hover:bg-[#002970]" : "border-[#00338D]/20"}
          onClick={() => setRegulationSlotSource(slotKey, "library")}
        >
          Library
        </Button>
      </div>

      {slot.source === "upload" ? (
        <div className="space-y-3">
          <div
            {...dropzone.getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dropzone.isDragActive
                ? "border-[#00338D] bg-[#00338D]/5"
                : "border-[#00338D]/20 hover:border-[#00338D]/45"
            }`}
            data-testid={`dropzone-regulation-${slotKey}`}
          >
            <input {...dropzone.getInputProps()} data-testid={`input-regulation-${slotKey}`} />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {dropzone.isDragActive ? `Drop ${title} here...` : `Upload ${title}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
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
            <div className="space-y-1.5 max-h-60 overflow-auto pr-1">
              {libraryDocuments.map((doc) => {
                const isSelected = slot.libraryDocumentId === doc.document_id;
                return (
                  <button
                    key={`${slotKey}-${doc.document_id}`}
                    type="button"
                    onClick={() => setRegulationSlotLibraryDocument(slotKey, doc.document_id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-[#00338D]/10 border border-[#00338D]/30"
                        : "bg-[#F8FAFF] border border-transparent hover:bg-[#EEF4FF]"
                    }`}
                    data-testid={`button-library-regulation-${slotKey}-${doc.document_id}`}
                  >
                    <div className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-[#00338D] border-[#00338D]" : "border-muted-foreground/40"
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.framework_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
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

  return (
    <div className="h-full flex flex-col" style={pageFontStyle}>
      <HeroSection title="Regulatory Testing" subtitle="Compare regulations or assess RCM documents against regulatory requirements" icon={Scale} />
      <div className="flex-1 overflow-auto bg-[#F0F2F7] px-6 py-7">
      <div className="mx-auto max-w-[1180px] space-y-6">

        <HowItWorks
          steps={[
            { number: 1, title: "Select Mode & Sources", desc: "Choose Regulation Comparison to benchmark two frameworks, or RCM Comparison to assess an RCM against a regulation. Pick the library or upload source documents.", color: "#7213EA" },
            { number: 2, title: "Run Comparison", desc: "APEX parses obligations, aligns requirements, and identifies overlaps, gaps, and deltas between the selected documents.", color: "#1E49E2" },
            { number: 3, title: "Review & Export", desc: "Explore mapped obligations, coverage gaps, and supporting citations. Export the analysis as a structured report for downstream review.", color: "#098E7E" },
          ]}
        />

        <div className="mx-auto flex w-fit flex-wrap justify-center gap-2 rounded-full border border-[#00338D]/12 bg-white/85 p-2 shadow-[0_18px_36px_-24px_rgba(12,35,60,0.4)] backdrop-blur">
          <Button
            variant={mode === "regulation" ? "default" : "outline"}
            onClick={() => handleModeSwitch("regulation")}
            className={`gap-2 rounded-full px-5 ${mode === "regulation" ? primaryButtonClass : secondaryButtonClass}`}
            data-testid="button-regulation-mode"
          >
            <Scale className="h-4 w-4" />
            Regulation Comparison
          </Button>
          <Button
            variant={mode === "rcm" ? "default" : "outline"}
            onClick={() => handleModeSwitch("rcm")}
            className={`gap-2 rounded-full px-5 ${mode === "rcm" ? primaryButtonClass : secondaryButtonClass}`}
            data-testid="button-rcm-mode"
          >
            <FileCheck className="h-4 w-4" />
            RCM Comparison
          </Button>
        </div>

        {/* ── Regulation Comparison / RCM Mode ─────────────────────────────── */}
        {!isProcessing && !comparisonResults && (
          <>
            {/* ── Regulation file upload (regulation comparison mode only) ── */}
            {mode === "regulation" && (
              <Card className={`${elevatedCardClass} border-[#00338D]/15`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitMerge className="h-5 w-5 text-[#00338D]" />
                    Compare Two Regulations
                    <Badge variant="secondary" className="ml-2">
                      Mixed sources supported
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Configure Regulation A and Regulation B using either uploaded files or items already ingested in the Regulatory Library.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {renderRegulationSlot("a", "Regulation A", regulationSlotA, {
                      getRootProps: getRegulationARootProps,
                      getInputProps: getRegulationAInputProps,
                      isDragActive: isRegulationADragActive,
                    })}
                    {renderRegulationSlot("b", "Regulation B", regulationSlotB, {
                      getRootProps: getRegulationBRootProps,
                      getInputProps: getRegulationBInputProps,
                      isDragActive: isRegulationBDragActive,
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Library document selection (RCM mode only) ── */}
            {mode === "rcm" && (
              <Card className={`${elevatedCardClass} border-[#00338D]/15`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Library className="h-5 w-5 text-[#00338D]" />
                    Choose Regulations for RCM Assessment
                    <Badge variant="secondary" className="ml-2">
                      {rcmRegulationSource === "library" ? `${selectedLibraryDocIds.length} selected` : `${regulationFiles.length} uploaded`}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Select regulations from the library or upload regulation files directly for this assessment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={rcmRegulationSource === "library" ? "default" : "outline"}
                      className={`rounded-full ${rcmRegulationSource === "library" ? primaryButtonClass : secondaryButtonClass}`}
                      onClick={() => setRcmRegulationSource("library")}
                      data-testid="button-rcm-source-library"
                    >
                      Library
                    </Button>
                    <Button
                      type="button"
                      variant={rcmRegulationSource === "upload" ? "default" : "outline"}
                      className={`rounded-full ${rcmRegulationSource === "upload" ? primaryButtonClass : secondaryButtonClass}`}
                      onClick={() => setRcmRegulationSource("upload")}
                      data-testid="button-rcm-source-upload"
                    >
                      Upload
                    </Button>
                  </div>

                  {rcmRegulationSource === "library" ? (
                    libraryDocuments.length === 0 ? (
                      <div className="text-center py-8 rounded-lg border border-dashed border-[#00338D]/15">
                        <Library className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No regulations in library. Ingest documents in the Regulatory Library tab first, or switch to upload.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {libraryDocuments.length} document{libraryDocuments.length !== 1 ? "s" : ""} available
                          </p>
                          {selectedLibraryDocIds.length > 0 && (
                            <button
                              onClick={() => setSelectedLibraryDocIds([])}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                              data-testid="button-clear-rcm-library-selection"
                            >
                              Clear selection
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-auto">
                          {libraryDocuments.map((doc) => {
                            const isSelected = selectedLibraryDocIds.includes(doc.document_id);
                            return (
                              <button
                                key={doc.document_id}
                                onClick={() => toggleLibraryDoc(doc.document_id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                                  isSelected
                                    ? "bg-[#00338D]/10 border border-[#00338D]/30"
                                    : "bg-[#F8FAFF] border border-transparent hover:bg-[#EEF4FF]"
                                }`}
                                data-testid={`button-rcm-library-doc-${doc.document_id}`}
                              >
                                <div className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected ? "bg-[#00338D] border-[#00338D]" : "border-muted-foreground/40"
                                }`}>
                                  {isSelected && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{doc.framework_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
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
                      </>
                    )
                  ) : (
                    <div className="space-y-4">
                      <div
                        {...getRcmRegulationsRootProps()}
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                          isRcmRegulationsDragActive
                            ? "border-[#00338D] bg-[#00338D]/5"
                            : "border-[#00338D]/20 hover:border-[#00338D]/45"
                        }`}
                        data-testid="dropzone-rcm-regulations"
                      >
                        <input {...getRcmRegulationsInputProps()} data-testid="input-rcm-regulations" />
                        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        {isRcmRegulationsDragActive ? (
                          <p className="text-[#00338D] font-medium">Drop regulation files here...</p>
                        ) : (
                          <>
                            <p className="text-foreground font-medium">
                              Drag & drop regulation files here
                            </p>
                            <p className="text-muted-foreground text-sm mt-1">
                              or click to browse (PDF, DOCX, TXT, MD, CSV, XLSX, XLS, PNG, JPG)
                            </p>
                          </>
                        )}
                      </div>

                      {regulationFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Uploaded Regulations</p>
                            <button
                              type="button"
                              onClick={() => setRegulationFiles([])}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                              data-testid="button-clear-rcm-uploaded-regulations"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="space-y-2 max-h-56 overflow-auto pr-1">
                            {regulationFiles.map((file, index) => (
                              <div
                                key={`${file.name}-${file.size}-${index}`}
                                className="flex items-center justify-between rounded-xl border border-[#00338D]/10 bg-[#F8FAFF] p-3"
                                data-testid={`rcm-regulation-file-${index}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-4 w-4 text-[#00338D]" />
                                  <span className="text-sm truncate">{file.name}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {(file.size / 1024).toFixed(1)} KB
                                  </Badge>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeUploadedRcmRegulationFile(index)}
                                  data-testid={`button-remove-rcm-regulation-${index}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {mode === "rcm" && (
              <Card className={surfaceCardClass}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-[#00338D]" />
                    Upload RCM Document
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    {...getRcmRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isRcmDragActive
                        ? "border-[#00338D] bg-[#00338D]/5"
                        : "border-[#00338D]/20 bg-[#FBFCFF] hover:border-[#1E49E2]/45"
                    }`}
                    data-testid="dropzone-rcm"
                  >
                    <input {...getRcmInputProps()} data-testid="input-rcm-file" />
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    {isRcmDragActive ? (
                      <p className="text-primary font-medium">Drop RCM document here...</p>
                    ) : (
                      <>
                        <p className="text-foreground font-medium">
                          Drag & drop RCM document here
                        </p>
                        <p className="text-muted-foreground text-sm mt-1">
                          or click to browse (PDF, DOCX, XLSX)
                        </p>
                      </>
                    )}
                  </div>

                  {rcmFile && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">RCM Document</p>
                      <div
                        className="flex items-center justify-between rounded-xl border border-[#00338D]/10 bg-[#F8FAFF] p-3"
                        data-testid="rcm-file-item"
                      >
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-green-500" />
                          <span className="text-sm truncate max-w-xs">{rcmFile.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {(rcmFile.size / 1024).toFixed(1)} KB
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={removeRcmFile}
                          data-testid="button-remove-rcm"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              onClick={handleRunComparison}
              disabled={mode === "regulation" ? !canRunRegulationComparison : !canRunRcmComparison}
              className={`w-full rounded-2xl py-6 text-base ${primaryButtonClass}`}
              data-testid="button-run-comparison"
            >
              <Play className="h-4 w-4 mr-2" />
              {mode === "regulation" ? "Run Regulatory Comparison" : "Run RCM Assessment"}
            </Button>
          </>
        )}

        {isProcessing && (
          <Card className="border-[#00338D]/12 bg-[linear-gradient(135deg,rgba(12,35,60,0.96)_0%,rgba(0,51,141,0.96)_60%,rgba(30,73,226,0.92)_100%)] text-white shadow-[0_28px_80px_-44px_rgba(0,51,141,0.8)]">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                <p className="text-lg font-medium">
                  {mode === "regulation" ? "Comparing regulations..." : "Assessing RCM document..."}
                </p>
                <p className="text-sm text-white/75">
                  {mode === "regulation"
                    ? `Comparing ${getRegulationSlotSummary(regulationSlotA, "Regulation A")} vs ${getRegulationSlotSummary(regulationSlotB, "Regulation B")}`
                    : getRcmProcessingDescription(rcmRegulationSource, selectedLibraryDocIds, regulationFiles)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {comparisonResults && (
          <>
            {!comparisonResults.success ? (
              <Card className="border-destructive/40 bg-white shadow-[0_20px_60px_-38px_rgba(220,38,38,0.35)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    Analysis Failed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive">{comparisonResults.error || "Unknown error occurred"}</p>
                </CardContent>
              </Card>
            ) : mode === "rcm" ? (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className={`${tabListClass} grid-cols-3`}>
                  <TabsTrigger value="summary" className={tabTriggerClass} data-testid="tab-rcm-summary">Summary</TabsTrigger>
                  <TabsTrigger value="executive" className={tabTriggerClass} data-testid="tab-rcm-executive">Executive Report</TabsTrigger>
                  <TabsTrigger value="domains" className={tabTriggerClass} data-testid="tab-rcm-domains">Domain Reports</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <Card className={surfaceCardClass}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        RCM Compliance Summary
                      </CardTitle>
                      <CardDescription>
                        Request ID: {comparisonResults.request_id} | Model: {comparisonResults.model_used}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-primary">{comparisonResults.filenames?.length || 0}</p>
                          <p className="text-sm text-muted-foreground">Files Analyzed</p>
                        </div>
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-primary">{Object.keys(comparisonResults.domain_reports || {}).length}</p>
                          <p className="text-sm text-muted-foreground">Domains Covered</p>
                        </div>
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-green-500">
                            {comparisonResults.success ? "Complete" : "Failed"}
                          </p>
                          <p className="text-sm text-muted-foreground">Status</p>
                        </div>
                      </div>

                      {comparisonResults.filenames && comparisonResults.filenames.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Files Analyzed</h4>
                          <div className="flex flex-wrap gap-2">
                            {comparisonResults.filenames.map((name, idx) => (
                              <Badge key={idx} variant="secondary">{name}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {comparisonResults.suggestions_summary_counts && Object.keys(comparisonResults.suggestions_summary_counts).length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Remediation Suggestions by Domain</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(comparisonResults.suggestions_summary_counts).map(([domain, count]) => (
                              <div key={domain} className="flex items-center justify-between rounded-xl border border-[#00338D]/10 bg-[#F8FAFF] p-3">
                                <span className="text-sm font-medium capitalize">{domain.replace(/_/g, " ")}</span>
                                <Badge variant="outline">{count} suggestion{count !== 1 ? "s" : ""}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="executive" className="space-y-4">
                  <Card className={surfaceCardClass}>
                    <CardHeader>
                      <CardTitle>Executive Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparisonResults.executive_summary ? (
                        <ScrollArea className="h-[600px]">
                          <div className={markdownClass}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {comparisonResults.executive_summary}
                            </ReactMarkdown>
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No executive summary available</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="domains" className="space-y-4">
                  {comparisonResults.domain_reports && Object.keys(comparisonResults.domain_reports).length > 0 ? (
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-4 pr-4">
                        {Object.entries(comparisonResults.domain_reports).map(([domain, report], idx) => (
                          <Collapsible key={idx}>
                            <Card className={surfaceCardClass}>
                              <CollapsibleTrigger className="w-full">
                                <CardHeader className="flex flex-row items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                    <CardTitle className="text-base capitalize">{domain.replace(/_/g, " ")}</CardTitle>
                                  </div>
                                  {comparisonResults.suggestions_summary_counts?.[domain] !== undefined && (
                                    <Badge variant="secondary" className="shrink-0">
                                      {comparisonResults.suggestions_summary_counts[domain]} suggestion{comparisonResults.suggestions_summary_counts[domain] !== 1 ? "s" : ""}
                                    </Badge>
                                  )}
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="pt-0">
                                  <div className={markdownClass}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {report}
                                    </ReactMarkdown>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <Card className={surfaceCardClass}>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No domain reports available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className={`${tabListClass} grid-cols-5`}>
                  <TabsTrigger value="summary" className={tabTriggerClass} data-testid="tab-summary">Summary</TabsTrigger>
                  <TabsTrigger value="frameworks" className={tabTriggerClass} data-testid="tab-frameworks">Frameworks</TabsTrigger>
                  <TabsTrigger value="controls" className={tabTriggerClass} data-testid="tab-controls">Controls</TabsTrigger>
                  <TabsTrigger value="gaps" className={tabTriggerClass} data-testid="tab-gaps">Gap Analysis</TabsTrigger>
                  <TabsTrigger value="report" className={tabTriggerClass} data-testid="tab-report">Report</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <Card className={surfaceCardClass}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        Analysis Summary
                      </CardTitle>
                      <CardDescription>
                        Request ID: {comparisonResults.request_id} | Model: {comparisonResults.model_used}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-primary">{comparisonResults.documents?.length || 0}</p>
                          <p className="text-sm text-muted-foreground">Documents</p>
                        </div>
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-primary">{comparisonResults.extracted_controls || 0}</p>
                          <p className="text-sm text-muted-foreground">Controls Extracted</p>
                        </div>
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-primary">{comparisonResults.control_groups || 0}</p>
                          <p className="text-sm text-muted-foreground">Control Groups</p>
                        </div>
                        <div className={statCardClass}>
                          <p className="text-2xl font-bold text-green-500">
                            {comparisonResults.success ? "Complete" : "Failed"}
                          </p>
                          <p className="text-sm text-muted-foreground">Status</p>
                        </div>
                      </div>

                      {comparisonResults.stringency_analysis?.overall_stringency && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Overall Stringency Scores</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(comparisonResults.stringency_analysis.overall_stringency).map(([doc, data]) => (
                              <div key={doc} className="rounded-xl border border-[#00338D]/10 bg-[#F8FAFF] p-3 space-y-2">
                                <p className="text-sm font-medium truncate" title={doc}>{doc}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all"
                                      style={{ width: `${Math.min(100, data.average_stringency)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-mono">{data.average_stringency.toFixed(1)}</span>
                                </div>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  <span>Median: {data.median_stringency.toFixed(1)}</span>
                                  <span>Controls: {data.control_count}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {comparisonResults.documents && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Documents Analyzed</h4>
                          <div className="flex flex-wrap gap-2">
                            {comparisonResults.documents.map((doc, idx) => (
                              <Badge key={idx} variant="secondary">{doc}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="frameworks" className="space-y-4">
                  {comparisonResults.document_analyses && Object.keys(comparisonResults.document_analyses).length > 0 ? (
                    Object.entries(comparisonResults.document_analyses).map(([docName, analysis], idx) => (
                      <Card key={idx} className={surfaceCardClass}>
                        <CardHeader>
                          <CardTitle className="text-lg">{docName}</CardTitle>
                          <CardDescription>{analysis.framework_name}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Issuing Authority</p>
                              <p className="text-sm">{analysis.issuing_authority || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Target Industry</p>
                              <p className="text-sm">{analysis.target_industry || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Regulatory Approach</p>
                              <p className="text-sm">{analysis.regulatory_approach || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Governance Model</p>
                              <p className="text-sm">{analysis.governance_model || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Enforcement Style</p>
                              <p className="text-sm">{analysis.enforcement_style || "N/A"}</p>
                            </div>
                          </div>
                          {analysis.key_focus_areas && analysis.key_focus_areas.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-2">Key Focus Areas</p>
                              <div className="flex flex-wrap gap-2">
                                {analysis.key_focus_areas.map((area, tidx) => (
                                  <Badge key={tidx} variant="outline">{area}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className={surfaceCardClass}>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No framework analysis available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="controls" className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    {comparisonResults.stringency_analysis?.control_groups && comparisonResults.stringency_analysis.control_groups.length > 0 ? (
                      comparisonResults.stringency_analysis.control_groups.map((group, gidx) => (
                        <Collapsible key={gidx} className="mb-4">
                          <Card className={surfaceCardClass}>
                            <CollapsibleTrigger className="w-full">
                              <CardHeader className="flex flex-row items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                  <div className="text-left min-w-0">
                                    <CardTitle className="text-base capitalize">{group.control_domain.replace(/_/g, " ")}</CardTitle>
                                    <p className="text-xs text-muted-foreground">Risk: {group.risk_addressed}</p>
                                  </div>
                                </div>
                                <Badge variant="secondary" className="shrink-0">Score: {group.baseline_stringency.overall.toFixed(1)}</Badge>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="space-y-3 pt-0">
                                <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <Badge variant="outline">Most Stringent</Badge>
                                    <span className="text-xs text-muted-foreground">{group.most_stringent_source}</span>
                                  </div>
                                  <p className="text-sm">{group.most_stringent_control}</p>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Prescriptive</p>
                                      <p className="font-medium">{group.baseline_stringency.prescriptiveness}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Measurability</p>
                                      <p className="font-medium">{group.baseline_stringency.measurability}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Enforcement</p>
                                      <p className="font-medium">{group.baseline_stringency.enforcement}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Scope</p>
                                      <p className="font-medium">{group.baseline_stringency.scope}</p>
                                    </div>
                                    <div className="text-center p-2 bg-background rounded">
                                      <p className="text-xs text-muted-foreground">Independence</p>
                                      <p className="font-medium">{group.baseline_stringency.independence}</p>
                                    </div>
                                  </div>
                                </div>
                                {group.comparisons && group.comparisons.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium">Comparisons ({group.comparisons.length})</p>
                                    {group.comparisons.map((comp, cidx) => (
                                      <div key={cidx} className="rounded-xl border border-[#00338D]/10 bg-[#F8FAFF] p-2 text-sm">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="font-medium truncate">{comp.source}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {comp.compliance_percentage.toFixed(0)}% compliance
                                          </Badge>
                                        </div>
                                        <p className="text-muted-foreground text-xs">{comp.control_statement}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      ))
                    ) : (
                      <Card className={surfaceCardClass}>
                        <CardContent className="py-8 text-center text-muted-foreground">
                          No control groups available
                        </CardContent>
                      </Card>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="gaps" className="space-y-4">
                  {comparisonResults.gap_analysis ? (
                    <>
                      {/* Gap Summary */}
                      <Card className={surfaceCardClass}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <GitMerge className="h-5 w-5 text-orange-500" />
                            Gap Analysis Summary
                          </CardTitle>
                          <CardDescription>
                            {comparisonResults.gap_analysis.gap_summary.total_domains_found} domains identified across {comparisonResults.documents?.length || 0} documents
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div className={statCardClass}>
                              <p className="text-2xl font-bold text-primary">
                                {comparisonResults.gap_analysis.gap_summary.total_domains_found}
                              </p>
                              <p className="text-xs text-muted-foreground">Total Domains</p>
                            </div>
                            <div className={statCardClass}>
                              <p className="text-2xl font-bold text-green-500">
                                {comparisonResults.gap_analysis.gap_summary.domains_with_universal_coverage.length}
                              </p>
                              <p className="text-xs text-muted-foreground">Universal Coverage</p>
                            </div>
                            <div className={statCardClass}>
                              <p className="text-2xl font-bold text-blue-500">
                                {comparisonResults.gap_analysis.gap_summary.shared_control_groups}
                              </p>
                              <p className="text-xs text-muted-foreground">Shared Control Groups</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {comparisonResults.gap_analysis.gap_summary.most_gaps_in && (
                              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                                <p className="text-xs text-muted-foreground mb-1">Most gaps in</p>
                                <p className="font-medium truncate">{comparisonResults.gap_analysis.gap_summary.most_gaps_in}</p>
                              </div>
                            )}
                            {comparisonResults.gap_analysis.gap_summary.best_covered && (
                              <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                                <p className="text-xs text-muted-foreground mb-1">Best covered</p>
                                <p className="font-medium truncate">{comparisonResults.gap_analysis.gap_summary.best_covered}</p>
                              </div>
                            )}
                          </div>
                          {comparisonResults.gap_analysis.gap_summary.domains_with_universal_coverage.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2">Domains covered by all documents</p>
                              <div className="flex flex-wrap gap-1">
                                {comparisonResults.gap_analysis.gap_summary.domains_with_universal_coverage.map((d, i) => (
                                  <Badge key={i} variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs capitalize">
                                    {d.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Domain Coverage Heatmap */}
                      <Card className={surfaceCardClass}>
                        <CardHeader>
                          <CardTitle className="text-base">Domain Coverage by Document</CardTitle>
                          <CardDescription>Green = covered, Red = absent</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr>
                                  <th className="min-w-[140px] border border-[#00338D]/10 bg-[#F3F7FF] p-2 text-left font-medium">Domain</th>
                                  {(comparisonResults.documents || []).map((doc, i) => (
                                    <th key={i} className="max-w-[100px] border border-[#00338D]/10 bg-[#F3F7FF] p-2 text-center font-medium">
                                      <span className="block truncate" title={doc}>{doc}</span>
                                    </th>
                                  ))}
                                  <th className="border border-[#00338D]/10 bg-[#F3F7FF] p-2 text-center font-medium">Coverage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(comparisonResults.gap_analysis.domain_coverage).map(([domain, info], i) => (
                                  <tr key={i} className="even:bg-muted/20">
                                    <td className="p-2 border border-border capitalize font-medium">{domain.replace(/_/g, " ")}</td>
                                    {(comparisonResults.documents || []).map((doc, j) => (
                                      <td key={j} className="p-2 border border-border text-center">
                                        {info.present_in.includes(doc) ? (
                                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                        ) : (
                                          <X className="h-4 w-4 text-red-400 mx-auto" />
                                        )}
                                      </td>
                                    ))}
                                    <td className="p-2 border border-border text-center font-mono">
                                      {info.coverage_pct.toFixed(0)}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Per-document unique controls */}
                      <Card className={surfaceCardClass}>
                        <CardHeader>
                          <CardTitle className="text-base">Unique Controls per Document</CardTitle>
                          <CardDescription>Controls present in only one document (potential gaps in others)</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {Object.entries(comparisonResults.gap_analysis.document_gaps).map(([doc, info], i) => (
                            <Collapsible key={i}>
                              <div className="border rounded-lg">
                                <CollapsibleTrigger className="w-full">
                                  <div className="flex items-center justify-between p-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                      <span className="text-sm font-medium truncate">{doc}</span>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                      <Badge variant="outline" className="text-xs">
                                        {info.domain_coverage_pct.toFixed(0)}% domain coverage
                                      </Badge>
                                      {info.unique_controls.length > 0 && (
                                        <Badge variant="secondary" className="text-xs">
                                          {info.unique_controls.length} unique
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="px-3 pb-3 space-y-2 border-t">
                                    {info.missing_domains.length > 0 && (
                                      <div className="pt-2">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Missing domains</p>
                                        <div className="flex flex-wrap gap-1">
                                          {info.missing_domains.map((d, j) => (
                                            <Badge key={j} variant="outline" className="text-xs border-red-300 text-red-600 capitalize">
                                              {d.replace(/_/g, " ")}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {info.unique_controls.length > 0 && (
                                      <div className="pt-2">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">Controls unique to this document</p>
                                        <div className="space-y-2">
                                          {info.unique_controls.map((uc, j) => (
                                            <div key={j} className="p-2 bg-muted/30 rounded text-xs">
                                              <Badge variant="outline" className="capitalize text-xs mb-1">
                                                {uc.domain.replace(/_/g, " ")}
                                              </Badge>
                                              <p className="text-muted-foreground mt-1">{uc.control_statement}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {info.missing_domains.length === 0 && info.unique_controls.length === 0 && (
                                      <p className="pt-2 text-xs text-muted-foreground">No unique controls or missing domains</p>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          ))}
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card className={surfaceCardClass}>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No gap analysis available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="report" className="space-y-4">
                  <Card className={surfaceCardClass}>
                    <CardHeader>
                      <CardTitle>Final Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparisonResults.final_report ? (
                        <ScrollArea className="h-[600px]">
                          <div className={markdownClass}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {comparisonResults.final_report}
                            </ReactMarkdown>
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No report generated</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button
                onClick={handleExportResults}
                className={`rounded-full px-5 ${primaryButtonClass}`}
                data-testid="button-export-results"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              {(comparisonResults.final_report || comparisonResults.executive_summary || comparisonResults.domain_reports) && (
                <Button
                  variant="secondary"
                  onClick={handleExportMarkdown}
                  className={`rounded-full px-5 ${secondaryButtonClass}`}
                  data-testid="button-export-markdown"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              )}
              {(comparisonResults.final_report || comparisonResults.executive_summary || comparisonResults.domain_reports) && (
                <Button
                  variant="secondary"
                  onClick={handleExportPdf}
                  className={`rounded-full px-5 ${secondaryButtonClass}`}
                  data-testid="button-export-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleNewComparison}
                className={`rounded-full px-5 ${outlineButtonClass}`}
                data-testid="button-new-comparison"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New Comparison
              </Button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
