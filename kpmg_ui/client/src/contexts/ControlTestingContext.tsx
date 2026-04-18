import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ── Domain types ──────────────────────────────────────────────────────────────

export type TestResultType = "pass" | "fail" | "partial" | "not_tested";
export type SessionStatus = "draft" | "in_progress" | "complete";

export interface EvidenceReview {
  conclusion: string;
  explanation: string;
  confidence: string;
  gaps: string;
}

export interface TestedControl {
  id: string;
  control_id: string;
  control_name: string;
  domain: string;
  test_result: TestResultType;
  evidence_text: string;
  evidence_review: EvidenceReview;
  tester_notes: string;
}

export interface TestingSession {
  id: string;
  title: string;
  description: string;
  status: SessionStatus;
  controls: TestedControl[];
  report_markdown: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryControl {
  control_id: string;
  control_name: string;
  domain: string;
}

// ── Context interface ─────────────────────────────────────────────────────────

interface Ctx {
  sessions: TestingSession[];
  selectedSession: TestingSession | null;
  libraryControls: LibraryControl[];
  isLoading: boolean;
  isReviewing: boolean;
  isGeneratingReport: boolean;
  error: string | null;
  report: string | null;
  fetchSessions: () => Promise<void>;
  selectSession: (s: TestingSession | null) => void;
  createSession: (title: string, description: string) => Promise<TestingSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  fetchLibraryControls: () => Promise<void>;
  addControls: (sessionId: string, controls: LibraryControl[]) => Promise<void>;
  updateControl: (
    sessionId: string,
    controlId: string,
    update: { test_result?: TestResultType; tester_notes?: string; evidence_text?: string },
  ) => Promise<void>;
  reviewEvidence: (sessionId: string, controlId: string, evidenceText: string, claim: string) => Promise<EvidenceReview>;
  generateReport: (sessionId: string) => Promise<void>;
}

const ControlTestingContext = createContext<Ctx | null>(null);

export function ControlTestingProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TestingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TestingSession | null>(null);
  const [libraryControls, setLibraryControls] = useState<LibraryControl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/control-testing");
      if (!r.ok) throw new Error("Failed to fetch sessions");
      setSessions(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectSession = useCallback((s: TestingSession | null) => {
    setSelectedSession(s);
    setReport(s?.report_markdown ?? null);
  }, []);

  const createSession = useCallback(async (title: string, description: string): Promise<TestingSession> => {
    const r = await fetch("/api/control-testing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    if (!r.ok) throw new Error("Failed to create session");
    const s: TestingSession = await r.json();
    setSessions(prev => [s, ...prev]);
    return s;
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error("Failed to delete session");
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setSelectedSession(prev => prev?.id === sessionId ? null : prev);
  }, []);

  const fetchLibraryControls = useCallback(async () => {
    try {
      const r = await fetch("/api/control-testing/library-controls");
      if (!r.ok) throw new Error("Failed to fetch library controls");
      setLibraryControls(await r.json());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const addControls = useCallback(async (sessionId: string, controls: LibraryControl[]): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controls }),
    });
    if (!r.ok) throw new Error("Failed to add controls");
    const updated = await fetch(`/api/control-testing/${sessionId}`);
    if (updated.ok) {
      const s: TestingSession = await updated.json();
      setSelectedSession(s);
      setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
    }
  }, []);

  const updateControl = useCallback(async (
    sessionId: string,
    controlId: string,
    update: { test_result?: TestResultType; tester_notes?: string; evidence_text?: string },
  ): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}/controls/${controlId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!r.ok) throw new Error("Failed to update control");
    const updated = await fetch(`/api/control-testing/${sessionId}`);
    if (updated.ok) {
      const s: TestingSession = await updated.json();
      setSelectedSession(s);
      setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
    }
  }, []);

  const reviewEvidence = useCallback(async (
    sessionId: string,
    controlId: string,
    evidenceText: string,
    claim: string,
  ): Promise<EvidenceReview> => {
    setIsReviewing(true);
    try {
      const r = await fetch(`/api/control-testing/${sessionId}/controls/${controlId}/review-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_text: evidenceText, claim }),
      });
      if (!r.ok) throw new Error("Evidence review failed");
      const data = await r.json();
      const updated = await fetch(`/api/control-testing/${sessionId}`);
      if (updated.ok) {
        const s: TestingSession = await updated.json();
        setSelectedSession(s);
        setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
      }
      return data.review as EvidenceReview;
    } finally {
      setIsReviewing(false);
    }
  }, []);

  const generateReport = useCallback(async (sessionId: string): Promise<void> => {
    setIsGeneratingReport(true);
    try {
      const r = await fetch(`/api/control-testing/${sessionId}/generate-report`, { method: "POST" });
      if (!r.ok) throw new Error("Report generation failed");
      const data = await r.json();
      setReport(data.report_markdown ?? null);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, status: "complete", report_markdown: data.report_markdown } : s
      ));
      setSelectedSession(prev =>
        prev?.id === sessionId ? { ...prev, status: "complete", report_markdown: data.report_markdown } : prev
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

  return (
    <ControlTestingContext.Provider value={{
      sessions, selectedSession, libraryControls,
      isLoading, isReviewing, isGeneratingReport, error, report,
      fetchSessions, selectSession, createSession, deleteSession,
      fetchLibraryControls, addControls, updateControl,
      reviewEvidence, generateReport,
    }}>
      {children}
    </ControlTestingContext.Provider>
  );
}

export function useControlTesting() {
  const ctx = useContext(ControlTestingContext);
  if (!ctx) throw new Error("useControlTesting must be used inside ControlTestingProvider");
  return ctx;
}
