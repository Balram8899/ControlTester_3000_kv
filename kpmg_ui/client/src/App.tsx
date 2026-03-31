import { useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChatProvider } from "@/contexts/ChatContext";
import { EvidenceProvider } from "@/contexts/EvidenceContext";
import { ControlTestingProvider } from "@/contexts/ControlTestingContext";
import { RegulatoryTestingProvider } from "@/contexts/RegulatoryTestingContext";
import AppLayout from "@/components/AppLayout";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import EvidenceAssessmentPage from "@/pages/evidence-assessment";
import ControlTestingPage from "@/pages/control-testing";
import RegulatoryTestingPage from "@/pages/regulatory-testing";
import RegulatoryLibraryPage from "@/pages/regulatory-library";
import ControlsLibraryPage from "@/pages/controls-library";

// All pages are kept permanently mounted and CSS-hidden when inactive.
// This prevents remount on every tab switch, so useEffect runs only once per
// session and local state (loading, filters, results) is preserved.
const PAGES = [
  { path: "/",                    Page: RegulatoryTestingPage   },
  { path: "/evidence-assessment", Page: EvidenceAssessmentPage  },
  { path: "/control-testing",     Page: ControlTestingPage      },
  { path: "/chat",                Page: ChatPage                },
  { path: "/regulatory-library",  Page: RegulatoryLibraryPage   },
  { path: "/controls-library",    Page: ControlsLibraryPage     },
  { path: "/settings",            Page: SettingsPage            },
] as const;

function Router() {
  const [location] = useLocation();
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
        <TooltipProvider>
          <ChatProvider>
            <EvidenceProvider>
              <ControlTestingProvider>
                <RegulatoryTestingProvider>
                  <Toaster />
                  <Router />
                </RegulatoryTestingProvider>
              </ControlTestingProvider>
            </EvidenceProvider>
          </ChatProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
