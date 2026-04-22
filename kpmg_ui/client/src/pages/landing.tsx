import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  FileBarChart,
  FileSearch,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquare,
  TestTube,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/kpmg (1).png";
import {
  LANDING_MODULES,
  type LandingModule,
  type LandingModuleIconKey,
} from "./landing.helpers";

const LANDING_ICON_MAP: Record<LandingModuleIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  regulatoryLibrary: Library,
  reports: FileBarChart,
  assetRegistry: Database,
  riskAssessment: AlertTriangle,
  finalReporting: FileSearch,
  controlTesting: TestTube,
  chat: MessageSquare,
  issueManagement: Workflow,
};

function getSequence(index: number) {
  return String(index + 1).padStart(2, "0");
}

function LandingCard({
  module,
  sequence,
  onOpen,
}: {
  module: LandingModule;
  sequence: string;
  onOpen: (path: string) => void;
}) {
  const Icon = LANDING_ICON_MAP[module.iconKey];

  return (
    <button
      type="button"
      onClick={() => onOpen(module.path)}
      className="landing-module-card group flex min-h-[196px] flex-col rounded-[22px] px-5 py-5 text-left"
      style={{ "--module-accent": module.accent } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-[16px]"
          style={{
            background: `${module.accent}14`,
            color: module.accent,
          }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <span className="font-display text-[24px] font-bold leading-none text-[#00338D]/30">{sequence}</span>
      </div>

      <p className="kpmg-module-tag mt-5">{module.eyebrow}</p>
      <h2 className="mt-2 font-display text-[23px] font-bold leading-none text-[#0C233C]">{module.title}</h2>
      <p className="mt-3 flex-1 text-[14px] leading-6 text-[#5B6B82]">{module.description}</p>

      <div className="mt-6 flex items-center justify-between border-t border-[#00338D]/8 pt-4">
        <span className="text-[12px] font-semibold text-[#00338D]">Open module</span>
        <span
          className="landing-module-arrow flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: `${module.accent}14`, color: module.accent }}
        >
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();

  const handleSignOut = () => {
    logout();
    setLocation("/login");
  };

  const openModule = (path: string) => {
    setLocation(path);
  };

  return (
    <div className="landing-shell flex min-h-screen flex-col">
      <header className="landing-topbar">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-6 py-4 lg:px-12">
          <div className="flex items-center gap-4">
            <div className="flex h-12 items-center rounded-[6px] bg-white px-3 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.32)]">
              <img src={logo} alt="KPMG" className="h-7 w-auto object-contain" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[12px] font-semibold text-[#5B6B82]">Trace workspace</p>
              <p className="mt-1 text-[13px] font-semibold text-[#0C233C]">Enterprise control platform</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-md border border-[#00338D]/10 bg-white/90 px-4 text-xs font-semibold text-[#00338D] hover:bg-white"
            onClick={handleSignOut}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-[1320px] space-y-6">
          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="kpmg-section-label">Core modules</p>
                <p className="mt-2 text-[14px] text-[#5B6B82]">
                  Clean post-login access to the main TRACE destinations.
                </p>
              </div>
              <span className="hidden rounded-md border border-[#00338D]/10 bg-white/80 px-3.5 py-1.5 text-[12px] font-semibold text-[#5B6B82] md:inline-flex">
                {LANDING_MODULES.length} modules
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {LANDING_MODULES.map((module, index) => (
                <LandingCard
                  key={module.path}
                  module={module}
                  sequence={getSequence(index)}
                  onOpen={openModule}
                />
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-2 border-t border-[#00338D]/8 pt-4 text-[12px] font-semibold text-[#7B8DA2] sm:flex-row sm:items-center sm:justify-between">
            <p>KPMG TRACE</p>
            <p>Landing simplified for focused navigation</p>
          </div>
        </div>
      </main>
    </div>
  );
}
