// Phone notifications (Web Push): Android (Chrome, installed or not), iPhone and iPad once Ghosted is
// on the Home Screen (iOS 16.4+), and desktop browsers. Every in-app notification also goes to the
// member's devices that turned notifications on (push_subscriptions). Best effort: a failed push
// never affects the in-app notification, and devices the push service says are gone are removed.
// Off until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set (see env.example).
import webpush from "web-push";
import { env } from "./env.js";
import { admin } from "./supabase.js";

let configured: boolean | null = null;
export function pushEnabled() {
  if (configured !== null) return configured;
  const e = env();
  configured = !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
  if (configured) webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  return configured;
}
export const pushPublicKey = () => (pushEnabled() ? env().VAPID_PUBLIC_KEY! : null);

export type NotificationKind = "relatable" | "reply" | "company" | "system" | "following" | "follower" | "goofy";
// "reminder" is push-only (Waiting Room follow-ups, nudges.ts); it has no in-app notification row.
type PushKind = NotificationKind | "reminder" | "streak";
const TITLE: Record<PushKind, string> = {
  relatable: "Your story is helping someone", reply: "New reply", company: "Company update", system: "Ghosted",
  following: "New story from someone you follow", follower: "New follower", goofy: "Goofy", reminder: "Time for a polite follow-up", streak: "Your streak is waiting",
};

// Quiet hours: no phone buzzing between 9 PM and 8 AM India time. The in-app notification still
// lands; only the push is skipped. The daily job runs in the morning, so reminders are never lost.
export function quietHoursIST(now = new Date()) {
  const h = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return h >= 21 || h < 8;
}

// Where tapping the notification goes: the story, the company, the person, or the notifications.
export function pushUrl(n: { storyPublicId?: number | string | null; companySlug?: string | null; profilePublicId?: number | string | null }) {
  if (n.storyPublicId) return `/s/${n.storyPublicId}`;
  if (n.companySlug) return `/c/${n.companySlug}`;
  if (n.profilePublicId) return `/u/${n.profilePublicId}`;
  return "/dashboard";
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export async function sendPush(userId: string, msg: { kind: PushKind; body: string; url: string; tag?: string }) {
  if (!pushEnabled() || quietHoursIST()) return;
  try {
    const { data, error } = await admin().from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(10);
    if (error || !data?.length) return; // no devices (or the table isn't created yet)
    // `tag` groups notifications of the same kind, so a burst of reactions doesn't stack ten alerts.
    const payload = JSON.stringify({ title: TITLE[msg.kind], body: msg.body, url: msg.url, tag: msg.tag ?? `ghosted-${msg.kind}` });
    await Promise.all((data as Sub[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: msg.kind === "system" || msg.kind === "goofy" ? "high" : "normal" });
        await admin().from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Gone for good (uninstalled, permission revoked, expired): forget the device.
        if (status === 404 || status === 410) await admin().from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] send", status ?? "", (e as Error).message);
      }
    }));
  } catch (e) { console.error("[push]", (e as Error).message); }
}
