import type { ReactNode } from "react";

type ComponentShellProps = {
  children: ReactNode;
  className?: string;
};

export function ComponentShell({ children, className = "" }: ComponentShellProps) {
  return <section className={className}>{children}</section>;
}
