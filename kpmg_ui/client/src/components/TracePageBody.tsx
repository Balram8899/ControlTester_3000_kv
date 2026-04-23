import { cn } from "@/lib/utils";

interface TracePageBodyProps {
  children: React.ReactNode;
  width?: "default" | "wide" | "narrow";
  tint?: boolean;
  className?: string;
  contentClassName?: string;
}

export default function TracePageBody({
  children,
  width = "default",
  tint = false,
  className,
  contentClassName,
}: TracePageBodyProps) {
  return (
    <div className={cn("trace-page-body", tint && "trace-page-body--tint", className)}>
      <div
        className={cn(
          "trace-page-content",
          width === "wide" && "trace-page-content--wide",
          width === "narrow" && "trace-page-content--narrow",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
