import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LayoutDashboard, Library, ShieldCheck, Scale, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RegDoc {
  total_obligations?: number;
  obligations_by_domain?: Record<string, number>;
}

interface CtrlDoc {
  total_controls?: number;
  controls_by_domain?: Record<string, number>;
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [regDocs, setRegDocs] = useState<RegDoc[]>([]);
  const [ctrlDocs, setCtrlDocs] = useState<CtrlDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/regulatory-library/documents").then(r => r.json()).catch(() => ({ documents: [] })),
      fetch("/api/controls-library/documents").then(r => r.json()).catch(() => ({ documents: [] })),
    ]).then(([regData, ctrlData]) => {
      setRegDocs(regData.documents ?? []);
      setCtrlDocs(ctrlData.documents ?? []);
      setLastRefreshed(new Date());
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  // Derive regulatory metrics
  let totalObligations = 0;
  const regDomainCounts: Record<string, number> = {};
  for (const doc of regDocs) {
    totalObligations += doc.total_obligations ?? 0;
    for (const [d, c] of Object.entries(doc.obligations_by_domain ?? {}))
      regDomainCounts[d] = (regDomainCounts[d] ?? 0) + c;
  }
  const regDomainCount = Object.keys(regDomainCounts).length;

  // Derive controls metrics
  let totalControls = 0;
  const ctrlDomainCounts: Record<string, number> = {};
  for (const doc of ctrlDocs) {
    totalControls += doc.total_controls ?? 0;
    for (const [d, c] of Object.entries(doc.controls_by_domain ?? {}))
      ctrlDomainCounts[d] = (ctrlDomainCounts[d] ?? 0) + c;
  }
  const ctrlDomainCount = Object.keys(ctrlDomainCounts).length;

  const regKpis = [
    { label: "Regulations", value: regDocs.length, sub: "documents in library", accent: "from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800", icon: "📄" },
    { label: "Obligations", value: totalObligations.toLocaleString(), sub: "total extracted", accent: "from-violet-500/10 to-violet-500/5 border-violet-200 dark:border-violet-800", icon: "📋" },
    { label: "Reg. Domains", value: regDomainCount, sub: "regulatory areas", accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 dark:border-emerald-800", icon: "🏷️" },
  ];

  const ctrlKpis = [
    { label: "Policy Docs", value: ctrlDocs.length, sub: "policy files", accent: "from-cyan-500/10 to-cyan-500/5 border-cyan-200 dark:border-cyan-800", icon: "📁" },
    { label: "Controls", value: totalControls.toLocaleString(), sub: "total extracted", accent: "from-indigo-500/10 to-indigo-500/5 border-indigo-200 dark:border-indigo-800", icon: "🛡️" },
    { label: "Ctrl. Domains", value: ctrlDomainCount, sub: "security domains", accent: "from-teal-500/10 to-teal-500/5 border-teal-200 dark:border-teal-800", icon: "🔐" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Pinned section header */}
      <div
        className="flex-shrink-0 px-6 py-3 flex items-center gap-3"
        style={{
          background: "linear-gradient(90deg, hsl(222 40% 9%) 0%, hsl(220 40% 12%) 100%)",
          borderBottom: "1px solid hsl(217 91% 55% / 0.2)",
        }}
      >
        <LayoutDashboard className="h-6 w-6 text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground leading-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Audit overview — Regulatory &amp; Controls summary</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchData}
            disabled={loading}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Regulatory Library KPIs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-foreground">Regulatory Library</h2>
              </div>
              <button
                onClick={() => setLocation("/regulatory-library")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-400 transition-colors"
              >
                View library <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
                    <div className="h-2.5 w-20 bg-muted rounded mb-3" />
                    <div className="h-7 w-12 bg-muted rounded mb-2" />
                    <div className="h-2 w-16 bg-muted rounded" />
                  </div>
                ))
              ) : (
                regKpis.map(({ label, value, sub, accent, icon }) => (
                  <div key={label} className={`rounded-xl border bg-gradient-to-br ${accent} p-4`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-3xl font-bold mt-1 leading-none">{value}</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
                      </div>
                      <span className="text-xl opacity-60">{icon}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Controls Library KPIs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-foreground">Controls Library</h2>
              </div>
              <button
                onClick={() => setLocation("/controls-library")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
              >
                View library <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
                    <div className="h-2.5 w-20 bg-muted rounded mb-3" />
                    <div className="h-7 w-12 bg-muted rounded mb-2" />
                    <div className="h-2 w-16 bg-muted rounded" />
                  </div>
                ))
              ) : (
                ctrlKpis.map(({ label, value, sub, accent, icon }) => (
                  <div key={label} className={`rounded-xl border bg-gradient-to-br ${accent} p-4`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-3xl font-bold mt-1 leading-none">{value}</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
                      </div>
                      <span className="text-xl opacity-60">{icon}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Quick Links */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">Quick Links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Regulatory Testing", desc: "Run compliance assessments", path: "/regulatory-testing", icon: <Scale className="h-4 w-4" />, color: "text-blue-400" },
                { label: "Regulatory Library", desc: "Browse & manage regulations", path: "/regulatory-library", icon: <Library className="h-4 w-4" />, color: "text-violet-400" },
                { label: "Controls Library", desc: "Browse & manage controls", path: "/controls-library", icon: <ShieldCheck className="h-4 w-4" />, color: "text-cyan-400" },
              ].map(({ label, desc, path, icon, color }) => (
                <button
                  key={path}
                  onClick={() => setLocation(path)}
                  className="rounded-xl border bg-card p-4 text-left hover:border-primary/40 hover:bg-accent/30 transition-all duration-150 group"
                >
                  <div className={`${color} mb-2 group-hover:scale-110 transition-transform inline-block`}>{icon}</div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
