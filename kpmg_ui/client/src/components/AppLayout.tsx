import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Moon, Sun, LogOut, MessageSquare, FileSearch, Settings, TestTube,
  Scale, Library, ShieldCheck, ChevronLeft, ChevronRight, LayoutDashboard,
  FileBarChart, BookOpen, AlertTriangle,
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

// Pages the user can toggle visibility for (Settings is never hidden)
export const HIDEABLE_TABS = [
  { title: "Dashboard",       fullTitle: "Dashboard",            path: "/",                     icon: LayoutDashboard },
  { title: "Reg. Library",    fullTitle: "Regulatory Library",   path: "/regulatory-library",   icon: Library     },
  { title: "Controls Lib.",   fullTitle: "Controls Library",     path: "/controls-library",     icon: ShieldCheck },
  { title: "Frameworks Lib.", fullTitle: "Frameworks Library",   path: "/frameworks-library",   icon: BookOpen    },
  { title: "Reg. Testing",    fullTitle: "Regulatory Testing",   path: "/regulatory-testing",   icon: Scale       },
  { title: "Reports",         fullTitle: "RCM Reports",          path: "/reports",              icon: FileBarChart },
  { title: "Risk Assess.",    fullTitle: "Risk Assessment",      path: "/risk-assessment",      icon: FileSearch  },
  { title: "Final Report",    fullTitle: "Final Report",         path: "/evidence-assessment",  icon: FileSearch  },
  { title: "Control Testing", fullTitle: "AI Control Testing",   path: "/control-testing",      icon: TestTube    },
  { title: "Chat",            fullTitle: "AI Chat",              path: "/chat",                 icon: MessageSquare },
  { title: "Issue Mgmt.",     fullTitle: "Issue Management",     path: "/issue-management",     icon: AlertTriangle },
];

const COMING_SOON_TABS: typeof HIDEABLE_TABS = [];

const SETTINGS_TAB = { title: "Settings", fullTitle: "Settings", path: "/settings", icon: Settings };

const NAV_HIDDEN_KEY = "nav_hidden_pages";

function readHiddenPages(): string[] {
  try { return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || "[]"); } catch { return []; }
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [hiddenPages, setHiddenPages] = useState<string[]>(readHiddenPages);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";

  // Listen for changes from Settings page
  useEffect(() => {
    const handler = () => setHiddenPages(readHiddenPages());
    window.addEventListener(NAV_HIDDEN_KEY, handler);
    return () => window.removeEventListener(NAV_HIDDEN_KEY, handler);
  }, []);

  const visibleTabs = HIDEABLE_TABS.filter(t => !hiddenPages.includes(t.path));
  const allTabs = [...visibleTabs, ...COMING_SOON_TABS, SETTINGS_TAB];

  return (
    <div className="flex h-screen bg-background">
      {/* ── Left Sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: collapsed ? 56 : 224 }}
      >
        {/* Logo / brand + collapse toggle */}
        <div className="h-16 flex items-center border-b border-border flex-shrink-0 relative"
             style={{ paddingLeft: collapsed ? 0 : 16, paddingRight: collapsed ? 0 : 8, justifyContent: collapsed ? "center" : "space-between" }}>
          <div className={`flex items-center overflow-hidden transition-all duration-300 ${collapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"}`}>
            <img src={logo} alt="Trace logo" className="h-7 w-auto object-contain flex-shrink-0" />
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden"
             style={{ paddingLeft: collapsed ? 4 : 8, paddingRight: collapsed ? 4 : 8 }}>
          <div className="space-y-0.5">
            {allTabs.map((tab) => {
              const comingSoon = COMING_SOON_TABS.some(c => c.path === tab.path);
              const isActive = location === tab.path && !comingSoon;

              const btn = (
                <button
                  key={tab.path}
                  onClick={() => { if (!comingSoon) setLocation(tab.path); }}
                  data-testid={`tab-${tab.title.toLowerCase().replace(/\s+/g, "-")}`}
                  disabled={comingSoon}
                  className={`w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                    collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"
                  } ${
                    comingSoon
                      ? "opacity-35 cursor-not-allowed border-l-[3px] border-transparent text-muted-foreground"
                      : isActive
                      ? "border-l-[3px] border-[var(--kpmg-blue)] bg-[var(--kpmg-blue)]/8 text-[var(--kpmg-blue)] dark:border-[var(--pacific)] dark:bg-[var(--pacific)]/10 dark:text-[var(--pacific)] shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground border-l-[3px] border-transparent"
                  }`}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-left">{tab.title}</span>
                  )}
                  {!collapsed && comingSoon && (
                    <span className="text-[9px] font-semibold tracking-wide px-1 py-0.5 rounded bg-muted text-muted-foreground/70 flex-shrink-0">
                      SOON
                    </span>
                  )}
                </button>
              );

              const tooltipLabel = comingSoon ? `${tab.fullTitle} — Coming Soon` : tab.fullTitle;

              return collapsed ? (
                <Tooltip key={tab.path} delayDuration={0}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{tooltipLabel}</TooltipContent>
                </Tooltip>
              ) : btn;
            })}
          </div>
        </nav>

        {/* Sidebar footer — user info */}
        <div className="border-t border-border flex-shrink-0"
             style={{ padding: collapsed ? "8px 4px" : "8px" }}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1 cursor-default">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{user?.name ?? "User"}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg overflow-hidden">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">{user?.name ?? "User"}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: header + content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center px-4 gap-2 flex-shrink-0 sticky top-0 z-50 border-b border-white/10"
                style={{ background: "rgba(10,14,26,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[var(--pacific)] data-pulse" />
            <div className="flex flex-col leading-none">
              <span className="font-mono font-bold tracking-[0.25em] uppercase text-sm text-white select-none">TRACE</span>
              <span className="text-[8px] text-slate-500 tracking-[0.2em] uppercase mt-0.5 font-mono">Control Testing Platform</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-green-400 bg-green-500/15 px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Online
            </span>
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-theme-toggle"
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} title="Logout" data-testid="button-logout"
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10">
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
