import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Moon,
  Sun,
  LogOut,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/kpmg (1).png";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const HIDEABLE_TABS = [
  { title: "Dashboard", fullTitle: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Regulatory Library", fullTitle: "Regulatory Library", path: "/regulatory-library", icon: Library },
  { title: "Controls Library", fullTitle: "Controls Library", path: "/controls-library", icon: ShieldCheck },
  { title: "Frameworks Library", fullTitle: "Frameworks Library", path: "/frameworks-library", icon: BookOpen },
  { title: "Regulatory Testing", fullTitle: "Regulatory Testing", path: "/regulatory-testing", icon: Scale },
  { title: "Reports", fullTitle: "Reports", path: "/reports", icon: FileBarChart },
  { title: "Risk Assessment", fullTitle: "Risk Assessment", path: "/risk-assessment", icon: FileSearch },
  { title: "Final Report", fullTitle: "Final Report", path: "/evidence-assessment", icon: FileSearch },
  { title: "Control Testing", fullTitle: "Control Testing", path: "/control-testing", icon: TestTube },
  { title: "Chat", fullTitle: "AI Chat", path: "/chat", icon: MessageSquare },
  { title: "Issue Management", fullTitle: "Issue Management", path: "/issue-management", icon: AlertTriangle },
];

const COMING_SOON_TABS: typeof HIDEABLE_TABS = [];
const SETTINGS_TAB = { title: "Settings", fullTitle: "Settings", path: "/settings", icon: Settings };
const NAV_HIDDEN_KEY = "nav_hidden_pages";

function readHiddenPages(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
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
        className="kpmg-shell-sidebar relative flex-shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: collapsed ? 68 : 272 }}
      >
        <div
          className="relative z-10 flex h-24 items-center border-b border-white/8 px-3 flex-shrink-0"
          style={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          <div className={`flex items-center transition-all duration-300 ${collapsed ? "justify-center" : "gap-3 pr-10"}`}>
            <div className="flex h-12 items-center rounded-[18px] bg-white px-3 shadow-[0_14px_30px_-24px_rgba(0,0,0,0.5)]">
              <img src={logo} alt="KPMG" className="h-7 w-auto object-contain flex-shrink-0" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.32em] text-[#ACEAFF]">KPMG TRACE</p>
                <p className="mt-1 text-[13px] font-semibold text-white">Control Workspace</p>
                <p className="text-[10px] leading-4 text-[#C8D8F0]">Assessment, testing, and reporting</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/8 text-[#C8D8F0] hover:text-white hover:bg-white/14 transition-colors flex-shrink-0"
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
                      ? "opacity-40 cursor-not-allowed border-l-[3px] border-transparent text-[#93A9C9]"
                      : isActive
                        ? "text-white bg-[linear-gradient(90deg,rgba(0,184,245,0.16)_0%,rgba(0,184,245,0.07)_100%)] border-l-[3px] border-[#00B8F5]"
                        : "text-[#C8D8F0] hover:bg-white/7 hover:text-white border-l-[3px] border-transparent"
                  }`}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="flex-1 text-left text-[13px] leading-5">{tab.title}</span>}
                  {!collapsed && comingSoon && (
                    <span className="text-[9px] font-semibold tracking-wide px-1 py-0.5 rounded bg-white/10 text-[#C8D8F0] flex-shrink-0">
                      SOON
                    </span>
                  )}
                </button>
              );

              const tooltipLabel = comingSoon ? `${tab.fullTitle} - Coming Soon` : tab.fullTitle;

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

        <div className="relative z-10 border-t border-white/8 flex-shrink-0" style={{ padding: collapsed ? "10px 4px" : "10px 8px" }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1 cursor-default">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-[#00338D] text-white text-xs font-bold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {user?.name ?? "User"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/6 overflow-hidden">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-[#00338D] text-white text-xs font-bold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/80 truncate leading-none mb-0.5">{user?.name ?? "User"}</p>
                <p className="text-[10px] text-[#A6BCD9] leading-none">Analyst</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="kpmg-shell-header h-16 flex items-center px-4 gap-2 flex-shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[var(--pacific)] data-pulse" />
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold tracking-[0.28em] uppercase text-[#5B6B82] select-none">TRACE workspace</span>
              <span className="text-[13px] font-semibold text-[#0C233C] mt-1">KPMG Control Platform</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--green)] bg-[rgba(0,154,68,0.1)] border border-[rgba(0,154,68,0.12)] px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              Online
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              className="h-8 w-8 text-[#5B6B82] hover:text-[#0C233C] hover:bg-[#F3F7FF]"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Logout"
              data-testid="button-logout"
              className="h-8 w-8 text-[#5B6B82] hover:text-[#0C233C] hover:bg-[#F3F7FF]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Avatar className="h-7 w-7 cursor-default ml-1" title={user?.name}>
              <AvatarFallback className="bg-[var(--cobalt)] text-white text-xs font-semibold">{userInitial}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
