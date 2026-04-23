import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
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
      className="landing-nav sticky top-0 z-50 w-full"
      style={{ background: "#0C233C", backdropFilter: "blur(12px)" }}
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-8 py-4 lg:px-14">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/landing")}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <span className="text-[18px] font-bold tracking-tight text-white">KPMG</span>
            <span className="text-[#1E49E2] text-[20px] font-light select-none">|</span>
            <span className="text-[18px] font-bold tracking-tight text-[#00B8F5]">TRACE</span>
          </button>
          {breadcrumb && (
            <span className="hidden sm:flex items-center gap-1.5 ml-1 text-white/40 text-[13px]">
              <span>/</span>
              <span className="text-white/60">{breadcrumb}</span>
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
