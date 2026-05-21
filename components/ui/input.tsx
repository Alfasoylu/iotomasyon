"use client";

import { forwardRef } from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] disabled:opacity-50 ${className}`}
      {...props}
    />
  ),
);

Input.displayName = "Input";
