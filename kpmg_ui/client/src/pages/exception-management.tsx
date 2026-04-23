import { ShieldOff } from "lucide-react";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";

export default function ExceptionManagementPage() {
  return (
    <div className="h-full flex flex-col">
      <HeroSection
        title="Exception Management"
        subtitle="Log, review, and disposition control exceptions and waivers"
        icon={ShieldOff}
      />
      <TracePageBody width="narrow" tint className="flex items-center">
        <div className="text-center space-y-3">
          <ShieldOff className="h-14 w-14 mx-auto text-muted-foreground/30" />
          <p className="text-lg font-semibold text-muted-foreground">Under Development</p>
          <p className="text-sm text-muted-foreground/60">This module is coming soon.</p>
        </div>
      </TracePageBody>
    </div>
  );
}
