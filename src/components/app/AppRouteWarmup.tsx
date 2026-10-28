import { useEffect } from "react";

interface PreloadableRouteModule {
  preload?: () => Promise<unknown>;
}

const shouldWarmRouteChunks = () => {
  if (typeof navigator === "undefined") {
    return true;
  }

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  if (connection?.saveData) {
    return false;
  }

  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
};

const scheduleIdleWarmup = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const idleId = idleWindow.requestIdleCallback(callback, { timeout: 1_500 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 700);
  return () => window.clearTimeout(timeoutId);
};

const AppRouteWarmup = ({
  preloaders,
}: {
  preloaders: readonly PreloadableRouteModule[];
}) => {
  useEffect(() => {
    if (!shouldWarmRouteChunks()) {
      return undefined;
    }

    const uniquePreloaders = preloaders.filter(
      (preloader, index) =>
        typeof preloader.preload === "function" && preloaders.indexOf(preloader) === index
    );

    return scheduleIdleWarmup(() => {
      for (const preloader of uniquePreloaders) {
        void preloader.preload?.();
      }
    });
  }, [preloaders]);

  return null;
};

export default AppRouteWarmup;
