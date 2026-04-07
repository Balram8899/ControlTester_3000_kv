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
      className="rounded-2xl border bg-card text-card-foreground p-4 card-interactive osint-grid animate-fade-up"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider font-mono">{label}</p>
          <p className="text-2xl font-extrabold font-mono mt-1 leading-none">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-1.5">{subtitle}</p>}
        </div>
        {icon && <span className="text-muted-foreground/40 flex-shrink-0">{icon}</span>}
      </div>
    </div>
  );
}
