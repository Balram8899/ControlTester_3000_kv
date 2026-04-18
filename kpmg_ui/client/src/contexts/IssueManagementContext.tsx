import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Severity = "Low" | "Medium" | "High" | "Critical";
export type IssueStatus = "Open" | "In Remediation" | "Pending Review" | "Closed" | "Returned";
export type QueueStatus = "Pending" | "Accepted" | "Dismissed";

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
  checker: string;
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
  source_module: string | null;
  asset_ids: string[];
  control_ids: string[];
  risk_assessment_id: string | null;
  raised_by: string;
  owner: string;
  checker: string;
  remediation_plan: string | null;
  target_date: string | null;
  review_notes: string | null;
  closure_notes: string | null;
  evidences: IssueEvidence[];
  approvals: IssueApproval[];
  created_at: string;
  updated_at: string;
}

export interface IssueCreate {
  title: string;
  description: string;
  severity: Severity;
  source_module?: string;
  asset_ids?: string[];
  control_ids?: string[];
  risk_assessment_id?: string;
  raised_by: string;
  owner: string;
  checker: string;
  remediation_plan?: string;
  target_date?: string;
  review_notes?: string;
  closure_notes?: string;
}

export interface IssueImpact {
  issue_id: string;
  severity: Severity;
  status: IssueStatus;
  control_effectiveness: number;
  note: string;
}

export interface ValidationQueueCreate {
  title: string;
  description: string;
  severity: Severity;
  source_module?: string;
  asset_ids?: string[];
  control_ids?: string[];
}

export interface ValidationQueueItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  source_module: string | null;
  asset_ids: string[];
  control_ids: string[];
  queue_status: QueueStatus;
  accepted_issue_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Ctx {
  issues: Issue[];
  selectedIssue: Issue | null;
  isLoading: boolean;
  error: string | null;
  impact: IssueImpact | null;
  isLoadingImpact: boolean;
  queueItems: ValidationQueueItem[];
  isLoadingQueue: boolean;
  fetchIssues: (filters?: { severity?: string; status?: string; asset_id?: string; control_id?: string; source_module?: string }) => Promise<void>;
  selectIssue: (i: Issue | null) => void;
  createIssue: (data: IssueCreate) => Promise<Issue>;
  updateIssue: (id: string, data: Partial<IssueCreate>) => Promise<Issue>;
  deleteIssue: (id: string) => Promise<void>;
  uploadEvidence: (issueId: string, file: File, uploadedBy: string) => Promise<Issue>;
  submitIssue: (issueId: string) => Promise<Issue>;
  approveIssue: (issueId: string, decision: "approved" | "rejected", notes?: string) => Promise<Issue>;
  fetchImpact: (issueId: string) => Promise<void>;
  fetchQueue: (queueStatus?: QueueStatus) => Promise<void>;
  addToQueue: (data: ValidationQueueCreate) => Promise<ValidationQueueItem>;
  acceptQueueItem: (itemId: string, raisedBy: string, owner: string, checker: string) => Promise<ValidationQueueItem>;
  dismissQueueItem: (itemId: string) => Promise<ValidationQueueItem>;
}

const IssueManagementContext = createContext<Ctx | null>(null);

export function IssueManagementProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<IssueImpact | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);
  const [queueItems, setQueueItems] = useState<ValidationQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  const fetchIssues = useCallback(async (filters?: { severity?: string; status?: string; asset_id?: string; control_id?: string; source_module?: string }) => {
    setIsLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (filters?.severity)      p.set("severity", filters.severity);
      if (filters?.status)        p.set("status", filters.status);
      if (filters?.asset_id)      p.set("asset_id", filters.asset_id);
      if (filters?.control_id)    p.set("control_id", filters.control_id);
      if (filters?.source_module) p.set("source_module", filters.source_module);
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

  const fetchQueue = useCallback(async (queueStatus?: QueueStatus): Promise<void> => {
    setIsLoadingQueue(true);
    try {
      const p = new URLSearchParams();
      if (queueStatus) p.set("queue_status", queueStatus);
      const r = await fetch(`/api/validation-queue?${p}`);
      if (!r.ok) throw new Error("Failed to fetch queue");
      setQueueItems(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setIsLoadingQueue(false); }
  }, []);

  const addToQueue = useCallback(async (data: ValidationQueueCreate): Promise<ValidationQueueItem> => {
    const r = await fetch("/api/validation-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Failed to add to queue");
    const item: ValidationQueueItem = await r.json();
    setQueueItems(p => [item, ...p]);
    return item;
  }, []);

  const acceptQueueItem = useCallback(async (itemId: string, raisedBy: string, owner: string, checker: string): Promise<ValidationQueueItem> => {
    const r = await fetch(`/api/validation-queue/${itemId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raised_by: raisedBy, owner, checker }),
    });
    if (!r.ok) throw new Error("Failed to accept queue item");
    const updated: ValidationQueueItem = await r.json();
    setQueueItems(p => p.map(i => i.id === itemId ? updated : i));
    await fetchIssues();
    return updated;
  }, [fetchIssues]);

  const dismissQueueItem = useCallback(async (itemId: string): Promise<ValidationQueueItem> => {
    const r = await fetch(`/api/validation-queue/${itemId}/dismiss`, { method: "POST" });
    if (!r.ok) throw new Error("Failed to dismiss queue item");
    const updated: ValidationQueueItem = await r.json();
    setQueueItems(p => p.map(i => i.id === itemId ? updated : i));
    return updated;
  }, []);

  return (
    <IssueManagementContext.Provider value={{
      issues, selectedIssue, isLoading, error, impact, isLoadingImpact,
      queueItems, isLoadingQueue,
      fetchIssues, selectIssue, createIssue, updateIssue, deleteIssue,
      uploadEvidence, submitIssue, approveIssue, fetchImpact,
      fetchQueue, addToQueue, acceptQueueItem, dismissQueueItem,
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
