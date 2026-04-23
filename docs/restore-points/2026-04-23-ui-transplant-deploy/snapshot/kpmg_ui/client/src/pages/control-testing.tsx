import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Loader2,
  Play,
  RotateCcw,
  Shield,
  Upload,
  X,
} from "lucide-react";

import ControlTestingKpis from "@/components/ControlTestingKpis";
import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useControlTesting } from "@/contexts/ControlTestingContext";
import { useToast } from "@/hooks/use-toast";
import {
  canGenerateWorkpaper,
  CONTROL_TESTING_API,
  getControlTestingStepNumber,
} from "@/pages/control-testing.helpers";

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
      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0];
      setTestScriptFile(file);
      toast({
        title: "Test script ready",
        description: `${file.name} is ready for parsing.`,
      });
    },
    [setTestScriptFile, toast],
  );

  const onDropEvidence = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      addEvidenceFiles(acceptedFiles);
      toast({
        title: "Evidence files added",
        description: `${acceptedFiles.length} file(s) queued for validation.`,
      });
    },
    [addEvidenceFiles, toast],
  );

  const {
    getRootProps: getScriptRootProps,
    getInputProps: getScriptInputProps,
    isDragActive: isScriptDragActive,
  } = useDropzone({
    onDrop: onDropScript,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
    },
  });

  const {
    getRootProps: getEvidenceRootProps,
    getInputProps: getEvidenceInputProps,
    isDragActive: isEvidenceDragActive,
  } = useDropzone({
    onDrop: onDropEvidence,
    multiple: true,
  });

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles(evidenceFiles.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleStartAudit = async () => {
    if (!testScriptFile) {
      toast({
        title: "No test script selected",
        description: "Upload the Excel test script first.",
        variant: "destructive",
      });
      return;
    }

    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("test_script", testScriptFile);

      const response = await fetch(CONTROL_TESTING_API.start, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errData.error || errData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setChecklistPage(0);
      setSessionData({
        sessionId: data.session_id,
        currentStep: "review_checklist",
        controlsFound: data.controls_found,
        evidenceChecklist: data.evidence_checklist || [],
        warnings: data.warnings || [],
        filesProcessed: [],
        evidenceSummary: null,
        pendingControls: data.evidence_checklist || [],
        readyToGenerate: false,
        isProcessing: false,
      });

      toast({
        title: "Test script parsed",
        description: `${data.controls_found} control(s) found. Review the checklist and upload evidence.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse the test script";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleUploadEvidence = async () => {
    if (evidenceFiles.length === 0) {
      toast({
        title: "No evidence selected",
        description: "Upload one or more evidence files first.",
        variant: "destructive",
      });
      return;
    }

    if (!sessionId) {
      return;
    }

    setSessionData({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      evidenceFiles.forEach((file) => {
        formData.append("evidence_files", file);
      });

      const response = await fetch(CONTROL_TESTING_API.uploadEvidence, {
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
        (file: { validation_status: string }) => file.validation_status === "accepted",
      ).length;
      const rejected = (data.files_processed || []).filter(
        (file: { validation_status: string }) => file.validation_status === "rejected",
      ).length;

      toast({
        title: "Evidence validated",
        description: `${accepted} accepted, ${rejected} rejected.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to validate evidence";
      setSessionData({ isProcessing: false, error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleGenerateWorkpaper = async () => {
    if (!sessionId) {
      return;
    }

    setSessionData({ isProcessing: true, currentStep: "generating", error: null });

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      if (!readyToGenerate) {
        formData.append("force_generate", "true");
      }

      const response = await fetch(CONTROL_TESTING_API.generateWorkpaper, {
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
        title: "Workpaper generated",
        description: data.message || "The workpaper is ready for download.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate workpaper";
      setSessionData({ isProcessing: false, currentStep: "upload_evidence", error: message });
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDownloadWorkpaper = async () => {
    if (!downloadUrl) {
      return;
    }

    try {
      const response = await fetch(`/api${downloadUrl}`);
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = workpaperFilename || "workpaper.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "The workpaper has been saved." });
    } catch {
      toast({
        title: "Error",
        description: "Failed to download the workpaper.",
        variant: "destructive",
      });
    }
  };

  const handleNewAudit = () => {
    resetState();
    setChecklistPage(0);
    toast({ title: "Ready", description: "You can start a new control test." });
  };

  const stepNumber = getControlTestingStepNumber(currentStep);
  const showGenerateAction = canGenerateWorkpaper(readyToGenerate, evidenceSummary);

  return (
    <div className="h-full flex flex-col">
      <HeroSection
        title="Control Testing"
        subtitle="Upload a test script, validate evidence against required controls, and generate an audit workpaper"
        icon={Shield}
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <HowItWorks
            steps={[
              { number: 1, title: "Upload Test Script", desc: "Upload the control test script (CSV / XLSX) defining the controls in scope and the evidence required for each test step.", color: "#7213EA" },
              { number: 2, title: "Validate Evidence", desc: "APEX validates uploaded evidence against required controls, checks completeness, and flags gaps before workpaper generation.", color: "#1E49E2" },
              { number: 3, title: "Generate Workpaper", desc: "Review the validation summary and generate a structured audit workpaper ready for download and reporting.", color: "#098E7E" },
            ]}
          />
          <div className="flex items-center justify-center gap-2 mb-6">
            {[
              { num: 1, label: "Upload Script" },
              { num: 2, label: "Validate Evidence" },
              { num: 3, label: "Generate Workpaper" },
            ].map((step, index) => (
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
                {index < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
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
                  <FileSpreadsheet className="h-5 w-5" />
                  Upload Test Script
                </CardTitle>
                <CardDescription>
                  Upload the Excel test script that defines the controls, test steps, and expected evidence.
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
                    <p className="text-primary font-medium">Drop the test script here...</p>
                  ) : (
                    <>
                      <p className="text-foreground font-medium">Drag and drop the Excel test script here</p>
                      <p className="text-muted-foreground text-sm mt-1">or click to browse (`.xlsx`, `.xlsm`)</p>
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
                        <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Test script warnings</p>
                        {warnings.map((warning, index) => (
                          <p key={index} className="text-sm text-muted-foreground">
                            {warning}
                          </p>
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
                    <Badge variant="secondary">{controlsFound} control(s)</Badge>
                  </CardTitle>
                  <CardDescription>
                    Review the evidence required for each parsed control, then submit the supporting files.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {evidenceChecklist
                      .slice(checklistPage * CHECKLIST_PAGE_SIZE, (checklistPage + 1) * CHECKLIST_PAGE_SIZE)
                      .map((item, index) => {
                        const isSatisfied = filesProcessed.some(
                          (file) =>
                            file.validation_status === "accepted" &&
                            file.satisfies_controls?.includes(item.control_id),
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
                                Required evidence: {item.evidence_required}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {evidenceChecklist.length > CHECKLIST_PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {checklistPage * CHECKLIST_PAGE_SIZE + 1}-
                        {Math.min((checklistPage + 1) * CHECKLIST_PAGE_SIZE, evidenceChecklist.length)} of{" "}
                        {evidenceChecklist.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          disabled={checklistPage === 0}
                          onClick={() => setChecklistPage((page) => page - 1)}
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
                          onClick={() => setChecklistPage((page) => page + 1)}
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
                      Evidence Validation Results
                      {evidenceSummary && (
                        <Badge variant="secondary">
                          {evidenceSummary.received}/{evidenceSummary.total_controls} received
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {filesProcessed.map((file, index) => (
                        <div
                          key={`${file.filename}-${index}`}
                          className={`flex items-start gap-3 p-3 rounded-lg ${
                            file.validation_status === "accepted" ? "bg-green-500/10" : "bg-destructive/10"
                          }`}
                          data-testid={`validation-result-${index}`}
                        >
                          {file.validation_status === "accepted" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{file.filename}</span>
                              <Badge
                                variant={file.validation_status === "accepted" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {file.validation_status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{file.reason}</p>
                            {file.satisfies_controls && file.satisfies_controls.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <span className="text-xs text-muted-foreground">Tagged controls:</span>
                                {file.satisfies_controls.map((controlId) => (
                                  <Badge key={controlId} variant="outline" className="text-xs font-mono">
                                    {controlId}
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
                    Upload Evidence Files
                  </CardTitle>
                  <CardDescription>
                    Submit the evidence files required by the checklist. Each file is validated and mapped to the relevant controls.
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
                      <p className="text-primary font-medium">Drop the evidence files here...</p>
                    ) : (
                      <>
                        <p className="text-foreground font-medium">Drag and drop the evidence files here</p>
                        <p className="text-muted-foreground text-sm mt-1">
                          or click to browse (PDF, DOCX, XLSX, CSV, TXT, images)
                        </p>
                      </>
                    )}
                  </div>

                  {evidenceFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Files queued for submission ({evidenceFiles.length})</p>
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

                    {showGenerateAction && (
                      <Button
                        onClick={handleGenerateWorkpaper}
                        variant={readyToGenerate ? "default" : "secondary"}
                        data-testid={readyToGenerate ? "button-generate-workpaper" : "button-force-generate"}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {readyToGenerate ? "Generate Workpaper" : "Generate with Partial Evidence"}
                      </Button>
                    )}
                  </div>

                  {pendingControls.length > 0 && !readyToGenerate && (
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Outstanding Evidence ({pendingControls.length})
                      </p>
                      <div className="space-y-1">
                        {pendingControls.map((control) => (
                          <div key={control.control_id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs font-mono">
                              {control.control_id}
                            </Badge>
                            <span className="truncate">
                              {control.evidence_required || control.control_description || ""}
                            </span>
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
                    The platform is validating control outcomes and preparing the workpaper. This can take a few minutes.
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
                    Control Testing Complete
                  </CardTitle>
                  <CardDescription>{resultMessage}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {workpaperSummary && (
                    <>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{workpaperSummary.controls_tested} control(s) tested</span>
                        <Badge
                          variant="outline"
                          className={
                            workpaperSummary.overall_result === "COMPLIANT"
                              ? "border-green-400 text-green-500 dark:text-green-400"
                              : workpaperSummary.overall_result === "NON_COMPLIANT"
                                ? "border-red-400 text-red-500 dark:text-red-400"
                                : "border-yellow-400 text-yellow-500 dark:text-yellow-400"
                          }
                        >
                          {(workpaperSummary.overall_result ?? "").replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <ControlTestingKpis
                        controlsTested={workpaperSummary.controls_tested}
                        issuesIdentified={workpaperSummary.fail_count + workpaperSummary.partial_count}
                        severityCounts={workpaperSummary.severity_counts}
                      />

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-4 bg-green-500/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {workpaperSummary.pass_count}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Pass</p>
                        </div>
                        <div className="p-4 bg-destructive/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-destructive">{workpaperSummary.fail_count}</p>
                          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Fail</p>
                        </div>
                        <div className="p-4 bg-yellow-500/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                            {workpaperSummary.partial_count}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Partial</p>
                        </div>
                        <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {workpaperSummary.controls_with_evidence}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                            Controls With Evidence
                          </p>
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
                <Button variant="outline" onClick={handleNewAudit} data-testid="button-new-audit">
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
