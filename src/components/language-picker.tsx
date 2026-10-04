// Language switch: a compact dropdown in the footer, a row of choices in Settings. Saved on this
// device with the other preferences.
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { LANGS, setLang, translate, useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguagePicker({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const t = useT();
  const pick = (l: Lang) => { setLang(l); if (variant === "full") toast.success(`${LANGS.find((x) => x.id === l)!.native}`); };

  if (variant === "compact") return <label className="inline-flex items-center gap-2 font-semibold">
    <Languages className="size-4" aria-hidden="true" />
    <span className="sr-only">{t("footer.language")}</span>
    <select value={t.lang} onChange={(e) => pick(e.target.value as Lang)} className="h-9 rounded-full border-2 border-foreground bg-card px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {LANGS.map((l) => <option key={l.id} value={l.id} lang={l.htmlLang}>{l.native}</option>)}
    </select>
  </label>;

  return <div role="radiogroup" aria-label={translate(t.lang, "sassy", "footer.language")} className="flex flex-wrap gap-2">
    {LANGS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={t.lang === l.id} lang={l.htmlLang} onClick={() => pick(l.id)}
      className={cn("min-h-10 rounded-full border-2 border-foreground px-4 text-sm font-bold transition-colors", t.lang === l.id ? "bg-foreground text-background" : "bg-card hover:bg-muted")}>
      {l.native}{l.native !== l.label && <span className="ml-1.5 font-normal opacity-70">{l.label}</span>}
    </button>)}
  </div>;
}
