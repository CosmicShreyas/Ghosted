// Personal data in free text. Ghosted is anonymous on both sides: stories describe companies and
// processes, never identify private individuals (DPDP Act 2023; Intermediary Rules 2021, 3(1)(b)).
// Each finder returns spans so the author can be told exactly what to remove.
//
// Checksums keep false positives down: a 12-digit number is only an Aadhaar if its Verhoeff check
// digit is right; a card number only if it passes Luhn.

export type PiiKind = "email" | "phone" | "aadhaar" | "pan" | "upi" | "card" | "ifsc" | "address" | "person" | "link";
export type PiiHit = { kind: PiiKind; text: string; index: number };

// Verhoeff (used by UIDAI for Aadhaar).
const V_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const V_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function verhoeffValid(num: string): boolean {
  let c = 0;
  const d = num.split("").reverse().map(Number);
  for (let i = 0; i < d.length; i++) c = V_D[c]![V_P[i % 8]![d[i]!]!]!;
  return c === 0;
}
export function luhnValid(num: string): boolean {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) { let n = Number(num[i]); if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}

const all = (re: RegExp, s: string) => [...s.matchAll(re)];

// Honorifics and role words that usually introduce a real person's name in Indian workplaces.
const INTRO = String.raw`(?:mr|mrs|ms|miss|dr|shri|smt|sir|madam|ma'am)\.?|(?:hr|recruiter|manager|interviewer|lead|director|founder|ceo|cto|vp|head)\s+(?:named|called|is|was)?`;
const NAME = String.raw`[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?`;

export function findPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const push = (kind: PiiKind, m: RegExpMatchArray) => hits.push({ kind, text: m[0], index: m.index ?? 0 });

  for (const m of all(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, text)) push("email", m);
  // UPI IDs (name@okaxis etc.) look like emails without a TLD.
  for (const m of all(/\b[A-Za-z0-9._-]{2,}@(?:ok)?(?:axis|hdfc|hdfcbank|icici|sbi|ybl|paytm|upi|ibl|apl|axl|kotak|barodampay|pnb|freecharge|jupiteraxis|slc|fbl)\b/gi, text)) push("upi", m);
  // Indian mobiles: optional +91 / 0, then 10 digits starting 6–9, spaces or dashes allowed.
  // Any grouping people use (98765 43210, 987-654-3210, 9876543210).
  for (const m of all(/(?<![\d])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?![\d])/g, text)) push("phone", m);
  // Aadhaar: 12 digits (often 4-4-4), first digit 2–9, valid Verhoeff.
  for (const m of all(/(?<![\d])[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g, text)) if (verhoeffValid(m[0].replace(/\D/g, ""))) push("aadhaar", m);
  // PAN: AAAAA9999A, fourth letter is the holder type (P = person, C = company…).
  for (const m of all(/\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g, text)) push("pan", m);
  for (const m of all(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, text)) push("ifsc", m);
  // Payment cards: 13–19 digits with optional separators, Luhn-valid.
  for (const m of all(/(?<![\d])(?:\d[\s-]?){13,19}(?![\d])/g, text)) { const d = m[0].replace(/\D/g, ""); if (d.length >= 13 && d.length <= 19 && luhnValid(d) && !hits.some((h) => h.index === m.index)) push("card", m); }
  // Home addresses: flat/house numbers with a PIN code.
  for (const m of all(/\b(?:flat|house|h\.?\s?no|plot|door)\s*(?:no\.?)?\s*[\w/-]+,?[^.\n]{0,60}\b\d{6}\b/gi, text)) push("address", m);
  // A named individual: "HR named Priya Sharma", "Mr. Rahul Verma".
  for (const m of all(new RegExp(`\\b(?:${INTRO})\\s+(${NAME})`, "gi"), text)) {
    const name = m[1] ?? "";
    // Needs a real capitalised name in the original text (the "i" flag matched the intro only loosely).
    if (/^[A-Z][a-z]{2,}/.test(name) && !COMMON_WORDS.has(name.split(/\s+/)[0]!.toLowerCase())) hits.push({ kind: "person", text: m[0], index: m.index ?? 0 });
  }
  // Profile links (LinkedIn people, Instagram, etc.) identify individuals too.
  for (const m of all(/\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|instagram\.com|facebook\.com|x\.com|twitter\.com|t\.me|wa\.me)\/[\w.-]+/gi, text)) push("link", m);

  // Nested matches (a phone inside a card number, etc.): keep the longest per start.
  return hits.sort((a, b) => a.index - b.index || b.text.length - a.text.length).filter((h, i, arr) => i === 0 || h.index >= arr[i - 1]!.index + arr[i - 1]!.text.length);
}

// Words that follow "HR was…" etc. but aren't names.
const COMMON_WORDS = new Set(["the", "very", "really", "extremely", "super", "quite", "not", "never", "always", "rude", "nice", "kind", "polite", "late", "absent", "busy", "helpful", "unprofessional", "professional", "okay", "fine", "good", "bad", "great", "terrible", "awful", "friendly", "cold", "silent", "unresponsive", "responsive", "clear", "vague", "honest", "fake", "also", "just", "still", "then", "there", "here", "sent", "said", "told", "asked", "called", "named", "team", "department", "round", "interview", "process", "company", "office", "manager", "lead", "senior", "junior", "head", "from", "at", "in", "on", "with"]);

// Masks what was found ("98•••••210") for the preview shown to moderators.
export function redact(text: string, hits: PiiHit[]): string {
  let out = "", at = 0;
  for (const h of hits) {
    out += text.slice(at, h.index);
    const t = h.text;
    out += h.kind === "person" ? t.replace(/[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/, "[name]") : t.length > 6 ? `${t.slice(0, 2)}${"•".repeat(Math.max(3, t.length - 5))}${t.slice(-3)}` : "•••";
    at = h.index + h.text.length;
  }
  return out + text.slice(at);
}
