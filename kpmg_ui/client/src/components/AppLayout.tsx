import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Moon,
  Sun,
  LogOut,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import {
  APP_LAYOUT_CONTENT_CLASSNAME,
  APP_LAYOUT_MAIN_CLASSNAME,
  HIDEABLE_TABS,
} from "./app-layout.helpers";
import logo from "@/assets/kpmg (1).png";

interface AppLayoutProps {
  children: React.ReactNode;
}

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
  const [hiddenPages, setHiddenPages] = useState<string[]>(readHiddenPages);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";
  const lastRefreshed = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date())
        .replace(",", ""),
    [],
  );

  useEffect(() => {
    const handler = () => setHiddenPages(readHiddenPages());
    window.addEventListener(NAV_HIDDEN_KEY, handler);
    return () => window.removeEventListener(NAV_HIDDEN_KEY, handler);
  }, []);

  const visibleTabs = HIDEABLE_TABS.filter((tab) => !hiddenPages.includes(tab.path));
  const allTabs = [...visibleTabs, ...COMING_SOON_TABS, SETTINGS_TAB];

  return (
    <div className="kpmg-shell flex h-screen bg-background">
      <aside className="kpmg-shell-sidebar relative flex w-[154px] flex-shrink-0 flex-col overflow-hidden bg-[#00338D] text-white">
        <div className="relative z-10 flex h-full flex-col p-[20px_10px_24px]">
          <div className="flex min-h-[44px] flex-shrink-0 items-center px-3">
            <img
              src={logo}
              alt="KPMG"
              className="kpmg-sidebar-logo-white h-auto w-[94px] flex-shrink-0 object-contain"
            />
          </div>

          <nav className="relative z-10 mt-4 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="space-y-1">
              {allTabs.map((tab) => {
                const comingSoon = COMING_SOON_TABS.some((candidate) => candidate.path === tab.path);
                const isActive = location === tab.path && !comingSoon;

                return (
                  <button
                    key={tab.path}
                    onClick={() => {
                      if (!comingSoon) setLocation(tab.path);
                    }}
                    title={comingSoon ? `${tab.fullTitle} - Coming Soon` : tab.fullTitle}
                    data-testid={`tab-${tab.path.replace(/\//g, "-").replace(/^-/, "") || "dashboard"}`}
                    disabled={comingSoon}
                    data-active={isActive}
                    className={`kpmg-sidebar-link flex w-full items-center gap-[9px] rounded-[4px] px-3 text-left text-[11px] font-bold leading-none transition-colors duration-150 min-h-[36px] ${
                      comingSoon
                        ? "cursor-not-allowed text-white/35"
                        : isActive
                          ? "bg-[#1759C9] text-white"
                          : "text-white/94 hover:bg-white/[0.12] hover:text-white"
                    }`}
                  >
                    <tab.icon className="h-[13px] w-[13px] flex-shrink-0" strokeWidth={2} />
                    <span className="min-w-0 flex-1">{tab.title}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="relative z-10 mt-auto flex-shrink-0 border-t border-white/20 pt-3 text-[10px] leading-[1.45] text-white/70">
            <p className="font-semibold text-white">Last refreshed</p>
            <p className="mt-[3px] font-semibold text-white/90">{lastRefreshed}</p>
          </div>
        </div>
      </aside>

      <div className={APP_LAYOUT_CONTENT_CLASSNAME}>
        <header className="kpmg-shell-header h-16 flex items-center px-4 gap-2 flex-shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[var(--pacific)] data-pulse" />
            <div className="flex flex-col leading-none">
              <span className="text-[11px] font-semibold text-[#5B6B82] select-none">Trace workspace</span>
              <span className="text-[13px] font-semibold text-[#0C233C] mt-1">KPMG control platform</span>
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

        <main className={APP_LAYOUT_MAIN_CLASSNAME}>{children}</main>
      </div>
    </div>
  );
}
