import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Network, Eye, EyeOff } from "lucide-react";
import { HIDEABLE_TABS } from "@/components/AppLayout";

const NAV_HIDDEN_KEY = "nav_hidden_pages";
const DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS = 80;
const DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS = 5;
const DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS = 200;

function readHiddenPages(): string[] {
  try { return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || "[]"); } catch { return []; }
}
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import ContextFileUpload from "@/components/ContextFileUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PROVIDER_MODELS, providerLabel } from "@/lib/llm-provider-models";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ContextFile {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface Model {
  value: string;
  label: string;
}

interface VectorstoreInfo {
  exists: boolean;
  path?: string;
  vector_count?: number;
  last_modified?: string;
  graph_loaded?: boolean;
  graph_nodes?: number;
  graph_edges?: number;
}

interface LLMStatus {
  provider: string;
  model: string;
  status: "ok" | "error";
  message: string;
  latency_ms: number;
  available_providers: string[];
}

interface DocumentUpliftConfig {
  max_llm_calls_per_pipeline: number;
  saved?: boolean;
}

export default function SettingsPage() {
  const [generalContextFiles, setGeneralContextFiles] = useState<ContextFile[]>([]);
  const [companyPolicyFiles, setCompanyPolicyFiles] = useState<ContextFile[]>([]);
  const [hiddenPages, setHiddenPages] = useState<string[]>(readHiddenPages);

  const togglePageVisibility = (path: string) => {
    setHiddenPages(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      localStorage.setItem(NAV_HIDDEN_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(NAV_HIDDEN_KEY));
      return next;
    });
  };
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("selectedModel") || "";
  });
  const { toast } = useToast();

  const [llmProvider, setLlmProvider] = useState<string>("");
  const [llmModel, setLlmModel] = useState<string>("");
  const [testResult, setTestResult] = useState<LLMStatus | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [documentUpliftMaxCalls, setDocumentUpliftMaxCalls] = useState(
    String(DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS),
  );
  const documentUpliftMaxCallsValue = Number.parseInt(documentUpliftMaxCalls, 10);
  const documentUpliftMaxCallsValid =
    Number.isFinite(documentUpliftMaxCallsValue) &&
    documentUpliftMaxCallsValue >= DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS &&
    documentUpliftMaxCallsValue <= DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS;

  const { data: llmStatus, isLoading: llmStatusLoading } = useQuery<LLMStatus>({
    queryKey: ["/api/settings/llm-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/llm-status");
      if (!res.ok) throw new Error("Failed to fetch LLM status");
      return res.json();
    },
  });

  useEffect(() => {
    if (llmStatus) {
      setLlmProvider(llmStatus.provider);
      setLlmModel(llmStatus.model);
    }
  }, [llmStatus]);

  const saveLLMConfig = useMutation({
    mutationFn: async ({ provider, model }: { provider: string; model: string }) => {
      const res = await fetch("/api/settings/llm-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Provider saved", description: `Now using ${data.provider} / ${data.model}` });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/llm-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const params = new URLSearchParams();
      if (llmProvider) params.set("provider", llmProvider);
      if (llmModel) params.set("model", llmModel);
      const query = params.toString();
      const res = await fetch(`/api/settings/llm-status${query ? `?${query}` : ""}`);
      const data: LLMStatus = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ provider: llmProvider, model: llmModel, status: "error", message: "Network error", latency_ms: 0, available_providers: [] });
    } finally {
      setTestLoading(false);
    }
  };

  const {
    data: documentUpliftConfig,
    isLoading: documentUpliftConfigLoading,
    error: documentUpliftConfigError,
  } = useQuery<DocumentUpliftConfig>({
    queryKey: ["/api/settings/document-uplift-config"],
    queryFn: async () => {
      const res = await fetch("/api/settings/document-uplift-config");
      if (!res.ok) throw new Error("Failed to fetch Document Uplift config");
      return res.json();
    },
  });

  useEffect(() => {
    if (documentUpliftConfig) {
      setDocumentUpliftMaxCalls(String(documentUpliftConfig.max_llm_calls_per_pipeline));
    }
  }, [documentUpliftConfig]);

  const saveDocumentUpliftConfig = useMutation({
    mutationFn: async (maxLlmCalls: number) => {
      const res = await fetch("/api/settings/document-uplift-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_llm_calls_per_pipeline: maxLlmCalls }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save Document Uplift config");
      }
      return res.json() as Promise<DocumentUpliftConfig>;
    },
    onSuccess: (data) => {
      setDocumentUpliftMaxCalls(String(data.max_llm_calls_per_pipeline));
      toast({
        title: "Pipeline controls saved",
        description: `Document Uplift will allow up to ${data.max_llm_calls_per_pipeline} LLM calls per new run.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/document-uplift-config"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveDocumentUpliftConfig = () => {
    if (!documentUpliftMaxCallsValid) {
      toast({
        title: "Invalid call limit",
        description: `Enter a value between ${DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS} and ${DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS}.`,
        variant: "destructive",
      });
      return;
    }
    saveDocumentUpliftConfig.mutate(documentUpliftMaxCallsValue);
  };

  const loadedVectorstores = useRef<Set<string>>(new Set());

  const { data: models, isLoading: modelsLoading, error: modelsError } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  // Check if global vectorstore exists (with model for loading)
  const { data: globalVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["vectorstore/global", selectedModel],
    queryFn: async () => {
      if (!selectedModel) return { exists: false, path: "saved_global_vectorstore", vector_count: 0 };
      
      // Call external API directly to load vectorstore
      const formData = new URLSearchParams();
      formData.append("dir_path", "saved_global_vectorstore");
      formData.append("kb_type", "global");
      formData.append("model_name", selectedModel);

      const response = await fetch("/api/load-vectorstore", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.success) {
          return {
            exists: true,
            path: "saved_global_vectorstore",
            vector_count: data.ntotal ?? data.vector_count ?? 0,
            last_modified: new Date().toISOString(),
            graph_loaded: data.graph_loaded ?? false,
            graph_nodes: data.graph_nodes ?? 0,
            graph_edges: data.graph_edges ?? 0,
          };
        }
      }

      return { exists: false, path: "saved_global_vectorstore", vector_count: 0 };
    },
    enabled: !!selectedModel,
  });

  // Check if company vectorstore exists (with model for loading)
  const { data: companyVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["vectorstore/company", selectedModel],
    queryFn: async () => {
      if (!selectedModel) return { exists: false, path: "saved_company_vectorstore", vector_count: 0 };
      
      // Call external API directly to load vectorstore
      const formData = new URLSearchParams();
      formData.append("dir_path", "saved_company_vectorstore");
      formData.append("kb_type", "company");
      formData.append("model_name", selectedModel);

      const response = await fetch("/api/load-vectorstore", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.success) {
          return {
            exists: true,
            path: "saved_company_vectorstore",
            vector_count: data.ntotal ?? data.vector_count ?? 0,
            last_modified: new Date().toISOString(),
            graph_loaded: data.graph_loaded ?? false,
            graph_nodes: data.graph_nodes ?? 0,
            graph_edges: data.graph_edges ?? 0,
          };
        }
      }

      return { exists: false, path: "saved_company_vectorstore", vector_count: 0 };
    },
    enabled: !!selectedModel,
  });

  // Load vectorstore mutation
  const loadVectorstore = useMutation({
    mutationFn: async ({ type, modelName }: { type: string; modelName: string }) => {
      return await apiRequest("POST", `/api/vectorstore/load/${type}`, {
        model_name: modelName,
      });
    },
    onSuccess: (_, { type }) => {
      loadedVectorstores.current.add(type);
      toast({
        title: "✓ Loaded Successfully",
        description: `${type === "global" ? "General Context" : "Company Policy"} vectorstore has been loaded into memory`,
        className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
      });
    },
    onError: (error, { type }) => {
      toast({
        title: "✗ Load Failed",
        description: `Failed to load ${type === "global" ? "General Context" : "Company Policy"} vectorstore: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    },
  });


  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("selectedModel", selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].value);
    }
  }, [models, selectedModel]);

  // Note: Vectorstores are now auto-loaded during the check phase when model_name is provided
  // No need for separate loading since GET /api/vectorstore/:type?model_name=X loads them

  const handleGeneralContextUpload = async (files: File[]) => {
    try {
      const selectedModel = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!selectedModel) {
        throw new Error("Please select a model first");
      }

      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "global");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/build-knowledge-base", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      // Save the vectorstore to disk - call external API directly
      try {
        const formData = new URLSearchParams();
        formData.append("kb_type", "global");
        formData.append("dir_path", "saved_global_vectorstore");

        const saveResponse = await fetch("/api/save-vectorstore", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        
        if (!saveResponse.ok) {
          console.warn("Failed to save vectorstore to disk");
        }
      } catch (saveError) {
        console.warn("Error saving vectorstore:", saveError);
      }
      
      const newFiles = files.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        uploadedAt: "Just now",
      }));
      setGeneralContextFiles((prev) => [...prev, ...newFiles]);

      // Refresh vectorstore info after upload
      queryClient.invalidateQueries({ queryKey: ["vectorstore/global"] });

      return result;
    } catch (error) {
      console.error("Error uploading files:", error);
      throw error;
    }
  };

  const handleGeneralContextRemove = (id: string) => {
    setGeneralContextFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleCompanyPolicyUpload = async (files: File[]) => {
    try {
      const selectedModel = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!selectedModel) {
        throw new Error("Please select a model first");
      }

      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "company");

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/build-knowledge-base", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }

      const result = await response.json();
      
      // Save the vectorstore to disk - call external API directly
      try {
        const formData = new URLSearchParams();
        formData.append("kb_type", "company");
        formData.append("dir_path", "saved_company_vectorstore");

        const saveResponse = await fetch("/api/save-vectorstore", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        
        if (!saveResponse.ok) {
          console.warn("Failed to save vectorstore to disk");
        }
      } catch (saveError) {
        console.warn("Error saving vectorstore:", saveError);
      }
      
      const newFiles = files.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        uploadedAt: "Just now",
      }));
      setCompanyPolicyFiles((prev) => [...prev, ...newFiles]);

      // Refresh vectorstore info after upload
      queryClient.invalidateQueries({ queryKey: ["vectorstore/company"] });

      return result;
    } catch (error) {
      console.error("Error uploading files:", error);
      throw error;
    }
  };

  const handleCompanyPolicyRemove = (id: string) => {
    setCompanyPolicyFiles((prev) => prev.filter((file) => file.id !== id));
  };

  return (
    <div className="h-full flex flex-col">
      <HeroSection title="Settings" subtitle="Configure AI models and application preferences" icon={Network} />
      <TracePageBody width="narrow" contentClassName="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>LLM Provider</CardTitle>
              <CardDescription>
                Select the active cloud AI provider and model. API keys must be set in <code>.env</code> before a provider appears here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {llmStatusLoading && (
                <p className="text-sm text-muted-foreground">Loading provider config...</p>
              )}
              {!llmStatusLoading && (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</label>
                      <Select
                        value={llmProvider}
                        onValueChange={(val) => {
                          setLlmProvider(val);
                          setLlmModel(PROVIDER_MODELS[val]?.[0] ?? "");
                        }}
                      >
                        <SelectTrigger className="w-full" data-testid="select-llm-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {(llmStatus?.available_providers ?? []).map((p) => (
                            <SelectItem key={p} value={p}>
                              {providerLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</label>
                      <Select value={llmModel} onValueChange={setLlmModel}>
                        <SelectTrigger className="w-full" data-testid="select-llm-model">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {(PROVIDER_MODELS[llmProvider] ?? []).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => saveLLMConfig.mutate({ provider: llmProvider, model: llmModel })}
                      disabled={saveLLMConfig.isPending || !llmProvider || !llmModel}
                      data-testid="btn-save-llm-config"
                    >
                      {saveLLMConfig.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testLoading}
                      data-testid="btn-test-connection"
                    >
                      {testLoading ? "Testing..." : "Test Connection"}
                    </Button>
                  </div>

                  {testResult && (
                    <div
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                        testResult.status === "ok"
                          ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                          : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                      }`}
                      data-testid="llm-test-result"
                    >
                      <span>{testResult.status === "ok" ? "✓" : "✗"}</span>
                      <span>
                        {testResult.status === "ok"
                          ? `ok · ${testResult.latency_ms}ms · "${testResult.message}"`
                          : testResult.message}
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Uplift Pipeline Controls</CardTitle>
              <CardDescription>
                Set the LLM call cap used by new Document Uplift pipeline runs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {documentUpliftConfigLoading && (
                <p className="text-sm text-muted-foreground">Loading pipeline controls...</p>
              )}
              {documentUpliftConfigError && (
                <p className="text-sm text-destructive">
                  Failed to load Document Uplift controls.
                </p>
              )}
              {!documentUpliftConfigLoading && !documentUpliftConfigError && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Max LLM Calls Per Pipeline
                    </label>
                    <input
                      type="number"
                      min={DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS}
                      max={DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS}
                      value={documentUpliftMaxCalls}
                      onChange={(event) => setDocumentUpliftMaxCalls(event.target.value)}
                      className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      data-testid="input-document-uplift-max-llm-calls"
                    />
                    <p className="text-xs text-muted-foreground">
                      Applies to future Document Uplift runs only. Existing case outputs remain unchanged.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleSaveDocumentUpliftConfig}
                      disabled={saveDocumentUpliftConfig.isPending || !documentUpliftMaxCallsValid}
                      data-testid="btn-save-document-uplift-config"
                    >
                      {saveDocumentUpliftConfig.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => saveDocumentUpliftConfig.mutate(DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS)}
                      disabled={saveDocumentUpliftConfig.isPending}
                      data-testid="btn-reset-document-uplift-config"
                    >
                      Reset to 80
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>LLM Model</CardTitle>
              <CardDescription>
                Select the AI model to use for your conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelsLoading && (
                <div className="text-sm text-muted-foreground" data-testid="text-loading-models">
                  Loading models...
                </div>
              )}
              {modelsError && (
                <div className="text-sm text-destructive" data-testid="text-error-models">
                  Failed to load models. Please check if the API is running.
                </div>
              )}
              {!modelsLoading && !modelsError && models && (
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full max-w-sm" data-testid="select-model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>General Context</CardTitle>
                    {globalVectorstore?.exists && (
                      <Badge
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="badge-global-vectorstore-ready"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vectorstore Ready
                      </Badge>
                    )}
                    {globalVectorstore?.graph_loaded && (
                      <Badge
                        variant="outline"
                        className="border-blue-400 text-blue-600"
                        data-testid="badge-global-graph-ready"
                      >
                        <Network className="h-3 w-3 mr-1" />
                        Graph: {globalVectorstore.graph_nodes} nodes / {globalVectorstore.graph_edges} edges
                      </Badge>
                    )}
                  </div>
                  {globalVectorstore?.exists && (
                    <CardDescription className="mt-2">
                      <span className="text-xs">
                        📁 Path: <code className="bg-muted px-1 py-0.5 rounded">{globalVectorstore.path}</code>
                      </span>
                    </CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ContextFileUpload
                title="General Context"
                description="Upload general reference documents and knowledge base files (unlimited)"
                files={generalContextFiles}
                onRemoveFile={handleGeneralContextRemove}
                onUpload={handleGeneralContextUpload}
                testId="general"
                acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle>Company Policy Context</CardTitle>
                    {companyVectorstore?.exists && (
                      <Badge
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="badge-company-vectorstore-ready"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vectorstore Ready
                      </Badge>
                    )}
                    {companyVectorstore?.graph_loaded && (
                      <Badge
                        variant="outline"
                        className="border-blue-400 text-blue-600"
                        data-testid="badge-company-graph-ready"
                      >
                        <Network className="h-3 w-3 mr-1" />
                        Graph: {companyVectorstore.graph_nodes} nodes / {companyVectorstore.graph_edges} edges
                      </Badge>
                    )}
                  </div>
                  {companyVectorstore?.exists && (
                    <CardDescription className="mt-2">
                      <span className="text-xs">
                        📁 Path: <code className="bg-muted px-1 py-0.5 rounded">{companyVectorstore.path}</code>
                      </span>
                    </CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ContextFileUpload
                title="Company Policy Context"
                description="Upload company policies, guidelines, and compliance documents (unlimited)"
                files={companyPolicyFiles}
                onRemoveFile={handleCompanyPolicyRemove}
                onUpload={handleCompanyPolicyUpload}
                testId="policy"
                acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Navigation Visibility
              </CardTitle>
              <CardDescription>
                Choose which pages appear in the left panel. Settings is always visible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {HIDEABLE_TABS.map(tab => {
                  const hidden = hiddenPages.includes(tab.path);
                  return (
                    <div
                      key={tab.path}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <tab.icon className={`h-4 w-4 ${hidden ? "text-muted-foreground/40" : "text-muted-foreground"}`} />
                        <span className={`text-sm ${hidden ? "text-muted-foreground/40 line-through" : "text-foreground"}`}>
                          {tab.fullTitle}
                        </span>
                      </div>
                      <button
                        onClick={() => togglePageVisibility(tab.path)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          hidden
                            ? "border-muted-foreground/30 text-muted-foreground/50 hover:text-foreground hover:border-primary/50"
                            : "border-primary/30 text-primary hover:bg-primary/10"
                        }`}
                      >
                        {hidden ? (
                          <><EyeOff className="h-3 w-3" /> Hidden</>
                        ) : (
                          <><Eye className="h-3 w-3" /> Visible</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
      </TracePageBody>
    </div>
  );
}
