// Invites, missions and flair on the site (backend/src/referral.ts has the rules).
//   - An invite link is /invite?ref=CODE. Opening it remembers the code in this browser, and sign-up
//     sends it along, so the inviter gets credit once the new member shares a story.
//   - Flair is a coloured ring around a member's avatar, unlocked by voices and missions.
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/meta";

export type FlairId = "violet" | "sunrise" | "mint" | "gold" | "cosmic";
export type Mission = { id: string; label: string; hint: string; done: number; goal: number };
export type Invite = {
  code: string | null; joined: number; voices: number; stories: number; relatable: number; invitedBy: boolean;
  missions: Mission[]; completed: number; flair: FlairId | null;
  flairs: { id: FlairId; label: string; how: string; unlocked: boolean }[];
};

export const FLAIR_GRADIENT: Record<FlairId, string> = {
  violet: "linear-gradient(135deg,#6D28D9,#A78BFA)",
  sunrise: "linear-gradient(135deg,#F97316,#F59E0B,#EC4899)",
  mint: "linear-gradient(135deg,#059669,#6EE7B7)",
  gold: "linear-gradient(135deg,#B45309,#FBBF24,#FDE68A,#B45309)",
  cosmic: "conic-gradient(from 0deg,#6D28D9,#06B6D4,#EC4899,#F59E0B,#6D28D9)",
};
export const VOICE_TIERS = [1, 3, 10] as const;

// The ring around an avatar. No flair: the avatar as it is.
export function FlairRing({ flair, children, className }: { flair: FlairId | null | undefined; children: ReactNode; className?: string }) {
  if (!flair) return <>{children}</>;
  return <span className={cn("inline-flex shrink-0 rounded-full p-[3px]", className)} style={{ background: FLAIR_GRADIENT[flair] }} title={`${flair[0]!.toUpperCase()}${flair.slice(1)} flair`}>{children}</span>;
}

export function useInvite(enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invite"], queryFn: () => api<Invite>("/v1/me/invite"), enabled: apiEnabled && enabled, staleTime: 30_000, retry: false });
  const setFlair = async (flair: FlairId | null) => {
    await api("/v1/me/flair", { method: "PATCH", body: { flair } });
    qc.setQueryData<Invite>(["invite"], (d) => (d ? { ...d, flair } : d));
    for (const k of [["feed"], ["person"], ["story"], ["me"]]) void qc.invalidateQueries({ queryKey: k });
  };
  return { data: q.data ?? null, loading: q.isPending && apiEnabled, setFlair };
}

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
