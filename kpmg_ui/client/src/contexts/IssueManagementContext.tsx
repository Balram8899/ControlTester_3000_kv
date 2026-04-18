import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Severity = "Low" | "Medium" | "High" | "Critical";
export type IssueStatus = "Open" | "In Remediation" | "Pending Sign-off" | "Closed";

export interface IssueEvidence {
  id: string;
  filename: string;
  content_b64: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface IssueApproval {
  id: string;
  stage: number;
  approver: string;
  decision: "approved" | "rejected";
  notes: string | null;
  decided_at: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  asset_id: string | null;
  control_id: string | null;
  risk_assessment_id: string | null;
  raised_by: string;
  assigned_to: string;
  approver: string;
  remediation_plan: string | null;
  target_date: string | null;
  evidences: IssueEvidence[];
  approvals: IssueApproval[];
  created_at: string;
  updated_at: string;
}

export interface IssueCreate {
  title: string;
  description: string;
  severity: Severity;
  asset_id?: string;
  control_id?: string;
  risk_assessment_id?: string;
  raised_by: string;
  assigned_to: string;
  approver: string;
  remediation_plan?: string;
  target_date?: string;
}

export interface IssueImpact {
  issue_id: string;
  severity: Severity;
  status: IssueStatus;
  control_effectiveness: number;
  note: string;
}

interface Ctx {
  issues: Issue[];
  selectedIssue: Issue | null;
  isLoading: boolean;
  error: string | null;
  impact: IssueImpact | null;
  isLoadingImpact: boolean;
  fetchIssues: (filters?: { severity?: string; status?: string; asset_id?: string; control_id?: string }) => Promise<void>;
  selectIssue: (i: Issue | null) => void;
  createIssue: (data: IssueCreate) => Promise<Issue>;
  updateIssue: (id: string, data: Partial<IssueCreate>) => Promise<Issue>;
  deleteIssue: (id: string) => Promise<void>;
  uploadEvidence: (issueId: string, file: File, uploadedBy: string) => Promise<Issue>;
  submitIssue: (issueId: string) => Promise<Issue>;
  approveIssue: (issueId: string, decision: "approved" | "rejected", notes?: string) => Promise<Issue>;
  fetchImpact: (issueId: string) => Promise<void>;
}

const IssueManagementContext = createContext<Ctx | null>(null);

export function IssueManagementProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<IssueImpact | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);

  const fetchIssues = useCallback(async (filters?: { severity?: string; status?: string; asset_id?: string; control_id?: string }) => {
    setIsLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (filters?.severity)   p.set("severity", filters.severity);
      if (filters?.status)     p.set("status", filters.status);
      if (filters?.asset_id)   p.set("asset_id", filters.asset_id);
      if (filters?.control_id) p.set("control_id", filters.control_id);
      const r = await fetch(`/api/issues?${p}`);
      if (!r.ok) throw new Error("Failed to fetch issues");
      setIssues(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  const selectIssue = useCallback((i: Issue | null) => {
    setSelectedIssue(i); setImpact(null);
  }, []);

  const createIssue = useCallback(async (data: IssueCreate): Promise<Issue> => {
    const r = await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Failed to create issue");
    const issue: Issue = await r.json();
    setIssues(p => [issue, ...p]);
    return issue;
  }, []);

  const updateIssue = useCallback(async (id: string, data: Partial<IssueCreate>): Promise<Issue> => {
    const r = await fetch(`/api/issues/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Failed to update issue");
    const updated: Issue = await r.json();
    setIssues(p => p.map(i => i.id === id ? updated : i));
    if (selectedIssue?.id === id) setSelectedIssue(updated);
    return updated;
  }, [selectedIssue]);

  const deleteIssue = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/issues/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Failed to delete issue");
    setIssues(p => p.filter(i => i.id !== id));
    if (selectedIssue?.id === id) setSelectedIssue(null);
  }, [selectedIssue]);

  const uploadEvidence = useCallback(async (issueId: string, file: File, uploadedBy: string): Promise<Issue> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("uploaded_by", uploadedBy);
    const r = await fetch(`/api/issues/${issueId}/evidence`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("Failed to upload evidence");
    const updated: Issue = await r.json();
    setIssues(p => p.map(i => i.id === issueId ? updated : i));
    if (selectedIssue?.id === issueId) setSelectedIssue(updated);
    return updated;
  }, [selectedIssue]);

  const submitIssue = useCallback(async (issueId: string): Promise<Issue> => {
    const r = await fetch(`/api/issues/${issueId}/submit`, { method: "POST" });
    if (!r.ok) throw new Error("Failed to submit issue");
    const updated: Issue = await r.json();
    setIssues(p => p.map(i => i.id === issueId ? updated : i));
    if (selectedIssue?.id === issueId) setSelectedIssue(updated);
    return updated;
  }, [selectedIssue]);

  const approveIssue = useCallback(async (issueId: string, decision: "approved" | "rejected", notes?: string): Promise<Issue> => {
    const r = await fetch(`/api/issues/${issueId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes }),
    });
    if (!r.ok) throw new Error("Failed to approve issue");
    const updated: Issue = await r.json();
    setIssues(p => p.map(i => i.id === issueId ? updated : i));
    if (selectedIssue?.id === issueId) setSelectedIssue(updated);
    return updated;
  }, [selectedIssue]);

  const fetchImpact = useCallback(async (issueId: string): Promise<void> => {
    setIsLoadingImpact(true);
    try {
      const r = await fetch(`/api/issues/${issueId}/impact`);
      if (!r.ok) throw new Error("Failed to fetch impact");
      setImpact(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setIsLoadingImpact(false); }
  }, []);

  return (
    <IssueManagementContext.Provider value={{
      issues, selectedIssue, isLoading, error, impact, isLoadingImpact,
      fetchIssues, selectIssue, createIssue, updateIssue, deleteIssue,
      uploadEvidence, submitIssue, approveIssue, fetchImpact,
    }}>
      {children}
    </IssueManagementContext.Provider>
  );
}

export function useIssueManagement() {
  const ctx = useContext(IssueManagementContext);
  if (!ctx) throw new Error("useIssueManagement must be inside IssueManagementProvider");
  return ctx;
}
