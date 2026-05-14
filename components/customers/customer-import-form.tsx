"use client";

import { startTransition, useState } from "react";

import { importCustomersCsvAction } from "@/lib/actions/customer-import-actions";
import { Button } from "@/components/ui/button";

export function CustomerImportForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        setPending(true);
        setMessage(undefined);

        startTransition(async () => {
          const result = await importCustomersCsvAction(formData);
          setPending(false);
          setMessage(result.message);
          if (result.ok) {
            (event.currentTarget as HTMLFormElement).reset();
          }
        });
      }}
    >
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
      />
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Iceri aktariliyor..." : "CSV iceri aktar"}
      </Button>
    </form>
  );
}
