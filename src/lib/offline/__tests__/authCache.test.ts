import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ROLE_CACHE_MAX_AGE_MS,
  clearCachedRoles,
  readCachedOrgContext,
  readCachedRoles,
  readStoredSession,
  writeCachedOrgContext,
  writeCachedRoles,
} from "../authCache";

// Node 25 ships an experimental global localStorage that shadows jsdom's and lacks
// clear(); use a plain in-memory Storage so the test behaves the same everywhere.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, String(value));
  removeItem = (key: string) => void this.data.delete(key);
  clear = () => this.data.clear();
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

describe("role cache", () => {
  it("returns the roles last confirmed online", () => {
    writeCachedRoles("u1", ["admin", "employee"], 1000);
    expect(readCachedRoles("u1", 2000)).toEqual(["admin", "employee"]);
    expect(readCachedRoles("someone-else", 2000)).toBeNull();
  });

  it("expires after 30 days and can be cleared", () => {
    writeCachedRoles("u1", ["admin"], 0);
    expect(readCachedRoles("u1", ROLE_CACHE_MAX_AGE_MS)).toEqual(["admin"]);
    expect(readCachedRoles("u1", ROLE_CACHE_MAX_AGE_MS + 1)).toBeNull();

    writeCachedRoles("u1", ["admin"], 5);
    clearCachedRoles("u1");
    expect(readCachedRoles("u1", 6)).toBeNull();
  });

  it("ignores corrupt entries instead of throwing", () => {
    localStorage.setItem("lims_roles_v1_u1", "{not json");
    expect(readCachedRoles("u1")).toBeNull();
    localStorage.setItem("lims_roles_v1_u1", JSON.stringify({ roles: "admin", savedAt: 1 }));
    expect(readCachedRoles("u1")).toBeNull();
  });
});

describe("organization context cache", () => {
  it("round-trips the payload per workspace", () => {
    writeCachedOrgContext("demo", { organization: { id: "o1" } });
    expect(readCachedOrgContext("demo")).toEqual({ organization: { id: "o1" } });
    expect(readCachedOrgContext("other")).toBeNull();
  });
});

describe("stored session", () => {
  it("returns a well-formed stored login and rejects anything else", () => {
    const session = { access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "u1" } };
    localStorage.setItem("sb-test-auth-token", JSON.stringify(session));
    expect(readStoredSession("sb-test-auth-token")?.user.id).toBe("u1");

    localStorage.setItem("sb-test-auth-token", JSON.stringify({ access_token: "a" }));
    expect(readStoredSession("sb-test-auth-token")).toBeNull();
    expect(readStoredSession("missing")).toBeNull();
    expect(readStoredSession(undefined)).toBeNull();
  });
});
