/**
 * Like setInterval, but only ticks while the page is visible. When the page becomes visible again
 * after missing at least one tick, it runs once straight away.
 *
 * Background tabs and idle desktop windows used to keep polling the database all day, which
 * multiplied every query by the number of open windows. Returns a function that stops it.
 */
export function visibleInterval(task: () => void, everyMs: number): () => void {
  let missed = false;

  const timer = window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      missed = true;
      return;
    }
    task();
  }, everyMs);

  const onVisible = () => {
    if (document.visibilityState === "visible" && missed) {
      missed = false;
      task();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
