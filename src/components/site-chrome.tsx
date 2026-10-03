import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-picker";
import { entity } from "@/content/legal";
import { openCookieSettings } from "@/components/cookie-consent";

export function Brand() {
  return <Link to="/" className="flex items-center gap-1.5 font-display text-2xl font-bold tracking-tight" aria-label="Ghosted home"><img src="/ghosted-mark.png" alt="" className="size-10 object-contain" />Ghosted.</Link>;
}

// Section links use "/#id" so they also work from the legal pages.
export function SiteHeader() {
  return <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Brand /><nav className="hidden items-center gap-7 text-sm font-semibold md:flex"><a href="/#ghost-o-meter">Ghost-o-meter</a><a href="/#stories">Experiences</a><a href="/#how">How it works</a><a href="/#why">Why Ghosted</a></nav><div className="flex items-center gap-1.5 sm:gap-3"><ThemeToggle className="size-9 sm:size-10" /><Button variant="ghost" size="sm" className="px-2.5 sm:h-10 sm:px-4" asChild><Link to="/auth" search={{ tab: "login" }}>Log in</Link></Button><Button size="sm" className="px-3 sm:h-10 sm:px-4" asChild><Link to="/auth"><span className="sm:hidden">Join</span><span className="hidden sm:inline">Join anonymously</span></Link></Button></div></div></header>;
}

const footerLinks = [
  { to: "/about", label: "About" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms & Conditions" },
  { to: "/community", label: "Community Rules" },
  { to: "/feedback", label: "Feedback & Support" },
] as const;

export function SiteFooter() {
  return <footer className="border-t-2 border-foreground">
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
      <div><Brand /><p className="mt-2 text-muted-foreground">The truth about hiring, from people who lived it.</p><p className="mt-1 text-xs text-muted-foreground">© {new Date().getFullYear()} Ghosted. Stories are the personal opinions of their authors, not statements of fact by Ghosted.</p></div>
      <nav aria-label="Legal and company" className="flex flex-wrap gap-x-6 gap-y-2 font-semibold">{footerLinks.map((l) => <Link key={l.to} to={l.to} className="underline-offset-4 hover:text-primary hover:underline" activeProps={{ className: "text-primary" }}>{l.label}</Link>)}<a href={entity.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-primary hover:underline"><Github className="size-4" />Open source</a><button type="button" onClick={openCookieSettings} className="underline-offset-4 hover:text-primary hover:underline">Cookie settings</button></nav>
    </div>
  </footer>;
}
