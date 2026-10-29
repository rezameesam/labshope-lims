import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visibleInterval } from "../visibleInterval";

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("visibleInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => vi.useRealTimers());

  it("ticks while visible", () => {
    const task = vi.fn();
    const stop = visibleInterval(task, 1000);
    vi.advanceTimersByTime(3000);
    expect(task).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not tick while hidden, then catches up once on return", () => {
    const task = vi.fn();
    const stop = visibleInterval(task, 1000);
    setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    expect(task).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(task).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not catch up if nothing was missed", () => {
    const task = vi.fn();
    const stop = visibleInterval(task, 1000);
    setVisibility("hidden");
    setVisibility("visible");
    expect(task).not.toHaveBeenCalled();
    stop();
  });

  it("stops completely when cleaned up", () => {
    const task = vi.fn();
    const stop = visibleInterval(task, 1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(task).not.toHaveBeenCalled();
  });
});
