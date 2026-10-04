// Layout that holds still across languages: the English layout is the reference. A piece of text
// keeps at least the space its English version takes (both versions sit in the same grid cell, only
// the current one visible; the other is invisible and hidden from screen readers). So switching to a
// language with shorter text leaves every button and block exactly where it is in English.
import type { ReactNode } from "react";
import { landingCopy, type LandingCopy } from "@/content/landing-copy";
import { composerCopy, type ComposerCopy } from "@/content/composer-copy";
import { LANGS, translate, useT, type Key } from "@/lib/i18n";
import type { Lang } from "@/lib/prefs";
import { useTone } from "@/lib/session";
import { cn } from "@/lib/utils";

export function Fit({ en, text, lang, className }: { en: ReactNode; text: ReactNode; lang: Lang; className?: string }) {
  if (lang === "en") return <>{en}</>;
  const htmlLang = LANGS.find((l) => l.id === lang)?.htmlLang;
  return <span className={cn("inline-grid", className)}>
    <span aria-hidden="true" className="invisible col-start-1 row-start-1 select-none">{en}</span>
    <span lang={htmlLang} className="col-start-1 row-start-1">{text}</span>
  </span>;
}

// `f.t("hero.share")` for shared strings, `f.l((c) => c.cta.share)` for landing copy.
export function useFit() {
  const t = useT();
  const tone = useTone();
  const lang = t.lang;
  return {
    lang,
    t: (key: Key, className?: string) => <Fit lang={lang} en={translate("en", tone, key)} text={t(key)} {...(className && { className })} />,
    l: (pick: (c: LandingCopy) => string, className?: string) => <Fit lang={lang} en={pick(landingCopy("en"))} text={pick(landingCopy(lang))} {...(className && { className })} />,
    c: (pick: (c: ComposerCopy) => string, className?: string) => <Fit lang={lang} en={pick(composerCopy("en"))} text={pick(composerCopy(lang))} {...(className && { className })} />,
  };
}
