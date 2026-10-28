import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

/** Re-renders with fresh results whenever the underlying IndexedDB data changes. */
export function useLive<T>(query: (() => Promise<T> | T) | null, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    if (!query) {
      setValue(initial);
      return undefined;
    }
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: (error) => console.warn("[offline] live query failed", error),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
