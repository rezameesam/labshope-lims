import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  action?: string;
}

let activeWidgetId: string | null = null;
let activeContainer: HTMLElement | null = null;

const Turnstile = ({ siteKey, onVerify, onExpire, action }: TurnstileProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const renderLockRef = useRef(false);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const container = containerRef.current;
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
    const isPrivateIp = /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname);
    if (isLocalhost || isPrivateIp) {
      onVerifyRef.current("dev-bypass");
      return;
    }

    if (!siteKey) return;

    const ensureScript = () => {
      if (document.querySelector("script[data-turnstile]")) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Turnstile"));
        document.head.appendChild(script);
      });
    };

    const renderWidget = async () => {
      if (!container) return;
      if (widgetIdRef.current || renderLockRef.current) return;
      if (container.dataset.turnstileRendered === "true") return;
      if (activeContainer && activeContainer !== container) return;
      renderLockRef.current = true;
      try {
        await ensureScript();
        if (!window.turnstile) return;

        const id = window.turnstile.render(container, {
          sitekey: siteKey,
          action,
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
        });
        widgetIdRef.current = id;
        container.dataset.turnstileRendered = "true";
        activeWidgetId = id;
        activeContainer = container;
      } finally {
        renderLockRef.current = false;
      }
    };

    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        // Use remove() instead of reset() so Turnstile fully tears down the
        // widget — prevents the "already rendered" warning on StrictMode remount.
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        if (activeWidgetId === widgetIdRef.current) {
          activeWidgetId = null;
          activeContainer = null;
        }
      }
      if (container) {
        container.innerHTML = "";
        delete container.dataset.turnstileRendered;
      }
      widgetIdRef.current = null;
      renderLockRef.current = false;
    };
  }, [siteKey, action]);

  return <div ref={containerRef} />;
};

export default Turnstile;
