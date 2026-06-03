import { useLocation } from "wouter";
import { ChevronLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface TraceNavBarProps {
  breadcrumb?: string;
  actions?: React.ReactNode;
}

export default function TraceNavBar({ breadcrumb, actions }: TraceNavBarProps) {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();

  const handleSignOut = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div
      className="landing-nav trace-top-ribbon sticky top-0 z-50 w-full"
      style={{ background: "#0C233C", backdropFilter: "blur(12px)" }}
    >
      <div className="trace-top-ribbon__inner mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setLocation("/landing")}
            aria-label="Back to Apex landing"
            title="Back to Apex landing"
            className="trace-top-ribbon__brand flex min-w-0 items-center gap-3 transition-opacity hover:opacity-90"
          >
            <span className="trace-top-ribbon__back" aria-hidden="true">
              <ChevronLeft className="h-4 w-4" />
            </span>
            <span className="text-[18px] font-bold tracking-tight text-white">KPMG</span>
            <span className="text-[#1E49E2] text-[20px] font-light select-none">|</span>
            <span className="text-[18px] font-bold tracking-tight text-[#00B8F5]">Apex</span>
          </button>
          {breadcrumb && (
            <span className="hidden min-w-0 items-center gap-1.5 text-white/40 sm:flex text-[13px]">
              <span>/</span>
              <span className="truncate text-white/60">{breadcrumb}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            variant="ghost"
            size="sm"
            className="kpmg-dark-outline-button rounded-full text-xs gap-1.5"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
