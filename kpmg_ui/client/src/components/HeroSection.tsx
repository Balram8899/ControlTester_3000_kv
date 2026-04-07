import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export default function HeroSection({ title, subtitle, icon: Icon, actions }: HeroSectionProps) {
  return (
    <div className="hero-section osint-scanline flex-shrink-0 px-6 py-4 animate-panel-in">
      {/* OSINT dot grid */}
      <div className="absolute inset-0 osint-grid opacity-40 pointer-events-none" />

      {/* Animated gradient orbs */}
      <div
        className="absolute top-[-60px] right-[-40px] h-48 w-48 rounded-full opacity-25 blur-[60px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--pacific), transparent)" }}
      />
      <div
        className="absolute bottom-[-40px] left-[-30px] h-36 w-36 rounded-full opacity-20 blur-[50px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--cobalt), transparent)", animationDelay: "-3s" }}
      />

      <div className="relative z-10 flex items-center gap-3">
        {Icon && <Icon className="h-6 w-6 text-[var(--pacific)] flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold font-mono tracking-wide text-white leading-tight uppercase">{title}</h1>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
