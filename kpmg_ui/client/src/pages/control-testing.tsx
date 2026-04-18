import { useEffect, useState } from "react";
import {
  CheckCircle2, ChevronRight, FileBarChart,
  Loader2, Plus, Shield, Sparkles,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useControlTesting,
  TestResultType,
  TestedControl,
  LibraryControl,
} from "@/contexts/ControlTestingContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ["Setup", "Controls", "Evidence", "Report"];

const RESULT_COLOR: Record<TestResultType, string> = {
  pass: "bg-emerald-100 text-emerald-700 border-emerald-300",
  fail: "bg-red-100 text-red-700 border-red-300",
  partial: "bg-amber-100 text-amber-700 border-amber-300",
  not_tested: "bg-slate-100 text-slate-500 border-slate-300",
};

const RESULT_LABEL: Record<TestResultType, string> = {
  pass: "Pass",
  fail: "Fail",
  partial: "Partial",
  not_tested: "Not Tested",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-300",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ControlTestingPage() {
  const {
    sessions, selectedSession, libraryControls,
    isLoading, isReviewing, isGeneratingReport, report,
    fetchSessions, selectSession, createSession,
    fetchLibraryControls, addControls, updateControl,
    reviewEvidence, generateReport,
  } = useControlTesting();
  const { toast } = useToast();

  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [controlSearch, setControlSearch] = useState("");

  const [activeControlId, setActiveControlId] = useState<string | null>(null);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [claimInput, setClaimInput] = useState("");

  useEffect(() => { fetchSessions(); fetchLibraryControls(); }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const total = sessions.length;
  const complete = sessions.filter(s => s.status === "complete").length;
  const allControls = sessions.flatMap(s => s.controls);
  const failCount = allControls.filter(c => c.test_result === "fail").length;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const filteredLibrary = libraryControls.filter(c =>
    controlSearch === "" ||
    c.control_name.toLowerCase().includes(controlSearch.toLowerCase()) ||
    c.domain.toLowerCase().includes(controlSearch.toLowerCase())
  );

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      const s = await createSession(newTitle.trim(), newDesc.trim());
      selectSession(s);
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setWizardStep(0);
      toast({ title: "Session created" });
    } catch {
      toast({ title: "Failed to create session", variant: "destructive" });
    }
  }

  async function handleAddControls() {
    if (!selectedSession || selectedLibraryIds.size === 0) return;
    const toAdd: LibraryControl[] = libraryControls.filter(c => selectedLibraryIds.has(c.control_id));
    try {
      await addControls(selectedSession.id, toAdd);
      setSelectedLibraryIds(new Set());
      setWizardStep(1);
      toast({ title: `${toAdd.length} control(s) added` });
    } catch {
      toast({ title: "Failed to add controls", variant: "destructive" });
    }
  }

  async function handleResult(ctrl: TestedControl, result: TestResultType) {
    if (!selectedSession) return;
    try {
      await updateControl(selectedSession.id, ctrl.id, { test_result: result });
    } catch {
      toast({ title: "Failed to update result", variant: "destructive" });
    }
  }

  async function handleNotes(ctrl: TestedControl, notes: string) {
    if (!selectedSession) return;
    await updateControl(selectedSession.id, ctrl.id, { tester_notes: notes });
  }

  async function handleReviewEvidence() {
    if (!selectedSession || !activeControlId) return;
    if (!evidenceInput.trim()) {
      toast({ title: "Paste evidence text first", variant: "destructive" });
      return;
    }
    try {
      const review = await reviewEvidence(selectedSession.id, activeControlId, evidenceInput, claimInput);
      toast({ title: `Evidence review: ${review.conclusion}` });
      setEvidenceInput("");
      setClaimInput("");
    } catch {
      toast({ title: "Evidence review failed", variant: "destructive" });
    }
  }

  async function handleGenerateReport() {
    if (!selectedSession) return;
    try {
      await generateReport(selectedSession.id);
      toast({ title: "Report generated" });
    } catch {
      toast({ title: "Report generation failed", variant: "destructive" });
    }
  }

  const activeControl = selectedSession?.controls.find(c => c.id === activeControlId) ?? null;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <HeroSection
        title="Control Testing"
        subtitle="Test controls against evidence — evidence review, findings, and final audit report"
        icon={Shield}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel: session list ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <Button className="w-full" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Session
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-5 h-5 text-slate-400" /></div>
            ) : sessions.map(s => (
              <button
                key={s.id}
                onClick={() => { selectSession(s); setWizardStep(s.status === "complete" ? 3 : s.controls.length > 0 ? 1 : 0); }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedSession?.id === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
              >
                <p className="font-medium text-sm text-slate-800 truncate">{s.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[s.status]}`}>
                    {s.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-400">{s.controls.length} ctrl{s.controls.length !== 1 ? "s" : ""}</span>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-auto p-6">
          {/* Create form */}
          {showCreate && (
            <Card className="max-w-lg mx-auto mb-6">
              <CardHeader><CardTitle>New Testing Session</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Session title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button onClick={handleCreate}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dashboard */}
          {!selectedSession && !showCreate && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-blue-600">{total}</p><p className="text-sm text-slate-500">Total Sessions</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-emerald-600">{complete}</p><p className="text-sm text-slate-500">Complete</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-red-500">{failCount}</p><p className="text-sm text-slate-500">Failed Controls</p></CardContent></Card>
              </div>
              <p className="text-slate-400 text-sm">Select a session from the left or create a new one.</p>
            </div>
          )}

          {/* Wizard */}
          {selectedSession && (
            <div className="max-w-3xl">
              {/* Stepper */}
              <div className="flex items-center gap-2 mb-6">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${i < wizardStep ? "bg-emerald-500 border-emerald-500 text-white" : i === wizardStep ? "bg-blue-500 border-blue-500 text-white" : "bg-white border-slate-300 text-slate-400"}`}>
                      {i < wizardStep ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === wizardStep ? "text-blue-600" : "text-slate-400"}`}>{label}</span>
                    {i < WIZARD_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 ml-1" />}
                  </div>
                ))}
              </div>

              {/* Step 0: Setup */}
              {wizardStep === 0 && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{selectedSession.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-slate-500">{selectedSession.description || "No description."}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">Select controls from library</p>
                        <span className="text-xs text-slate-400">{selectedLibraryIds.size} selected</span>
                      </div>
                      <Input
                        placeholder="Search by name or domain…"
                        value={controlSearch}
                        onChange={e => setControlSearch(e.target.value)}
                        className="text-sm"
                      />
                      <div className="max-h-64 overflow-y-auto border rounded divide-y">
                        {filteredLibrary.length === 0 && (
                          <p className="text-xs text-slate-400 p-3">No controls in library yet. Upload controls via the Controls Library module.</p>
                        )}
                        {filteredLibrary.map(c => (
                          <label key={c.control_id} className="flex items-start gap-2 p-2 hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={selectedLibraryIds.has(c.control_id)}
                              onChange={e => {
                                setSelectedLibraryIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(c.control_id);
                                  else next.delete(c.control_id);
                                  return next;
                                });
                              }}
                            />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{c.control_name}</p>
                              <p className="text-xs text-slate-500">{c.domain}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button onClick={handleAddControls} disabled={selectedLibraryIds.size === 0}>
                        Add Selected Controls <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                  {selectedSession.controls.length > 0 && (
                    <Button variant="outline" onClick={() => setWizardStep(1)}>
                      Skip — view existing controls ({selectedSession.controls.length})
                    </Button>
                  )}
                </div>
              )}

              {/* Step 1: Controls */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Controls ({selectedSession.controls.length})</h3>
                    <Button size="sm" onClick={() => setWizardStep(2)}>
                      Evidence Review <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  {selectedSession.controls.length === 0 && (
                    <p className="text-slate-400 text-sm">No controls added. Go back to Setup.</p>
                  )}
                  {selectedSession.controls.map(ctrl => (
                    <Card key={ctrl.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm text-slate-800">{ctrl.control_name}</p>
                            <p className="text-xs text-slate-500">{ctrl.domain}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${RESULT_COLOR[ctrl.test_result]}`}>
                            {RESULT_LABEL[ctrl.test_result]}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {(["pass", "fail", "partial", "not_tested"] as TestResultType[]).map(r => (
                            <button
                              key={r}
                              onClick={() => handleResult(ctrl, r)}
                              className={`px-2 py-0.5 rounded border text-xs transition-colors ${ctrl.test_result === r ? RESULT_COLOR[r] : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"}`}
                            >
                              {RESULT_LABEL[r]}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="Tester notes…"
                          defaultValue={ctrl.tester_notes}
                          onBlur={e => handleNotes(ctrl, e.target.value)}
                          rows={1}
                          className="text-xs"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Step 2: Evidence Review */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Evidence Review</h3>
                    <Button size="sm" onClick={() => setWizardStep(3)}>
                      Generate Report <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {selectedSession.controls.map(ctrl => {
                      const reviewed = !!ctrl.evidence_review.conclusion;
                      return (
                        <button
                          key={ctrl.id}
                          onClick={() => setActiveControlId(ctrl.id)}
                          className={`text-left p-3 rounded border text-sm transition-colors ${activeControlId === ctrl.id ? "bg-blue-50 border-blue-400" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                        >
                          <p className="font-medium text-slate-800 truncate">{ctrl.control_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs ${RESULT_COLOR[ctrl.test_result]}`}>
                              {RESULT_LABEL[ctrl.test_result]}
                            </Badge>
                            {reviewed && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {activeControl && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">{activeControl.control_name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {activeControl.evidence_review.conclusion && (
                          <div className="p-3 bg-slate-50 rounded border text-xs space-y-1">
                            <p><strong>Conclusion:</strong> {activeControl.evidence_review.conclusion}</p>
                            <p><strong>Explanation:</strong> {activeControl.evidence_review.explanation}</p>
                            <p><strong>Confidence:</strong> {activeControl.evidence_review.confidence}</p>
                            <p><strong>Gaps:</strong> {activeControl.evidence_review.gaps}</p>
                          </div>
                        )}
                        <Input
                          placeholder="Claim under review (optional — defaults to control name)"
                          value={claimInput}
                          onChange={e => setClaimInput(e.target.value)}
                          className="text-sm"
                        />
                        <Textarea
                          placeholder="Paste evidence text here…"
                          value={evidenceInput}
                          onChange={e => setEvidenceInput(e.target.value)}
                          rows={5}
                          className="text-sm font-mono"
                        />
                        <Button onClick={handleReviewEvidence} disabled={isReviewing}>
                          {isReviewing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reviewing…</> : <><Sparkles className="w-4 h-4 mr-1" />Review Evidence</>}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  {!activeControl && (
                    <p className="text-slate-400 text-sm">Select a control above to review its evidence.</p>
                  )}
                </div>
              )}

              {/* Step 3: Report */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Final Report</h3>
                    <Button size="sm" onClick={handleGenerateReport} disabled={isGeneratingReport}>
                      {isGeneratingReport
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Generating…</>
                        : <><FileBarChart className="w-4 h-4 mr-1" />Generate Report</>}
                    </Button>
                  </div>
                  {report ? (
                    <Card>
                      <CardContent className="pt-4">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono leading-relaxed">{report}</pre>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="text-slate-400 text-sm">
                      Click "Generate Report" to produce the domain-grouped Control Testing Report.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
