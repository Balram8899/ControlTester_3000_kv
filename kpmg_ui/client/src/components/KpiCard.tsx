interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, subtitle, accentColor, icon }: KpiCardProps) {
  return (
    <div
      className="dashboard-panel card-interactive animate-fade-up rounded-[18px] border bg-card text-card-foreground p-4"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.18em]">{label}</p>
          <p className="mt-2 text-[30px] font-bold leading-none text-[var(--ink-strong)]">{value}</p>
          {subtitle && <p className="text-[11px] text-[var(--ink-muted)] mt-2">{subtitle}</p>}
        </div>
        {icon && (
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] border border-[#00338D]/10 bg-[#F3F7FF]"
            style={{ color: accentColor }}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
