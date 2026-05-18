"use client";

/**
 * Phase 87 — ReassignForm client component
 *
 * Renders a compact user select + "Ata" button per task row.
 * On submit calls assignTaskAction and reloads via router.refresh().
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { assignTaskAction } from "@/lib/actions/task-assign-action";

type User = { id: string; name: string };

type Props = {
  taskId: string;
  currentAssigneeId: string | null;
  users: User[];
};

export function ReassignForm({ taskId, currentAssigneeId, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(currentAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);

  const isDirty = selected !== (currentAssigneeId ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await assignTaskAction(taskId, selected || null);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
        disabled={isPending}
      >
        <option value="">— Atanmamış</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {isDirty && (
        <button
          type="submit"
          disabled={isPending}
          className="h-7 rounded-lg bg-slate-800 px-2.5 text-[10px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? "…" : "Ata"}
        </button>
      )}
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </form>
  );
}
