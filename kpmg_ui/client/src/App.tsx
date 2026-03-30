import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={RegulatoryTestingPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/evidence-assessment" component={EvidenceAssessmentPage} />
        <Route path="/control-testing" component={ControlTestingPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/regulatory-library" component={RegulatoryLibraryPage} />
      </Switch>
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
