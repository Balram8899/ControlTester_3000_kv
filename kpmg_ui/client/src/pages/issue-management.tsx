import { AlertTriangle } from "lucide-react";
import HeroSection from "@/components/HeroSection";

export default function IssueManagementPage() {
  return (
    <div className="h-full flex flex-col">
      <HeroSection
        title="Issue Management"
        subtitle="Track, triage, and resolve issues across engagements"
        icon={AlertTriangle}
      />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-14 w-14 mx-auto text-muted-foreground/30" />
          <p className="text-lg font-semibold text-muted-foreground">Under Development</p>
          <p className="text-sm text-muted-foreground/60">This module is coming soon.</p>
        </div>
      </div>
    </div>
  );
}
