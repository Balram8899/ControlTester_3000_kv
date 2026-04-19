import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Database,
  FileBarChart,
  FileSearch,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  ShieldCheck,
  TestTube,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/kpmg (1).png";

type FeatureCard = {
  title: string;
  path: string;
  description: string;
  functionLabel: string;
  accent: string;
  icon: LucideIcon;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Dashboard",
    path: "/",
    description: "Portfolio view of regulatory content, control coverage, domain distribution, and diagnostic status across the active libraries.",
    functionLabel: "Portfolio monitoring",
    accent: "#00338D",
    icon: LayoutDashboard,
  },
  {
    title: "Regulatory Library",
    path: "/regulatory-library",
    description: "Ingest regulations, extract obligations, classify domains, and maintain the regulatory knowledge base used for gap and comparison analysis.",
    functionLabel: "Regulatory ingestion",
    accent: "#1E49E2",
    icon: Library,
  },
  {
    title: "Controls Library",
    path: "/controls-library",
    description: "Upload control inventories, normalize control records, evaluate mapping quality, and identify duplication across control sets.",
    functionLabel: "Control diagnostics",
    accent: "#009A44",
    icon: ShieldCheck,
  },
  {
    title: "Frameworks Library",
    path: "/frameworks-library",
    description: "Manage reference frameworks and supporting metadata used to organize regulatory and control analysis workflows.",
    functionLabel: "Reference frameworks",
    accent: "#7213EA",
    icon: BookOpen,
  },
  {
    title: "Regulatory Testing",
    path: "/regulatory-testing",
    description: "Run regulation-versus-regulation comparisons or assess uploaded RCM documents against regulatory obligations from uploads or library sources.",
    functionLabel: "Comparative assessment",
    accent: "#00B8F5",
    icon: Scale,
  },
  {
    title: "Reports",
    path: "/reports",
    description: "Review generated outputs for evidence assessment, control testing, regulatory testing, and related reporting artefacts in one place.",
    functionLabel: "Report retrieval",
    accent: "#0C233C",
    icon: FileBarChart,
  },
  {
    title: "Risk Assessment",
    path: "/risk-assessment",
    description: "Capture risk inputs, structure scoring, connect risks to controls, and generate risk assessment outputs for downstream reporting.",
    functionLabel: "Risk scoring",
    accent: "#EAAA00",
    icon: AlertTriangle,
  },
  {
    title: "Asset Registry",
    path: "/asset-registry",
    description: "Maintain a central asset register with CIA ratings, business criticality, ownership data, and control linkage context.",
    functionLabel: "Asset intelligence",
    accent: "#098E7E",
    icon: Database,
  },
  {
    title: "Final Report",
    path: "/evidence-assessment",
    description: "Execute evidence-based assessment workflows and compile structured final outputs from uploaded evidence packs.",
    functionLabel: "Evidence synthesis",
    accent: "#5B6B82",
    icon: FileSearch,
  },
  {
    title: "Control Testing",
    path: "/control-testing",
    description: "Coordinate AI-assisted control testing, track evidence, record outcomes, and generate domain-grouped testing workpapers.",
    functionLabel: "Testing execution",
    accent: "#E5001B",
    icon: TestTube,
  },
  {
    title: "Chat",
    path: "/chat",
    description: "Use conversational analysis to interrogate platform context, uploaded content, and working outputs during assessment workflows.",
    functionLabel: "Analyst support",
    accent: "#00B8F5",
    icon: MessageSquare,
  },
  {
    title: "Issue Management",
    path: "/issue-management",
    description: "Track findings, assign remediation actions, capture evidence, and monitor issue status against associated risks and controls.",
    functionLabel: "Remediation tracking",
    accent: "#F97316",
    icon: Workflow,
  },
  {
    title: "Settings",
    path: "/settings",
    description: "Configure model selection, workspace visibility, and application preferences used by the TRACE operating environment.",
    functionLabel: "Platform configuration",
    accent: "#64748B",
    icon: Settings,
  },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();

  const handleSignOut = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="landing-shell flex min-h-screen flex-col" style={{ fontFamily: "Arial, sans-serif" }}>
      <header className="landing-hero relative overflow-hidden">
        <div className="absolute inset-0 osint-grid opacity-30 pointer-events-none" />
        <div className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-4">
            <img src={logo} alt="KPMG" className="h-9 w-auto object-contain" />
            <div className="hidden h-8 w-px bg-white/12 sm:block" />
            <div className="hidden sm:block">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white">TRACE</p>
              <p className="text-[10px] text-white/60">Technology Risk and Controls Exchange</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-white/20 bg-white/8 text-white hover:bg-white/14 hover:text-white"
              onClick={() => setLocation("/")}
            >
              Open Dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 pb-14 pt-8 lg:px-10 lg:pb-20 lg:pt-10">
          <div className="max-w-4xl">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
              Control Environment Workspaces
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight text-white sm:text-5xl">
              Central entry point for TRACE assessment, testing, library, and reporting workflows.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-white/72 sm:text-[15px]">
              Use the workspace catalogue below to access regulatory ingestion, control diagnostics, RCM comparison,
              evidence-based reporting, risk assessment, issue management, and related platform functions.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <span className="landing-chip rounded-full px-4 py-2 text-xs font-semibold">Cross-library diagnostics</span>
            <span className="landing-chip rounded-full px-4 py-2 text-xs font-semibold">Regulation and RCM comparison</span>
            <span className="landing-chip rounded-full px-4 py-2 text-xs font-semibold">Evidence and reporting workflows</span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-[1280px] space-y-8">
          <section className="dashboard-band rounded-[28px] px-6 py-5 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#1E49E2]">
                  Workspace Catalogue
                </p>
                <h2 className="mt-2 text-2xl font-bold text-[#0C233C]">Platform capabilities and operating modules</h2>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="landing-chip rounded-full px-3 py-1.5 text-xs font-semibold">{FEATURE_CARDS.length} workspaces</span>
                <span className="landing-chip rounded-full px-3 py-1.5 text-xs font-semibold">All active functions retained</span>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon;
              return (
                <button
                  key={feature.path}
                  type="button"
                  onClick={() => setLocation(feature.path)}
                  className="landing-feature-card card-interactive group flex h-full flex-col rounded-[26px] p-6 text-left transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/50 bg-white"
                      style={{ color: feature.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="landing-chip rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
                      {feature.functionLabel}
                    </span>
                  </div>

                  <div className="mt-5 flex-1">
                    <h3 className="text-lg font-bold text-[#0C233C]">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{feature.description}</p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#00338D]/10 pt-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00338D]">
                      Open workspace
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#00338D] transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
