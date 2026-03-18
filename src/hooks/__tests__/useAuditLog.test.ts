import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuditLog } from "../useAuditLog";

const { mockInsert, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  return { mockInsert, mockFrom };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-123" } }),
}));

describe("useAuditLog", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockInsert.mockClear();
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  it("exposes a logAction function", () => {
    const { result } = renderHook(() => useAuditLog());
    expect(typeof result.current.logAction).toBe("function");
  });

  it("inserts into platform_audit_log with correct fields", async () => {
    const { result } = renderHook(() => useAuditLog());

    await act(async () => {
      await result.current.logAction("CREATE", "lab", "lab-1", { name: "Test Lab" });
    });

    expect(mockFrom).toHaveBeenCalledWith("platform_audit_log");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        entity_type: "lab",
        entity_id: "lab-1",
        details: { name: "Test Lab" },
        user_id: "user-123",
      }),
    );
  });

  it("includes a created_at ISO timestamp", async () => {
    const { result } = renderHook(() => useAuditLog());

    await act(async () => {
      await result.current.logAction("UPDATE", "test", "test-1");
    });

    const callArg = mockInsert.mock.calls[0][0];
    expect(callArg.created_at).toBeDefined();
    expect(new Date(callArg.created_at).toString()).not.toBe("Invalid Date");
  });

  it("does not throw when supabase insert fails (non-fatal)", async () => {
    mockInsert.mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useAuditLog());

    await expect(
      act(async () => {
        await result.current.logAction("DELETE", "test", "test-1");
      }),
    ).resolves.not.toThrow();
  });
});
