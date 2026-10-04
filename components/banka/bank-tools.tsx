"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BankaUpload } from "./banka-upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface BankAccountView {
  id: string; name: string; accountType: string; balanceTry: number | null;
  updatedAt: string; lastUpdatedAt: string;
}

export function BankTools({ accounts }: { accounts: BankAccountView[] }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const account = accounts.find(a => a.id === id);
  const uniqueBanks = accounts.filter(a => accounts.filter(b => b.name === a.name).length === 1);
  const field = "block w-full rounded border border-[var(--border-default)] bg-[var(--surface-2)] p-2";
  function reset() { setPreview(false); setMessage(""); }
  async function save() {
    if (!account || !preview || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/banka-yukleme/bakiye", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, balance, asOf: new Date(asOf).toISOString(), expectedUpdatedAt: account.updatedAt, confirmed: true }),
      });
      const result = await response.json();
      setMessage(response.ok ? "Bakiye ve değişiklik kaydı kaydedildi." : result.error ?? "İşlem tamamlanamadı.");
      if (response.ok) { setPreview(false); router.refresh(); }
    } catch { setMessage("İşlem doğrulanamadı. Sayfayı yenileyip kayıtlı bakiyeyi kontrol edin."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <h2 className="text-lg font-semibold">1. Dosyayı yükle ve incele</h2>
    <BankaUpload bankalar={uniqueBanks} onReset={() => { setId(""); setBalance(""); setAsOf(""); reset(); }} onPreview={(bank, value) => {
      const selected = uniqueBanks.find(a => a.name === bank);
      if (selected) setId(selected.id);
      setBalance(value == null ? "" : value.toFixed(2)); setAsOf(""); reset();
    }} />
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">2. Banka bakiyesini doğrula ve kaydet</h2>
      <p className="text-sm">Dosyadan gelen tutarı banka ekranıyla karşılaştırın. Ekstreler farklı sıralanabilir; görünen tutar en güncel bakiye olmayabilir. Bakiye tarihi, tutarın bankada geçerli olduğu tarih ve saattir. Eski tarihli bakiye güncel sayılmaz.</p>
      <label className="block text-sm">Hesap<select disabled={busy} className={field} value={id} onChange={e => { setId(e.target.value); setBalance(""); setAsOf(""); reset(); }}>
        <option value="">Hesap seçin</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.accountType}</option>)}
      </select></label>
      {account && <p className="text-sm">Kayıtlı bakiye: {account.balanceTry?.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) ?? "Bilinmiyor"} TL · Son bakiye tarihi: {new Date(account.lastUpdatedAt).toLocaleString("tr-TR")}</p>}
      <label className="block text-sm">Doğrulanan bakiye (TL)<input disabled={busy} className={field} value={balance} inputMode="decimal" placeholder="Örnek: 1.234,56 veya -1.234,56" onChange={e => { setBalance(e.target.value); reset(); }} /></label>
      <label className="block text-sm">Bakiye tarihi ve saati<input disabled={busy} className={field} type="datetime-local" value={asOf} onChange={e => { setAsOf(e.target.value); reset(); }} /></label>
      {!preview ? <Button disabled={!account || !balance || !asOf || busy || !Number.isFinite(new Date(asOf).getTime())} onClick={() => setPreview(true)}>Bakiye değişikliğini önizle</Button> : <div className="space-y-3">
        <p className="font-medium">{account?.name}: {balance} TL · {new Date(asOf).toLocaleString("tr-TR")}. Bu tutarı ve tarihi banka ekranından doğruladım.</p>
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Kaydediliyor…" : "Onayla ve bakiyeyi kaydet"}</Button>
      </div>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </Card>
  </div>;
}
