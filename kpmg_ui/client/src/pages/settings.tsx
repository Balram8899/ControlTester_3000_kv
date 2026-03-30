import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Network } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

export default function SettingsPage() {
  const [generalContextFiles, setGeneralContextFiles] = useState<ContextFile[]>([]);
  const [companyPolicyFiles, setCompanyPolicyFiles] = useState<ContextFile[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("selectedModel") || "";
  });
  const { toast } = useToast();
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
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-8">
        <div className="space-y-8">
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
        </div>
      </div>
    </div>
  );
}
