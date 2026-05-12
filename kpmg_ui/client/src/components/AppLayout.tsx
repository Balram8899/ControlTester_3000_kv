import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare,
  FileSearch,
  Settings,
  TestTube,
  Scale,
  Library,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FileBarChart,
  BookOpen,
  AlertTriangle,
  FilePenLine,
  FileStack,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/Footer";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface TraceTab {
  title: string;
  fullTitle: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  tooltip?: string;
}

export const HIDEABLE_TABS: TraceTab[] = [
  { title: "Dashboard", fullTitle: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Regulatory Library", fullTitle: "Regulatory Library", path: "/regulatory-library", icon: Library },
  { title: "Controls Library", fullTitle: "Controls Library", path: "/controls-library", icon: ShieldCheck },
  { title: "Frameworks Library", fullTitle: "Frameworks Library", path: "/frameworks-library", icon: BookOpen },
  { title: "Regulatory Testing", fullTitle: "Regulatory Testing", path: "/regulatory-testing", icon: Scale },
  { title: "Reports", fullTitle: "Reports", path: "/reports", icon: FileBarChart },
  { title: "Risk Assessment", fullTitle: "Risk Assessment", path: "/risk-assessment", icon: FileSearch },
  { title: "Final Report", fullTitle: "Final Report", path: "/evidence-assessment", icon: FileSearch },
  { title: "Control Testing", fullTitle: "Control Testing", path: "/control-testing", icon: TestTube },
  {
    title: "SOP Uplift",
    fullTitle: "SOP Uplift",
    path: "/sop-uplift",
    icon: FilePenLine,
    tooltip: "SOP Uplift - Superseded by Document Uplift. Migrate when ready.",
  },
  { title: "Document Uplift", fullTitle: "Document Uplift", path: "/document-uplift", icon: FileStack, badge: "NEW" },
  { title: "Chat", fullTitle: "AI Chat", path: "/chat", icon: MessageSquare },
  { title: "Issue Management", fullTitle: "Issue Management", path: "/issue-management", icon: AlertTriangle },
];

const COMING_SOON_TABS: TraceTab[] = [];
const SETTINGS_TAB: TraceTab = { title: "Settings", fullTitle: "Settings", path: "/settings", icon: Settings };
const NAV_HIDDEN_KEY = "nav_hidden_pages";

function readHiddenPages(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || "[]");
  } catch {
    return [];
  }
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  l2:    "L2 — Lead",
  l1:    "L1 — User",
};

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [hiddenPages, setHiddenPages] = useState<string[]>(readHiddenPages);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";

  useEffect(() => {
    const handler = () => setHiddenPages(readHiddenPages());
    window.addEventListener(NAV_HIDDEN_KEY, handler);
    return () => window.removeEventListener(NAV_HIDDEN_KEY, handler);
  }, []);

  const visibleTabs = HIDEABLE_TABS.filter((tab) => !hiddenPages.includes(tab.path));
  const allTabs = [...visibleTabs, ...COMING_SOON_TABS, SETTINGS_TAB];

  return (
    <div className="kpmg-shell flex h-screen bg-background">
      <aside
        className="kpmg-shell-sidebar relative flex-shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-in-out overflow-x-hidden"
        style={{ width: collapsed ? 68 : 288 }}
      >
        <div
          className="trace-sidebar-brand relative z-10 flex items-center border-b border-white/8 px-3 flex-shrink-0"
          style={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 pr-10">
              <span className="text-[16px] font-bold tracking-tight text-white">KPMG</span>
              <span className="text-[#1E49E2] text-[18px] font-light select-none">|</span>
              <span className="text-[16px] font-bold tracking-tight text-[#00B8F5]">TRACE</span>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/8 text-[#C8D8F0] hover:text-white hover:bg-white/14 transition-colors flex-shrink-0 ${collapsed ? "" : "absolute right-3 top-1/2 -translate-y-1/2"}`}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav
          className="relative z-10 flex-1 py-4 overflow-y-auto overflow-x-hidden"
          style={{ paddingLeft: collapsed ? 4 : 8, paddingRight: collapsed ? 4 : 8 }}
        >
          <div className="space-y-0.5">
            {allTabs.map((tab) => {
              const comingSoon = COMING_SOON_TABS.some((candidate) => candidate.path === tab.path);
              const isActive = location === tab.path && !comingSoon;

              const button = (
                <button
                  key={tab.path}
                  onClick={() => {
                    if (!comingSoon) setLocation(tab.path);
                  }}
                  data-testid={`tab-${tab.path.replace(/\//g, "-").replace(/^-/, "") || "dashboard"}`}
                  disabled={comingSoon}
                  data-active={isActive}
                  className={`kpmg-sidebar-link w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                    collapsed ? "justify-center px-0 py-3" : "gap-3 px-3.5 py-2.5"
                  } ${
                    comingSoon
                      ? `opacity-40 cursor-not-allowed text-[#93A9C9] ${collapsed ? "" : "border-l-[3px] border-transparent"}`
                      : isActive
                        ? `text-white bg-[linear-gradient(90deg,rgba(0,184,245,0.18)_0%,rgba(0,184,245,0.08)_100%)] ${collapsed ? "ring-1 ring-[#00B8F5]/40" : "border-l-[3px] border-[#00B8F5]"}`
                        : `text-[#C8D8F0] hover:bg-white/7 hover:text-white ${collapsed ? "" : "border-l-[3px] border-transparent"}`
                  }`}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="flex-1 text-left text-[13px] leading-5">{tab.title}</span>}
                  {!collapsed && tab.badge && !comingSoon && (
                    <span className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-[#1E49E2] text-white flex-shrink-0">
                      {tab.badge}
                    </span>
                  )}
                  {!collapsed && comingSoon && (
                    <span className="text-[9px] font-semibold tracking-wide px-1 py-0.5 rounded bg-white/10 text-[#C8D8F0] flex-shrink-0">
                      SOON
                    </span>
                  )}
                </button>
              );

              const tooltipLabel = comingSoon ? `${tab.fullTitle} - Coming Soon` : (tab.tooltip ?? tab.fullTitle);

              return collapsed ? (
                <Tooltip key={tab.path} delayDuration={0}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {tooltipLabel}
                  </TooltipContent>
                </Tooltip>
              ) : (
                button
              );
            })}
          </div>
        </nav>

        <div className="trace-sidebar-user relative z-10 border-t border-white/8 flex-shrink-0" style={{ padding: collapsed ? "6px 4px" : "6px 8px" }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-0.5 cursor-default">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-[#00338D] text-white text-xs font-bold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {user?.name ?? "User"} · {ROLE_LABELS[user?.role ?? "l1"] ?? "User"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/6 overflow-hidden">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className="bg-[#00338D] text-white text-xs font-bold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/80 truncate leading-none mb-0.5">{user?.name ?? "User"}</p>
                <p className="text-[10px] text-[#A6BCD9] leading-none">{ROLE_LABELS[user?.role ?? "l1"] ?? "User"}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="trace-shell-main flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <main className="trace-shell-canvas flex-1 min-h-0 overflow-hidden flex flex-col">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
