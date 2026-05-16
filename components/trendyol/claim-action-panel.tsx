"use client";

import { useState, useTransition } from "react";
import {
  approveTrendyolClaimAction,
  createTrendyolClaimIssueAction,
} from "@/lib/actions/trendyol-return-actions";
import { Button } from "@/components/ui/button";
import type { TrendyolClaimIssueReason } from "@/lib/trendyol-api";

interface ClaimLineItem {
  claimItemId: string;
  orderLineId: number;
  productName: string;
}

interface Props {
  claimId: string;
  lineItems: ClaimLineItem[];
  issueReasons: TrendyolClaimIssueReason[];
}

export function ClaimActionPanel({ claimId, lineItems, issueReasons }: Props) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [selectedIds, setSelectedIds] = useState<string[]>(lineItems.map((l) => l.claimItemId));
  const [issueReasonId, setIssueReasonId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleItem(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleApprove() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const res = await approveTrendyolClaimAction({
        claimId,
        claimLineItemIds: selectedIds,
      });
      setResult(res);
      if (res.ok) setMode("idle");
    });
  }

  function handleReject() {
    if (!issueReasonId) { setResult({ ok: false, message: "Neden seçilmeli." }); return; }
    if (!description.trim() || description.trim().length < 5) {
      setResult({ ok: false, message: "Açıklama en az 5 karakter olmalıdır." });
      return;
    }
    startTransition(async () => {
      const res = await createTrendyolClaimIssueAction({
        claimId,
        claimIssueReasonId: issueReasonId,
        claimItemIdList: selectedIds.join(","),
        description: description.trim(),
      });
      setResult(res);
      if (res.ok) setMode("idle");
    });
  }

  if (mode === "idle") {
    return (
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setMode("approve"); setResult(null); }}>
          Onayla
        </Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setMode("reject"); setResult(null); }}>
          İtiraz Et
        </Button>
        {result && (
          <span className={`text-xs font-medium self-center ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
            {result.ok ? "İşlem başarılı." : result.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
      <p className="text-sm font-semibold text-slate-800">
        {mode === "approve" ? "İade Onayı" : "İtiraz / Red"}
      </p>

      {/* Item selection */}
      <div className="space-y-1">
        <p className="text-xs text-slate-500 font-medium">Kalemler:</p>
        {lineItems.map((item) => (
          <label key={item.claimItemId} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.claimItemId)}
              onChange={() => toggleItem(item.claimItemId)}
              className="rounded"
            />
            <span className="truncate">{item.productName}</span>
            <span className="text-slate-400 font-mono text-[10px]">#{item.claimItemId.slice(-8)}</span>
          </label>
        ))}
      </div>

      {/* Reject-only fields */}
      {mode === "reject" && (
        <>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">İtiraz Nedeni</label>
            <select
              className="w-full rounded-md border border-slate-200 p-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={issueReasonId ?? ""}
              onChange={(e) => setIssueReasonId(Number(e.target.value) || null)}
            >
              <option value="">— Seçiniz —</option>
              {issueReasons.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Açıklama</label>
            <textarea
              className="w-full rounded-md border border-slate-200 p-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 resize-y min-h-[64px]"
              placeholder="İtiraz gerekçesini açıklayın..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-slate-400 text-right">{description.length}/500</p>
          </div>
        </>
      )}

      {result && !result.ok && (
        <p className="text-xs text-red-600 font-medium">{result.message}</p>
      )}

      <div className="flex gap-2">
        {mode === "approve" ? (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
            disabled={isPending || selectedIds.length === 0}
          >
            {isPending ? "İşleniyor..." : "Onayı Gönder"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleReject}
            disabled={isPending}
          >
            {isPending ? "İşleniyor..." : "İtirazı Gönder"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => { setMode("idle"); setResult(null); }}>
          İptal
        </Button>
      </div>
    </div>
  );
}
