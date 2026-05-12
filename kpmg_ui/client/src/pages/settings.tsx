import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  Network,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Cpu,
  Database,
  Building2,
  Users,
  Plus,
  Trash2,
  KeyRound,
  X,
} from "lucide-react";
import { HIDEABLE_TABS } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PROVIDER_MODELS, providerLabel } from "@/lib/llm-provider-models";
import { apiRequest, queryClient } from "@/lib/queryClient";

const NAV_HIDDEN_KEY = "nav_hidden_pages";
const DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS = 80;
const DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS = 5;
const DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS = 200;

function readHiddenPages(): string[] {
  try { return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || "[]"); } catch { return []; }
}

// ── Types ──────────────────────────────────────────────────────────────────

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

interface KeyProviderStatus {
  required: boolean;
  set: boolean;
  source: string | null;
  env_var: string | null;
}

type SectionId =
  | "llm-provider"
  | "pipeline-controls"
  | "llm-model"
  | "general-context"
  | "company-policy"
  | "nav-visibility"
  | "user-management";

interface SettingsSection {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "llm-provider",      label: "LLM Provider",          icon: Network,          adminOnly: true  },
  { id: "pipeline-controls", label: "Pipeline Controls",      icon: SlidersHorizontal, adminOnly: false },
  { id: "llm-model",         label: "LLM Model",              icon: Cpu,              adminOnly: false },
  { id: "general-context",   label: "General Context",        icon: Database,         adminOnly: false },
  { id: "company-policy",    label: "Company Policy",         icon: Building2,        adminOnly: false },
  { id: "nav-visibility",    label: "Navigation Visibility",  icon: Eye,              adminOnly: false },
  { id: "user-management",   label: "User Management",        icon: Users,            adminOnly: true  },
];

// ── User Management sub-component ─────────────────────────────────────────

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  admin: "bg-[rgba(30,73,226,0.12)] text-[#1E49E2] border border-[rgba(30,73,226,0.25)]",
  l2:    "bg-[rgba(9,142,126,0.12)] text-[#098E7E] border border-[rgba(9,142,126,0.25)]",
  l1:    "bg-[rgba(132,146,166,0.12)] text-[#5B6B82] border border-[rgba(132,146,166,0.25)]",
};
const ROLE_DISPLAY: Record<UserRole, string> = {
  admin: "Admin",
  l2:    "L2 — Lead",
  l1:    "L1 — User",
};

interface UserManagementSectionProps {
  users: Array<{ email: string; name: string; role: UserRole }>;
  currentUserEmail: string;
  onRoleChange: (email: string, role: UserRole) => void;
  onDelete: (email: string) => void;
  onOpenCreate: () => void;
}

function UserManagementSection({
  users,
  currentUserEmail,
  onRoleChange,
  onDelete,
  onOpenCreate,
}: UserManagementSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Management
            </CardTitle>
            <CardDescription>
              Manage user accounts and role assignments. Roles determine feature access.
            </CardDescription>
          </div>
          <Button size="sm" onClick={onOpenCreate} className="gap-1.5 flex-shrink-0">
            <Plus className="h-3.5 w-3.5" />
            New User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isDefaultAdmin = u.email.toLowerCase() === "admin@bank.com";
                const isSelf = u.email.toLowerCase() === currentUserEmail.toLowerCase();
                return (
                  <TableRow key={u.email}>
                    <TableCell className="font-medium text-sm">
                      {u.name}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5">You</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {isDefaultAdmin ? (
                        <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE_STYLES.admin}`}>
                          Admin
                        </span>
                      ) : (
                        <Select
                          value={u.role}
                          onValueChange={(v) => onRoleChange(u.email, v as UserRole)}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="l1">L1 — User</SelectItem>
                            <SelectItem value="l2">L2 — Lead</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isDefaultAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onDelete(u.email)}
                          title="Delete user"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, listUsers, updateUserRole, createUser, deleteUser } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();

  // Left nav state
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>(() =>
    isAdmin ? "llm-provider" : "pipeline-controls"
  );

  const visibleSections = SETTINGS_SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  // Navigation visibility
  const [hiddenPages, setHiddenPages] = useState<string[]>(readHiddenPages);
  const togglePageVisibility = (path: string) => {
    setHiddenPages((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      localStorage.setItem(NAV_HIDDEN_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(NAV_HIDDEN_KEY));
      return next;
    });
  };

  // LLM model selector
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("selectedModel") || "");

  // LLM provider
  const [llmProvider, setLlmProvider] = useState<string>("");
  const [llmModel, setLlmModel] = useState<string>("");
  const [testResult, setTestResult] = useState<LLMStatus | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // API key management (admin only)
  const [selectedKeyProvider, setSelectedKeyProvider] = useState<string>("");
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keySaving, setKeySaving] = useState<Record<string, boolean>>({});

  // Document uplift
  const [documentUpliftMaxCalls, setDocumentUpliftMaxCalls] = useState(
    String(DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS),
  );
  const documentUpliftMaxCallsValue = Number.parseInt(documentUpliftMaxCalls, 10);
  const documentUpliftMaxCallsValid =
    Number.isFinite(documentUpliftMaxCallsValue) &&
    documentUpliftMaxCallsValue >= DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS &&
    documentUpliftMaxCallsValue <= DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS;

  // Context files
  const [generalContextFiles, setGeneralContextFiles] = useState<ContextFile[]>([]);
  const [companyPolicyFiles, setCompanyPolicyFiles] = useState<ContextFile[]>([]);

  // User management
  const [allUsers, setAllUsers] = useState<Array<{ email: string; name: string; role: UserRole }>>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", password: "", role: "l1" as UserRole });

  const loadedVectorstores = useRef<Set<string>>(new Set());

  // ── Queries ──

  const { data: llmStatus, isLoading: llmStatusLoading } = useQuery<LLMStatus>({
    queryKey: ["/api/settings/llm-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/llm-status");
      if (!res.ok) throw new Error("Failed to fetch LLM status");
      return res.json();
    },
  });

  const { data: models, isLoading: modelsLoading, error: modelsError } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const { data: keyStatus, refetch: refetchKeyStatus } = useQuery<Record<string, KeyProviderStatus>>({
    queryKey: ["/api/settings/llm-key-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/llm-key-status");
      if (!res.ok) throw new Error("Failed to fetch key status");
      return res.json();
    },
    enabled: isAdmin,
  });

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

  const { data: globalVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["vectorstore/global", selectedModel],
    queryFn: async () => {
      if (!selectedModel) return { exists: false, path: "saved_global_vectorstore", vector_count: 0 };
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

  const { data: companyVectorstore } = useQuery<VectorstoreInfo>({
    queryKey: ["vectorstore/company", selectedModel],
    queryFn: async () => {
      if (!selectedModel) return { exists: false, path: "saved_company_vectorstore", vector_count: 0 };
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

  // ── Mutations ──

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

  const loadVectorstore = useMutation({
    mutationFn: async ({ type, modelName }: { type: string; modelName: string }) => {
      return await apiRequest("POST", `/api/vectorstore/load/${type}`, { model_name: modelName });
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

  // ── Effects ──

  useEffect(() => {
    if (llmStatus) {
      setLlmProvider(llmStatus.provider);
      setLlmModel(llmStatus.model);
    }
  }, [llmStatus]);

  useEffect(() => {
    if (documentUpliftConfig) {
      setDocumentUpliftMaxCalls(String(documentUpliftConfig.max_llm_calls_per_pipeline));
    }
  }, [documentUpliftConfig]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].value);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    if (isAdmin) listUsers().then(setAllUsers);
  }, [isAdmin]);

  // ── Handlers ──

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

  const handleSaveKey = async (provider: string) => {
    const key = keyInputs[provider]?.trim();
    if (!key) return;
    setKeySaving((s) => ({ ...s, [provider]: true }));
    try {
      const res = await fetch("/api/settings/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: key }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save key");
      }
      setKeyInputs((k) => ({ ...k, [provider]: "" }));
      await refetchKeyStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/settings/llm-status"] });
      toast({ title: "API key saved", description: `${providerLabel(provider)} key updated successfully.` });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setKeySaving((s) => ({ ...s, [provider]: false }));
    }
  };

  const handleClearKey = async (provider: string) => {
    setKeySaving((s) => ({ ...s, [provider]: true }));
    try {
      const res = await fetch(`/api/settings/llm-key/${provider}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to clear key");
      }
      await refetchKeyStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/settings/llm-status"] });
      toast({ title: "API key cleared", description: `${providerLabel(provider)} key removed from database.` });
    } catch (err) {
      toast({ title: "Clear failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setKeySaving((s) => ({ ...s, [provider]: false }));
    }
  };

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

  const handleGeneralContextUpload = async (files: File[]) => {
    try {
      const model = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!model) throw new Error("Please select a model first");
      const formData = new FormData();
      formData.append("selected_model", model);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "global");
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/build-knowledge-base", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }
      const result = await response.json();
      try {
        const fd = new URLSearchParams();
        fd.append("kb_type", "global");
        fd.append("dir_path", "saved_global_vectorstore");
        await fetch("/api/save-vectorstore", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fd.toString() });
      } catch (e) { console.warn("Error saving vectorstore:", e); }
      setGeneralContextFiles((prev) => [...prev, ...files.map((f) => ({ id: `${Date.now()}-${Math.random()}`, filename: f.name, uploadedAt: "Just now" }))]);
      queryClient.invalidateQueries({ queryKey: ["vectorstore/global"] });
      return result;
    } catch (error) { console.error("Error uploading files:", error); throw error; }
  };

  const handleCompanyPolicyUpload = async (files: File[]) => {
    try {
      const model = localStorage.getItem("selectedModel") || models?.[0]?.value;
      if (!model) throw new Error("Please select a model first");
      const formData = new FormData();
      formData.append("selected_model", model);
      formData.append("batch_size", "15");
      formData.append("delay_between_batches", "0.2");
      formData.append("max_retries", "3");
      formData.append("kb_type", "company");
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/build-knowledge-base", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to build knowledge base");
      }
      const result = await response.json();
      try {
        const fd = new URLSearchParams();
        fd.append("kb_type", "company");
        fd.append("dir_path", "saved_company_vectorstore");
        await fetch("/api/save-vectorstore", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fd.toString() });
      } catch (e) { console.warn("Error saving vectorstore:", e); }
      setCompanyPolicyFiles((prev) => [...prev, ...files.map((f) => ({ id: `${Date.now()}-${Math.random()}`, filename: f.name, uploadedAt: "Just now" }))]);
      queryClient.invalidateQueries({ queryKey: ["vectorstore/company"] });
      return result;
    } catch (error) { console.error("Error uploading files:", error); throw error; }
  };

  const handleRoleChange = async (email: string, role: UserRole) => {
    const result = await updateUserRole(email, role);
    if (result.ok) {
      setAllUsers(await listUsers());
      toast({ title: "Role updated", description: `${email} is now ${ROLE_DISPLAY[role]}.` });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const handleDeleteUser = async (email: string) => {
    const result = await deleteUser(email);
    if (result.ok) {
      setAllUsers(await listUsers());
      toast({ title: "User deleted" });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const handleCreateUser = async () => {
    const result = await createUser(newUserForm.name, newUserForm.email, newUserForm.password, newUserForm.role);
    if (result.ok) {
      setAllUsers(await listUsers());
      setShowCreateDialog(false);
      setNewUserForm({ name: "", email: "", password: "", role: "l1" });
      toast({ title: "User created", description: `${newUserForm.email} added as ${ROLE_DISPLAY[newUserForm.role]}.` });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="trace-workbench-shell flex flex-col h-full overflow-hidden">
      <HeroSection title="Settings" subtitle="Configure AI models and application preferences" icon={Network} />

      <div className="trace-workbench-layout">

        {/* ── Left Navigation Rail ── */}
        <div
          className="flex-shrink-0 flex flex-col border-r border-slate-100 bg-white/60 transition-[width] duration-300 ease-in-out overflow-hidden"
          style={{ width: navCollapsed ? 52 : 220 }}
        >
          <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 flex-shrink-0">
            {!navCollapsed && (
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
                Settings
              </span>
            )}
            <button
              onClick={() => setNavCollapsed((c) => !c)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              title={navCollapsed ? "Expand" : "Collapse"}
            >
              {navCollapsed
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronLeft className="h-4 w-4" />
              }
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="py-2 px-2 space-y-0.5">
              {visibleSections.map((section) => {
                const SectionIcon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    title={navCollapsed ? section.label : undefined}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150 text-left ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <SectionIcon className="h-4 w-4 flex-shrink-0" />
                    {!navCollapsed && (
                      <span className="leading-snug break-words min-w-0">
                        {section.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right Content Panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-6 max-w-3xl mx-auto space-y-6">

              {/* LLM Provider — admin only */}
              {activeSection === "llm-provider" && isAdmin && (
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
                                  <SelectItem key={p} value={p}>{providerLabel(p)}</SelectItem>
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
              )}

              {/* API Key Management — admin only, shown inside llm-provider section */}
              {activeSection === "llm-provider" && isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      API Key Management
                    </CardTitle>
                    <CardDescription>
                      Keys saved here are stored in the database and override environment variables.
                      Ollama requires no key.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!keyStatus ? (
                      <p className="text-sm text-muted-foreground">Loading key status...</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedKeyProvider}
                            onValueChange={(v) => {
                              setSelectedKeyProvider(v);
                              setKeyInputs((k) => ({ ...k, [v]: "" }));
                            }}
                          >
                            <SelectTrigger className="w-44" data-testid="select-key-provider">
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(keyStatus)
                                .filter(([, info]) => info.required)
                                .map(([p]) => (
                                  <SelectItem key={p} value={p}>
                                    {providerLabel(p)}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="password"
                            placeholder={
                              selectedKeyProvider && keyStatus[selectedKeyProvider]?.set
                                ? "Enter new key to update..."
                                : "Paste API key..."
                            }
                            value={selectedKeyProvider ? (keyInputs[selectedKeyProvider] ?? "") : ""}
                            onChange={(e) =>
                              selectedKeyProvider &&
                              setKeyInputs((k) => ({ ...k, [selectedKeyProvider]: e.target.value }))
                            }
                            disabled={!selectedKeyProvider}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            disabled={!selectedKeyProvider || !(keyInputs[selectedKeyProvider] ?? "").trim() || (keySaving[selectedKeyProvider] ?? false)}
                            onClick={() => handleSaveKey(selectedKeyProvider)}
                          >
                            {keySaving[selectedKeyProvider] ? "Saving..." : "Save"}
                          </Button>
                          {selectedKeyProvider && keyStatus[selectedKeyProvider]?.source === "db" && (
                            <Button
                              variant="outline"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={keySaving[selectedKeyProvider] ?? false}
                              onClick={() => handleClearKey(selectedKeyProvider)}
                              title="Remove DB key (reverts to env var)"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                        {selectedKeyProvider && keyStatus[selectedKeyProvider] && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                              {keyStatus[selectedKeyProvider].env_var}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full border ${
                                keyStatus[selectedKeyProvider].set
                                  ? keyStatus[selectedKeyProvider].source === "db"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-green-50 text-green-700 border-green-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {keyStatus[selectedKeyProvider].set ? (
                                <><CheckCircle2 className="h-3 w-3" />{keyStatus[selectedKeyProvider].source === "db" ? "Set (DB)" : "Set (env)"}</>
                              ) : (
                                <><X className="h-3 w-3" />Not set</>
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pipeline Controls */}
              {activeSection === "pipeline-controls" && (
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
                      <p className="text-sm text-destructive">Failed to load Document Uplift controls.</p>
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
                            onChange={(e) => setDocumentUpliftMaxCalls(e.target.value)}
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
              )}

              {/* LLM Model */}
              {activeSection === "llm-model" && (
                <Card>
                  <CardHeader>
                    <CardTitle>LLM Model</CardTitle>
                    <CardDescription>Select the AI model to use for your conversations</CardDescription>
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
              )}

              {/* General Context */}
              {activeSection === "general-context" && (
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
                      onRemoveFile={(id) => setGeneralContextFiles((prev) => prev.filter((f) => f.id !== id))}
                      onUpload={handleGeneralContextUpload}
                      testId="general"
                      acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                      acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Company Policy */}
              {activeSection === "company-policy" && (
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
                      onRemoveFile={(id) => setCompanyPolicyFiles((prev) => prev.filter((f) => f.id !== id))}
                      onUpload={handleCompanyPolicyUpload}
                      testId="policy"
                      acceptedFileTypes=".pdf,.txt,.jpg,.jpeg,.csv,.xls,.xlsx"
                      acceptedExtensions={['pdf', 'txt', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx']}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Navigation Visibility */}
              {activeSection === "nav-visibility" && (
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
                      {HIDEABLE_TABS.map((tab) => {
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
              )}

              {/* User Management — admin only */}
              {activeSection === "user-management" && isAdmin && (
                <UserManagementSection
                  users={allUsers}
                  currentUserEmail={user?.email ?? ""}
                  onRoleChange={handleRoleChange}
                  onDelete={handleDeleteUser}
                  onOpenCreate={() => setShowCreateDialog(true)}
                />
              )}

            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Create User Dialog */}
      {isAdmin && (
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Full Name</label>
                <Input
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                <Input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@bank.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</label>
                <Input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</label>
                <Select
                  value={newUserForm.role}
                  onValueChange={(v) => setNewUserForm((f) => ({ ...f, role: v as UserRole }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="l1">L1 — User</SelectItem>
                    <SelectItem value="l2">L2 — Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                onClick={handleCreateUser}
                disabled={!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password.trim()}
              >
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
