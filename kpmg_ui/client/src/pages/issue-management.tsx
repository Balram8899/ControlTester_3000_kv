import { useEffect, useState, useRef } from "react";
import {
  AlertTriangle, CheckCircle, Clock, XCircle, Plus, Search,
  Loader2, Trash2, Upload, Send, ThumbsUp, ThumbsDown, X, Shield,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useIssueManagement, Issue, IssueCreate, Severity,
} from "@/contexts/IssueManagementContext";

const SEV_COLOR: Record<Severity, string> = {
  Low:      "bg-emerald-100 text-emerald-700 border-emerald-300",
  Medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  High:     "bg-orange-100 text-orange-700 border-orange-300",
  Critical: "bg-red-100 text-red-700 border-red-300",
};

const STATUS_ICON: Record<string, any> = {
  "Open":              AlertTriangle,
  "In Remediation":    Clock,
  "Pending Sign-off":  Send,
  "Closed":            CheckCircle,
};

const EMPTY: IssueCreate = {
  title: "", description: "", severity: "Medium",
  raised_by: "", assigned_to: "", approver: "",
};

export default function IssueManagementPage() {
  const {
    issues, selectedIssue, isLoading, impact, isLoadingImpact,
    fetchIssues, selectIssue, createIssue, deleteIssue,
    uploadEvidence, submitIssue, approveIssue, fetchImpact,
  } = useIssueManagement();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"dashboard" | "detail" | "remediation">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IssueCreate>(EMPTY);
  const [approveNotes, setApproveNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchIssues(); }, []);
  useEffect(() => { if (selectedIssue) fetchImpact(selectedIssue.id); }, [selectedIssue?.id]);

  const filtered = issues.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.severity.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    open:     issues.filter(i => i.status === "Open").length,
    critical: issues.filter(i => i.severity === "Critical" && i.status !== "Closed").length,
    pending:  issues.filter(i => i.status === "Pending Sign-off").length,
    overdue:  issues.filter(i =>
      i.target_date !== null && i.target_date !== undefined &&
      new Date(i.target_date) < new Date() && i.status !== "Closed"
    ).length,
  };

  async function handleCreate() {
    try {
      await createIssue(form);
      setShowForm(false); setForm(EMPTY);
      toast({ title: "Issue created", description: form.title });
    } catch { toast({ title: "Failed to create issue", variant: "destructive" }); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedIssue || !e.target.files?.[0]) return;
    try {
      await uploadEvidence(selectedIssue.id, e.target.files[0], "Current User");
      toast({ title: "Evidence uploaded" });
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (!selectedIssue) return;
    try {
      await submitIssue(selectedIssue.id);
      toast({ title: "Submitted for sign-off" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }

  async function handleApprove(decision: "approved" | "rejected") {
    if (!selectedIssue) return;
    try {
      await approveIssue(selectedIssue.id, decision, approveNotes || undefined);
      setApproveNotes("");
      toast({ title: decision === "approved" ? "Issue closed" : "Returned for remediation" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HeroSection title="Issue Management" subtitle="Track, triage, and resolve issues across engagements" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input className="pl-7 h-8 text-xs" placeholder="Search issues…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" className="h-8 px-2" onClick={() => setShowForm(true)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {filtered.map(issue => {
              const Icon = STATUS_ICON[issue.status] ?? AlertTriangle;
              const sel = selectedIssue?.id === issue.id;
              return (
                <div key={issue.id} onClick={() => { selectIssue(issue); setTab("dashboard"); }}
                  className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${sel ? "bg-blue-50 border-l-2 border-l-[#001E62]" : "hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">{issue.title}</span>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex-shrink-0 ${SEV_COLOR[issue.severity]}`}>{issue.severity}</Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 ml-5">{issue.status}</p>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No issues found</p>}
          </ScrollArea>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 bg-white">
            {(["dashboard", "detail", "remediation"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? "border-[#001E62] text-[#001E62]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t === "remediation" ? "Remediation Tracker" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">
            {/* Dashboard Tab */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Open Issues",        value: kpis.open,     icon: AlertTriangle, color: "text-blue-600"    },
                    { label: "Critical",            value: kpis.critical, icon: XCircle,       color: "text-red-600"    },
                    { label: "Pending Sign-off",    value: kpis.pending,  icon: Send,          color: "text-amber-600"  },
                    { label: "Overdue Remediation", value: kpis.overdue,  icon: Clock,         color: "text-orange-600" },
                  ].map(k => (
                    <Card key={k.label} className="border-slate-200">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">{k.label}</p>
                          <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {selectedIssue && (
                  <Card className="border-[#001E62]">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold text-[#001E62] uppercase tracking-wide">Selected: {selectedIssue.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1.5 text-xs text-slate-600">
                      <p><span className="font-medium">Severity:</span> <Badge className={`text-[10px] ${SEV_COLOR[selectedIssue.severity]}`}>{selectedIssue.severity}</Badge></p>
                      <p><span className="font-medium">Status:</span> {selectedIssue.status}</p>
                      <p><span className="font-medium">Raised by:</span> {selectedIssue.raised_by} | <span className="font-medium">Assigned to:</span> {selectedIssue.assigned_to}</p>
                      {impact && !isLoadingImpact && (
                        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
                          <p className="flex items-center gap-1 text-amber-700 font-medium"><Shield className="h-3 w-3" /> Control Effectiveness</p>
                          <p className="text-amber-600">{(impact.control_effectiveness * 100).toFixed(0)}% — {impact.status === "Closed" ? "Issue closed, full effectiveness restored" : `Reduced due to ${impact.severity} severity open issue`}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Detail Tab */}
            {tab === "detail" && selectedIssue && (
              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{selectedIssue.title}</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600"
                    onClick={async () => { await deleteIssue(selectedIssue.id); toast({ title: "Deleted" }); }}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["Severity",    selectedIssue.severity],
                    ["Status",      selectedIssue.status],
                    ["Raised by",   selectedIssue.raised_by],
                    ["Assigned to", selectedIssue.assigned_to],
                    ["Approver",    selectedIssue.approver],
                    ["Target date", selectedIssue.target_date ?? "Not set"],
                  ].map(([l, v]) => (
                    <div key={l} className="p-2 bg-white rounded border border-slate-100">
                      <p className="text-slate-400 text-[10px]">{l}</p>
                      <p className="text-slate-700 font-medium mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-white rounded border border-slate-100 text-xs">
                  <p className="text-slate-400 text-[10px] mb-1">Description</p>
                  <p className="text-slate-700">{selectedIssue.description}</p>
                </div>
                {selectedIssue.approvals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Approval History</p>
                    {selectedIssue.approvals.map((a: any) => (
                      <div key={a.id} className={`p-2 rounded border text-xs ${a.decision === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <p className="font-medium">{a.approver} — <span className="capitalize">{a.decision}</span></p>
                        {a.notes && <p className="text-slate-500 mt-0.5">{a.notes}</p>}
                        <p className="text-slate-400 text-[10px] mt-0.5">{a.decided_at}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === "detail" && !selectedIssue && <p className="text-xs text-slate-400 text-center mt-12">Select an issue to view details</p>}

            {/* Remediation Tracker Tab */}
            {tab === "remediation" && selectedIssue && (
              <div className="space-y-4 max-w-lg">
                <p className="text-xs font-semibold text-slate-600">Remediation for <span className="text-[#001E62]">{selectedIssue.title}</span></p>

                <div className="p-3 bg-white rounded border border-slate-100 text-xs">
                  <p className="text-slate-400 text-[10px] mb-1">Remediation Plan</p>
                  <p className="text-slate-700">{selectedIssue.remediation_plan ?? <span className="text-slate-400 italic">Not yet set</span>}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Evidence ({selectedIssue.evidences.length})</p>
                    <div>
                      <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => fileRef.current?.click()}>
                        <Upload className="h-3 w-3" /> Upload
                      </Button>
                    </div>
                  </div>
                  {selectedIssue.evidences.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 text-xs">
                      <Upload className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700 truncate">{e.filename}</p>
                        <p className="text-slate-400 text-[10px]">by {e.uploaded_by} · {e.uploaded_at.slice(0, 10)}</p>
                      </div>
                    </div>
                  ))}
                  {selectedIssue.evidences.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No evidence uploaded yet</p>}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sign-off Workflow</p>
                  {(selectedIssue.status === "Open" || selectedIssue.status === "In Remediation") && (
                    <Button size="sm" className="w-full gap-1 text-xs" onClick={handleSubmit}>
                      <Send className="h-3 w-3" /> Submit for Sign-off
                    </Button>
                  )}
                  {selectedIssue.status === "Pending Sign-off" && (
                    <div className="space-y-2">
                      <textarea
                        className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none"
                        rows={2} placeholder="Approval notes (optional)…"
                        value={approveNotes} onChange={e => setApproveNotes(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove("approved")}>
                          <ThumbsUp className="h-3 w-3" /> Approve & Close
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs text-red-600 border-red-300" onClick={() => handleApprove("rejected")}>
                          <ThumbsDown className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}
                  {selectedIssue.status === "Closed" && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded border border-emerald-200 text-xs text-emerald-700">
                      <CheckCircle className="h-4 w-4" /> Issue closed — control effectiveness restored.
                    </div>
                  )}
                </div>
              </div>
            )}
            {tab === "remediation" && !selectedIssue && <p className="text-xs text-slate-400 text-center mt-12">Select an issue to track remediation</p>}
          </ScrollArea>
        </div>
      </div>

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Raise Issue</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-slate-600">Title *</label>
                  <Input className="mt-1 h-8 text-xs" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
                </div>
                <div><label className="text-xs font-medium text-slate-600">Description *</label>
                  <textarea className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none" rows={3}
                    value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
                </div>
                <div><label className="text-xs font-medium text-slate-600">Severity *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                    value={form.severity} onChange={e => setForm(p => ({...p, severity: e.target.value as Severity}))}>
                    {["Low","Medium","High","Critical"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["raised_by","assigned_to","approver"] as const).map(f => (
                    <div key={f}><label className="text-xs font-medium text-slate-600 capitalize">{f.replace("_"," ")} *</label>
                      <Input className="mt-1 h-8 text-xs" value={form[f] as string} onChange={e => setForm(p => ({...p, [f]: e.target.value}))} />
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate}
                disabled={!form.title || !form.description || !form.raised_by || !form.assigned_to || !form.approver}>
                Raise Issue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
