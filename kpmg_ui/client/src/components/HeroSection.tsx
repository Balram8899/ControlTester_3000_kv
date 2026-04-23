import type { LucideIcon } from "lucide-react";
import TraceNavBar from "./TraceNavBar";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export default function HeroSection({ title, subtitle, icon: Icon, actions }: HeroSectionProps) {
  return (
    <section className="hero-section trace-page-hero flex-shrink-0">
      <TraceNavBar breadcrumb={title} actions={actions} />
      <div className="trace-page-hero__inner">
        <div className="trace-page-hero__content">
          {Icon ? (
            <div className="trace-page-hero__icon">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div className="trace-page-hero__copy">
            <h1 className="trace-page-hero__title">{title}</h1>
            {subtitle ? <p className="trace-page-hero__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="trace-page-hero__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
