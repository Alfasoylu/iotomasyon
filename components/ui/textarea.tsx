"use client";

import { forwardRef } from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`min-h-24 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] disabled:opacity-50 ${className}`}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
