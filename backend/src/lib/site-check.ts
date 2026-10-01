// Checks a company website before it can be listed, and reads its name, description and icon.
//
// The server fetches a URL a user typed, so it's locked down against SSRF (tricking the server into
// calling internal services): HTTPS on port 443 only; every DNS answer is checked at connection time
// (so a domain can't point at 127.0.0.1, 10.x, 169.254.169.254 cloud metadata, etc., even after a
// DNS change); at most 3 redirects, each re-checked; 300 KB and 6 s per request; no cookies sent.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { env } from "../env.js";

const MAX_BYTES = 300_000;
const TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;

export class SiteCheckError extends Error {}

// Private, loopback, link-local, CGNAT, multicast and reserved ranges (IPv4 and IPv6).
function isPrivate(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

// DNS lookup that refuses to connect anywhere private.
function safeLookup(hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivate(a.address))) return cb(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "");
    const wantsAll = (options as { all?: boolean }).all;
    if (wantsAll) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}

type Fetched = { url: URL; status: number; type: string; body: Buffer };

const DEFAULT_UA = "GhostedBot/1.0 (+company listing check)";

function fetchOnce(url: URL, accept: string, maxBytes = MAX_BYTES, ua = DEFAULT_UA): Promise<Fetched & { location?: string }> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || isIP(url.hostname)) return reject(new SiteCheckError("Use the company's https:// website address."));
    const req = request(url, {
      method: "GET", lookup: safeLookup as never, timeout: TIMEOUT_MS,
      headers: { "user-agent": ua, accept, "accept-language": "en-IN,en;q=0.8" },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; if (size > maxBytes) { res.destroy(); resolve({ url, status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }); return; } chunks.push(c); });
      res.on("end", () => resolve({ url, status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks), ...(res.headers.location && { location: res.headers.location }) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new SiteCheckError("The website took too long to answer.")));
    req.on("error", (e: NodeJS.ErrnoException) => reject(e instanceof SiteCheckError ? e : new SiteCheckError(e.code === "EBLOCKED" ? "That address isn't allowed." : e.code === "ENOTFOUND" ? "That website doesn't exist (the domain has no address)." : "We couldn't reach that website.")));
    req.end();
  });
}

async function safeFetch(start: URL, accept = "text/html,application/xhtml+xml", maxBytes = MAX_BYTES, ua = DEFAULT_UA): Promise<Fetched> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const r = await fetchOnce(url, accept, maxBytes, ua);
    if (r.status >= 300 && r.status < 400 && r.location) { url = new URL(r.location, url); continue; }
    return r;
  }
  throw new SiteCheckError("The website redirects too many times.");
}

// JSON from a fixed, trusted public API (Wikidata, Wikipedia), through the same locked-down fetcher.
// Wikimedia asks automated clients to identify themselves with a way to reach the operator, so the
// user agent carries the site's address and contact email (otherwise requests get rate-limited).
export async function fetchJson<T>(url: string, maxBytes = 2_000_000): Promise<T | null> {
  try {
    const e = env();
    const ua = `GhostedBot/1.0 (${e.FRONTEND_URL}; ${e.MAIL_FROM_EMAIL}) company-listing-autofill`;
    const r = await safeFetch(new URL(url), "application/json", maxBytes, ua);
    if (r.status !== 200) { if (r.status === 429) console.warn("[facts] rate limited by", new URL(url).hostname); return null; }
    return JSON.parse(r.body.toString("utf8")) as T;
  } catch { return null; }
}

// A company's logo, fetched for our own server to pass on (see GET /v1/companies/:slug/logo).
export async function fetchImage(url: string) {
  try {
    const r = await safeFetch(new URL(url), "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8");
    return r.status === 200 && /^image\//i.test(r.type) && r.body.length > 50 ? { type: r.type.split(";")[0]!.trim(), body: r.body } : null;
  } catch { return null; }
}

// ---------- normalising ----------

// Two-part public suffixes common in India and elsewhere, so "tcs.co.in" stays whole.
const SECOND_LEVEL = /\.(co|com|net|org|gov|ac|edu|res|gen|firm|ind)\.[a-z]{2}$/;
export function registrableDomain(hostname: string) {
  const h = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const parts = h.split(".");
  return parts.slice(SECOND_LEVEL.test(h) ? -3 : -2).join(".");
}

// Accepts "acme.com", "www.acme.com/careers", "https://acme.com"; returns the https homepage URL.
export function normaliseWebsite(input: string) {
  const raw = input.trim().replace(/\s+/g, "");
  if (!raw || raw.length > 200) throw new SiteCheckError("Enter the company's website.");
  let url: URL;
  try { url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new SiteCheckError("That doesn't look like a website address."); }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw new SiteCheckError("Use the company's https:// website address.");
  if (url.username || url.password) throw new SiteCheckError("That doesn't look like a website address.");
  const host = url.hostname.toLowerCase();
  if (isIP(host) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || !/\.[a-z]{2,}$/.test(host)) throw new SiteCheckError("Use the company's own domain, like acme.com.");
  return { homepage: new URL(`https://${host}/`), domain: registrableDomain(host) };
}

// Domains that are never one company's own site: shared hosting, free-site subdomains, link
// shorteners and placeholders. Blocked whatever the address.
const SHARED_HOSTING = new Set([
  "github.io", "gitlab.io", "notion.site", "linktr.ee", "bio.link", "beacons.ai",
  "blogspot.com", "wixsite.com", "webflow.io", "framer.website", "godaddysites.com", "business.site",
  "vercel.app", "netlify.app", "herokuapp.com", "pages.dev", "web.app", "firebaseapp.com", "glitch.me", "repl.co", "onrender.com",
  "bit.ly", "tinyurl.com", "goo.gl", "rb.gy", "cutt.ly", "shorturl.at",
  "example.com", "example.org", "example.net", "localhost",
]);
// Platforms (social networks, job boards, site builders) are real companies in their own right:
// LinkedIn, Indeed or Naukri can be listed and reviewed as employers from their own homepage. What
// isn't allowed is using them as someone else's website: a subdomain (acme.wordpress.com,
// sites.google.com) or a company site that just forwards to a profile on one of them.
const PLATFORMS = new Set([
  "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "threads.net", "t.me", "wa.me", "whatsapp.com",
  "github.com", "medium.com", "substack.com", "notion.so", "wordpress.com", "wix.com", "weebly.com", "squarespace.com", "carrd.co", "framer.ai", "google.com",
  "naukri.com", "indeed.com", "glassdoor.com", "glassdoor.co.in", "ambitionbox.com", "monster.com", "foundit.in", "internshala.com", "wellfound.com", "angel.co", "instahyre.com", "iimjobs.com", "hirist.tech", "cutshort.io", "apna.co",
  "gmail.com", "yahoo.com", "outlook.com",
]);
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
// Can this host be listed as a company's website? The platform's own homepage yes, a page on it no.
export function isBlockedHost(host: string) {
  const h = bare(host), domain = registrableDomain(h);
  return SHARED_HOSTING.has(domain) || (PLATFORMS.has(domain) && h !== domain);
}
// Used where only a domain is known (a company already stored by domain).
export const isBlockedDomain = (domain: string) => SHARED_HOSTING.has(domain);
const isPlatform = (domain: string) => PLATFORMS.has(domain) || SHARED_HOSTING.has(domain);

// ---------- reading the homepage ----------

// HTML entities, decimal (&#39;) and hex (&#x27;), plus the common named ones. Sites often
// double-encode (&amp;#x27;), so decode until nothing changes (at most 3 passes). Stray tags and
// control characters inside JSON-LD text are dropped too, so auto-filled fields read cleanly.
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·" };
const codePoint = (n: number) => (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "");
const decodeOnce = (s: string) => s
  .replace(/&#x([0-9a-f]{1,6});?/gi, (_, h) => codePoint(parseInt(h, 16)))
  .replace(/&#(\d{1,7});?/g, (_, n) => codePoint(Number(n)))
  .replace(/&([a-z]{2,8});/gi, (m, k: string) => NAMED[k.toLowerCase()] ?? m);
const decode = (s: string) => {
  let out = s;
  for (let i = 0; i < 3; i++) { const next = decodeOnce(out); if (next === out) break; out = next; }
  return out.replace(/<[^>]{0,200}>/g, " ").replace(/[\u0000-\u001f\u007f​-‍﻿]/g, " ").replace(/\s+/g, " ").trim();
};
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined);
const meta = (html: string, key: string) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (k === key) { const v = attr(tag, "content"); if (v) return decode(v); }
  }
  return null;
};

async function isImage(url: URL) {
  try {
    const r = await safeFetch(url, "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8");
    return r.status === 200 && /^image\//i.test(r.type) && r.body.length > 50;
  } catch { return false; }
}

// Picks the best icon the site declares (largest apple-touch/icon), else /favicon.ico, and checks
// it really is an image. Returns an https URL on the company's site, or null.
async function findIcon(html: string, base: URL) {
  const links = (html.match(/<link\b[^>]*>/gi) ?? []).map((tag) => ({ rel: (attr(tag, "rel") ?? "").toLowerCase(), href: attr(tag, "href"), sizes: attr(tag, "sizes") ?? "" }))
    .filter((l) => l.href && /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(l.rel));
  const size = (s: string) => Math.max(0, ...s.split(/\s+/).map((x) => Number(x.split("x")[0]) || 0));
  links.sort((a, b) => (b.rel.includes("apple") ? 1 : 0) - (a.rel.includes("apple") ? 1 : 0) || size(b.sizes) - size(a.sizes));
  const candidates = [...links.map((l) => { try { return new URL(decode(l.href!), base); } catch { return null; } }), new URL("/favicon.ico", base)]
    .filter((u): u is URL => !!u && u.protocol === "https:");
  for (const u of candidates.slice(0, 4)) if (await isImage(u)) return u.toString();
  // Last resort (sites that block bots): DuckDuckGo's public icon service, which only gets the domain.
  const ddg = new URL(`https://icons.duckduckgo.com/ip3/${registrableDomain(base.hostname)}.ico`);
  return (await isImage(ddg)) ? ddg.toString() : null;
}

// Company facts a site describes about itself in schema.org JSON-LD (Organization/Corporation…).
export type SiteOrg = { name: string | null; description: string | null; founded: number | null; city: string | null; employees: number | null };

function readOrg(html: string): SiteOrg | null {
  const orgTypes = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|NGO|EducationalOrganization|FinancialService|ProfessionalService)$/i;
  const found: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (types.some((t) => orgTypes.test(t))) found.push(o);
    if (o["@graph"]) walk(o["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]!.trim())); } catch { /* malformed block: skip */ }
  }
  const o = found[0];
  if (!o) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? decode(v).slice(0, 800) : null);
  const address = ([] as unknown[]).concat(o["address"] ?? [])[0] as Record<string, unknown> | undefined;
  const emp = o["numberOfEmployees"] as unknown;
  const empN = typeof emp === "number" ? emp : typeof emp === "string" ? Number(emp.replace(/[^\d]/g, "")) : emp && typeof emp === "object" ? Number((emp as Record<string, unknown>)["value"] ?? (emp as Record<string, unknown>)["maxValue"] ?? NaN) : NaN;
  const year = Number(String(o["foundingDate"] ?? "").slice(0, 4));
  return {
    name: str(o["legalName"]) ?? str(o["name"]),
    description: str(o["description"]),
    founded: year >= 1800 && year <= new Date().getFullYear() ? year : null,
    city: address ? str(address["addressLocality"]) : null,
    employees: Number.isFinite(empN) && empN > 0 ? empN : null,
  };
}

// A careers/jobs link on the company's own site, from the homepage's links.
function findCareers(html: string, base: URL, domain: string) {
  for (const tag of html.match(/<a\b[^>]*href\s*=[^>]*>/gi) ?? []) {
    const href = attr(tag, "href");
    if (!href || !/(careers?|jobs|join-?us|work-?with-?us|life-at)/i.test(href)) continue;
    try {
      const u = new URL(decode(href), base);
      if (u.protocol === "https:" && registrableDomain(u.hostname) === domain) return `${u.origin}${u.pathname}`.replace(/\/$/, "");
    } catch { /* not a URL */ }
  }
  return null;
}

export type SiteInfo = { homepage: string; domain: string; title: string | null; siteName: string | null; description: string | null; iconUrl: string | null; org: SiteOrg | null; careersUrl: string | null; readable: boolean };

export async function inspectWebsite(input: string): Promise<SiteInfo> {
  const { homepage, domain } = normaliseWebsite(input);
  if (isBlockedHost(homepage.hostname)) throw new SiteCheckError("That's a page on a shared platform, not a company's own website. Use the company's own domain.");
  const r = await safeFetch(homepage);
  // Many real company sites block automated visitors (401/403/429/503 from bot protection). They
  // still answered over valid HTTPS, so the site exists; we just can't read its details.
  const botWall = [401, 403, 429, 503].includes(r.status);
  if (r.status >= 400 && !botWall) throw new SiteCheckError(`The website answered with an error (${r.status}). Check the address.`);
  const finalDomain = registrableDomain(r.url.hostname);
  if (finalDomain !== domain && isPlatform(finalDomain)) throw new SiteCheckError("That website just forwards to a social profile or site builder. Use the company's own domain.");
  const html = !botWall && /html|xml/i.test(r.type) ? r.body.toString("utf8") : "";
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    homepage: `https://${r.url.hostname}/`,
    domain,
    title: title ? decode(title).slice(0, 120) : null,
    siteName: meta(html, "og:site_name")?.slice(0, 80) ?? meta(html, "application-name")?.slice(0, 80) ?? null,
    description: (meta(html, "og:description") ?? meta(html, "description"))?.slice(0, 400) ?? null,
    iconUrl: await findIcon(html, r.url),
    org: html ? readOrg(html) : null,
    careersUrl: html ? findCareers(html, r.url, domain) : null,
    // False when the site blocked us (bot protection): nothing could be read from the page itself.
    readable: !!html,
  };
}

// Does the name plausibly belong to this website? True when a meaningful word of the name appears
// in the domain, the page title or the site name ("Tata Consultancy Services" ~ tcs? handled by
// initials too). Stops "Google" being listed with some random blog's address.
export function nameMatchesSite(name: string, site: SiteInfo) {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ");
  const stop = new Set(["the", "and", "of", "pvt", "private", "ltd", "limited", "inc", "llp", "llc", "co", "company", "corp", "corporation", "technologies", "technology", "tech", "solutions", "services", "labs", "group", "india", "global", "software", "systems"]);
  const words = norm(name).split(/\s+/).filter((w) => w.length >= 3 && !stop.has(w));
  const initials = norm(name).split(/\s+/).filter((w) => w && !["the", "and", "of"].includes(w)).map((w) => w[0]).join("");
  const domainLabel = site.domain.split(".")[0]!;
  const hay = `${domainLabel} ${norm(site.title ?? "")} ${norm(site.siteName ?? "")}`.replace(/\s+/g, " ");
  const squashed = hay.replace(/ /g, "");
  if (!words.length) return squashed.includes(norm(name).replace(/ /g, ""));
  return words.some((w) => hay.includes(w) || squashed.includes(w)) || (initials.length >= 2 && domainLabel === initials) || domainLabel.includes(norm(name).replace(/ /g, ""));
}
