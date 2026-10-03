// Link previews for shared pages: title, description and the generic brand image. Never a story's
// text or anything that could identify the author. Crawlers need absolute image URLs.
export const SITE_URL = ((import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "https://ghosted-platform.vibgyor.co.in").replace(/\/$/, "");

export function pageMeta({ title, description, type = "website", noindex = false }: { title: string; description: string; type?: "website" | "article"; noindex?: boolean }) {
  return [
    { title },
    { name: "description", content: description },
    ...(noindex ? [{ name: "robots", content: "noindex, follow" }] : []),
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:site_name", content: "Ghosted" },
    { property: "og:image", content: `${SITE_URL}/icon-512.png` },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}
