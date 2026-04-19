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
      className="dashboard-panel card-interactive animate-fade-up rounded-2xl border bg-card text-card-foreground p-4"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">{label}</p>
          <p className="mt-2 text-[30px] font-bold leading-none text-[#0C233C]">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        {icon && (
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[#00338D]/10 bg-[#F3F7FF] text-muted-foreground/70"
            style={{ color: accentColor }}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
