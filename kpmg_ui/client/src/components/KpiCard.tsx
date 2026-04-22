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
      className="dashboard-panel card-interactive animate-fade-up rounded-lg border bg-card text-card-foreground p-4"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-semibold text-[var(--ink-muted)]">{label}</p>
          <p className="mt-2 font-display text-[34px] font-bold leading-none text-[var(--ink-strong)]">{value}</p>
          {subtitle && <p className="text-[11px] text-[var(--ink-muted)] mt-2">{subtitle}</p>}
        </div>
        {icon && (
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[6px] border border-[#00338D]/10 bg-[#F3F7FF]"
            style={{ color: accentColor }}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
