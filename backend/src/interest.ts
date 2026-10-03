// "I want to know about this company": members waiting for a company's first story. When a story
// about it is published, each waiting member gets one notification and one email, then is marked
// notified. Called right after publishing, and by the automation sweep for every other way a story
// goes live (Goofy releasing a held story, an admin approving one).
import { env } from "./env.js";
import { bump } from "./live.js";
import { sendMail } from "./mail/mailer.js";
import { button, escape, layout } from "./mail/otp-email.js";
import { admin } from "./supabase.js";

type Waiting = { user_id: string; profile: { handle: string; tone: "sassy" | "calm"; email_theme: "light" | "dark" | null } | null };

export async function waitingCount(companyId: string) {
  const { count } = await admin().from("company_interest").select("user_id", { count: "exact", head: true }).eq("company_id", companyId).is("notified_at", null);
  return count ?? 0;
}

function storyLandedEmail({ appUrl, handle, company, slug, storyId, tone }: { appUrl: string; handle: string; company: string; slug: string; storyId: string; tone: "sassy" | "calm" }) {
  const subject = `The first story about ${company} is on Ghosted`;
  const html = layout({
    appUrl, subject, banner: "You asked, it's here",
    heading: tone === "sassy" ? `${escape(handle)}, the wait is over.` : `Hi ${escape(handle)}, a story about ${escape(company)} is up.`,
    ...(tone === "sassy" && { tagline: "Unlike some recruiters, we actually got back to you." }),
    intro: `You asked to know about <strong>${escape(company)}</strong>. Someone just shared how their hiring process went.`,
    preheader: `Someone shared how hiring at ${company} went.`,
    body: button(`${appUrl}/s/${storyId}`, "Read the story") + `<tr><td align="center" style="padding:0 28px 24px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;"><a href="${appUrl}/c/${slug}" style="color:#6D28D9;">See everything about ${escape(company)}</a></td></tr>`,
    footnote: "You got this because you tapped “I want to know about this company”. We send it once.",
  });
  const text = `You asked to know about ${company}. Someone just shared how their hiring process went.\n\nRead it: ${appUrl}/s/${storyId}\nAll about ${company}: ${appUrl}/c/${slug}`;
  return { subject, html, text };
}

// Tell everyone waiting on this company, if it now has a published story. Best effort, never throws.
export async function notifyWaiting(companyId: string) {
  try {
    const [{ data: story }, { data: co }] = await Promise.all([
      admin().from("stories").select("public_id").eq("company_id", companyId).eq("status", "published").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin().from("companies").select("name, slug").eq("id", companyId).single(),
    ]);
    if (!story || !co) return 0;
    const { data } = await admin().from("company_interest").select("user_id, profile:profiles(handle, tone, email_theme)").eq("company_id", companyId).is("notified_at", null).limit(2000);
    const rows = (data ?? []) as unknown as Waiting[];
    if (!rows.length) return 0;
    const { name, slug } = co as { name: string; slug: string };
    const storyId = String((story as { public_id: number }).public_id);
    // Marked first, so two runs at once can't double-send.
    await admin().from("company_interest").update({ notified_at: new Date().toISOString() }).eq("company_id", companyId).in("user_id", rows.map((r) => r.user_id)).is("notified_at", null);
    for (const r of rows) {
      await admin().from("notifications").insert({ user_id: r.user_id, kind: "company", body: `The first story about ${name} is here. You asked to know.`, story_public_id: storyId, company_slug: slug });
      await bump({ user: r.user_id, topics: ["notifications"] });
      const { data: u } = await admin().auth.admin.getUserById(r.user_id);
      if (u.user?.email) {
        try { await sendMail(u.user.email, storyLandedEmail({ appUrl: env().FRONTEND_URL, handle: r.profile?.handle ?? "there", company: name, slug, storyId, tone: r.profile?.tone ?? "sassy" }), { theme: r.profile?.email_theme ?? "light" }); }
        catch (e) { console.error("[interest] email", (e as Error).message); }
      }
    }
    await bump({ shared: [`company:${slug}`] });
    return rows.length;
  } catch (e) { console.error("[interest] notify", (e as Error).message); return 0; }
}

// The automation sweep: every company with waiting members and a published story.
export async function sweepWaiting() {
  const { data } = await admin().from("company_interest").select("company_id").is("notified_at", null).limit(5000);
  const ids = [...new Set(((data ?? []) as { company_id: string }[]).map((r) => r.company_id))];
  let sent = 0;
  for (const id of ids) sent += await notifyWaiting(id);
  return sent;
}
