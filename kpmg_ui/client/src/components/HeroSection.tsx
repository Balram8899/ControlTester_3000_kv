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
      <div className="absolute inset-0 osint-grid opacity-30 pointer-events-none" />

      <div
        className="absolute top-[-50px] right-[-20px] h-44 w-44 rounded-full opacity-20 blur-[72px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--pacific), transparent)" }}
      />
      <div
        className="absolute bottom-[-30px] left-[-20px] h-32 w-32 rounded-full opacity-15 blur-[60px] animate-orb-float"
        style={{ background: "radial-gradient(circle, var(--cobalt), transparent)", animationDelay: "-3s" }}
      />

      <div className="relative z-10 flex items-center gap-3">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Icon className="h-5 w-5 text-[var(--pacific)] flex-shrink-0" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-[0.18em] text-white leading-tight uppercase">{title}</h1>
          {subtitle && <p className="text-[12px] text-white/62 mt-1 leading-5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
