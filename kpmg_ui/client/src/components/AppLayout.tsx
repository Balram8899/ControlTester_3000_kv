import { useState } from "react";
import { useLocation } from "wouter";
import {
  Moon, Sun, LogOut, MessageSquare, FileSearch, Settings, TestTube,
  Scale, Library, ShieldCheck, ChevronLeft, ChevronRight, LayoutDashboard, FileBarChart, BookOpen,
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

const tabs = [
  { title: "Dashboard",       fullTitle: "Dashboard",            path: "/",                     icon: LayoutDashboard },
  { title: "Reg. Library",    fullTitle: "Regulatory Library",   path: "/regulatory-library",   icon: Library     },
  { title: "Controls Lib.",   fullTitle: "Controls Library",     path: "/controls-library",     icon: ShieldCheck },
  { title: "Frameworks Lib.", fullTitle: "Frameworks Library",   path: "/frameworks-library",   icon: BookOpen    },
  { title: "Reg. Testing",    fullTitle: "Regulatory Testing",   path: "/regulatory-testing",   icon: Scale       },
  { title: "Reports",         fullTitle: "RCM Reports",          path: "/reports",              icon: FileBarChart },
  { title: "Final Report",    fullTitle: "Final Report",         path: "/evidence-assessment",  icon: FileSearch  },
  { title: "Control Testing", fullTitle: "AI Control Testing",   path: "/control-testing",      icon: TestTube    },
  { title: "Chat",            fullTitle: "AI Chat",              path: "/chat",                 icon: MessageSquare },
  { title: "Settings",        fullTitle: "Settings",             path: "/settings",             icon: Settings    },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex h-screen bg-background">
      {/* ── Left Sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: collapsed ? 56 : 224 }}
      >
        {/* Logo / brand + collapse toggle */}
        <div className="h-14 flex items-center border-b border-border flex-shrink-0 relative"
             style={{ paddingLeft: collapsed ? 0 : 16, paddingRight: collapsed ? 0 : 8, justifyContent: collapsed ? "center" : "space-between" }}>
          {/* Logo area */}
          <div className={`flex items-center overflow-hidden transition-all duration-300 ${collapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"}`}>
            <img
              src={logo}
              alt="Trace logo"
              className="h-7 w-auto object-contain flex-shrink-0"
            />
          </div>

          {/* Collapse toggle button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden"
             style={{ paddingLeft: collapsed ? 4 : 8, paddingRight: collapsed ? 4 : 8 }}>
          <div className="space-y-0.5">
            {tabs.map((tab) => {
              const isActive = location === tab.path;
              const btn = (
                <button
                  key={tab.path}
                  onClick={() => setLocation(tab.path)}
                  data-testid={`tab-${tab.title.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                    collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"
                  } ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="whitespace-nowrap overflow-hidden text-ellipsis">{tab.title}</span>}
                </button>
              );

              return collapsed ? (
                <Tooltip key={tab.path} delayDuration={0}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {tab.fullTitle}
                  </TooltipContent>
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
              <TooltipContent side="right" className="text-xs">
                {user?.name ?? "User"}
              </TooltipContent>
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
        {/* Top header */}
        <header className="h-14 border-b border-border bg-sidebar/80 backdrop-blur-sm flex items-center px-4 gap-1 flex-shrink-0">
          {/* App name — centred */}
          <div className="flex-1 flex justify-center">
            <span className="text-sm font-bold text-foreground tracking-wide select-none">Trace</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            title="Logout"
            data-testid="button-logout"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>

          <Avatar className="h-7 w-7 cursor-default ml-1" title={user?.name}>
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {userInitial}
            </AvatarFallback>
          </Avatar>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
