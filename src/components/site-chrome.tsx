import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Github, LayoutDashboard, PenLine } from "lucide-react";
import { openStoryComposer } from "@/lib/guest";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-picker";
import { entity } from "@/content/legal";
import { openCookieSettings } from "@/components/cookie-consent";
import { LanguagePicker } from "@/components/language-picker";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Brand() {
  return <Link to="/" className="flex items-center gap-1.5 font-display text-2xl font-bold tracking-tight" aria-label="Ghosted home"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" />Ghosted.</Link>;
}

// Section links use "/#id" so they also work from the legal pages.
export function SiteHeader() {
  const { signedIn: known } = useMe();
  // The server always renders the signed-out header; the first browser render must match it, so
  // "Go to dashboard" only appears after mount (it used to make React re-render the whole page).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && known;
  return <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Brand /><nav className="hidden items-center gap-7 text-sm font-semibold md:flex"><a href="/#how">How it works</a><a href="/#ghost-o-meter">Ghost-o-meter</a><a href="/#companies">Companies</a><a href="/#gauntlet">The gauntlet</a><a href="/#stories">Stories</a></nav><div className="flex items-center gap-1.5 sm:gap-3"><ThemeToggle className="size-9 sm:size-10" />{signedIn
    // Signed in (e.g. opening /invite or the policy pages from the dashboard): one way back in.
    ? <Button size="sm" className="px-3 sm:h-10 sm:px-4" asChild><Link to="/dashboard"><LayoutDashboard className="size-4" /><span className="sm:hidden">Dashboard</span><span className="hidden sm:inline">Go to dashboard</span></Link></Button>
    : <><Button variant="ghost" size="sm" className="px-2.5 sm:h-10 sm:px-4" asChild><Link to="/auth" search={{ tab: "login" }}>Log in</Link></Button>{/* Write first, join at the end: the story form opens straight away (lib/guest.ts). */}<Button size="sm" className="px-3 sm:h-10 sm:px-4" onClick={openStoryComposer}><PenLine className="size-4" /><span className="sm:hidden">Write</span><span className="hidden sm:inline">Write your story</span></Button></>}</div></div></header>;
}

// The footer's columns, each with a heading.
const footerColumns = [
  { title: "Ghosted", links: [{ to: "/about", label: "About" }, { to: "/feedback", label: "Feedback & Support" }, { to: "/for-hr", label: "For HR teams" }] },
  { title: "Policies", links: [{ to: "/privacy", label: "Privacy Policy" }, { to: "/terms", label: "Terms & Conditions" }, { to: "/community", label: "Community Rules" }] },
  { title: "Safety & trust", links: [{ to: "/moderation", label: "How moderation works" }, { to: "/takedown", label: "Takedown requests" }] },
] as const;

const linkCls = "w-fit underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring";
const headingCls = "mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground";

export function SiteFooter() {
  const t = useT();
  return <footer className="relative overflow-hidden border-t-2 border-foreground">
    {/* A big ghost drifting slowly behind everything, barely there. It holds still with reduced motion. */}
    <img src="/ghosted-mark.png" alt="" aria-hidden="true" className="footer-ghost pointer-events-none absolute -bottom-16 right-[-4rem] w-[22rem] select-none opacity-[0.05] sm:w-[28rem] dark:opacity-[0.07]" />
    {/* Brand on the left; then a column per category. Phones: brand, then two columns of links. */}
    <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm sm:px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
      <div className="min-w-0"><Brand /><p className="mt-2 text-muted-foreground">{t("footer.tagline")}</p><p className="mt-3 text-xs text-muted-foreground">© {new Date().getFullYear()} Ghosted. Stories are the personal opinions of their authors, not statements of fact by Ghosted.</p></div>
      <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
        {footerColumns.map((col) => <nav key={col.title} aria-label={col.title} className="min-w-0">
          <p className={headingCls}>{col.title}</p>
          <ul className="flex flex-col gap-2.5 font-semibold">{col.links.map((l) => <li key={l.to}><Link to={l.to} className={linkCls} activeProps={{ className: "text-primary" }}>{l.label}</Link></li>)}</ul>
        </nav>)}
        <div className="min-w-0">
          <p className={headingCls}>Preferences</p>
          <ul className="flex flex-col items-start gap-2.5 font-semibold">
            <li><a href={entity.github} target="_blank" rel="noopener noreferrer" className={cn(linkCls, "inline-flex items-center gap-1.5")}><Github className="size-4" />Open source</a></li>
            <li><button type="button" onClick={openCookieSettings} className={linkCls}>Cookie settings</button></li>
            <li><LanguagePicker /></li>
          </ul>
        </div>
      </div>
    </div>
  </footer>;
}
