// Theme controls. `ThemePicker`: three preview cards for Settings (each drawn in its own theme's
// colours, so you see the result before choosing). `ThemeToggle`: a compact sun/moon button for the
// landing, log-in and sign-up pages.
import { motion } from "motion/react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { usePrefs, type Theme } from "@/lib/prefs";
import { setTheme, useResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// A tiny Ghosted screen in fixed colours: sidebar, a story card with a flag pill and a violet button.
function Mini({ dark }: { dark: boolean }) {
  const c = dark
    ? { bg: "#16111d", card: "#211a2b", ink: "#f2e9d8", muted: "#2c2338", violet: "#9f7aea", yellow: "#f4c44e", red: "#f25c5c", shadow: "#7c4dde" }
    : { bg: "#faf6ef", card: "#ffffff", ink: "#1c1714", muted: "#efe9df", violet: "#6d28d9", yellow: "#f0dc7a", red: "#e5484d", shadow: "#1c1714" };
  return <div className="flex h-full w-full gap-1.5 p-2" style={{ background: c.bg }}>
    <div className="w-5 shrink-0 space-y-1 rounded" style={{ background: c.card, border: `1.5px solid ${c.ink}` }}>
      <div className="mx-auto mt-1 size-2.5 rounded-sm" style={{ background: c.violet }} />
      <div className="mx-auto h-0.5 w-2.5 rounded" style={{ background: c.muted }} />
      <div className="mx-auto h-0.5 w-2.5 rounded" style={{ background: c.muted }} />
    </div>
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="rounded p-1.5" style={{ background: c.card, border: `1.5px solid ${c.ink}`, boxShadow: `2px 2px 0 ${c.shadow}` }}>
        <div className="flex items-center gap-1"><div className="size-2.5 rounded-full" style={{ background: c.yellow, border: `1px solid ${c.ink}` }} /><div className="h-1 w-8 rounded" style={{ background: c.ink }} /></div>
        <div className="mt-1.5 h-1 w-full rounded" style={{ background: c.muted }} />
        <div className="mt-1 h-1 w-3/4 rounded" style={{ background: c.muted }} />
        <div className="mt-1.5 flex gap-1"><div className="h-1.5 w-5 rounded-full" style={{ border: `1px solid ${c.red}` }} /><div className="h-1.5 w-5 rounded-full" style={{ background: c.violet }} /></div>
      </div>
      <div className="h-2.5 w-10 rounded" style={{ background: c.violet, boxShadow: `1.5px 1.5px 0 ${c.shadow}` }} />
    </div>
  </div>;
}

const OPTIONS: { id: Theme; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", hint: "Cream and ink", icon: Sun },
  { id: "dark", label: "After hours", hint: "Dark, violet glow", icon: Moon },
  { id: "system", label: "Match device", hint: "Follows your system", icon: Monitor },
];

export function ThemePicker() {
  const { theme } = usePrefs();
  return <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
    {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
      const on = theme === id;
      return <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setTheme(id)}
        className={cn("group relative overflow-hidden rounded-xl border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card", on ? "border-primary shadow-hard-sm" : "border-foreground hover:-translate-y-0.5")}>
        {/* The preview: "Match device" shows both halves. */}
        <div className="relative h-24 border-b-2 border-foreground">
          {id === "system"
            ? <div className="flex h-full"><div className="w-1/2 overflow-hidden"><div className="w-[200%]"><Mini dark={false} /></div></div><div className="w-1/2 overflow-hidden"><div className="-ml-[100%] w-[200%]"><Mini dark /></div></div></div>
            : <Mini dark={id === "dark"} />}
        </div>
        <div className="flex items-center gap-2 bg-card p-3">
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
          {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3} /></motion.span>}
        </div>
      </button>;
    })}
  </div>;
}

// Sun/moon switch for public pages: flips between light and dark (an explicit choice).
export function ThemeToggle({ className }: { className?: string }) {
  const resolved = useResolvedTheme();
  const dark = resolved === "dark";
  return <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}
    className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-foreground bg-card shadow-hard-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-none", className)}>
    <motion.span key={resolved} initial={{ y: 14, rotate: -40, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 22 }} className="grid place-items-center">
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </motion.span>
  </button>;
}
