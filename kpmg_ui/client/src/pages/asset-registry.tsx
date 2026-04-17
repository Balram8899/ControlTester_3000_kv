// kpmg_ui/client/src/pages/asset-registry.tsx
import { useEffect, useState } from "react";
import { Database, Server, GitBranch, Building2, Plus, Search, AlertTriangle, Clock, Shield, Loader2, Trash2, Zap, X } from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAssetRegistry, Asset, AssetCreate, AssetType } from "@/contexts/AssetRegistryContext";
import CiaRatingWidget from "@/components/CiaRatingWidget";

const TYPE_ICONS: Record<string, any> = { IT: Server, Data: Database, Process: GitBranch, Vendor: Building2 };

const CRIT_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-300",
  High:     "bg-orange-100 text-orange-700 border-orange-300",
  Medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low:      "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const EMPTY: AssetCreate = {
  name: "", type: "IT", description: "",
  confidentiality_score: 3, integrity_score: 3, availability_score: 3,
  owner: "", custodian: "", location: "Cloud", jurisdiction: "", classification: "Internal",
};

export default function AssetRegistryPage() {
  const { assets, selectedAsset, isLoading, controlSuggestions, isSuggestingControls,
          fetchAssets, selectAsset, createAsset, deleteAsset, suggestControls } = useAssetRegistry();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AssetCreate>(EMPTY);
  const [tab, setTab] = useState<"dashboard" | "detail" | "controls">("dashboard");

  useEffect(() => { fetchAssets(); }, []);

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) || a.type.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    total: assets.length,
    critical: assets.filter(a => a.criticality === "Critical").length,
    due: assets.filter(a => a.next_assessment_due && new Date(a.next_assessment_due) <= new Date()).length,
  };

  async function handleCreate() {
    try {
      await createAsset(form);
      setShowForm(false); setForm(EMPTY);
      toast({ title: "Asset created", description: form.name });
    } catch { toast({ title: "Failed to create asset", variant: "destructive" }); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HeroSection title="Asset Registry" subtitle="Manage assets, CIA ratings, and control mappings" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input className="pl-7 h-8 text-xs" placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" className="h-8 px-2" onClick={() => setShowForm(true)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {filtered.map(asset => {
              const Icon = TYPE_ICONS[asset.type] ?? Server;
              const sel = selectedAsset?.id === asset.id;
              return (
                <div key={asset.id} onClick={() => { selectAsset(asset); setTab("dashboard"); }}
                  className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${sel ? "bg-blue-50 border-l-2 border-l-[#001E62]" : "hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">{asset.name}</span>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex-shrink-0 ${CRIT_COLOR[asset.criticality]}`}>{asset.criticality}</Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 ml-6">{asset.type} · {asset.location}</p>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No assets found</p>}
          </ScrollArea>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 bg-white">
            {(["dashboard", "detail", "controls"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? "border-[#001E62] text-[#001E62]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t === "controls" ? "Controls Mapping" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">
            {/* Dashboard Tab */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Assets",       value: kpis.total,    icon: Database,      color: "text-blue-600"  },
                    { label: "Critical Assets",    value: kpis.critical, icon: AlertTriangle, color: "text-red-600"   },
                    { label: "Due for Assessment", value: kpis.due,      icon: Clock,         color: "text-amber-600" },
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
                <Card className="border-slate-200">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assets by Type</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {(["IT", "Data", "Process", "Vendor"] as AssetType[]).map(type => {
                        const Icon = TYPE_ICONS[type];
                        return (
                          <div key={type} className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-700">{assets.filter(a => a.type === type).length}</p>
                            <p className="text-[10px] text-slate-400">{type}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                {selectedAsset && (
                  <Card className="border-[#001E62]">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold text-[#001E62] uppercase tracking-wide">Selected: {selectedAsset.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1 text-xs text-slate-600">
                      <p><span className="font-medium">CIA Score:</span> {selectedAsset.cia_score.toFixed(2)} / 5.00</p>
                      <p><span className="font-medium">Criticality:</span> <Badge className={`text-[10px] ${CRIT_COLOR[selectedAsset.criticality]}`}>{selectedAsset.criticality}</Badge></p>
                      <p><span className="font-medium">Next Assessment:</span> {selectedAsset.next_assessment_due ?? "Not scheduled"}</p>
                      <p><span className="font-medium">Owner:</span> {selectedAsset.owner} | <span className="font-medium">Custodian:</span> {selectedAsset.custodian}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Detail Tab */}
            {tab === "detail" && selectedAsset && (
              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{selectedAsset.name}</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600"
                    onClick={async () => { await deleteAsset(selectedAsset.id); toast({ title: "Deleted" }); }}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[["Type", selectedAsset.type], ["Status", selectedAsset.status], ["Location", selectedAsset.location],
                    ["Classification", selectedAsset.classification], ["Jurisdiction", selectedAsset.jurisdiction],
                    ["Owner", selectedAsset.owner], ["Custodian", selectedAsset.custodian],
                    ["Periodicity", selectedAsset.assessment_periodicity]].map(([l, v]) => (
                    <div key={l} className="p-2 bg-white rounded border border-slate-100">
                      <p className="text-slate-400 text-[10px]">{l}</p>
                      <p className="text-slate-700 font-medium mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
                <CiaRatingWidget
                  confidentiality_score={selectedAsset.confidentiality_score}
                  integrity_score={selectedAsset.integrity_score}
                  availability_score={selectedAsset.availability_score}
                  onChange={() => {}}
                  readOnly
                />
              </div>
            )}
            {tab === "detail" && !selectedAsset && <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view details</p>}

            {/* Controls Tab */}
            {tab === "controls" && selectedAsset && (
              <div className="space-y-3 max-w-lg">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">Controls for <span className="font-semibold">{selectedAsset.name}</span></p>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => suggestControls(selectedAsset.id)} disabled={isSuggestingControls}>
                    {isSuggestingControls ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    Suggest Controls
                  </Button>
                </div>
                {controlSuggestions.map((s, i) => (
                  <div key={i} className="p-3 bg-white rounded border border-blue-100 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-700">{s.name}</p>
                      <Badge className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">{s.source}</Badge>
                    </div>
                    <p className="text-slate-400 mt-1">{s.rationale}</p>
                  </div>
                ))}
                {controlSuggestions.length === 0 && !isSuggestingControls && (
                  <p className="text-xs text-slate-400 text-center py-8">Click "Suggest Controls" to get LLM recommendations from all control sources.</p>
                )}
              </div>
            )}
            {tab === "controls" && !selectedAsset && <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view controls</p>}
          </ScrollArea>
        </div>
      </div>

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Add Asset</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-slate-600">Name *</label>
                  <Input className="mt-1 h-8 text-xs" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
                </div>
                <div><label className="text-xs font-medium text-slate-600">Type *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value as AssetType}))}>
                    {["IT","Data","Process","Vendor"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="text-xs font-medium text-slate-600">Description *</label>
                  <textarea className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none" rows={2} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium text-slate-600">Owner *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.owner} onChange={e => setForm(p => ({...p, owner: e.target.value}))} />
                  </div>
                  <div><label className="text-xs font-medium text-slate-600">Custodian *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.custodian} onChange={e => setForm(p => ({...p, custodian: e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium text-slate-600">Location *</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2" value={form.location} onChange={e => setForm(p => ({...p, location: e.target.value as any}))}>
                      {["On-premise","Cloud","Hybrid"].map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-medium text-slate-600">Jurisdiction *</label>
                    <Input className="mt-1 h-8 text-xs" placeholder="EU, India, US…" value={form.jurisdiction} onChange={e => setForm(p => ({...p, jurisdiction: e.target.value}))} />
                  </div>
                </div>
                <div><label className="text-xs font-medium text-slate-600">Classification *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2" value={form.classification} onChange={e => setForm(p => ({...p, classification: e.target.value as any}))}>
                    {["Public","Internal","Confidential","Restricted"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <CiaRatingWidget
                  confidentiality_score={form.confidentiality_score} integrity_score={form.integrity_score} availability_score={form.availability_score}
                  onChange={(field, value) => setForm(p => ({...p, [field]: value}))}
                />
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!form.name || !form.description || !form.owner || !form.custodian || !form.jurisdiction}>
                Create Asset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
