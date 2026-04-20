import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export default function HeroSection({ title, subtitle, icon: Icon, actions }: HeroSectionProps) {
  return (
    <div className="hero-section flex-shrink-0 px-7 py-4 animate-panel-in">
      <div className="relative z-10 flex items-center gap-4">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/8 flex-shrink-0">
            <Icon className="h-4.5 w-4.5 text-[#00B8F5] flex-shrink-0" style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.38em] text-white/45 mb-1">
            TRACE workspace
          </p>
          <h1 className="text-[17px] font-bold tracking-[0.14em] text-white leading-tight uppercase">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11.5px] text-white/60 mt-0.5 leading-5 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
