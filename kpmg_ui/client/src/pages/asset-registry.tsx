// kpmg_ui/client/src/pages/asset-registry.tsx
import { useEffect, useState } from "react";
import {
  Database, Cpu, Server, Network, Monitor, Box, GitBranch,
  Plus, Search, AlertTriangle, Shield, Loader2, Trash2, Zap, X,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useAssetRegistry,
  Asset, AssetCreate, AssetType, HostingType, SupportType, StatusType, ClassType,
} from "@/contexts/AssetRegistryContext";
import CiaRatingWidget from "@/components/CiaRatingWidget";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<AssetType, any> = {
  "Application":           Server,
  "Hardware":              Cpu,
  "Database":              Database,
  "Interface/API":         GitBranch,
  "Network Component":     Network,
  "Desktop/Client Software": Monitor,
  "Other":                 Box,
};

const BAND_COLOR: Record<string, string> = {
  Critical: "bg-red-100    text-red-700    border-red-300",
  High:     "bg-orange-100 text-orange-700 border-orange-300",
  Medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low:      "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// ── Form default ────────────────────────────────────────────────────────────

const EMPTY: AssetCreate = {
  name: "", description: "", use: "",
  asset_type: "Application",
  hosting_type: "Unspecified",
  support_type: "Company",
  status: "Operational",
  owner: "", custodian: "",
  location: "", jurisdiction: "",
  classification: "Internal",
  confidentiality_score: 1,
  integrity_score: 1,
  availability_score: 1,
};

// ── Page ────────────────────────────────────────────────────────────────────

type RightTab = "dashboard" | "detail" | "controls";

export default function AssetRegistryPage() {
  const {
    assets, selectedAsset, isLoading,
    controlSuggestions, isSuggestingControls,
    fetchAssets, selectAsset, createAsset, deleteAsset, suggestControls,
  } = useAssetRegistry();
  const { toast } = useToast();

  const [search, setSearch]     = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<AssetCreate>(EMPTY);
  const [tab, setTab]           = useState<RightTab>("dashboard");

  useEffect(() => { fetchAssets(); }, []);

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_type.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    total:    assets.length,
    critical: assets.filter(a => a.cia_band === "Critical").length,
    high:     assets.filter(a => a.cia_band === "High").length,
  };

  function updateForm(field: keyof AssetCreate, value: any) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-clear hosting_type when asset_type changes away from Application
      if (field === "asset_type" && value !== "Application") {
        next.hosting_type = undefined;
      }
      if (field === "asset_type" && value === "Application") {
        next.hosting_type = "Unspecified";
      }
      return next;
    });
  }

  async function handleCreate() {
    try {
      await createAsset(form);
      setShowForm(false);
      setForm(EMPTY);
      toast({ title: "Asset created", description: form.name });
    } catch {
      toast({ title: "Failed to create asset", variant: "destructive" });
    }
  }

  const isFormValid =
    form.name.trim() &&
    form.description.trim() &&
    form.use.trim() &&
    form.owner.trim() &&
    form.custodian.trim() &&
    form.location.trim() &&
    form.jurisdiction.trim();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HeroSection
        title="Asset Registry"
        subtitle="Manage assets, CIA ratings, and control mappings"
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search assets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" className="h-8 px-2" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {isLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {filtered.map(asset => {
              const Icon = TYPE_ICON[asset.asset_type] ?? Box;
              const selected = selectedAsset?.id === asset.id;
              return (
                <div
                  key={asset.id}
                  onClick={() => { selectAsset(asset); setTab("dashboard"); }}
                  className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${
                    selected
                      ? "bg-blue-50 border-l-2 border-l-[#001E62]"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">{asset.name}</span>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex-shrink-0 ${BAND_COLOR[asset.cia_band]}`}>
                      {asset.cia_band}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 ml-6">
                    {asset.asset_type} · CIA {asset.cia_total}/15
                  </p>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">No assets found</p>
            )}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* Tab bar */}
          <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 bg-white">
            {(["dashboard", "detail", "controls"] as RightTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-[#001E62] text-[#001E62]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "controls" ? "Controls Mapping" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">

            {/* Dashboard tab */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Assets",    value: kpis.total,    icon: Database,       color: "text-blue-600"   },
                    { label: "Critical Assets", value: kpis.critical, icon: AlertTriangle,  color: "text-red-600"    },
                    { label: "High Assets",     value: kpis.high,     icon: Shield,         color: "text-orange-600" },
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
                    <CardTitle className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Assets by Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(TYPE_ICON) as AssetType[]).map(type => {
                        const Icon = TYPE_ICON[type];
                        return (
                          <div key={type} className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-700">
                              {assets.filter(a => a.asset_type === type).length}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate">{type}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {selectedAsset && (
                  <Card className="border-[#001E62]">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold text-[#001E62] uppercase tracking-wide">
                        Selected: {selectedAsset.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1 text-xs text-slate-600">
                      <p><span className="font-medium">CIA Total:</span> {selectedAsset.cia_total}/15</p>
                      <p>
                        <span className="font-medium">Band:</span>{" "}
                        <Badge className={`text-[10px] ${BAND_COLOR[selectedAsset.cia_band]}`}>
                          {selectedAsset.cia_band}
                        </Badge>
                      </p>
                      <p><span className="font-medium">Type:</span> {selectedAsset.asset_type}</p>
                      <p><span className="font-medium">Owner:</span> {selectedAsset.owner} · <span className="font-medium">Custodian:</span> {selectedAsset.custodian}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Detail tab */}
            {tab === "detail" && selectedAsset && (
              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{selectedAsset.name}</h3>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs gap-1 text-red-600"
                    onClick={async () => {
                      await deleteAsset(selectedAsset.id);
                      toast({ title: "Asset deleted" });
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {([
                    ["Type",           selectedAsset.asset_type],
                    ["Hosting",        selectedAsset.hosting_type ?? "N/A"],
                    ["Support",        selectedAsset.support_type],
                    ["Status",         selectedAsset.status],
                    ["Classification", selectedAsset.classification],
                    ["Jurisdiction",   selectedAsset.jurisdiction],
                    ["Location",       selectedAsset.location],
                    ["Owner",          selectedAsset.owner],
                    ["Custodian",      selectedAsset.custodian],
                    ["Use",            selectedAsset.use],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} className="p-2 bg-white rounded border border-slate-100">
                      <p className="text-slate-400 text-[10px]">{l}</p>
                      <p className="text-slate-700 font-medium mt-0.5 truncate">{v}</p>
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
            {tab === "detail" && !selectedAsset && (
              <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view details</p>
            )}

            {/* Controls tab */}
            {tab === "controls" && selectedAsset && (
              <div className="space-y-3 max-w-lg">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">
                    Controls for <span className="font-semibold">{selectedAsset.name}</span>
                  </p>
                  <Button
                    size="sm" className="h-7 text-xs gap-1"
                    onClick={() => suggestControls(selectedAsset.id)}
                    disabled={isSuggestingControls}
                  >
                    {isSuggestingControls
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Zap className="h-3 w-3" />}
                    Suggest Controls
                  </Button>
                </div>

                {controlSuggestions.map((s, i) => (
                  <div key={i} className="p-3 bg-white rounded border border-blue-100 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-700">{s.name}</p>
                      <Badge className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 flex-shrink-0">
                        {s.source}
                      </Badge>
                    </div>
                    <p className="text-slate-400 mt-1">{s.rationale}</p>
                  </div>
                ))}

                {controlSuggestions.length === 0 && !isSuggestingControls && (
                  <p className="text-xs text-slate-400 text-center py-8">
                    Click "Suggest Controls" to get LLM recommendations from the controls and regulatory libraries.
                  </p>
                )}
              </div>
            )}
            {tab === "controls" && !selectedAsset && (
              <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view controls</p>
            )}

          </ScrollArea>
        </div>
      </div>

      {/* ── Create modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Add Asset</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">

                <div>
                  <label className="text-xs font-medium text-slate-600">Name *</label>
                  <Input className="mt-1 h-8 text-xs" value={form.name}
                    onChange={e => updateForm("name", e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Asset Type *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                    value={form.asset_type}
                    onChange={e => updateForm("asset_type", e.target.value as AssetType)}>
                    {(Object.keys(TYPE_ICON) as AssetType[]).map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {form.asset_type === "Application" && (
                  <div>
                    <label className="text-xs font-medium text-slate-600">Hosting Type</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.hosting_type ?? "Unspecified"}
                      onChange={e => updateForm("hosting_type", e.target.value as HostingType)}>
                      {(["PaaS","IaaS","SaaS","Internally Hosted","Desktop/Client Software","Not Hosted","Unspecified"] as HostingType[])
                        .map(h => <option key={h}>{h}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-600">Description *</label>
                  <textarea className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none"
                    rows={2} value={form.description}
                    onChange={e => updateForm("description", e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Use *</label>
                  <Input className="mt-1 h-8 text-xs" placeholder="What is this asset used for?"
                    value={form.use} onChange={e => updateForm("use", e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Support Type *</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.support_type}
                      onChange={e => updateForm("support_type", e.target.value as SupportType)}>
                      {(["Company","Vendor","Business"] as SupportType[]).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Status</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.status}
                      onChange={e => updateForm("status", e.target.value as StatusType)}>
                      {(["Operational","Build in Progress","Planned Decommissioning","Decommissioned","Archived"] as StatusType[])
                        .map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Owner *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.owner}
                      onChange={e => updateForm("owner", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Custodian *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.custodian}
                      onChange={e => updateForm("custodian", e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Location *</label>
                    <Input className="mt-1 h-8 text-xs" placeholder="e.g. AWS Sydney"
                      value={form.location} onChange={e => updateForm("location", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Jurisdiction *</label>
                    <Input className="mt-1 h-8 text-xs" placeholder="e.g. AU, EU, IN"
                      value={form.jurisdiction} onChange={e => updateForm("jurisdiction", e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Classification *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                    value={form.classification}
                    onChange={e => updateForm("classification", e.target.value as ClassType)}>
                    {(["Public","Internal","Confidential","Restricted"] as ClassType[]).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <CiaRatingWidget
                  confidentiality_score={form.confidentiality_score}
                  integrity_score={form.integrity_score}
                  availability_score={form.availability_score}
                  onChange={(field, value) => updateForm(field, value)}
                />

              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!isFormValid}>
                Create Asset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
