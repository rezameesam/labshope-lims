import type { Session } from "@supabase/supabase-js";

/**
 * Small caches that let the app start with no network. They only decide what the
 * screen shows while the server is unreachable: every request is still checked
 * by the server (login + row level security) as soon as it can be reached.
 */

export const TIMED_OUT = Symbol("timed-out");

/** Resolves with the promise's value, or TIMED_OUT if it takes longer than `ms`. */
export function raceTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const ROLE_KEY = (userId: string) => `lims_roles_v1_${userId}`;
const ORG_KEY = (key: string) => `lims_org_ctx_v1_${key}`;

/** Roles are trusted offline for this long after they were last confirmed online. */
export const ROLE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

const readJson = <T>(key: string): T | null => {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: caching is best effort.
  }
};

export function writeCachedRoles<T extends string>(userId: string, roles: T[], now = Date.now()) {
  writeJson(ROLE_KEY(userId), { roles, savedAt: now });
}

export function readCachedRoles<T extends string>(userId: string, now = Date.now()): T[] | null {
  const entry = readJson<{ roles?: T[]; savedAt?: number }>(ROLE_KEY(userId));
  if (!entry || !Array.isArray(entry.roles) || typeof entry.savedAt !== "number") return null;
  return now - entry.savedAt <= ROLE_CACHE_MAX_AGE_MS ? entry.roles : null;
}

export function clearCachedRoles(userId: string) {
  try {
    storage()?.removeItem(ROLE_KEY(userId));
  } catch {
    // ignore
  }
}

export function writeCachedOrgContext(key: string, payload: unknown) {
  writeJson(ORG_KEY(key), payload);
}

export function readCachedOrgContext<T>(key: string): T | null {
  return readJson<T>(ORG_KEY(key));
}

/**
 * The login Supabase keeps in storage. When the access token has expired and the
 * refresh cannot reach the server, Supabase reports "no session" but leaves this
 * in place, so its presence means the login is still valid and only the refresh
 * failed. (An invalid or revoked login is removed by Supabase itself.)
 */
export function readStoredSession(storageKey: string | undefined): Session | null {
  if (!storageKey) return null;
  const stored = readJson<Partial<Session>>(storageKey);
  if (!stored?.user?.id || !stored.access_token || !stored.refresh_token) return null;
  return stored as Session;
}
