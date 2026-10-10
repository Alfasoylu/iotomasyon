"use client";

import { useState, useTransition } from "react";
import { answerTrendyolQuestionAction } from "@/lib/actions/trendyol-question-actions";
import { answerN11QuestionAction } from "@/lib/actions/n11-question-actions";
import { Button } from "@/components/ui/button";

interface Props {
  questionId: string;
  /** Hangi pazaryerine yanıt gider (varsayılan Trendyol). */
  platform?: "TRENDYOL" | "N11";
  onSuccess?: () => void;
}

export function AnswerQuestionForm({ questionId, platform = "TRENDYOL", onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!text.trim()) return;
    startTransition(async () => {
      const send = platform === "N11" ? answerN11QuestionAction : answerTrendyolQuestionAction;
      const res = await send({ questionId, text: text.trim() });
      setResult(res);
      if (res.ok) {
        setText("");
        setOpen(false);
        onSuccess?.();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Yanıtla
      </Button>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      <textarea
        className="w-full rounded-md border border-slate-200 p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-y min-h-[80px]"
        placeholder="Cevabınızı buraya yazın (10–2000 karakter)..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        disabled={isPending}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || text.trim().length < 10}>
          {isPending ? "Gönderiliyor..." : "Gönder"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setText(""); setResult(null); }}>
          İptal
        </Button>
        <span className="text-xs text-slate-400">{text.length}/2000</span>
      </div>
      {result && !result.ok && (
        <p className="text-xs text-red-600 font-medium">{result.message}</p>
      )}
    </div>
  );
}
