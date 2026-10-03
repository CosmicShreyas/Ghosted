// Search and link-preview tags for public pages: one title and description per page, a canonical
// URL, Open Graph and Twitter tags with the generic brand image, and JSON-LD structured data.
// Never a story's text or anything that could identify an author. Crawlers need absolute URLs.
// (No keyword stuffing: search engines ignore the keywords tag and penalise repeated terms.)
export const SITE_URL = ((import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "https://ghosted-platform.vibgyor.co.in").replace(/\/$/, "");
export const SITE_NAME = "Ghosted";
const IMAGE = `${SITE_URL}/icon-512.png`;

type Head = { title: string; description: string; path?: string; type?: "website" | "article"; noindex?: boolean; jsonLd?: object[] };

export function pageMeta({ title, description, type = "website", noindex = false, path }: Head) {
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_IN" },
    ...(path ? [{ property: "og:url", content: `${SITE_URL}${path}` }] : []),
    { property: "og:image", content: IMAGE },
    { property: "og:image:alt", content: "Ghosted logo" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: IMAGE },
  ];
}

// Full head for a route: meta, the canonical link (indexable pages only) and structured data.
export function pageHead(h: Head) {
  return {
    meta: pageMeta(h),
    links: h.path && !h.noindex ? [{ rel: "canonical", href: `${SITE_URL}${h.path}` }] : [],
    scripts: (h.jsonLd ?? []).map((d) => ({ type: "application/ld+json", children: JSON.stringify(d) })),
  };
}

// ---------- structured data ----------

export const organizationLd = {
  "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME, url: SITE_URL, logo: IMAGE,
  description: "Anonymous hiring experiences from real candidates in India, searchable by company.",
  areaServed: "IN", sameAs: ["https://github.com/CosmicShreyas/Ghosted"],
};
export const websiteLd = {
  "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`,
  name: SITE_NAME, url: SITE_URL, inLanguage: "en-IN", publisher: { "@id": `${SITE_URL}/#organization` },
  description: "Know what happened before you apply. Real candidate experiences: interview rounds, waiting time, communication, rejections, offers and ghosting.",
};
export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
});
