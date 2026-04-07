import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileText, X, Play, RotateCcw, Download, CheckCircle2,
  AlertCircle, Clock, ChevronRight, ChevronLeft, FileWarning, Shield, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useControlTesting } from "@/contexts/ControlTestingContext";
import ControlTestingKpis from "@/components/ControlTestingKpis";

const CHECKLIST_PAGE_SIZE = 5;

export default function ControlTestingPage() {
  const { toast } = useToast();
  const [checklistPage, setChecklistPage] = useState(0);
  const {
    sessionId,
    currentStep,
    testScriptFile,
    controlsFound,
    evidenceChecklist,
    warnings,
    evidenceFiles,
    filesProcessed,
    evidenceSummary,
    appendFilesProcessed,
    pendingControls,
    readyToGenerate,
    isProcessing,
    workpaperFilename,
    downloadUrl,
    workpaperSummary,
    resultMessage,
    error,
    setTestScriptFile,
    setSessionData,
    addEvidenceFiles,
    setEvidenceFiles,
    resetState,
  } = useControlTesting();

  const onDropScript = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setTestScriptFile(file);
        toast({
          title: "Script uploaded",
          description: `${file.name} ready for parsing`,
        });
      }
    },
    [setTestScriptFile, toast]
  );

  const onDropEvidence = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        addEvidenceFiles(acceptedFiles);
        toast({
          title: "Evidence files added",
          description: `${acceptedFiles.length} file(s) added`,
        });
      }
    },
    [addEvidenceFiles, toast]
  );

  const { getRootProps: getScriptRootProps, getInputProps: getScriptInputProps, isDragActive: isScriptDragActive } =
    useDropzone({
      onDrop: onDropScript,
      multiple: false,
      accept: {
        "application/pdf": [".pdf"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        "application/vnd.ms-excel": [".xls"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        "application/msword": [".doc"],
        "application/x-yaml": [".yaml", ".yml"],
        "text/yaml": [".yaml", ".yml"],
        "text/csv": [".csv"],
        "text/plain": [".txt"],
      },
    });

  const { getRootProps: getEvidenceRootProps, getInputProps: getEvidenceInputProps, isDragActive: isEvidenceDragActive } =
    useDropzone({
      onDrop: onDropEvidence,
      multiple: true,
    });

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles(evidenceFiles.filter((_, i) => i !== index));
  };

  const handleStartAudit = async () => {
    if (!testScriptFile) {
      toast({ title: "No file", description: "Please upload a test script", variant: "destructive" });
      return;
    }

    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("test_script", testScriptFile);

      const response = await fetch(`/api/audit/start`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      setSessionData({
        sessionId: data.session_id,
        currentStep: "review_checklist",
        controlsFound: data.controls_found,
        evidenceChecklist: data.evidence_checklist || [],
        warnings: data.warnings || [],
        isProcessing: false,
      });

      toast({
        title: "Test Script Parsed",
        description: `${data.controls_found} controls found. Please upload evidence files.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start audit";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleUploadEvidence = async () => {
    if (evidenceFiles.length === 0) {
      toast({ title: "No files", description: "Please upload evidence files", variant: "destructive" });
      return;
    }
    if (!sessionId) return;

    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      evidenceFiles.forEach((file) => {
        formData.append("evidence_files", file);
      });

      const response = await fetch(`/api/audit/upload-evidence`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      appendFilesProcessed(data.files_processed || []);
      setSessionData({
        currentStep: "upload_evidence",
        evidenceSummary: data.evidence_summary || null,
        pendingControls: data.pending_controls || [],
        readyToGenerate: data.ready_to_generate || false,
        isProcessing: false,
        evidenceFiles: [],
      });

      const accepted = (data.files_processed || []).filter(
        (f: { validation_status: string }) => f.validation_status === "accepted"
      ).length;
      const rejected = (data.files_processed || []).filter(
        (f: { validation_status: string }) => f.validation_status === "rejected"
      ).length;

      toast({
        title: "Evidence Processed",
        description: `${accepted} accepted, ${rejected} rejected. ${data.ready_to_generate ? "Ready to generate workpaper." : `${data.evidence_summary?.pending || 0} controls still need evidence.`}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload evidence";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleGenerateWorkpaper = async () => {
    if (!sessionId) return;

    setSessionData({ isProcessing: true, currentStep: "generating", error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      if (!readyToGenerate) {
        formData.append("force_generate", "true");
      }

      const response = await fetch(`/api/audit/generate-workpaper`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      setSessionData({
        currentStep: "results",
        workpaperFilename: data.workpaper_filename || null,
        downloadUrl: data.download_url || null,
        workpaperSummary: data.summary || null,
        resultMessage: data.message || "Workpaper generated successfully",
        isProcessing: false,
      });

      toast({
        title: "Workpaper Generated",
        description: data.message || "Audit workpaper is ready for download.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate workpaper";
      setSessionData({ isProcessing: false, currentStep: "upload_evidence", error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDownloadWorkpaper = async () => {
    if (!downloadUrl) return;
    try {
      const response = await fetch(`/api${downloadUrl}`);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = workpaperFilename || "workpaper.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Workpaper saved" });
    } catch {
      toast({ title: "Error", description: "Failed to download workpaper", variant: "destructive" });
    }
  };

  const handleNewAudit = () => {
    resetState();
    setChecklistPage(0);
    toast({ title: "Reset", description: "Ready for new audit" });
  };

  const stepNumber = currentStep === "landing" ? 0
    : currentStep === "upload_script" ? 1
    : currentStep === "review_checklist" || currentStep === "upload_evidence" ? 2
    : 3;

  return (
    <div className="h-full flex flex-col">
      <HeroSection title="AI Control Testing" subtitle="Upload a control test script, provide evidence, and generate audit workpapers" icon={Shield} />
      <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[
            { num: 1, label: "Upload Script" },
            { num: 2, label: "Provide Evidence" },
            { num: 3, label: "Generate Workpaper" },
          ].map((step, idx) => (
            <div key={step.num} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  stepNumber === step.num
                    ? "bg-primary text-primary-foreground"
                    : stepNumber > step.num
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.num}`}
              >
                {stepNumber > step.num ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span>{step.num}</span>
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {idx < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "upload_script" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Control Test Script
              </CardTitle>
              <CardDescription>
                Upload a YAML test script that defines the controls to be tested and the evidence requirements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getScriptRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isScriptDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                data-testid="dropzone-script"
              >
                <input {...getScriptInputProps()} data-testid="input-script-file" />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                {isScriptDragActive ? (
                  <p className="text-primary font-medium">Drop test script here...</p>
                ) : (
                  <>
                    <p className="text-foreground font-medium">
                      Drag & drop your test script here
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      or click to browse (.pdf, .xlsx, .xls, .docx, .doc, .yaml, .csv, .txt)
                    </p>
                  </>
                )}
              </div>

              {testScriptFile && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm truncate max-w-xs">{testScriptFile.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(testScriptFile.size / 1024).toFixed(1)} KB
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTestScriptFile(null)}
                    data-testid="button-remove-script"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <Button
                onClick={handleStartAudit}
                disabled={!testScriptFile || isProcessing}
                className="w-full"
                data-testid="button-start-audit"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing Test Script...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Parse Test Script
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {(currentStep === "review_checklist" || currentStep === "upload_evidence") && (
          <>
            {warnings.length > 0 && (
              <Card className="border-yellow-500/50">
                <CardContent className="py-4">
                  <div className="flex items-start gap-2">
                    <FileWarning className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Warnings</p>
                      {warnings.map((w, i) => (
                        <p key={i} className="text-sm text-muted-foreground">{w}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Evidence Checklist
                  <Badge variant="secondary">{controlsFound} controls</Badge>
                </CardTitle>
                <CardDescription>
                  The test script requires evidence for each control listed below. Upload the appropriate files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {evidenceChecklist
                    .slice(checklistPage * CHECKLIST_PAGE_SIZE, (checklistPage + 1) * CHECKLIST_PAGE_SIZE)
                    .map((item, index) => {
                      const isSatisfied = filesProcessed.some(
                        (fp) => fp.validation_status === "accepted" && fp.satisfies_controls?.includes(item.control_id)
                      );
                      return (
                        <div
                          key={item.control_id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                          data-testid={`checklist-item-${checklistPage * CHECKLIST_PAGE_SIZE + index}`}
                        >
                          <div className="mt-0.5">
                            {isSatisfied ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-mono">
                                {item.control_id}
                              </Badge>
                              <Badge variant={isSatisfied ? "default" : "secondary"} className="text-xs">
                                {isSatisfied ? "Received" : "Pending"}
                              </Badge>
                            </div>
                            <p className="text-sm mt-1 text-muted-foreground truncate">
                              {item.control_description}
                            </p>
                            <p className="text-xs mt-0.5 text-primary/80">
                              Required: {item.evidence_required}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {evidenceChecklist.length > CHECKLIST_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {checklistPage * CHECKLIST_PAGE_SIZE + 1}–{Math.min((checklistPage + 1) * CHECKLIST_PAGE_SIZE, evidenceChecklist.length)} of {evidenceChecklist.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={checklistPage === 0}
                        onClick={() => setChecklistPage((p) => p - 1)}
                        data-testid="button-checklist-prev"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2 text-muted-foreground">
                        {checklistPage + 1} / {Math.ceil(evidenceChecklist.length / CHECKLIST_PAGE_SIZE)}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={(checklistPage + 1) * CHECKLIST_PAGE_SIZE >= evidenceChecklist.length}
                        onClick={() => setChecklistPage((p) => p + 1)}
                        data-testid="button-checklist-next"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {filesProcessed.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Validation Results
                    {evidenceSummary && (
                      <Badge variant="secondary">
                        {evidenceSummary.received}/{evidenceSummary.total_controls} received
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {filesProcessed.map((fp, index) => (
                      <div
                        key={`${fp.filename}-${index}`}
                        className={`flex items-start gap-3 p-3 rounded-lg ${
                          fp.validation_status === "accepted"
                            ? "bg-green-500/10"
                            : "bg-destructive/10"
                        }`}
                        data-testid={`validation-result-${index}`}
                      >
                        {fp.validation_status === "accepted" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{fp.filename}</span>
                            <Badge
                              variant={fp.validation_status === "accepted" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {fp.validation_status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{fp.reason}</p>
                          {fp.satisfies_controls && fp.satisfies_controls.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">Satisfies:</span>
                              {fp.satisfies_controls.map((c) => (
                                <Badge key={c} variant="outline" className="text-xs font-mono">
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Required Files
                </CardTitle>
                <CardDescription>
                  Upload the files required by the test script. The system will validate each file against the checklist.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getEvidenceRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isEvidenceDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  data-testid="dropzone-evidence"
                >
                  <input {...getEvidenceInputProps()} data-testid="input-evidence-files" />
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  {isEvidenceDragActive ? (
                    <p className="text-primary font-medium">Drop evidence files here...</p>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">
                        Drag & drop required files here
                      </p>
                      <p className="text-muted-foreground text-sm mt-1">
                        or click to browse (PDF, LOG, TXT, CSV, DOCX)
                      </p>
                    </>
                  )}
                </div>

                {evidenceFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Files to Upload ({evidenceFiles.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {evidenceFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          data-testid={`evidence-file-${index}`}
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
                            onClick={() => removeEvidenceFile(index)}
                            data-testid={`button-remove-evidence-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={handleUploadEvidence}
                    disabled={evidenceFiles.length === 0 || isProcessing}
                    data-testid="button-upload-evidence"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Validating Evidence...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Submit Evidence
                      </>
                    )}
                  </Button>

                  {readyToGenerate && (
                    <Button
                      onClick={handleGenerateWorkpaper}
                      variant="default"
                      data-testid="button-generate-workpaper"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Generate Workpaper
                    </Button>
                  )}

                  {!readyToGenerate && evidenceSummary && evidenceSummary.received > 0 && (
                    <Button
                      onClick={handleGenerateWorkpaper}
                      variant="secondary"
                      data-testid="button-force-generate"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Generate with Partial Evidence
                    </Button>
                  )}
                </div>

                {pendingControls.length > 0 && !readyToGenerate && (
                  <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Still Needed ({pendingControls.length})
                    </p>
                    <div className="space-y-1">
                      {pendingControls.map((pc) => (
                        <div key={pc.control_id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-xs font-mono">{pc.control_id}</Badge>
                          <span className="truncate">{pc.evidence_required || pc.control_description || ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {currentStep === "generating" && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Generating Audit Workpaper...</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Analyzing evidence against controls using pre-built knowledge bases. This may take a few minutes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === "results" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Audit Complete
                </CardTitle>
                <CardDescription>{resultMessage}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {workpaperSummary && (
                  <>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{workpaperSummary.controls_tested} controls tested</span>
                      <Badge variant="outline" className={
                        workpaperSummary.overall_result === "COMPLIANT" ? "border-green-400 text-green-500 dark:text-green-400"
                        : workpaperSummary.overall_result === "NON_COMPLIANT" ? "border-red-400 text-red-500 dark:text-red-400"
                        : "border-yellow-400 text-yellow-500 dark:text-yellow-400"
                      }>
                        {(workpaperSummary.overall_result ?? "").replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {/* KPI cards */}
                    <ControlTestingKpis
                      controlsTested={workpaperSummary.controls_tested}
                      issuesIdentified={workpaperSummary.fail_count + workpaperSummary.partial_count}
                      severityCounts={workpaperSummary.severity_counts}
                    />

                    {/* Detailed pass/fail/partial/no-evidence breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 bg-green-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{workpaperSummary.pass_count}</p>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Pass</p>
                      </div>
                      <div className="p-4 bg-destructive/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-destructive">{workpaperSummary.fail_count}</p>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Fail</p>
                      </div>
                      <div className="p-4 bg-yellow-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{workpaperSummary.partial_count}</p>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Partial</p>
                      </div>
                      <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{workpaperSummary.controls_with_evidence}</p>
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Evidence Files</p>
                      </div>
                    </div>
                  </>
                )}

                {downloadUrl && (
                  <Button
                    onClick={handleDownloadWorkpaper}
                    className="w-full"
                    data-testid="button-download-workpaper"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Workpaper
                  </Button>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={handleNewAudit}
                data-testid="button-new-audit"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New Audit
              </Button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}