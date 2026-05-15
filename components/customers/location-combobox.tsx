"use client";

import { useEffect, useRef, useState } from "react";

interface LocationComboboxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function LocationCombobox({
  options,
  value,
  onChange,
  placeholder = "Seçin veya yazın...",
  disabled = false,
  id,
}: LocationComboboxProps) {
  // inputValue tracks what the user is typing; initialized from value prop.
  // External resets are handled via the `key` prop on the parent (remounts).
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered =
    inputValue.trim().length === 0
      ? options
      : options.filter((o) =>
          o.toLocaleLowerCase("tr-TR").includes(
            inputValue.toLocaleLowerCase("tr-TR"),
          ),
        );

  function selectOption(opt: string) {
    onChange(opt);
    setInputValue(opt);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0 && filtered[highlighted]) {
      e.preventDefault();
      selectOption(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setInputValue(value);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const item = listRef.current.children[highlighted] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={inputValue}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />

      {open && !disabled && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              className={`cursor-pointer px-3 py-2 text-sm transition ${
                i === highlighted
                  ? "bg-orange-50 text-orange-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}

      {open &&
        !disabled &&
        filtered.length === 0 &&
        inputValue.trim().length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 shadow-lg">
            Eşleşen konum bulunamadı.
          </div>
        )}
    </div>
  );
}
