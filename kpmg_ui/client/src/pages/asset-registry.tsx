import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  Loader2,
  Network,
  Search,
  Server,
  Shield,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import CiaRatingWidget from "@/components/CiaRatingWidget";
import {
  useAssetRegistry,
  Asset,
  AssetCreate,
  AssetStatus,
  AssetType,
  HostingType,
  SupportType,
} from "@/contexts/AssetRegistryContext";
import { useToast } from "@/hooks/use-toast";
import HeroSection from "@/components/HeroSection";

const ASSET_TYPES: AssetType[] = [
  "Application",
  "Hardware",
  "Database",
  "Interface/API",
  "Network Component",
  "Desktop/Client Software",
  "Other",
];

const HOSTING_TYPES: HostingType[] = [
  "PaaS",
  "IaaS",
  "SaaS",
  "Internally Hosted",
  "Desktop/Client Software",
  "Not Hosted",
  "Unspecified",
];

const SUPPORT_TYPES: SupportType[] = ["Company", "Vendor", "Business"];

const STATUS_VALUES: AssetStatus[] = [
  "Operational",
  "Build in Progress",
  "Planned Decommissioning",
  "Decommissioned",
  "Archived",
];

const TYPE_ICON: Record<AssetType, LucideIcon> = {
  Application: Server,
  Hardware: Cpu,
  Database,
  "Interface/API": Network,
  "Network Component": Network,
  "Desktop/Client Software": Cpu,
  Other: Server,
};

const EMPTY_ASSET: AssetCreate = {
  name: "",
  description: "",
  use: "",
  type: "Application",
  hosting_type: null,
  support_type: null,
  status: "Operational",
  owner: "",
  custodian: "",
  location: "On-premise",
  jurisdiction: "",
  classification: "Internal",
  confidentiality: 1,
  confidentiality_min: 1,
  integrity: 1,
  integrity_min: 1,
  availability: 1,
  availability_min: 1,
};

type RegistryView = "overview" | "detail" | "controls" | "create";
type FilterValue = "All" | string;

const VIEW_LABELS: Record<RegistryView, string> = {
  overview: "Overview",
  detail: "Detail",
  controls: "Controls Mapping",
  create: "Create",
};

const CRITICALITY_CLASSES: Record<Asset["criticality"], string> = {
  Critical: "bg-[#FEEBED] text-[#E5001B] border-[#E5001B]",
  High: "bg-[#FFFBEB] text-[#EAAA00] border-[#EAAA00]",
  Medium: "bg-[#FFFBEB] text-[#EAAA00] border-[#EAAA00]",
  Low: "bg-[#EDFBF5] text-[#009A44] border-[#009A44]",
};

const ACCENT_BY_CRITICALITY: Record<Asset["criticality"], string> = {
  Critical: "#E5001B",
  High: "#EAAA00",
  Medium: "#EAAA00",
  Low: "#009A44",
};

function resettableAssetForm(): AssetCreate {
  return { ...EMPTY_ASSET };
}

function SectionHeading({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="text-left">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">
          {label}
        </div>
        <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</div>
        {description ? <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-[#5A6478]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function PrimaryAction({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#7213EA] px-6 py-3 text-[15px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#8492A6]"
    >
      {children}
    </button>
  );
}

function SecondaryAction({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#1E49E2] transition-colors hover:bg-[#F0F2F7] disabled:cursor-not-allowed disabled:text-[#8492A6]"
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string | number;
  note: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">{label}</div>
      <div className="mt-5 text-[38px] font-bold leading-none tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#5A6478]">{note}</p>
    </div>
  );
}

function CriticalityPill({ criticality }: { criticality: Asset["criticality"] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${CRITICALITY_CLASSES[criticality]}`}>
      {criticality}
    </span>
  );
}

function SegmentedNav({
  view,
  onChange,
}: {
  view: RegistryView;
  onChange: (view: RegistryView) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[#E2E6EF] bg-white p-1">
      {(["overview", "detail", "controls", "create"] as RegistryView[]).map((item) => (
        <button
          key={item}
          type="button"
          data-asset-registry-view={item}
          onClick={() => onChange(item)}
          className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${
            view === item ? "bg-[#EEF2FF] text-[#1E49E2]" : "text-[#8492A6] hover:text-[#0C233C]"
          }`}
        >
          {VIEW_LABELS[item]}
        </button>
      ))}
    </div>
  );
}

function TypeBar({ type, count, max }: { type: AssetType; count: number; max: number }) {
  const Icon = TYPE_ICON[type];
  const width = `${Math.max(4, Math.round((count / max) * 100))}%`;
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)_42px] items-center gap-3">
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#0C233C]">
        <Icon className="h-4 w-4 flex-shrink-0 text-[#8492A6]" />
        <span className="truncate">{type}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F0F2F7]">
        <div className="h-full rounded-full bg-[#1E49E2]" style={{ width }} />
      </div>
      <div className="text-right text-[13px] font-bold text-[#0C233C]">{count}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E2E6EF] bg-white p-8 text-center text-[13px] text-[#8492A6]">
      {message}
    </div>
  );
}

function FactTile({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E2E6EF] bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">{label}</div>
      <div className="mt-2 truncate text-[13px] font-bold text-[#0C233C]">{value || "-"}</div>
    </div>
  );
}

function CiaMeter({
  label,
  min,
  max,
}: {
  label: string;
  min: number;
  max: number;
}) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)_34px] items-center gap-3">
      <div className="text-[13px] font-bold text-[#0C233C]">{label}</div>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((level) => {
          const active = level >= min && level <= max;
          return (
            <div
              key={level}
              className={`h-8 rounded-lg border ${active ? "border-[#098E7E] bg-[#E6F4F2]" : "border-[#E2E6EF] bg-[#F0F2F7]"}`}
            />
          );
        })}
      </div>
      <div className="text-right text-[13px] font-bold text-[#0C233C]">{max}</div>
    </div>
  );
}

function SelectedAssetInspector({ asset }: { asset: Asset | null }) {
  if (!asset) {
    return (
      <aside
        data-asset-registry-inspector="true"
        className="rounded-2xl bg-[linear-gradient(135deg,#0C233C_0%,#1E49E2_100%)] p-7 text-white shadow-sm"
      >
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00B8F5]">Selected Asset</div>
        <h3 className="text-[22px] font-bold tracking-tight">No Asset Selected</h3>
        <p className="mt-3 text-[13px] leading-relaxed text-white/65">
          Select an asset from the register to review CIA ratings, ownership, hosting context, and mapped controls.
        </p>
      </aside>
    );
  }

  return (
    <aside
      data-asset-registry-inspector="true"
      className="rounded-2xl bg-[linear-gradient(135deg,#0C233C_0%,#1E49E2_100%)] p-7 text-white shadow-sm"
    >
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00B8F5]">Selected Asset</div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[22px] font-bold tracking-tight">{asset.name}</h3>
          <p className="mt-3 text-[13px] leading-relaxed text-white/65">{asset.description || "No description recorded."}</p>
        </div>
        <CriticalityPill criticality={asset.criticality} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          ["CIA Total", `${asset.cia_total}/15`],
          ["Owner", asset.owner || "-"],
          ["Jurisdiction", asset.jurisdiction || "-"],
          ["Hosting", asset.hosting_type || asset.location],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-4">
            <div className="truncate text-[24px] font-bold leading-none text-[#00B8F5]">{value}</div>
            <div className="mt-2 text-[11px] text-white/65">{label}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">{children}</label>;
}

export default function AssetRegistryPage() {
  const {
    assets,
    selectedAsset,
    isLoading,
    controlSuggestions,
    isSuggestingControls,
    fetchAssets,
    selectAsset,
    createAsset,
    deleteAsset,
    suggestControls,
  } = useAssetRegistry();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<RegistryView>("overview");
  const [form, setForm] = useState<AssetCreate>(() => resettableAssetForm());
  const [typeFilter, setTypeFilter] = useState<FilterValue>("All");
  const [criticalityFilter, setCriticalityFilter] = useState<FilterValue>("All");
  const [statusFilter, setStatusFilter] = useState<FilterValue>("All");

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesSearch =
        !query ||
        asset.name.toLowerCase().includes(query) ||
        asset.type.toLowerCase().includes(query) ||
        asset.owner.toLowerCase().includes(query) ||
        asset.custodian.toLowerCase().includes(query);
      const matchesType = typeFilter === "All" || asset.type === typeFilter;
      const matchesCriticality = criticalityFilter === "All" || asset.criticality === criticalityFilter;
      const matchesStatus = statusFilter === "All" || asset.status === statusFilter;
      return matchesSearch && matchesType && matchesCriticality && matchesStatus;
    });
  }, [assets, criticalityFilter, search, statusFilter, typeFilter]);

  const kpis = useMemo(() => {
    const critical = assets.filter((asset) => asset.criticality === "Critical").length;
    const high = assets.filter((asset) => asset.criticality === "High").length;
    const cloud = assets.filter(
      (asset) => asset.location === "Cloud" || asset.hosting_type === "SaaS" || asset.hosting_type === "PaaS" || asset.hosting_type === "IaaS",
    ).length;
    return {
      total: assets.length,
      critical,
      high,
      cloud,
    };
  }, [assets]);

  const typeCounts = useMemo(
    () =>
      ASSET_TYPES.map((type) => ({
        type,
        count: assets.filter((asset) => asset.type === type).length,
      })),
    [assets],
  );
  const maxTypeCount = Math.max(1, ...typeCounts.map((item) => item.count));

  function updateForm(field: keyof AssetCreate, value: unknown) {
    setForm((previous) => {
      const next = { ...previous, [field]: value } as AssetCreate;
      if (field === "type" && value !== "Application") {
        next.hosting_type = null;
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.description.trim()) return;
    try {
      const asset = await createAsset(form);
      selectAsset(asset);
      setForm(resettableAssetForm());
      setView("detail");
      toast({ title: "Asset created", description: form.name });
    } catch {
      toast({ title: "Failed to create asset", variant: "destructive" });
    }
  }

  async function handleDeleteSelected() {
    if (!selectedAsset) return;
    try {
      await deleteAsset(selectedAsset.id);
      setView("overview");
      toast({ title: "Asset deleted", description: selectedAsset.name });
    } catch {
      toast({ title: "Failed to delete asset", variant: "destructive" });
    }
  }

  async function handleSuggestControls() {
    if (!selectedAsset) return;
    await suggestControls(selectedAsset.id);
  }

  const isFormValid = Boolean(form.name.trim() && form.description.trim());

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7]">
      <div data-asset-registry-hero="true">
        <HeroSection
          title="Asset Registry"
          subtitle="Maintain critical assets, CIA ratings, ownership, hosting context, and control linkage evidence from one operational register."
          icon={Database}
        />
      </div>

      <main className="mx-auto max-w-[1200px] px-8 py-12 pb-24 md:px-12">
        <section data-asset-registry-kpis="true" className="mb-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Assets" value={kpis.total} note={`${filteredAssets.length} currently shown`} accent="#1E49E2" />
          <KpiCard label="Critical Assets" value={kpis.critical} note="Highest CIA exposure band" accent="#E5001B" />
          <KpiCard label="High Assets" value={kpis.high} note="Near-critical operating context" accent="#EAAA00" />
          <KpiCard label="Cloud Hosted" value={kpis.cloud} note="Cloud, SaaS, PaaS, or IaaS" accent="#098E7E" />
        </section>

        {view === "overview" && (
          <section className="animate-[fadeUp_0.5s_ease_both]">
            <SectionHeading
              label="Register"
              title="Asset Inventory"
              description="Search, filter, and select an asset without leaving the registry workspace."
              action={<SegmentedNav view={view} onChange={setView} />}
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
              <section data-asset-registry-inventory="true" className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b border-[#E2E6EF] p-4">
                  <div className="relative min-w-[240px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8492A6]" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search assets"
                      className="h-10 w-full rounded-xl border border-[#E2E6EF] bg-white pl-9 pr-3 text-[13px] text-[#0C233C] outline-none placeholder:text-[#8492A6] focus:border-[#1E49E2]"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[12px] font-semibold text-[#5A6478] outline-none"
                    aria-label="Filter by asset type"
                  >
                    <option value="All">Type: All</option>
                    {ASSET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <select
                    value={criticalityFilter}
                    onChange={(event) => setCriticalityFilter(event.target.value)}
                    className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[12px] font-semibold text-[#5A6478] outline-none"
                    aria-label="Filter by criticality"
                  >
                    <option value="All">Criticality: All</option>
                    {(["Critical", "High", "Medium", "Low"] as Asset["criticality"][]).map((criticality) => (
                      <option key={criticality} value={criticality}>
                        {criticality}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[12px] font-semibold text-[#5A6478] outline-none"
                    aria-label="Filter by status"
                  >
                    <option value="All">Status: All</option>
                    {STATUS_VALUES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                {isLoading ? (
                  <div className="flex justify-center p-10 text-[#8492A6]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="p-6">
                    <EmptyState message="No assets match the current register filters." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] table-fixed border-collapse">
                      <thead>
                        <tr className="border-b border-[#E2E6EF] bg-[#F0F2F7]">
                          <th className="w-[34%] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Asset</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Owner</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Type</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">CIA</th>
                          <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Criticality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssets.map((asset) => {
                          const Icon = TYPE_ICON[asset.type];
                          const selected = selectedAsset?.id === asset.id;
                          return (
                            <tr
                              key={asset.id}
                              onClick={() => selectAsset(asset)}
                              className={`cursor-pointer border-b border-[#E2E6EF] transition-colors hover:bg-[#F0F2F7] ${selected ? "bg-[#EEF2FF]" : "bg-white"}`}
                            >
                              <td className="px-4 py-4">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1E49E2]">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-[13px] font-bold text-[#0C233C]">{asset.name}</div>
                                    <div className="mt-1 truncate text-[11px] text-[#8492A6]">{asset.description || asset.use || "No description recorded"}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="truncate px-4 py-4 text-[13px] text-[#5A6478]">{asset.owner || "-"}</td>
                              <td className="truncate px-4 py-4 text-[13px] text-[#5A6478]">{asset.type}</td>
                              <td className="px-4 py-4 text-[13px] font-bold text-[#0C233C]">{asset.cia_total}/15</td>
                              <td className="px-4 py-4">
                                <CriticalityPill criticality={asset.criticality} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <SelectedAssetInspector asset={selectedAsset} />
            </div>

            <div className="mt-9">
              <SectionHeading label="Portfolio" title="Assets By Type" />
              <section className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                <div className="grid gap-4">
                  {typeCounts.map((item) => (
                    <TypeBar key={item.type} type={item.type} count={item.count} max={maxTypeCount} />
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {view === "detail" && (
          <section data-asset-registry-detail="true" className="animate-[fadeUp_0.5s_ease_both]">
            <SectionHeading
              label="Asset Dossier"
              title={selectedAsset?.name ?? "No Asset Selected"}
              description="Selected asset detail and suggested control coverage in a single review surface."
              action={<SegmentedNav view={view} onChange={setView} />}
            />
            {!selectedAsset ? (
              <EmptyState message="Select an asset from the register to view the asset dossier." />
            ) : (
              <div className="grid gap-5 xl:grid-cols-3">
                <section className="relative rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl bg-[#1E49E2]" />
                  <div className="mb-5 text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Asset Details</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FactTile label="Type" value={selectedAsset.type} />
                    <FactTile label="Status" value={selectedAsset.status} />
                    <FactTile label="Owner" value={selectedAsset.owner} />
                    <FactTile label="Custodian" value={selectedAsset.custodian} />
                    <FactTile label="Location" value={selectedAsset.location} />
                    <FactTile label="Classification" value={selectedAsset.classification} />
                    <FactTile label="Jurisdiction" value={selectedAsset.jurisdiction} />
                    <FactTile label="Support Type" value={selectedAsset.support_type} />
                    {selectedAsset.type === "Application" ? <FactTile label="Hosting Type" value={selectedAsset.hosting_type} /> : null}
                    <FactTile label="Use" value={selectedAsset.use} />
                  </div>
                  <p className="mt-5 text-[13px] leading-relaxed text-[#5A6478]">{selectedAsset.description}</p>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#FEEBED] px-4 py-2 text-[13px] font-semibold text-[#E5001B] transition-colors hover:bg-[#F0F2F7]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Asset
                  </button>
                </section>

                <section className="relative rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl bg-[#098E7E]" />
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">CIA Rating</div>
                  <div className="mt-5 text-[38px] font-bold leading-none tracking-tight text-[#098E7E]">{selectedAsset.cia_total}/15</div>
                  <div className="mt-6 grid gap-5">
                    <CiaMeter
                      label="Confidentiality"
                      min={selectedAsset.confidentiality_min ?? selectedAsset.confidentiality}
                      max={selectedAsset.confidentiality}
                    />
                    <CiaMeter label="Integrity" min={selectedAsset.integrity_min ?? selectedAsset.integrity} max={selectedAsset.integrity} />
                    <CiaMeter label="Availability" min={selectedAsset.availability_min ?? selectedAsset.availability} max={selectedAsset.availability} />
                  </div>
                </section>

                <section data-asset-registry-controls="true" className="relative rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl bg-[#EAAA00]" />
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Controls Mapping</div>
                    <SecondaryAction onClick={handleSuggestControls} disabled={isSuggestingControls}>
                      {isSuggestingControls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      Suggest Controls
                    </SecondaryAction>
                  </div>
                  <ControlSuggestionList
                    hasSelection={Boolean(selectedAsset)}
                    suggestions={controlSuggestions}
                    isSuggestingControls={isSuggestingControls}
                  />
                </section>
              </div>
            )}
          </section>
        )}

        {view === "controls" && (
          <section data-asset-registry-controls="true" className="animate-[fadeUp_0.5s_ease_both]">
            <SectionHeading
              label="Controls Mapping"
              title={selectedAsset ? `Controls For ${selectedAsset.name}` : "Controls Mapping"}
              description="Generate LLM-assisted candidate controls from the controls and regulatory libraries for the selected asset."
              action={<SegmentedNav view={view} onChange={setView} />}
            />
            <section className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[13px] text-[#5A6478]">
                  <Shield className="h-4 w-4 text-[#1E49E2]" />
                  {selectedAsset ? selectedAsset.name : "Select an asset to start mapping."}
                </div>
                <SecondaryAction onClick={handleSuggestControls} disabled={!selectedAsset || isSuggestingControls}>
                  {isSuggestingControls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Suggest Controls
                </SecondaryAction>
              </div>
              <ControlSuggestionList
                hasSelection={Boolean(selectedAsset)}
                suggestions={controlSuggestions}
                isSuggestingControls={isSuggestingControls}
              />
            </section>
          </section>
        )}

        {view === "create" && (
          <section data-asset-registry-create-panel="true" className="animate-[fadeUp_0.5s_ease_both]">
            <SectionHeading
              label="Create Asset"
              title="Add Asset With CIA Rating"
              description="A right-side creation panel keeps the register visible while the user records identity, ownership, and CIA scoring."
              action={<SegmentedNav view={view} onChange={setView} />}
            />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.7fr)]">
              <section className="relative rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl bg-[#1E49E2]" />
                <div className="mb-5 text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Register Context</div>
                {filteredAssets.length === 0 ? (
                  <EmptyState message="No assets are available in the current register context." />
                ) : (
                  <div className="grid gap-3">
                    {filteredAssets.slice(0, 6).map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        onClick={() => selectAsset(asset)}
                        className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-[#E2E6EF] bg-white px-4 py-3 text-left transition-colors hover:bg-[#F0F2F7]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-bold text-[#0C233C]">{asset.name}</div>
                          <div className="mt-1 truncate text-[12px] text-[#5A6478]">
                            {asset.type} - {asset.classification} - CIA {asset.cia_total}/15
                          </div>
                        </div>
                        <CriticalityPill criticality={asset.criticality} />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-[#E2E6EF] px-6 py-5">
                  <div>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">New Record</div>
                    <h2 className="text-[20px] font-bold tracking-tight text-[#0C233C]">Add Asset</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setView("overview");
                      setForm(resettableAssetForm());
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E6EF] bg-[#F0F2F7] text-[#8492A6] transition-colors hover:text-[#0C233C]"
                    aria-label="Close create asset panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid max-h-[620px] gap-6 overflow-auto px-6 py-5">
                  <FormSection title="Identity">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel>Name *</FieldLabel>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.name}
                          onChange={(event) => updateForm("name", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Asset Type *</FieldLabel>
                        <select
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                          value={form.type}
                          onChange={(event) => updateForm("type", event.target.value as AssetType)}
                        >
                          {ASSET_TYPES.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      {form.type === "Application" ? (
                        <div>
                          <FieldLabel>Hosting Type</FieldLabel>
                          <select
                            className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                            value={form.hosting_type ?? ""}
                            onChange={(event) => updateForm("hosting_type", event.target.value ? (event.target.value as HostingType) : null)}
                          >
                            <option value="">Select hosting type</option>
                            {HOSTING_TYPES.map((hosting) => (
                              <option key={hosting}>{hosting}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <div className="sm:col-span-2">
                        <FieldLabel>Description *</FieldLabel>
                        <textarea
                          className="mt-1 min-h-[72px] w-full resize-none rounded-xl border border-[#E2E6EF] bg-white px-3 py-2 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.description}
                          onChange={(event) => updateForm("description", event.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel>Use</FieldLabel>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.use ?? ""}
                          onChange={(event) => updateForm("use", event.target.value)}
                          placeholder="How this asset is used"
                        />
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Ownership">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Owner *</FieldLabel>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.owner}
                          onChange={(event) => updateForm("owner", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Custodian *</FieldLabel>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.custodian}
                          onChange={(event) => updateForm("custodian", event.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Location *</FieldLabel>
                        <select
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                          value={form.location}
                          onChange={(event) => updateForm("location", event.target.value as AssetCreate["location"])}
                        >
                          {(["On-premise", "Cloud", "Hybrid"] as AssetCreate["location"][]).map((location) => (
                            <option key={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Status</FieldLabel>
                        <select
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                          value={form.status}
                          onChange={(event) => updateForm("status", event.target.value as AssetStatus)}
                        >
                          {STATUS_VALUES.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Jurisdiction *</FieldLabel>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                          value={form.jurisdiction}
                          onChange={(event) => updateForm("jurisdiction", event.target.value)}
                          placeholder="e.g. AU, EU, IN"
                        />
                      </div>
                      <div>
                        <FieldLabel>Classification *</FieldLabel>
                        <select
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                          value={form.classification}
                          onChange={(event) => updateForm("classification", event.target.value as AssetCreate["classification"])}
                        >
                          {(["Public", "Internal", "Confidential", "Restricted"] as AssetCreate["classification"][]).map((classification) => (
                            <option key={classification}>{classification}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Support Type</FieldLabel>
                        <select
                          className="mt-1 h-10 w-full rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none"
                          value={form.support_type ?? ""}
                          onChange={(event) => updateForm("support_type", event.target.value ? (event.target.value as SupportType) : null)}
                        >
                          <option value="">Select support type</option>
                          {SUPPORT_TYPES.map((support) => (
                            <option key={support}>{support}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="CIA Rating">
                    <CiaRatingWidget
                      confidentiality={form.confidentiality}
                      confidentiality_min={form.confidentiality_min}
                      integrity={form.integrity}
                      integrity_min={form.integrity_min}
                      availability={form.availability}
                      availability_min={form.availability_min}
                      onChange={(field, min, max) => {
                        updateForm(field as keyof AssetCreate, max);
                        updateForm(`${field}_min` as keyof AssetCreate, min);
                      }}
                    />
                  </FormSection>
                </div>

                <div className="flex justify-end gap-3 border-t border-[#E2E6EF] bg-[#F0F2F7] px-6 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setView("overview");
                      setForm(resettableAssetForm());
                    }}
                    className="rounded-lg border border-[#E2E6EF] bg-white px-4 py-2 text-[13px] font-semibold text-[#5A6478] transition-colors hover:text-[#0C233C]"
                  >
                    Cancel
                  </button>
                  <PrimaryAction onClick={handleCreate} disabled={!isFormValid}>
                    <CheckCircle2 className="h-4 w-4" />
                    Create Asset
                  </PrimaryAction>
                </div>
              </section>
            </div>
          </section>
        )}
      </main>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{title}</div>
      {children}
    </section>
  );
}

function ControlSuggestionList({
  hasSelection,
  suggestions,
  isSuggestingControls,
}: {
  hasSelection: boolean;
  suggestions: Array<{ name: string; source: string; rationale: string }>;
  isSuggestingControls: boolean;
}) {
  if (!hasSelection) {
    return <EmptyState message="Select an asset to view or generate mapped control suggestions." />;
  }

  if (isSuggestingControls) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#E2E6EF] bg-white p-8 text-[13px] font-semibold text-[#5A6478]">
        <Loader2 className="h-5 w-5 animate-spin text-[#1E49E2]" />
        Generating control suggestions
      </div>
    );
  }

  if (suggestions.length === 0) {
    return <EmptyState message="Run Suggest Controls to get recommendations from the controls and regulatory libraries." />;
  }

  return (
    <div className="grid gap-3">
      {suggestions.map((suggestion, index) => (
        <div key={`${suggestion.name}-${index}`} className="rounded-xl border border-[#E2E6EF] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[13px] font-bold leading-snug text-[#0C233C]">{suggestion.name}</div>
            <span className="inline-flex flex-shrink-0 rounded-full border border-[#1E49E2] bg-[#EEF2FF] px-3 py-1 text-[11px] font-semibold text-[#1E49E2]">
              {suggestion.source}
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#5A6478]">{suggestion.rationale}</p>
        </div>
      ))}
    </div>
  );
}
