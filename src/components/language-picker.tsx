// Language switch: a compact dropdown in the footer, a row of choices in Settings. Saved on this
// device with the other preferences.
import { Check, ChevronDown, Languages } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { LANGS, setLang, translate, useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguagePicker({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const t = useT();
  const pick = (l: Lang) => { setLang(l); if (variant === "full") toast.success(`${LANGS.find((x) => x.id === l)!.native}`); };

  // Footer: a pill that opens a small themed menu (upward, since it sits at the bottom of the page).
  if (variant === "compact") {
    const current = LANGS.find((l) => l.id === t.lang)!;
    return <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${t("footer.language")}: ${current.native}`}
        className="group inline-flex h-9 items-center gap-2 rounded-full border-2 border-foreground bg-card pl-3 pr-2.5 text-sm font-bold shadow-hard-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-hard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:translate-y-0 data-[state=open]:shadow-none">
        <Languages className="size-4 text-primary" aria-hidden="true" />
        <span lang={current.htmlLang}>{current.native}</span>
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="min-w-48 rounded-xl border-2 border-foreground p-1.5 shadow-hard">
        <p className="px-2.5 pb-1.5 pt-1 text-xs font-bold text-muted-foreground">{t("footer.language")}</p>
        {/* Purple only follows the pointer or keyboard (one row at a time); the current language
            gets a soft tint and a tick, so two rows never look selected at once. */}
        <div className="grid gap-1">{LANGS.map((l) => {
          const on = l.id === t.lang;
          return <DropdownMenuItem key={l.id} onSelect={() => pick(l.id)} lang={l.htmlLang} aria-current={on || undefined}
            className={cn("group flex min-h-10 items-center gap-3 rounded-lg px-2.5 font-semibold", on && "bg-primary/10 text-primary")}>
            <span className="flex-1">{l.native}</span>
            {l.native !== l.label && <span className="text-xs font-normal text-muted-foreground group-focus:text-primary-foreground/85">{l.label}</span>}
            <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden="true" />
          </DropdownMenuItem>;
        })}</div>
      </DropdownMenuContent>
    </DropdownMenu>;
  }

  return <div role="radiogroup" aria-label={translate(t.lang, "sassy", "footer.language")} className="flex flex-wrap gap-2">
    {LANGS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={t.lang === l.id} lang={l.htmlLang} onClick={() => pick(l.id)}
      className={cn("min-h-10 rounded-full border-2 border-foreground px-4 text-sm font-bold transition-colors", t.lang === l.id ? "bg-foreground text-background" : "bg-card hover:bg-muted")}>
      {l.native}{l.native !== l.label && <span className="ml-1.5 font-normal opacity-70">{l.label}</span>}
    </button>)}
  </div>;
}
