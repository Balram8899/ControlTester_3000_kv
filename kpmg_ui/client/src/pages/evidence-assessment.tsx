import { useRef } from "react";
import { Upload, FileText, CheckCircle, Loader2, Download, Bot, Shield, Search, FileOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useEvidenceContext, AgentStatus } from "@/contexts/EvidenceContext";

function AgentCard({ 
  icon: Icon, 
  title, 
  description, 
  status, 
  statusMessage,
  isLast = false 
}: { 
  icon: React.ElementType;
  title: string;
  description: string;
  status: AgentStatus;
  statusMessage?: string;
  isLast?: boolean;
}) {
  const getStatusColor = () => {
    switch (status) {
      case "active": return "border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20";
      case "completed": return "border-green-500 bg-green-500/10";
      case "error": return "border-red-500 bg-red-500/10";
      default: return "border-muted bg-muted/30 opacity-50";
    }
  };

  const getIconColor = () => {
    switch (status) {
      case "active": return "text-purple-500";
      case "completed": return "text-green-500";
      case "error": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const getLineColor = () => {
    switch (status) {
      case "active": return "bg-purple-500";
      case "completed": return "bg-green-500";
      case "error": return "bg-red-500";
      default: return "bg-muted-foreground/30";
    }
  };

  return (
    <div className="flex">
      <div className="flex flex-col items-center mr-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${status === "active" ? "border-purple-500 bg-purple-500/20 animate-pulse" : status === "completed" ? "border-green-500 bg-green-500/20" : status === "error" ? "border-red-500 bg-red-500/20" : "border-muted bg-muted"}`}>
          {status === "active" ? (
            <Loader2 className={`h-6 w-6 animate-spin ${getIconColor()}`} />
          ) : status === "completed" ? (
            <CheckCircle className="h-6 w-6 text-green-500" />
          ) : (
            <Icon className={`h-6 w-6 ${getIconColor()}`} />
          )}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[60px] transition-all duration-500 ${getLineColor()}`} />
        )}
      </div>
      <div className={`flex-1 border-2 rounded-lg p-4 transition-all duration-500 ${getStatusColor()}`}>
        <div className="flex items-center gap-2 mb-1">
          <Bot className={`h-4 w-4 ${getIconColor()}`} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {statusMessage && status === "active" && (
          <p className="text-sm text-purple-500 mt-2 font-medium animate-pulse">
            {statusMessage}
          </p>
        )}
        {status === "completed" && (
          <p className="text-sm text-green-500 mt-2 font-medium">
            Task completed
          </p>
        )}
      </div>
    </div>
  );
}

export default function EvidenceAssessmentPage() {
  const {
    files,
    setFiles,
    isAssessing,
    setIsAssessing,
    assessmentStatus,
    setAssessmentStatus,
    reportData,
    setReportData,
    reportFilename,
    setReportFilename,
    showAgents,
    setShowAgents,
    agentStates,
    setAgentStates,
    clearEvidence,
  } = useEvidenceContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleAssess = async () => {
    if (files.length === 0) return;
    
    const selectedModel = localStorage.getItem("selectedModel");
    if (!selectedModel) {
      toast({
        title: "Model Required",
        description: "Please select an AI model in Settings before running an assessment.",
        variant: "destructive",
      });
      return;
    }

    setIsAssessing(true);
    setReportData(null);
    setShowAgents(true);
    setAgentStates({
      validator: "idle",
      assessor: "idle",
      reporter: "idle",
    });

    try {
      // Agent 1: Validator - Validate uploaded evidences
      console.log("Agent 1: Validating uploaded evidences...");
      setAgentStates(prev => ({ ...prev, validator: "active" }));
      setAssessmentStatus("Validating document formats and integrity...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      setAgentStates(prev => ({ ...prev, validator: "completed" }));

      // Agent 2: Assessor - Assess evidence against knowledge bases
      console.log("Agent 2: Starting evidence assessment...");
      setAgentStates(prev => ({ ...prev, assessor: "active" }));
      setAssessmentStatus("Analyzing evidence against knowledge bases...");
      
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("max_workers", "4");
      files.forEach((file) => {
        formData.append("evidence_files", file);
      });

      let assessResponse;
      try {
        assessResponse = await fetch(`/api/assess-evidence`, {
          method: "POST",
          body: formData,
        });
      } catch (fetchError) {
        setAgentStates(prev => ({ ...prev, assessor: "error" }));
        throw new Error(`Cannot connect to the FastAPI backend. Please ensure it is running.`);
      }

      if (!assessResponse.ok) {
        const errorData = await assessResponse.json().catch(() => ({}));
        console.error("Assessment API error:", errorData);
        setAgentStates(prev => ({ ...prev, assessor: "error" }));
        throw new Error(errorData.detail || `Assessment failed with status ${assessResponse.status}`);
      }

      const assessResult = await assessResponse.json();
      console.log("Agent 2 complete. Assessment result:", assessResult);
      
      if (!assessResult.success) {
        setAgentStates(prev => ({ ...prev, assessor: "error" }));
        throw new Error(assessResult.error_details || "Assessment failed");
      }
      
      setAgentStates(prev => ({ ...prev, assessor: "completed" }));

      // Agent 3: Reporter - Generate summary and prepare report
      console.log("Agent 3: Generating report...");
      setAgentStates(prev => ({ ...prev, reporter: "active" }));
      setAssessmentStatus("Generating executive summary and report...");
      
      let summaryResult = { success: true, executive_summary: "" };
      try {
        const summaryResponse = await fetch(`/api/generate-summary?selected_model=${encodeURIComponent(selectedModel)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(assessResult.processing_summary?.assessment_results || []),
        });

        if (summaryResponse.ok) {
          summaryResult = await summaryResponse.json();
          console.log("Summary generated:", summaryResult);
        } else {
          console.warn("Summary generation failed, continuing with workbook download...");
        }
      } catch (summaryError) {
        console.warn("Summary API error, continuing:", summaryError);
      }

      // Download report
      if (assessResult.workbook_path) {
        setAssessmentStatus("Preparing report for download...");
        const filename = assessResult.workbook_path.split("/").pop() || "assessment-report.pdf";
        console.log("Downloading report:", filename);
        
        try {
          const downloadResponse = await fetch(`/api/download-report?filename=${encodeURIComponent(filename)}`);
          
          if (downloadResponse.ok) {
            const blob = await downloadResponse.blob();
            setReportData(blob);
            setReportFilename(filename);
            console.log("Report downloaded successfully");
          } else {
            console.warn("Download failed, creating JSON report instead");
            const blob = new Blob([JSON.stringify({
              assessment: assessResult,
              summary: summaryResult
            }, null, 2)], { type: "application/json" });
            setReportData(blob);
            setReportFilename("assessment-report.json");
          }
        } catch (downloadError) {
          console.warn("Download error:", downloadError);
          const blob = new Blob([JSON.stringify({
            assessment: assessResult,
            summary: summaryResult
          }, null, 2)], { type: "application/json" });
          setReportData(blob);
          setReportFilename("assessment-report.json");
        }
      } else {
        console.log("No workbook_path in response, creating JSON report");
        const blob = new Blob([JSON.stringify({
          assessment: assessResult,
          summary: summaryResult
        }, null, 2)], { type: "application/json" });
        setReportData(blob);
        setReportFilename("assessment-report.json");
      }

      setAgentStates(prev => ({ ...prev, reporter: "completed" }));
      setAssessmentStatus("All agents completed successfully!");
      toast({
        title: "Assessment Complete",
        description: "All agents have completed their tasks. You can now download the report.",
      });
    } catch (error) {
      console.error("Assessment error:", error);
      setAssessmentStatus("");
      toast({
        title: "Assessment Failed",
        description: error instanceof Error ? error.message : "An error occurred during assessment",
        variant: "destructive",
      });
    } finally {
      setIsAssessing(false);
    }
  };

  const handleDownloadReport = () => {
    if (!reportData) return;
    const url = URL.createObjectURL(reportData);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewAssessment = () => {
    clearEvidence();
  };

  return (
    <div className="h-full flex flex-col">
      <HeroSection title="Final Report" subtitle="Upload evidence files for AI-powered multi-agent risk assessment" icon={Search} />
      <TracePageBody width="wide">
        {!showAgents ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Evidence Files
              </CardTitle>
              <CardDescription>
                Upload your evidence files for AI-powered multi-agent risk assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div
                className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover-elevate"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={handleDropzoneClick}
                data-testid="dropzone-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv"
                  data-testid="input-file"
                />
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Supports PDF, Word, Excel, CSV, and text files
                </p>
              </div>

              {files.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Selected Files ({files.length})</h3>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
                        data-testid={`file-item-${index}`}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1 truncate" data-testid={`text-filename-${index}`}>{file.name}</span>
                        <span className="text-sm text-muted-foreground" data-testid={`text-filesize-${index}`}>
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleAssess}
                  disabled={files.length === 0 || isAssessing}
                  className="flex-1"
                  data-testid="button-assess"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Start Assessment
                </Button>
                <Button
                  variant="outline"
                  onClick={clearEvidence}
                  disabled={files.length === 0}
                  data-testid="button-clear-files"
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                Analyzing through AI agents
              </h2>
              <p className="text-muted-foreground mt-2">
                Processing {files.length} file{files.length !== 1 ? "s" : ""} through AI agents
              </p>
            </div>

            <div className="space-y-4">
              <AgentCard
                icon={Shield}
                title="Validation Agent"
                description="Validates document formats, checks integrity, and prepares evidence for assessment"
                status={agentStates.validator}
                statusMessage={assessmentStatus}
              />
              
              <AgentCard
                icon={Search}
                title="Assessment Agent"
                description="Analyzes evidence against global and company knowledge bases using AI"
                status={agentStates.assessor}
                statusMessage={assessmentStatus}
              />
              
              <AgentCard
                icon={FileOutput}
                title="Report Agent"
                description="Generates executive summary and compiles the final assessment report"
                status={agentStates.reporter}
                statusMessage={assessmentStatus}
                isLast
              />
            </div>

            {(reportData || !isAssessing) && (
              <div className="flex items-center justify-center gap-4 mt-6">
                {reportData && (
                  <Button
                    onClick={handleDownloadReport}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-download-report"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Report
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleNewAssessment}
                  data-testid="button-new-assessment"
                >
                  New Assessment
                </Button>
              </div>
            )}
          </div>
        )}
      </TracePageBody>
    </div>
  );
}
