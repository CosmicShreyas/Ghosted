// Interface languages: English, Hindi, Kannada and Hinglish. A plain dictionary, no library.
//
// - `t("key")` returns the string in the chosen language, falling back to English for any key a
//   language doesn't have yet, so a half-translated language never shows blanks.
// - A string can have sassy and calm versions ({ sassy, calm }), like everywhere else on Ghosted;
//   `t` picks the one matching the tone setting.
// - `{name}` placeholders are filled from the second argument.
// - Stories, chitchats and company names are never translated: they're shown as people wrote them.
//
// Every non-English string here is a machine translation until a native speaker checks it. The list
// to verify is in src/content/i18n-review.md; tick keys off there as they're confirmed.
import { useEffect } from "react";
import { setPrefs, usePrefs, type Lang } from "@/lib/prefs";
import { useTone, type Tone } from "@/lib/session";

export type { Lang };
export const LANGS: { id: Lang; label: string; native: string; htmlLang: string }[] = [
  { id: "en", label: "English", native: "English", htmlLang: "en-IN" },
  { id: "hi", label: "Hindi", native: "हिन्दी", htmlLang: "hi-IN" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ", htmlLang: "kn-IN" },
  { id: "hinglish", label: "Hinglish", native: "Hinglish", htmlLang: "hi-Latn-IN" },
];

type Entry = string | { sassy: string; calm: string };

const en = {
  "hero.badge": "Real hiring experiences, by company",
  "hero.title": "Know what happened",
  "hero.lede": "Real candidate experiences, anonymous by default and searchable by company: the rounds, the waiting, the replies (or not), the offers and the ghosting.",
  "hero.share": "Share my experience",
  "hero.waiting": "Waiting on a reply?",
  "hero.trust": "No name. No company email. About 30 seconds to share.",
  "search.label": "Search a company",
  "search.placeholder": "Search a company, e.g. Accenture",
  "search.button": "Search",
  "search.try": "Try:",
  "footer.tagline": { sassy: "The truth about hiring, from people who lived it.", calm: "Honest hiring experiences, shared by candidates." },
  "footer.language": "Language",
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;

const hi: Partial<Record<Key, Entry>> = {
  "hero.badge": "कंपनी के हिसाब से असली हायरिंग अनुभव",
  "hero.title": "जानिए क्या हुआ था",
  "hero.lede": "उम्मीदवारों के असली अनुभव, पहचान छुपी रहती है और कंपनी के नाम से खोज सकते हैं: राउंड, इंतज़ार, जवाब (या जवाब ही नहीं), ऑफ़र और घोस्टिंग।",
  "hero.share": "अपना अनुभव बताएं",
  "hero.waiting": "जवाब का इंतज़ार है?",
  "hero.trust": "नाम नहीं। कंपनी ईमेल नहीं। बताने में लगभग 30 सेकंड।",
  "search.label": "कंपनी खोजें",
  "search.placeholder": "कंपनी खोजें, जैसे Accenture",
  "search.button": "खोजें",
  "search.try": "आज़माएं:",
  "footer.tagline": { sassy: "हायरिंग का सच, उन्हीं से जिन्होंने इसे झेला।", calm: "उम्मीदवारों के ईमानदार हायरिंग अनुभव।" },
  "footer.language": "भाषा",
};

const kn: Partial<Record<Key, Entry>> = {
  "hero.badge": "ಕಂಪನಿವಾರು ನಿಜವಾದ ನೇಮಕಾತಿ ಅನುಭವಗಳು",
  "hero.title": "ಏನಾಯಿತು ಎಂದು ತಿಳಿಯಿರಿ",
  "hero.lede": "ಅಭ್ಯರ್ಥಿಗಳ ನಿಜವಾದ ಅನುಭವಗಳು, ಹೆಸರು ಗೋಪ್ಯವಾಗಿರುತ್ತದೆ ಮತ್ತು ಕಂಪನಿಯ ಹೆಸರಿನಿಂದ ಹುಡುಕಬಹುದು: ಸುತ್ತುಗಳು, ಕಾಯುವಿಕೆ, ಉತ್ತರಗಳು (ಅಥವಾ ಇಲ್ಲ), ಆಫರ್‌ಗಳು ಮತ್ತು ಘೋಸ್ಟಿಂಗ್.",
  "hero.share": "ನನ್ನ ಅನುಭವ ಹಂಚಿಕೊಳ್ಳಿ",
  "hero.waiting": "ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದ್ದೀರಾ?",
  "hero.trust": "ಹೆಸರು ಬೇಡ. ಕಂಪನಿ ಇಮೇಲ್ ಬೇಡ. ಹಂಚಿಕೊಳ್ಳಲು ಸುಮಾರು 30 ಸೆಕೆಂಡ್.",
  "search.label": "ಕಂಪನಿ ಹುಡುಕಿ",
  "search.placeholder": "ಕಂಪನಿ ಹುಡುಕಿ, ಉದಾ. Accenture",
  "search.button": "ಹುಡುಕಿ",
  "search.try": "ಪ್ರಯತ್ನಿಸಿ:",
  "footer.tagline": { sassy: "ನೇಮಕಾತಿಯ ಸತ್ಯ, ಅದನ್ನು ಅನುಭವಿಸಿದವರಿಂದಲೇ.", calm: "ಅಭ್ಯರ್ಥಿಗಳು ಹಂಚಿಕೊಂಡ ಪ್ರಾಮಾಣಿಕ ನೇಮಕಾತಿ ಅನುಭವಗಳು." },
  "footer.language": "ಭಾಷೆ",
};

const hinglish: Partial<Record<Key, Entry>> = {
  "hero.badge": "Company-wise real hiring experiences",
  "hero.title": "Pata karo kya hua tha",
  "hero.lede": "Candidates ke real experiences, by default anonymous aur company ke naam se search kar sakte ho: rounds, waiting, replies (ya bilkul nahi), offers aur ghosting.",
  "hero.share": "Apna experience share karo",
  "hero.waiting": "Reply ka wait kar rahe ho?",
  "hero.trust": "Naam nahi. Company email nahi. Share karne mein bas 30 second.",
  "search.label": "Company search karo",
  "search.placeholder": "Company search karo, jaise Accenture",
  "search.button": "Search",
  "search.try": "Try karo:",
  "footer.tagline": { sassy: "Hiring ka sach, unse jinhone ise jhela hai.", calm: "Candidates ke honest hiring experiences." },
  "footer.language": "Bhasha",
};

const DICTS: Record<Lang, Partial<Record<Key, Entry>>> = { en, hi, kn, hinglish };

export function translate(lang: Lang, tone: Tone, key: Key, vars?: Record<string, string | number>) {
  const entry = DICTS[lang]?.[key] ?? en[key];
  let s = typeof entry === "string" ? entry : tone === "calm" ? entry.calm : entry.sassy;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// The translator for the current language and tone. Also keeps <html lang> in step.
export function useT() {
  const { lang } = usePrefs();
  const tone = useTone();
  useEffect(() => {
    const l = LANGS.find((x) => x.id === lang);
    if (l && typeof document !== "undefined") document.documentElement.lang = l.htmlLang;
  }, [lang]);
  return Object.assign((key: Key, vars?: Record<string, string | number>) => translate(lang, tone, key, vars), { lang });
}

export const setLang = (lang: Lang) => setPrefs({ lang });
