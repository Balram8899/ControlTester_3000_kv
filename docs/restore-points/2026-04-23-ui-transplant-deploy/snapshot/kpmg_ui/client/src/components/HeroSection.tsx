import type { LucideIcon } from "lucide-react";
import TraceNavBar from "./TraceNavBar";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

// Renders only the top KPMG|TRACE nav ribbon — the dark hero band has been removed.
// The `title` prop is passed as the breadcrumb label in the ribbon.
export default function HeroSection({ title, actions }: HeroSectionProps) {
  return (
    <div className="flex-shrink-0">
      <TraceNavBar breadcrumb={title} actions={actions} />
    </div>
  );
}
