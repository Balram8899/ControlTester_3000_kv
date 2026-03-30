import { useLocation } from "wouter";
import { Moon, Sun, User, LogOut, MessageSquare, FileSearch, Settings, TestTube, Scale, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "./ThemeProvider";
import logo from "@/assets/kpmg (1).png";

interface AppLayoutProps {
  children: React.ReactNode;
}

const tabs = [
  { title: "Regulatory Testing", path: "/", icon: Scale },
  { title: "Final Report", path: "/evidence-assessment", icon: FileSearch },
  { title: "AI Control Testing", path: "/control-testing", icon: TestTube },
  { title: "Chat", path: "/chat", icon: MessageSquare },
  { title: "Regulatory Library", path: "/regulatory-library", icon: Library },
  { title: "Settings", path: "/settings", icon: Settings },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    console.log("Logout clicked");
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#654ea3]/20 via-[#8b6dbb]/10 to-[#eaafc8]/20">
      <header className="h-16 border-b bg-gradient-to-r from-[#654ea3]/30 via-[#7b68b8]/20 to-[#eaafc8]/30 backdrop-blur-sm flex items-center px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="KPMG logo"
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="flex-1 flex justify-center">
          <span className="text-lg font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            AI Risk Assessment Agent
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav className="border-b bg-background/50 backdrop-blur-sm">
        <div className="flex items-center gap-1 px-6">
          {tabs.map((tab) => {
            const isActive = location === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => setLocation(tab.path)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                }`}
                data-testid={`tab-${tab.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.title}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
