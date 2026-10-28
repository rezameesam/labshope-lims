import { expect, it } from "vitest";

// Temporary: proves that a failing test stops CI from promoting the commit to production.
it("deliberately fails to exercise the deploy gate", () => {
  expect(1).toBe(2);
});
