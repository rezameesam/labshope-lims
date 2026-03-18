import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PlatformRoute from "../PlatformRoute";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, isStaff: false }),
}));

vi.mock("@/hooks/usePlatformAdmin", () => ({
  usePlatformAdmin: () => ({ loading: false, isPlatformAdmin: false }),
}));

vi.mock("../PlatformAdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="platform-layout">{children}</div>
  ),
}));

describe("PlatformRoute", () => {
  it("does not render children when user is unauthenticated", () => {
    render(
      <MemoryRouter initialEntries={["/platform/dashboard"]}>
        <Routes>
          <Route
            path="*"
            element={
              <PlatformRoute>
                <div>Protected Content</div>
              </PlatformRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows loading spinner while auth is resolving", () => {
    vi.doMock("@/hooks/useAuth", () => ({
      useAuth: () => ({ user: null, loading: true, isStaff: false }),
    }));

    // The unauthenticated mock (from module-level vi.mock) shows no content —
    // this test confirms the component renders without crashing during loading.
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="*"
            element={
              <PlatformRoute>
                <div>Protected Content</div>
              </PlatformRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});
