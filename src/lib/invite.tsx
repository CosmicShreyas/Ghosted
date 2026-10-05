// Invite links on the site (backend/src/referral.ts has the rules; rewards are XP, see levels.tsx).
//   - An invite link is /invite?ref=CODE. Opening it remembers the code in this browser, and sign-up
//     sends it along, so the inviter earns XP when the new member joins and more when they share.
import { SITE_URL } from "@/lib/meta";

export const inviteLink = (code: string) => `${SITE_URL}/invite?ref=${code}`;

// The code from an invite link, remembered in this browser until sign-up uses it (30 days).
const REF_KEY = "ghosted.ref";
export const rememberRef = (code: string) => { try { localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage blocked */ } };
export const pendingRef = (): string | null => {
  try {
    const r = JSON.parse(localStorage.getItem(REF_KEY) ?? "null") as { code: string; at: number } | null;
    return r && /^[A-Z2-9]{8}$/.test(r.code) && Date.now() - r.at < 30 * 86400_000 ? r.code : null;
  } catch { return null; }
};
export const clearRef = () => { try { localStorage.removeItem(REF_KEY); } catch { /* storage blocked */ } };
