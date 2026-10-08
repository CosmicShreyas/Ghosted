// IndexNow: tells Bing, Yandex, Seznam, Naver and the engines built on them (DuckDuckGo, Yahoo,
// Ecosia) which company pages changed, so they recrawl within hours instead of waiting. Google
// doesn't take IndexNow; it finds the same changes through the sitemap's <lastmod> dates.
//
// The key is public by design: engines confirm the site is ours by fetching
// https://<site>/<key>.txt, which is served from public/ in the main app.
import { env } from "./env.js";
import { admin } from "./supabase.js";

export const INDEXNOW_KEY = "a7b5c03070cab23a20178787a1489f33";

// Company pages that gained a story in the last `hours`, plus the directory that lists them.
// Runs from the daily automation job, so every way a story goes live (new post, moderation
// approval, AutoMod release, an admin restore) is covered in one place.
export async function pingChangedCompanies(hours = 26) {
  const site = env().FRONTEND_URL;
  const host = new URL(site).host;
  // Only the real site: never announce localhost or preview deployments.
  if (!site.startsWith("https://") || /localhost|\.vercel\.app$/.test(host)) return { skipped: "not the production site" };
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await admin().from("company_scores").select("slug").gt("story_count", 0).gte("last_story_at", since).limit(9000);
  if (error) throw new Error(`indexnow companies: ${error.message}`);
  const slugs = ((data ?? []) as { slug: string }[]).map((r) => r.slug);
  if (!slugs.length) return { sent: 0 };
  const urlList = [`${site}/companies`, ...slugs.map((s) => `${site}/c/${s}`)];
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${site}/${INDEXNOW_KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(15_000),
  });
  // 200 and 202 both mean accepted.
  if (res.status !== 200 && res.status !== 202) throw new Error(`indexnow responded ${res.status}`);
  return { sent: urlList.length };
}
