import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Play, Download, RotateCcw, Scale, FileCheck, ChevronRight, AlertCircle, CheckCircle2, GitMerge, Library, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, ComparisonResultsData } from "@/contexts/RegulatoryTestingContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  // Fetch library documents for RCM mode selection
  const [libraryFetched, setLibraryFetched] = useState(false);
  useEffect(() => {
    if (mode === "rcm" && !libraryFetched && libraryDocuments.length === 0) {
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

  const onDropRegulations = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        addRegulationFiles(acceptedFiles);
        toast({
          title: "Files uploaded",
          description: `${acceptedFiles.length} regulation file(s) added`,
        });
      }
    },
    [addRegulationFiles, toast]
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

  const {
    getRootProps: getRegulationRootProps,
    getInputProps: getRegulationInputProps,
    isDragActive: isRegulationDragActive,
  } = useDropzone({
    onDrop: onDropRegulations,
    multiple: true,
  });

  const {
    getRootProps: getRcmRootProps,
    getInputProps: getRcmInputProps,
    isDragActive: isRcmDragActive,
  } = useDropzone({
    onDrop: onDropRcm,
    multiple: false,
  });

  const removeRegulationFile = (index: number) => {
    setRegulationFiles(regulationFiles.filter((_, i) => i !== index));
  };

  const removeRcmFile = () => {
    setRcmFile(null);
  };

  const canRunRegulationComparison = regulationFiles.length >= 2;
  const canRunRcmComparison = selectedLibraryDocIds.length >= 1 && rcmFile !== null;

  const handleRunComparison = async () => {
    if (mode === "regulation" && !canRunRegulationComparison) {
      toast({
        title: "Insufficient files",
        description: "Please upload at least 2 regulation files to compare",
        variant: "destructive",
      });
      return;
    }

    if (mode === "rcm" && !canRunRcmComparison) {
      toast({
        title: "Insufficient input",
        description: "Please select at least one regulation from the library and upload an RCM document",
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
      formData.append("save_artifacts", "false");
      formData.append("output_format", "json");

      let endpoint: string;

      if (mode === "rcm") {
        endpoint = `/api/rcm_compliance_v2`;
        formData.append("document_ids", JSON.stringify(selectedLibraryDocIds));
        if (rcmFile) {
          formData.append("rcm_file", rcmFile);
        }
      } else {
        endpoint = `/api/compare-regulations`;
        formData.append("max_workers", "4");
        regulationFiles.forEach((file) => {
          formData.append("regulation_files", file);
        });
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

  const handleExportMarkdown = () => {
    let markdownContent = "";

    if (mode === "rcm") {
      if (!comparisonResults?.executive_summary && !comparisonResults?.domain_reports) return;
      const parts: string[] = [];
      if (comparisonResults.executive_summary) {
        parts.push("# Executive Summary\n\n" + comparisonResults.executive_summary);
      }
      if (comparisonResults.domain_reports) {
        Object.entries(comparisonResults.domain_reports).forEach(([domain, report]) => {
          parts.push(`# Domain: ${domain.replace(/_/g, " ")}\n\n${report}`);
        });
      }
      markdownContent = parts.join("\n\n---\n\n");
    } else {
      if (!comparisonResults?.final_report) return;
      markdownContent = comparisonResults.final_report;
    }

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

  const handleNewComparison = () => {
    resetForNewComparison();
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, hsl(262 80% 20% / 0.4), hsl(217 91% 20% / 0.3))", borderBottom: "1px solid hsl(217 91% 55% / 0.2)" }}>
        <Scale className="h-6 w-6 text-blue-400 flex-shrink-0" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Regulatory Testing</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Compare regulations or assess RCM documents against regulatory requirements</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex justify-center gap-2 mb-6 flex-wrap">
          <Button
            variant={mode === "regulation" ? "default" : "outline"}
            onClick={() => handleModeSwitch("regulation")}
            className="gap-2"
            data-testid="button-regulation-mode"
          >
            <Scale className="h-4 w-4" />
            Regulation Comparison
          </Button>
          <Button
            variant={mode === "rcm" ? "default" : "outline"}
            onClick={() => handleModeSwitch("rcm")}
            className="gap-2"
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Upload Regulation Files
                    <Badge variant="secondary" className="ml-2">
                      Min. 2 files required
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    {...getRegulationRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isRegulationDragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    data-testid="dropzone-regulations"
                  >
                    <input {...getRegulationInputProps()} data-testid="input-regulation-files" />
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    {isRegulationDragActive ? (
                      <p className="text-primary font-medium">Drop regulation files here...</p>
                    ) : (
                      <>
                        <p className="text-foreground font-medium">
                          Drag & drop regulation files here
                        </p>
                        <p className="text-muted-foreground text-sm mt-1">
                          or click to browse (PDF, DOCX, TXT)
                        </p>
                      </>
                    )}
                  </div>

                  {regulationFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Regulation Files ({regulationFiles.length})
                      </p>
                      <div className="space-y-2 max-h-48 overflow-auto">
                        {regulationFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                            data-testid={`regulation-file-${index}`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <span className="text-sm truncate max-w-xs">{file.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {(file.size / 1024).toFixed(1)} KB
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRegulationFile(index)}
                              data-testid={`button-remove-regulation-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Library document selection (RCM mode only) ── */}
            {mode === "rcm" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Library className="h-5 w-5" />
                    Select Regulations from Library
                    <Badge variant="secondary" className="ml-2">
                      {selectedLibraryDocIds.length} selected
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Choose one or more ingested regulation documents to assess your RCM against
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {libraryDocuments.length === 0 ? (
                    <div className="text-center py-8">
                      <Library className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No regulations in library. Ingest documents in the Regulatory Library tab first.
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
                                  ? "bg-primary/10 border border-primary/30"
                                  : "bg-muted/30 border border-transparent hover:bg-muted/60"
                              }`}
                            >
                              <div className={`h-5 w-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                              }`}>
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
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
                  )}
                </CardContent>
              </Card>
            )}

            {mode === "rcm" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Upload RCM Document
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    {...getRcmRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isRcmDragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
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
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
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
              className="w-full"
              data-testid="button-run-comparison"
            >
              <Play className="h-4 w-4 mr-2" />
              {mode === "regulation" ? "Run Regulatory Comparison" : "Run RCM Assessment"}
            </Button>
          </>
        )}

        {isProcessing && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-lg font-medium">
                  {mode === "regulation" ? "Comparing regulations..." : "Assessing RCM document..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mode === "regulation"
                    ? `Analyzing ${regulationFiles.length} regulation files`
                    : `Comparing RCM against ${selectedLibraryDocIds.length} library regulation(s)`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {comparisonResults && (
          <>
            {!comparisonResults.success ? (
              <Card className="border-destructive">
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
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary" data-testid="tab-rcm-summary">Summary</TabsTrigger>
                  <TabsTrigger value="executive" data-testid="tab-rcm-executive">Executive Report</TabsTrigger>
                  <TabsTrigger value="domains" data-testid="tab-rcm-domains">Domain Reports</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <Card>
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
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.filenames?.length || 0}</p>
                          <p className="text-sm text-muted-foreground">Files Analyzed</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{Object.keys(comparisonResults.domain_reports || {}).length}</p>
                          <p className="text-sm text-muted-foreground">Domains Covered</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
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
                              <div key={domain} className="flex items-center justify-between p-3 border rounded-lg">
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
                  <Card>
                    <CardHeader>
                      <CardTitle>Executive Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparisonResults.executive_summary ? (
                        <ScrollArea className="h-[600px]">
                          <div className="prose prose-sm dark:prose-invert max-w-none pr-4
                            prose-headings:text-foreground prose-headings:font-semibold
                            prose-h1:text-2xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4
                            prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
                            prose-p:text-muted-foreground prose-p:leading-relaxed
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-ul:my-2 prose-li:text-muted-foreground prose-li:my-1
                            prose-ol:my-2
                            prose-table:border-collapse prose-table:w-full prose-table:my-4
                            prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-foreground
                            prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-muted-foreground
                            prose-tr:even:bg-muted/30
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                            prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                            prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
                            prose-hr:border-border prose-hr:my-6">
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
                            <Card>
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
                                  <div className="prose prose-sm dark:prose-invert max-w-none
                                    prose-headings:text-foreground prose-headings:font-semibold
                                    prose-h1:text-xl prose-h1:mt-4 prose-h1:mb-3
                                    prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2
                                    prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1
                                    prose-p:text-muted-foreground prose-p:leading-relaxed
                                    prose-strong:text-foreground prose-strong:font-semibold
                                    prose-ul:my-2 prose-li:text-muted-foreground prose-li:my-1
                                    prose-ol:my-2
                                    prose-table:border-collapse prose-table:w-full prose-table:my-4
                                    prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-foreground
                                    prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-muted-foreground
                                    prose-tr:even:bg-muted/30
                                    prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                                    prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground">
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
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No domain reports available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                  <TabsTrigger value="frameworks" data-testid="tab-frameworks">Frameworks</TabsTrigger>
                  <TabsTrigger value="controls" data-testid="tab-controls">Controls</TabsTrigger>
                  <TabsTrigger value="gaps" data-testid="tab-gaps">Gap Analysis</TabsTrigger>
                  <TabsTrigger value="report" data-testid="tab-report">Report</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <Card>
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
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.documents?.length || 0}</p>
                          <p className="text-sm text-muted-foreground">Documents</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.extracted_controls || 0}</p>
                          <p className="text-sm text-muted-foreground">Controls Extracted</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold text-primary">{comparisonResults.control_groups || 0}</p>
                          <p className="text-sm text-muted-foreground">Control Groups</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
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
                              <div key={doc} className="p-3 border rounded-lg space-y-2">
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
                      <Card key={idx}>
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
                    <Card>
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
                          <Card>
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
                                      <div key={cidx} className="p-2 border rounded-lg text-sm">
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
                      <Card>
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
                      <Card>
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
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-primary">
                                {comparisonResults.gap_analysis.gap_summary.total_domains_found}
                              </p>
                              <p className="text-xs text-muted-foreground">Total Domains</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-green-500">
                                {comparisonResults.gap_analysis.gap_summary.domains_with_universal_coverage.length}
                              </p>
                              <p className="text-xs text-muted-foreground">Universal Coverage</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                              <p className="text-2xl font-bold text-blue-500">
                                {comparisonResults.gap_analysis.gap_summary.shared_control_groups}
                              </p>
                              <p className="text-xs text-muted-foreground">Shared Control Groups</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {comparisonResults.gap_analysis.gap_summary.most_gaps_in && (
                              <div className="p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Most gaps in</p>
                                <p className="font-medium truncate">{comparisonResults.gap_analysis.gap_summary.most_gaps_in}</p>
                              </div>
                            )}
                            {comparisonResults.gap_analysis.gap_summary.best_covered && (
                              <div className="p-3 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 rounded-lg">
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
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Domain Coverage by Document</CardTitle>
                          <CardDescription>Green = covered, Red = absent</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr>
                                  <th className="text-left p-2 border border-border bg-muted/50 font-medium min-w-[140px]">Domain</th>
                                  {(comparisonResults.documents || []).map((doc, i) => (
                                    <th key={i} className="p-2 border border-border bg-muted/50 font-medium text-center max-w-[100px]">
                                      <span className="block truncate" title={doc}>{doc}</span>
                                    </th>
                                  ))}
                                  <th className="p-2 border border-border bg-muted/50 font-medium text-center">Coverage</th>
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
                      <Card>
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
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No gap analysis available
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="report" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Final Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comparisonResults.final_report ? (
                        <ScrollArea className="h-[600px]">
                          <div className="prose prose-sm dark:prose-invert max-w-none pr-4
                            prose-headings:text-foreground prose-headings:font-semibold
                            prose-h1:text-2xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4
                            prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
                            prose-p:text-muted-foreground prose-p:leading-relaxed
                            prose-strong:text-foreground prose-strong:font-semibold
                            prose-ul:my-2 prose-li:text-muted-foreground prose-li:my-1
                            prose-table:border-collapse prose-table:w-full prose-table:my-4
                            prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-foreground
                            prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-muted-foreground
                            prose-tr:even:bg-muted/30
                            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                            prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                            prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
                            prose-hr:border-border prose-hr:my-6">
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
                data-testid="button-export-results"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              {(comparisonResults.final_report || comparisonResults.executive_summary || comparisonResults.domain_reports) && (
                <Button
                  variant="secondary"
                  onClick={handleExportMarkdown}
                  data-testid="button-export-markdown"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleNewComparison}
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