import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export default function HeroSection({ title, subtitle, icon: Icon, actions }: HeroSectionProps) {
  return (
    <div className="hero-section flex-shrink-0 px-7 py-6 animate-panel-in">
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        {Icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-white/16 bg-white/10 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.4)] flex-shrink-0">
            <Icon className="text-[#00B8F5] flex-shrink-0" style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="kpmg-on-dark-label text-[12px] font-semibold mb-1">
            Trace workspace
          </p>
          <h1 className="font-display text-[30px] font-bold text-white leading-none sm:text-[34px]">{title}</h1>
          {subtitle && (
            <p className="kpmg-on-dark-copy text-[14px] mt-2 leading-6 max-w-3xl">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
