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

type FeatureCategory =
  | "Oversight and Libraries"
  | "Assessment and Testing"
  | "Reporting and Operations";

type FeatureCard = {
  title: string;
  path: string;
  description: string;
  functionLabel: string;
  accent: string;
  icon: LucideIcon;
  category: FeatureCategory;
};

type FeatureSection = {
  id: FeatureCategory;
  title: string;
  description: string;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Dashboard",
    path: "/",
    description: "Portfolio view of regulatory content, control coverage, domain distribution, and diagnostic status across the active libraries.",
    functionLabel: "Portfolio monitoring",
    accent: "#00338D",
    icon: LayoutDashboard,
    category: "Oversight and Libraries",
  },
  {
    title: "Regulatory Library",
    path: "/regulatory-library",
    description: "Ingest regulations, extract obligations, classify domains, and maintain the regulatory knowledge base used for gap and comparison analysis.",
    functionLabel: "Regulatory ingestion",
    accent: "#1E49E2",
    icon: Library,
    category: "Oversight and Libraries",
  },
  {
    title: "Controls Library",
    path: "/controls-library",
    description: "Upload control inventories, normalize control records, evaluate mapping quality, and identify duplication across control sets.",
    functionLabel: "Control diagnostics",
    accent: "#009A44",
    icon: ShieldCheck,
    category: "Oversight and Libraries",
  },
  {
    title: "Frameworks Library",
    path: "/frameworks-library",
    description: "Manage reference frameworks and supporting metadata used to organize regulatory and control analysis workflows.",
    functionLabel: "Reference frameworks",
    accent: "#0C233C",
    icon: BookOpen,
    category: "Oversight and Libraries",
  },
  {
    title: "Asset Registry",
    path: "/asset-registry",
    description: "Maintain a central asset register with CIA ratings, business criticality, ownership data, and control linkage context.",
    functionLabel: "Asset intelligence",
    accent: "#1E49E2",
    icon: Database,
    category: "Oversight and Libraries",
  },
  {
    title: "Settings",
    path: "/settings",
    description: "Configure model selection, workspace visibility, and application preferences used by the TRACE operating environment.",
    functionLabel: "Platform configuration",
    accent: "#5B6B82",
    icon: Settings,
    category: "Oversight and Libraries",
  },
  {
    title: "Regulatory Testing",
    path: "/regulatory-testing",
    description: "Run regulation-versus-regulation comparisons or assess uploaded RCM documents against regulatory obligations from uploads or library sources.",
    functionLabel: "Comparative assessment",
    accent: "#00B8F5",
    icon: Scale,
    category: "Assessment and Testing",
  },
  {
    title: "Risk Assessment",
    path: "/risk-assessment",
    description: "Capture risk inputs, structure scoring, connect risks to controls, and generate risk assessment outputs for downstream reporting.",
    functionLabel: "Risk scoring",
    accent: "#EAAA00",
    icon: AlertTriangle,
    category: "Assessment and Testing",
  },
  {
    title: "Final Report",
    path: "/evidence-assessment",
    description: "Execute evidence-based assessment workflows and compile structured final outputs from uploaded evidence packs.",
    functionLabel: "Evidence synthesis",
    accent: "#5B6B82",
    icon: FileSearch,
    category: "Assessment and Testing",
  },
  {
    title: "Control Testing",
    path: "/control-testing",
    description: "Coordinate AI-assisted control testing, validate supporting evidence, record outcomes, and generate testing workpapers.",
    functionLabel: "Testing execution",
    accent: "#E5001B",
    icon: TestTube,
    category: "Assessment and Testing",
  },
  {
    title: "Chat",
    path: "/chat",
    description: "Use conversational analysis to interrogate platform context, uploaded content, and working outputs during assessment workflows.",
    functionLabel: "Analyst support",
    accent: "#00B8F5",
    icon: MessageSquare,
    category: "Assessment and Testing",
  },
  {
    title: "Reports",
    path: "/reports",
    description: "Review generated outputs for evidence assessment, control testing, regulatory testing, and related reporting artefacts in one place.",
    functionLabel: "Report retrieval",
    accent: "#0C233C",
    icon: FileBarChart,
    category: "Reporting and Operations",
  },
  {
    title: "Issue Management",
    path: "/issue-management",
    description: "Track findings, assign remediation actions, capture evidence, and monitor issue status against associated risks and controls.",
    functionLabel: "Remediation tracking",
    accent: "#EAAA00",
    icon: Workflow,
    category: "Reporting and Operations",
  },
];

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "Oversight and Libraries",
    title: "Oversight and Libraries",
    description: "Reference data, library operations, and portfolio monitoring surfaces.",
  },
  {
    id: "Assessment and Testing",
    title: "Assessment and Testing",
    description: "Execution workflows for regulatory comparison, control testing, and evidence-led analysis.",
  },
  {
    id: "Reporting and Operations",
    title: "Reporting and Operations",
    description: "Distribution, retrieval, and remediation workflows for generated outputs.",
  },
];

const HERO_SUMMARY = [
  {
    label: "Active workspaces",
    value: String(FEATURE_CARDS.length),
    description: "Centralized access to retained modules across oversight, assessment, and reporting.",
  },
  {
    label: "Navigation bands",
    value: String(FEATURE_SECTIONS.length),
    description: "Operating capabilities are grouped into structured enterprise bands for faster orientation.",
  },
  {
    label: "Library foundations",
    value: "4",
    description: "Regulatory, controls, frameworks, and asset context anchor downstream analysis.",
  },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();

  const groupedSections = FEATURE_SECTIONS.map((section) => ({
    ...section,
    items: FEATURE_CARDS.filter((card) => card.category === section.id),
  }));

  const handleSignOut = () => {
    logout();
    setLocation("/login");
  };

  const getSequence = (path: string) => {
    const index = FEATURE_CARDS.findIndex((card) => card.path === path);
    return String(index + 1).padStart(2, "0");
  };

  return (
    <div className="landing-shell flex min-h-screen flex-col" style={{ fontFamily: "Arial, sans-serif" }}>
      <header className="landing-hero relative overflow-hidden">
        <div className="relative z-10 mx-auto flex w-full max-w-[1400px] items-center justify-between px-8 py-4 lg:px-14">
          <div className="flex items-center gap-4">
            <div className="flex h-12 items-center rounded-[18px] bg-white px-3 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.45)]">
              <img src={logo} alt="KPMG" className="h-7 w-auto object-contain" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/54">TRACE workspace</p>
              <p className="mt-1 text-[13px] font-semibold text-white">Enterprise control platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="rounded-full bg-white text-[#00338D] hover:bg-white/92 font-semibold text-xs px-4"
              onClick={() => setLocation("/")}
            >
              Open Dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-white/72 hover:bg-white/10 hover:text-white text-xs gap-1.5"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-10 px-8 pb-18 pt-10 lg:grid-cols-[minmax(0,1.6fr)_380px] lg:px-14 lg:pb-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00B8F5] animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/72">Single-entry point</span>
            </div>
            <h1 className="max-w-4xl text-[44px] font-bold leading-[1.02] tracking-[-0.02em] text-white sm:text-[56px]">
              Centralized access to TRACE workspaces, analysis flows, and reporting outputs.
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-7 text-white/70">
              Move directly into the required workspace to manage regulatory content, execute testing and assessment
              workflows, and retrieve structured outputs through a clearer enterprise operating shell.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-white text-[#00338D] hover:bg-white/93 font-bold px-6 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                onClick={() => setLocation("/")}
              >
                Enter Workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-white/22 bg-transparent text-white hover:bg-white/10 hover:text-white font-semibold px-6"
                onClick={() => setLocation("/reports")}
              >
                View Reports
              </Button>
            </div>
          </div>

          <aside className="kpmg-summary-panel rounded-[24px] p-6 text-white self-start mt-1">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.34em] text-white/48">Operating summary</p>
            <h2 className="mt-2.5 text-[22px] font-bold leading-tight text-white">Platform scope</h2>
            <div className="mt-5 space-y-0">
              {HERO_SUMMARY.map((item, index) => (
                <div key={item.label} className={`py-4 ${index > 0 ? "kpmg-summary-stat" : ""}`}>
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.24em] text-white/48">{item.label}</p>
                  <p className="mt-1.5 text-[32px] font-bold leading-none text-white">{item.value}</p>
                  <p className="mt-1.5 text-[12.5px] leading-5 text-white/62">{item.description}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </header>

      <main className="flex-1 px-8 py-10 lg:px-14 lg:py-12">
        <div className="mx-auto max-w-[1400px] space-y-8">
          <section className="dashboard-band rounded-[22px] px-7 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="kpmg-section-label text-[#1E49E2]">Workspace directory</p>
                <h2 className="mt-2 text-[24px] font-bold text-[#0C233C]">Enterprise capabilities organized by operating band</h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">
                  Each entry below opens a retained TRACE module and states the core techno-functional role it plays in the operating model.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5 flex-shrink-0">
                <span className="landing-chip rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase">
                  {FEATURE_CARDS.length} active workspaces
                </span>
                <span className="landing-chip rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase">
                  Improved navigation
                </span>
              </div>
            </div>
          </section>

          {groupedSections.map((section) => (
            <section key={section.id} className="landing-directory-panel rounded-[22px] overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-[#00338D]/8 px-7 py-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="kpmg-section-label">{section.title}</p>
                  <h3 className="mt-2 text-[20px] font-bold text-[#0C233C]">{section.description}</h3>
                </div>
                <span className="landing-chip self-start rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase lg:self-auto">
                  {section.items.length} modules
                </span>
              </div>

              <div>
                {section.items.map((feature) => {
                  const Icon = feature.icon;
                  const seq = getSequence(feature.path);

                  return (
                    <button
                      key={feature.path}
                      type="button"
                      onClick={() => setLocation(feature.path)}
                      className="landing-directory-row group grid w-full gap-4 px-7 py-5 text-left lg:grid-cols-[72px_minmax(0,220px)_minmax(0,1fr)_150px_32px] lg:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] font-bold tracking-[0.18em] text-[#00338D]/50">{seq}</span>
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-2xl flex-shrink-0"
                          style={{
                            background: `${feature.accent}14`,
                            border: `1px solid ${feature.accent}22`,
                            color: feature.accent,
                          }}
                        >
                          <Icon className="h-[17px] w-[17px]" />
                        </div>
                      </div>

                      <div>
                        <p className="kpmg-module-tag">{feature.functionLabel}</p>
                        <h4 className="mt-1 text-[16px] font-bold text-[#0C233C]">{feature.title}</h4>
                      </div>

                      <p className="text-[13px] leading-[1.7] text-slate-500">{feature.description}</p>

                      <div className="flex items-center lg:justify-end">
                        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#00338D]">
                          Open workspace
                        </span>
                      </div>

                      <div className="flex items-center lg:justify-end">
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 group-hover:translate-x-0.5"
                          style={{ background: `${feature.accent}18`, color: feature.accent }}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="flex items-center justify-between border-t border-[#00338D]/8 pt-6 pb-2">
            <p className="text-[11px] text-slate-400 uppercase tracking-[0.22em] font-semibold">
              KPMG TRACE - Enterprise Control Platform
            </p>
            <p className="text-[11px] text-slate-400">
              {FEATURE_CARDS.length} modules - centralized operating environment
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
