import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { EvidenceProvider } from "@/contexts/EvidenceContext";
import { ControlTestingProvider } from "@/contexts/ControlTestingContext";
import { RegulatoryTestingProvider } from "@/contexts/RegulatoryTestingContext";
import { CrossNavProvider } from "@/contexts/CrossNavContext";
import { LibraryMetricsProvider } from "@/contexts/LibraryMetricsContext";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import EvidenceAssessmentPage from "@/pages/evidence-assessment";
import ControlTestingPage from "@/pages/control-testing";
import RegulatoryTestingPage from "@/pages/regulatory-testing";
import RegulatoryLibraryPage from "@/pages/regulatory-library";
import ControlsLibraryPage from "@/pages/controls-library";
import FrameworksLibraryPage from "@/pages/frameworks-library";
import DashboardPage from "@/pages/dashboard";
import ReportsPage from "@/pages/reports";
import IssueManagementPage from "@/pages/issue-management";
import ExceptionManagementPage from "@/pages/exception-management";
import LandingPage from "@/pages/landing";
import AssetRegistryPage from "@/pages/asset-registry";
import { AssetRegistryProvider } from "@/contexts/AssetRegistryContext";

// All pages are kept permanently mounted and CSS-hidden when inactive.
// This prevents remount on every tab switch, so useEffect runs only once per
// session and local state (loading, filters, results) is preserved.
const PAGES = [
  { path: "/",                     Page: DashboardPage           },
  { path: "/regulatory-testing",   Page: RegulatoryTestingPage   },
  { path: "/reports",              Page: ReportsPage             },
  { path: "/evidence-assessment",  Page: EvidenceAssessmentPage  },
  { path: "/control-testing",      Page: ControlTestingPage      },
  { path: "/chat",                 Page: ChatPage                },
  { path: "/regulatory-library",   Page: RegulatoryLibraryPage   },
  { path: "/controls-library",     Page: ControlsLibraryPage     },
  { path: "/frameworks-library",   Page: FrameworksLibraryPage   },
  { path: "/settings",             Page: SettingsPage            },
  { path: "/issue-management",     Page: IssueManagementPage     },
  { path: "/exception-management", Page: ExceptionManagementPage },
  { path: "/asset-registry",       Page: AssetRegistryPage       },
] as const;

function Router() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  // Sync URL with auth state
  useEffect(() => {
    if (!user && location !== "/login") {
      setLocation("/login");
    } else if (user && location === "/login") {
      setLocation("/landing");
    }
  }, [user, location]);

  // Not authenticated — always show login immediately (URL will sync via effect above)
  if (!user) {
    return <LoginPage />;
  }

  // Authenticated but still on /login — redirect pending, show nothing briefly
  if (location === "/login") return null;

  if (location === "/landing") {
    return <LandingPage />;
  }

  return (
    <AppLayout>
      {PAGES.map(({ path, Page }) => (
        <div key={path} className={location === path ? "h-full overflow-hidden" : "hidden"}>
          <Page />
        </div>
      ))}
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <ChatProvider>
              <EvidenceProvider>
                <ControlTestingProvider>
                  <RegulatoryTestingProvider>
                    <CrossNavProvider>
                      <LibraryMetricsProvider>
                        <AssetRegistryProvider>
                          <Toaster />
                          <Router />
                        </AssetRegistryProvider>
                      </LibraryMetricsProvider>
                    </CrossNavProvider>
                  </RegulatoryTestingProvider>
                </ControlTestingProvider>
              </EvidenceProvider>
            </ChatProvider>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
