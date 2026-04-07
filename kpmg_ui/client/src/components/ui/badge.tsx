import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
  " hover-elevate " ,
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-xs",

        outline: " border [border-color:var(--badge-outline)] shadow-xs",
        "status-pass": "border-[rgba(0,154,68,0.25)] bg-[rgba(0,154,68,0.12)] text-[#009A44]",
        "status-fail": "border-[rgba(229,0,27,0.25)] bg-[rgba(229,0,27,0.12)] text-[#E5001B]",
        "status-partial": "border-[rgba(234,170,0,0.25)] bg-[rgba(234,170,0,0.12)] text-[#EAAA00]",
        "status-info": "border-[rgba(0,184,245,0.25)] bg-[rgba(0,184,245,0.12)] text-[#00B8F5]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
