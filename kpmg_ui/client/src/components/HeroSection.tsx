import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export default function HeroSection({ title, subtitle, icon: Icon, actions }: HeroSectionProps) {
  return (
    <div className="hero-section flex-shrink-0 px-7 py-5 animate-panel-in">
      <div className="relative z-10 flex items-center gap-4">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/10 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.4)] flex-shrink-0">
            <Icon className="text-[#00B8F5] flex-shrink-0" style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="kpmg-on-dark-label text-[10px] font-bold uppercase tracking-[0.34em] mb-1">
            TRACE workspace
          </p>
          <h1 className="text-[24px] font-bold tracking-[0.01em] text-white leading-tight">{title}</h1>
          {subtitle && (
            <p className="kpmg-on-dark-copy text-[12.5px] mt-1.5 leading-6 max-w-3xl">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
