"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (explicit render).
 * Sunucu doğrulaması lib/turnstile.ts içinde; bu bileşen yalnız token üretir.
 */

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "compact" | "flexible";
      language?: string;
      action?: string;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  className?: string;
};

/** Sıfırlamak için üst bileşen `key` değiştirip yeniden kurar. */
export function TurnstileWidget({ siteKey, onToken, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const renderWidget = useCallback(() => {
    const api = window.turnstile;
    const container = containerRef.current;
    if (!api || !container || widgetIdRef.current) return;

    widgetIdRef.current = api.render(container, {
      sitekey: siteKey,
      theme: "dark",
      size: "flexible",
      language: "tr",
      action: "login",
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });
  }, [siteKey]);

  useEffect(() => {
    // Script daha önce yüklendiyse (client-side navigation) onLoad tetiklenmez.
    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget zaten kaldırılmış olabilir
        }
      }
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onLoad={renderWidget} />
      <div ref={containerRef} className={className} data-testid="turnstile" />
    </>
  );
}
