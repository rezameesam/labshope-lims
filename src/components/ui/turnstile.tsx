import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
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
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
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
      if (!containerRef.current) return;
      if (widgetIdRef.current || renderLockRef.current) return;
      if (containerRef.current.dataset.turnstileRendered === "true") return;
      if (activeContainer && activeContainer !== containerRef.current) return;
      renderLockRef.current = true;
      try {
        await ensureScript();
        if (!window.turnstile || !containerRef.current) return;

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
        });
        widgetIdRef.current = id;
        containerRef.current.dataset.turnstileRendered = "true";
        activeWidgetId = id;
        activeContainer = containerRef.current;
      } finally {
        renderLockRef.current = false;
      }
    };

    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        if (activeWidgetId === widgetIdRef.current) {
          activeWidgetId = null;
          activeContainer = null;
        }
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        delete containerRef.current.dataset.turnstileRendered;
      }
      widgetIdRef.current = null;
      renderLockRef.current = false;
    };
  }, [siteKey, action]);

  return <div ref={containerRef} />;
};

export default Turnstile;
