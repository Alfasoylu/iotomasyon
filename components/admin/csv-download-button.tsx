"use client";

interface Column {
  header: string;
  key: string;
}

interface Props {
  filename: string;
  columns: Column[];
  rows: Array<Record<string, string | number>>;
  label?: string;
}

function escapeCsv(value: string | number): string {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function CsvDownloadButton({ filename, columns, rows, label = "CSV indir" }: Props) {
  function handleDownload() {
    const header = columns.map((c) => escapeCsv(c.header)).join(";");
    const body = rows
      .map((r) => columns.map((c) => escapeCsv(r[c.key] ?? "")).join(";"))
      .join("\n");
    const csv = `﻿${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={rows.length === 0}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      ⬇ {label}
    </button>
  );
}
