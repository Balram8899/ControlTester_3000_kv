import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import TraceNavBar from "@/components/TraceNavBar";
import { cn } from "@/lib/utils";

interface TraceStandalonePageProps {
  breadcrumb: string;
  children: ReactNode;
  contentClassName?: string;
  mainClassName?: string;
  maxWidth?: string;
}

export default function TraceStandalonePage({
  breadcrumb,
  children,
  contentClassName,
  mainClassName,
  maxWidth = "1380px",
}: TraceStandalonePageProps) {
  return (
    <div className="min-h-screen bg-[#F3F6FA] text-[#0C233C]">
      <TraceNavBar breadcrumb={breadcrumb} />
      <main className={cn("px-5 py-6 sm:px-6 lg:px-10 lg:py-8", mainClassName)}>
        <div
          className={cn("mx-auto w-full space-y-6 lg:space-y-8", contentClassName)}
          style={{ maxWidth }}
        >
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
