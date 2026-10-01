import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BriefcaseBusiness, Clock, EyeOff, Linkedin, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "@/components/ghosted";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getUser, revealDemo } from "@/mock/data";

type Field = (typeof revealDemo.fields)[number]["key"];
const icons: Record<Field, typeof UserRound> = { name: UserRound, role: BriefcaseBusiness, experience: Clock, city: MapPin, linkedin: Linkedin };

// Interactive demo, same rules as Settings → Go public: one switch per detail, and you're public only
// while at least one is on. Starts fully anonymous, like every new account.
export function PrivacyDemo() {
  const user = getUser("u1");
  const [shared, setShared] = useState<Set<Field>>(new Set());
  const toggleField = (key: Field) => setShared((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const revealed = shared.size > 0;
  const showName = shared.has("name");
  const details = revealDemo.fields.filter((f) => f.key !== "name" && shared.has(f.key));

  return <div className="min-w-0 rounded-xl border-2 border-background bg-card p-4 text-foreground shadow-hard sm:p-6">
    <p className="text-[11px] font-bold uppercase text-muted-foreground">How your posts appear to others</p>
    <div className="mt-3 flex items-center gap-3 rounded-lg border-2 border-foreground bg-background p-4">
      <Avatar {...user} />
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}><motion.p key={showName ? "real" : "anon"} initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.22 }} className="truncate font-bold">{showName ? revealDemo.name : user.handle}</motion.p></AnimatePresence>
        <AnimatePresence mode="wait" initial={false}><motion.p key={details.map((d) => d.key).join() || "none"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="truncate text-xs text-muted-foreground">{details.length ? details.map((d) => d.value).join(" · ") : "No personal details shown"}</motion.p></AnimatePresence>
      </div>
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-foreground px-2.5 py-1 text-[11px] font-bold transition-colors", revealed ? "bg-flag-amber" : "bg-flag-green text-primary-foreground")}>{revealed ? <><UserRound className="size-3" />Public</> : <><ShieldCheck className="size-3" />Anonymous</>}</span>
    </div>

    <div className="mt-5 flex items-center justify-between gap-3">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">Choose what to show</p>
      <p className="text-[11px] text-muted-foreground">{revealed ? `${shared.size} of ${revealDemo.fields.length} shown` : "All hidden"}</p>
    </div>
    {/* One switch per detail. Two columns from tablet width; a single list on phones. */}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">{revealDemo.fields.map((f) => {
      const Icon = icons[f.key];
      const on = shared.has(f.key);
      return <label key={f.key} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 transition-colors", on ? "border-primary bg-primary/10" : "border-foreground/20 bg-background hover:border-foreground/40")}>
        <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{f.label}</span>
        <Switch checked={on} onCheckedChange={() => toggleField(f.key)} aria-label={`Show ${f.label}`} />
      </label>;
    })}</div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-xs text-muted-foreground"><EyeOff className="size-3.5 shrink-0" />Everything off means fully anonymous. Nobody sees who you are, not even companies.</p>
      {revealed && <button type="button" onClick={() => setShared(new Set())} className="text-xs font-bold text-primary hover:underline">Hide everything</button>}
    </div>
  </div>;
}
