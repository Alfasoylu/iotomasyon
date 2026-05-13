"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { logoutAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        setPending(true);

        startTransition(async () => {
          await logoutAction();
          router.push("/login");
          router.refresh();
          setPending(false);
        });
      }}
    >
      {pending ? "Cikiliyor..." : "Cikis"}
    </Button>
  );
}
