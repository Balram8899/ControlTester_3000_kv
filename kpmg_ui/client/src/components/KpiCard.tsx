interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  accentColor: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, subtitle, accentColor, icon }: KpiCardProps) {
  return (
    <div
      className="trace-kpi-card dashboard-panel card-interactive animate-fade-up overflow-hidden rounded-[20px] border bg-card text-card-foreground"
    >
      <div className="h-1 w-full" style={{ background: accentColor }} />
      <div className="flex min-h-[152px] items-start justify-between gap-4 p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)]">{label}</p>
          <p className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--ink-strong)]">{value}</p>
          {subtitle && <p className="max-w-[18ch] text-[12px] leading-5 text-[var(--ink-muted)]">{subtitle}</p>}
        </div>
        {icon ? (
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[15px] border border-[#00338D]/10 bg-[#F3F7FF]"
            style={{ color: accentColor }}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}
