// The admin app's API client.
//
// Sign-in gives two tokens, like the main site's sessions:
//   access token   15 minutes, kept only in this tab's memory (never written to storage)
//   refresh token  swapped for a new pair whenever the access token runs out; every swap retires the
//                  old one, and reusing a retired one revokes the session on the server
// The refresh token lives in sessionStorage, so it dies with the tab. The server ends every session
// 8 hours after sign-in no matter what. Anything the server doesn't trust gets a plain 404.
import { API_URL, ApiRequestError } from "@/lib/api";
import type { Permission } from "./perms";

const KEY = "ghosted.admin.session";
export type AdminMe = { name: string; email: string; role: "owner" | "admin" | "moderator" | "viewer"; permissions: Permission[]; avatarSeed: string; tone: "sassy" | "calm"; emailTheme: "light" | "dark"; mfaMethod: "none" | "totp" | "email"; fromEnv: boolean };
export type Tokens = { token: string; refreshToken: string; expiresAt: string; sessionExpiresAt: string };
type Stored = { refreshToken: string; sessionExpiresAt: string };

let access: { token: string; expiresAt: number } | null = null;

export const session = {
  get(): Stored | null { try { const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Stored | null; return s && new Date(s.sessionExpiresAt).getTime() > Date.now() ? s : null; } catch { return null; } },
  set(t: Tokens) {
    access = { token: t.token, expiresAt: new Date(t.expiresAt).getTime() };
    try { sessionStorage.setItem(KEY, JSON.stringify({ refreshToken: t.refreshToken, sessionExpiresAt: t.sessionExpiresAt } satisfies Stored)); } catch { /* storage blocked: this tab only */ }
  },
  clear() { access = null; try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } window.dispatchEvent(new Event("ghosted:admin-signed-out")); },
};

const call = (path: string, method: string, body: unknown, token?: string) => fetch(`${API_URL}/v1/admin${path}`, {
  method,
  // X-Ghosted-Client is the API's CSRF guard.
  headers: { "X-Ghosted-Client": "web", ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { "Content-Type": "application/json" }) },
  body: body !== undefined ? JSON.stringify(body) : null,
  cache: "no-store",
});

// One refresh at a time, shared by every request that needed it.
let refreshing: Promise<boolean> | null = null;
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const s = session.get();
    if (!s) return false;
    const res = await call("/refresh", "POST", { refreshToken: s.refreshToken }).catch(() => null);
    if (!res?.ok) return false;
    session.set((await res.json()) as Tokens);
    return true;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

const OPEN = new Set(["/login", "/login/mfa", "/setup/start", "/setup/finish", "/refresh"]);

export async function adminApi<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!API_URL) throw new ApiRequestError(0, "api_disabled", "Set VITE_API_URL to the Ghosted API to use the admin panel.");
  const open = OPEN.has(path);
  if (!open) {
    if (!session.get()) { session.clear(); throw new ApiRequestError(401, "signed_out", "Sign in to continue."); }
    // Refresh a little early, so a request never leaves with a token that dies on the way.
    if (!access || access.expiresAt - Date.now() < 30_000) if (!(await refresh())) { session.clear(); throw new ApiRequestError(401, "signed_out", "Your admin session ended. Sign in again."); }
  }
  let res = await call(path, method, body, open ? undefined : access?.token);
  // The access token can be revoked or expire between the check and the server: one retry.
  if (res.status === 404 && !open) {
    if (await refresh()) res = await call(path, method, body, access?.token);
    if (res.status === 404) { session.clear(); throw new ApiRequestError(401, "signed_out", "Your admin session ended. Sign in again."); }
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; fields?: Record<string, string> } };
  if (!res.ok) throw new ApiRequestError(res.status, json.error?.code ?? "http_error", json.error?.message ?? "Request failed.", json.error?.fields);
  return json as T;
}

// A random id for this browser (not tied to you), sent at sign-in so a fresh sign-in here replaces
// this browser's previous session instead of piling up.
export function deviceId() {
  try {
    let id = localStorage.getItem("ghosted.admin.device");
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) { id = crypto.randomUUID(); localStorage.setItem("ghosted.admin.device", id); }
    return id;
  } catch { return undefined; }
}

// The public site, for "open on Ghosted" links.
export const SITE_URL = ((import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "http://localhost:8080").replace(/\/$/, "");
export const peep = (seed: string) => `https://api.dicebear.com/9.x/open-peeps/svg?seed=${encodeURIComponent(seed)}`;
