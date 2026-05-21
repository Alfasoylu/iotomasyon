import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <section
      {...rest}
      className={`rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] ${className}`}
    >
      {children}
    </section>
  );
}
