import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TraceStatusRibbonProps {
  title: string;
  detail: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "blue" | "purple";
}

const ribbonToneClass: Record<NonNullable<TraceStatusRibbonProps["tone"]>, string> = {
  blue: "bg-[linear-gradient(90deg,#153A96_0%,#1E49E2_100%)] text-white",
  purple: "bg-[linear-gradient(90deg,#5917B8_0%,#7213EA_55%,#861EF2_100%)] text-white",
};

export function TraceStatusRibbon({
  title,
  detail,
  action,
  icon: Icon = CheckCircle2,
  tone = "blue",
}: TraceStatusRibbonProps) {
  return (
    <section
      className={cn(
        "rounded-[26px] px-6 py-5 shadow-[0_24px_60px_-40px_rgba(12,35,60,0.42)] lg:px-8",
        ribbonToneClass[tone],
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-[260px] items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white/12 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-bold tracking-[-0.02em] text-white">{title}</p>
            <p className="mt-1 text-[14px] text-white/80">{detail}</p>
          </div>
        </div>
        {action}
      </div>
    </section>
  );
}

interface TraceMetricCardProps {
  label: string;
  value: React.ReactNode;
  sub: string;
  badge?: React.ReactNode;
  accentColor: string;
  badgeClassName?: string;
  children?: React.ReactNode;
  className?: string;
}

export function TraceMetricCard({
  label,
  value,
  sub,
  badge,
  accentColor,
  badgeClassName,
  children,
  className,
}: TraceMetricCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-[#DCE3EE] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.32)]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accentColor }} />
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">{label}</p>
      <div className="text-[46px] font-bold leading-none tracking-[-0.04em] text-[#0C233C]">{value}</div>
      <p className="mt-3 text-[15px] text-[#7388A8]">{sub}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      {badge ? (
        <div
          className={cn(
            "mt-5 inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] font-bold",
            badgeClassName,
          )}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

interface TracePanelProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function TracePanel({ title, subtitle, children, className }: TracePanelProps) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-[#DCE3EE] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.26)]",
        className,
      )}
    >
      <header className="mb-5">
        <h2 className="text-[18px] font-bold tracking-[-0.02em] text-[#0C233C]">{title}</h2>
        {subtitle ? <p className="mt-1.5 text-[14px] text-[#7388A8]">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

interface TraceSectionHeadingProps {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}

export function TraceSectionHeading({ title, eyebrow, action }: TraceSectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#00338D]">{eyebrow}</p>
        ) : null}
        <h2 className="text-[24px] font-bold tracking-[-0.03em] text-[#0C233C]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

interface TraceLockedStateProps {
  title: string;
  description: string;
  action: React.ReactNode;
}

export function TraceLockedState({ title, description, action }: TraceLockedStateProps) {
  return (
    <section className="rounded-[24px] border-2 border-dashed border-[#D8E0EC] bg-white px-6 py-14 text-center shadow-[0_18px_42px_-34px_rgba(12,35,60,0.2)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F6FA] text-[#7E91AE]">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-[24px] font-bold tracking-[-0.03em] text-[#0C233C]">{title}</h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-7 text-[#7388A8]">{description}</p>
      <div className="mt-7">{action}</div>
    </section>
  );
}
