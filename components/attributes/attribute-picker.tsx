"use client";

import { useState, useTransition } from "react";

import { upsertAttributeAction } from "@/lib/actions/attribute-actions";
import type { AttributeOption } from "@/services/attribute-service";

export function AttributePicker({
  value,
  onChange,
  options: initialOptions,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: AttributeOption[];
}) {
  const [options, setOptions] = useState(initialOptions);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const trimmed = search.trim();
  const filtered = trimmed
    ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
    : options;

  const hasExactMatch = options.some(
    (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const handleCreate = () => {
    if (!trimmed) return;
    startTransition(async () => {
      const result = await upsertAttributeAction(trimmed);
      if (result.ok && result.id && result.name) {
        const newOpt = { id: result.id, name: result.name };
        setOptions((prev) => {
          if (prev.find((o) => o.id === newOpt.id)) return prev;
          return [...prev, newOpt].sort((a, b) => a.name.localeCompare(b.name));
        });
        if (!value.includes(result.id)) {
          onChange([...value, result.id]);
        }
        setSearch("");
      }
    });
  };

  const selectedOptions = options.filter((o) => value.includes(o.id));

  return (
    <div className="space-y-3">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {o.name}
              <button
                type="button"
                onClick={() => toggle(o.id)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={`${o.name} kaldır`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Özellik ara veya yeni ekle..."
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
      />

      {filtered.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {filtered.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="h-4 w-4 rounded"
              />
              {o.name}
            </label>
          ))}
        </div>
      )}

      {trimmed && !hasExactMatch && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending}
          className="text-sm text-[color:var(--accent)] hover:underline disabled:opacity-50"
        >
          {isPending ? "Oluşturuluyor..." : `"${trimmed}" özelliğini oluştur ve ekle`}
        </button>
      )}
    </div>
  );
}
