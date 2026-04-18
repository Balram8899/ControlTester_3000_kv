import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type AssetType = "Application" | "Hardware" | "Database" | "Interface/API" | "Network Component" | "Desktop/Client Software" | "Other";
export type HostingType = "PaaS" | "IaaS" | "SaaS" | "Internally Hosted" | "Desktop/Client Software" | "Not Hosted" | "Unspecified";
export type SupportType = "Company" | "Vendor" | "Business";
export type AssetStatus = "Operational" | "Build in Progress" | "Planned Decommissioning" | "Decommissioned" | "Archived";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  description: string;
  use: string;
  hosting_type: HostingType | null;
  support_type: SupportType | null;
  confidentiality: number;     // 1–5 (upper bound)
  confidentiality_min: number; // 1–5 (lower bound)
  integrity: number;
  integrity_min: number;
  availability: number;
  availability_min: number;
  cia_total: number;           // 3–15
  criticality: "Critical" | "High" | "Medium" | "Low";
  last_assessment_id: string | null;
  owner: string;
  custodian: string;
  location: "On-premise" | "Cloud" | "Hybrid";
  jurisdiction: string;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
  status: AssetStatus;
  created_at: string;
  updated_at: string;
}

export interface AssetCreate {
  name: string;
  type: AssetType;
  description: string;
  use?: string;
  hosting_type?: HostingType | null;
  support_type?: SupportType | null;
  confidentiality: number;     // 1–5 (upper bound)
  confidentiality_min: number; // 1–5 (lower bound)
  integrity: number;
  integrity_min: number;
  availability: number;
  availability_min: number;
  owner: string;
  custodian: string;
  location: "On-premise" | "Cloud" | "Hybrid";
  jurisdiction: string;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
  status?: AssetStatus;
}

export interface ControlSuggestion {
  control_id: string;
  name: string;
  source: string;
  rationale: string;
}

interface Ctx {
  assets: Asset[];
  selectedAsset: Asset | null;
  isLoading: boolean;
  error: string | null;
  controlSuggestions: ControlSuggestion[];
  isSuggestingControls: boolean;
  fetchAssets: (filters?: { type?: string; criticality?: string; status?: string }) => Promise<void>;
  selectAsset: (a: Asset | null) => void;
  createAsset: (data: AssetCreate) => Promise<Asset>;
  updateAsset: (id: string, data: Partial<AssetCreate>) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  suggestControls: (assetId: string) => Promise<void>;
}

const AssetRegistryContext = createContext<Ctx | null>(null);

export function AssetRegistryProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlSuggestions, setControlSuggestions] = useState<ControlSuggestion[]>([]);
  const [isSuggestingControls, setIsSuggestingControls] = useState(false);

  const fetchAssets = useCallback(async (filters?: { type?: string; criticality?: string; status?: string }) => {
    setIsLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (filters?.type) p.set("type", filters.type);
      if (filters?.criticality) p.set("criticality", filters.criticality);
      if (filters?.status) p.set("status", filters.status);
      const r = await fetch(`/api/assets?${p}`);
      if (!r.ok) throw new Error("Failed to fetch assets");
      setAssets(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  const selectAsset = useCallback((a: Asset | null) => {
    setSelectedAsset(a); setControlSuggestions([]);
  }, []);

  const createAsset = useCallback(async (data: AssetCreate): Promise<Asset> => {
    const r = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Failed to create asset");
    const asset: Asset = await r.json();
    setAssets(p => [asset, ...p]);
    return asset;
  }, []);

  const updateAsset = useCallback(async (id: string, data: Partial<AssetCreate>): Promise<Asset> => {
    const r = await fetch(`/api/assets/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error("Failed to update asset");
    const updated: Asset = await r.json();
    setAssets(p => p.map(a => a.id === id ? updated : a));
    if (selectedAsset?.id === id) setSelectedAsset(updated);
    return updated;
  }, [selectedAsset]);

  const deleteAsset = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Failed to delete asset");
    setAssets(p => p.filter(a => a.id !== id));
    if (selectedAsset?.id === id) setSelectedAsset(null);
  }, [selectedAsset]);

  const suggestControls = useCallback(async (assetId: string): Promise<void> => {
    setIsSuggestingControls(true); setControlSuggestions([]);
    try {
      const r = await fetch(`/api/assets/${assetId}/suggest-controls`, { method: "POST" });
      if (!r.ok) throw new Error("Suggestion failed");
      const data = await r.json();
      setControlSuggestions(data.suggestions ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setIsSuggestingControls(false); }
  }, []);

  return (
    <AssetRegistryContext.Provider value={{
      assets, selectedAsset, isLoading, error, controlSuggestions, isSuggestingControls,
      fetchAssets, selectAsset, createAsset, updateAsset, deleteAsset, suggestControls,
    }}>
      {children}
    </AssetRegistryContext.Provider>
  );
}

export function useAssetRegistry() {
  const ctx = useContext(AssetRegistryContext);
  if (!ctx) throw new Error("useAssetRegistry must be inside AssetRegistryProvider");
  return ctx;
}
