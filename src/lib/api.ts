// Client for the Ghosted API (backend/). When VITE_API_URL is unset, `apiEnabled` is false
// and the app keeps running on the mock data in src/mock/data.ts.
//
// Sessions live in encrypted HttpOnly cookies set by the API. This file never sees or stores a token:
// `credentials: "include"` just lets the browser send them, and the API refreshes them silently.

// In development, a localhost API URL is rewritten to whatever host the page was opened on, so the
// dev site works from a phone on the same Wi-Fi (there, "localhost" would be the phone itself).
const devApiUrl = (url: string) => {
  if (!import.meta.env.DEV || typeof window === "undefined") return url;
  const u = new URL(url);
  if (/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && window.location.hostname !== u.hostname) u.hostname = window.location.hostname;
  return u.toString().replace(/\/$/, "");
};
const RAW_API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") || null;
export const API_URL = RAW_API_URL && devApiUrl(RAW_API_URL);
export const apiEnabled = API_URL !== null;

// Earlier builds kept tokens in localStorage. Wipe that copy: cookies are the only store now.
if (typeof window !== "undefined") { try { localStorage.removeItem("ghosted.session"); } catch { /* storage blocked */ } }

export const UNAUTHORIZED_EVENT = "ghosted:unauthorized";

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}

export async function api<T>(path: string, { method = "GET", body, timeoutMs }: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!API_URL) throw new ApiRequestError(0, "api_disabled", "The API isn't configured.");
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    // Optional cap, so a stalled connection fails (and can be retried) instead of hanging forever.
    ...(timeoutMs && { signal: AbortSignal.timeout(timeoutMs) }),
    // X-Ghosted-Client is the API's CSRF check: other sites can't send it.
    headers: { "X-Ghosted-Client": "web", ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; fields?: Record<string, string> } };
  // A 401 outside the auth endpoints means the session is gone (both tokens expired or revoked).
  if (res.status === 401 && !path.startsWith("/v1/auth/") && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiRequestError(res.status, json.error?.code ?? "http_error", json.error?.message ?? "Request failed.", json.error?.fields);
  return json as T;
}

type Ok = { ok: true };

export const authApi = {
  // `emailTheme`: the theme the page is showing, so the code email arrives in the same palette.
  sendCode: (email: string, name: string | undefined, captchaToken: string | undefined, emailTheme?: "light" | "dark") => api<Ok & { expiresInMinutes: number }>("/v1/auth/otp/send", { method: "POST", body: { email, ...(name ? { name } : {}), captchaToken, ...(emailTheme && { emailTheme }) } }),
  verifyCode: (email: string, code: string) => api<{ verificationToken: string }>("/v1/auth/otp/verify", { method: "POST", body: { email, code } }),
  signup: (input: { fullName: string; email: string; password: string; verificationToken: string; handle: string; avatarSeed: string; pastel: string; acceptTerms: true }) => api<Ok>("/v1/auth/signup", { method: "POST", body: input }),
  // With two-step sign-in on, this returns a ticket instead of logging in; finish with loginMfa.
  login: (email: string, password: string, captchaToken: string | undefined) => api<(Ok & { profile?: Record<string, unknown> }) | { mfaRequired: true; method: MfaMethod; ticket: string }>("/v1/auth/login", { method: "POST", body: { email, password, captchaToken } }),
  loginMfa: (ticket: string, code: string) => api<Ok & { usedRecoveryCode: boolean }>("/v1/auth/login/mfa", { method: "POST", body: { ticket, code } }),
  resendMfa: (ticket: string) => api<Ok>("/v1/auth/login/mfa/resend", { method: "POST", body: { ticket } }),
  forgotPassword: (email: string, captchaToken: string | undefined) => api<Ok & { expiresInMinutes: number; needsAuthenticator: boolean }>("/v1/auth/password/forgot", { method: "POST", body: { email, captchaToken } }),
  resetPassword: (email: string, code: string, password: string, mfaCode?: string) => api<Ok>("/v1/auth/password/reset", { method: "POST", body: { email, code, password, ...(mfaCode ? { mfaCode } : {}) } }),
  logout: () => api<Ok>("/v1/auth/logout", { method: "POST" }).catch(() => undefined),
  logoutAll: () => api<Ok>("/v1/auth/logout-all", { method: "POST" }),
};

export type MfaMethod = "totp" | "email";
type Codes = { recoveryCodes: string[] };

// Settings → Two-factor authentication.
// Site-wide switches the team controls from the admin panel (announcement, paused features).
export type PlatformState = { announcement: { text: string; tone: "info" | "warn" | "good"; link: string | null } | null; signupsOpen: boolean; postingOpen: boolean; chitchatsOpen: boolean; donationsOpen: boolean; readOnly: boolean; readOnlyMessage: string };
export const platformApi = { get: () => api<PlatformState>("/v1/platform") };

export const mfaApi = {
  startTotp: () => api<{ secret: string; uri: string }>("/v1/me/2fa/totp/start", { method: "POST" }),
  confirmTotp: (code: string) => api<Codes>("/v1/me/2fa/totp/confirm", { method: "POST", body: { code } }),
  startEmail: () => api<Ok>("/v1/me/2fa/email/start", { method: "POST" }),
  confirmEmail: (code: string) => api<Codes>("/v1/me/2fa/email/confirm", { method: "POST", body: { code } }),
  sendCode: () => api<Ok>("/v1/me/2fa/send-code", { method: "POST" }),
  disable: (code: string) => api<Ok>("/v1/me/2fa/disable", { method: "POST", body: { code } }),
  newRecoveryCodes: (code: string) => api<Codes>("/v1/me/2fa/recovery", { method: "POST", body: { code } }),
};
