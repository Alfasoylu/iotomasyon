"use client";

import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 active:scale-[0.98] disabled:opacity-50",
  secondary:
    "bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-strong)] disabled:opacity-50",
  danger:
    "text-[var(--danger)] border border-[var(--danger-border)] hover:bg-[var(--danger-dim)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:opacity-50",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[12px] rounded-md",
  md: "h-9 px-3.5 text-[13px] rounded-md",
  lg: "h-10 px-4 text-[13px] rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-100 ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
