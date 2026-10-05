// Fills in the "List a company" form automatically. Two honest sources, no pretending to be a browser:
//  1. The company's own homepage: its schema.org JSON-LD (name, description, founding year, city,
//     employees), its meta description and a careers link. Many big sites block automated readers,
//     so this is often empty.
//  2. Wikidata (CC0, free, no key): the entry whose official website (P856) is exactly this domain,
//     so it can't pick the wrong company. Gives founding year, headquarters, employees and industry;
//     the linked English Wikipedia summary gives a starting description.
// Everything found is a suggestion: the person reviews and edits it, and the API validates it all.
import { fetchJson, registrableDomain, type SiteInfo } from "./site-check.js";

export type Facts = {
  name: string | null;
  about: string | null;
  aboutSource: "website" | "wikipedia" | null;
  industry: string | null;
  size: string | null;
  hqCity: string | null;
  founded: number | null;
  careersUrl: string | null;
  // Which fields were filled, and from where (shown to the person as "from the website"/"Wikidata").
  filled: string[];
  sources: ("website" | "wikidata" | "wikipedia")[];
};

const WD = "https://www.wikidata.org/w/api.php?format=json&origin=*";

type Claim = { mainsnak?: { datavalue?: { value?: unknown } }; rank?: string; qualifiers?: Record<string, { datavalue?: { value?: unknown } }[]> };
type Entity = { id: string; labels?: { en?: { value: string } }; descriptions?: { en?: { value: string } }; claims?: Record<string, Claim[]>; sitelinks?: { enwiki?: { title: string } } };

const values = (e: Entity, prop: string) => (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value);
const idOf = (v: unknown) => (v && typeof v === "object" && "id" in v ? String((v as { id: string }).id) : null);

// The Wikidata entry for this exact domain, if there is one.
async function findEntity(domain: string, hints: string[]): Promise<Entity | null> {
  // Few requests on purpose (Wikimedia's etiquette): stop at the first search term that finds anything.
  const terms = [...new Set([domain.split(".")[0]!, ...hints].map((t) => t.trim()).filter((t) => t.length >= 2))].slice(0, 2);
  const ids = new Set<string>();
  for (const term of terms) {
    const r = await fetchJson<{ search?: { id: string }[] }>(`${WD}&action=wbsearchentities&type=item&language=en&limit=8&search=${encodeURIComponent(term)}`);
    for (const s of r?.search ?? []) ids.add(s.id);
    if (ids.size) break;
  }
  if (!ids.size) return null;
  const r = await fetchJson<{ entities?: Record<string, Entity> }>(`${WD}&action=wbgetentities&props=labels|descriptions|claims|sitelinks&languages=en&sitefilter=enwiki&ids=${[...ids].slice(0, 10).join("|")}`, 6_000_000);
  for (const e of Object.values(r?.entities ?? {})) {
    const sites = values(e, "P856").map((v) => { try { return registrableDomain(new URL(String(v)).hostname); } catch { return null; } });
    if (sites.includes(domain)) return e;
  }
  return null;
}

async function labels(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const r = await fetchJson<{ entities?: Record<string, Entity> }>(`${WD}&action=wbgetentities&props=labels&languages=en&ids=${ids.slice(0, 20).join("|")}`);
  return new Map(Object.values(r?.entities ?? {}).map((e) => [e.id, e.labels?.en?.value ?? ""]));
}

// Ghosted's industry list, from words in Wikidata's industry labels and the descriptions.
// The most specific matches come first (a "payments bank" is payments, not banking).
const INDUSTRY_RULES: [RegExp, string][] = [
  [/artificial intelligence|machine learning|\bAI\b|generative/i, "ai_ml"],
  [/cyber ?security|information security|identity management/i, "cybersecurity"],
  [/semiconductor|chip design|integrated circuit/i, "semiconductors"],
  [/robotic|industrial automation/i, "robotics"],
  [/cryptocurrenc|blockchain|web3|crypto exchange/i, "crypto"],
  [/global capability|captive (centre|center)|offshore development cent/i, "gcc"],
  [/payment|upi|wallet|card network/i, "payments"],
  [/insurtech/i, "insurtech"],
  [/lending|nbfc|microfinance|credit/i, "lending"],
  [/wealth|asset management|mutual fund|brokerage|stock ?trad|investment/i, "wealth"],
  [/fintech|financial technology|neobank/i, "fintech"],
  [/\bbank|insurance|financial services/i, "bfsi"],
  [/accounting|audit|chartered/i, "accounting"],
  [/quick commerce|instant delivery/i, "quick_commerce"],
  [/food delivery|cloud kitchen|restaurant aggregator/i, "foodtech"],
  [/e-?commerce|online (retail|shopping|marketplace)/i, "ecommerce"],
  [/direct.to.consumer|\bd2c\b/i, "d2c"],
  [/fast.moving consumer|fmcg|consumer goods|packaged food/i, "fmcg"],
  [/beverage|food (processing|products)|dairy|brewery/i, "food_beverage"],
  [/fashion|apparel|clothing|footwear|jewel/i, "fashion"],
  [/cosmetic|beauty|personal care|skincare/i, "beauty"],
  [/retail|supermarket|department store/i, "retail"],
  [/pharma|biotech|drug|vaccine|life sciences/i, "pharma"],
  [/medical device|diagnostic equipment/i, "medical_devices"],
  [/hospital|clinic|healthcare provider/i, "hospitals"],
  [/fitness|gym|sports/i, "fitness"],
  [/health|medical|telemedicine/i, "healthtech"],
  [/university|college|school|institute of/i, "education"],
  [/education|edtech|e-learning|online learning|test prep/i, "edtech"],
  [/recruitment agenc|staffing|manpower|temporary work/i, "staffing"],
  [/human resources software|hr tech|payroll|recruiting software/i, "hrtech"],
  [/advertis|marketing agenc|digital marketing|public relations/i, "advertising"],
  [/social network|social media|online community/i, "social"],
  [/publishing|newspaper|news agency|magazine/i, "publishing"],
  [/streaming|film|music|entertainment|broadcast|television/i, "entertainment"],
  [/media/i, "media"],
  [/video game|gaming/i, "gaming"],
  [/consumer electronics|electronics|smartphone|appliance/i, "electronics"],
  [/internet of things|\biot\b/i, "iot"],
  [/automotive|automobile|electric vehicle|car manufactur|two-wheeler/i, "automotive"],
  [/aerospace|defen[cs]e|aircraft manufactur/i, "aerospace"],
  [/airline|aviation|airport/i, "aviation"],
  [/ride.hailing|ride.sharing|mobility|bike rental|car rental/i, "mobility"],
  [/travel|tourism|online travel/i, "travel"],
  [/hotel|hospitality|resort/i, "hospitality"],
  [/real estate|property|proptech|co-?working/i, "real_estate"],
  [/construction|infrastructure|engineering procurement|cement/i, "construction"],
  [/solar|wind power|renewable|clean energy/i, "renewables"],
  [/petroleum|oil and gas|natural gas|refin/i, "oil_gas"],
  [/climate|carbon|sustainab/i, "climate"],
  [/electric (utility|power)|power generation|utilit|energy/i, "energy"],
  [/agri|farm|crop|fertili[sz]er/i, "agritech"],
  [/chemical|materials|polymer|paint/i, "chemicals"],
  [/steel|metal|mining|aluminium|aluminum/i, "metals_mining"],
  [/textile|yarn|fabric/i, "textiles"],
  [/business process outsourcing|\bbpo\b|call cent|customer support outsourcing/i, "bpo"],
  [/knowledge process|\bkpo\b|analytics services|market research/i, "kpo"],
  [/law firm|legal services|legaltech/i, "legal"],
  [/government|public sector|ministry|municipal/i, "government"],
  [/non-?profit|ngo|charit|foundation/i, "nonprofit"],
  [/research (institute|laboratory|organisation|organization)|laborator/i, "research"],
  [/consult/i, "consulting"],
  [/it services|information technology (services|consulting)|outsourcing|systems integrat/i, "it_services"],
  [/cloud computing|data cent|hosting|infrastructure as a service/i, "cloud"],
  [/software|saas|internet|technology company|computer/i, "software"],
  [/telecom|mobile network|wireless/i, "telecom"],
  [/logistic|shipping|courier|supply chain|freight|transport/i, "logistics"],
  [/manufactur|industrial/i, "manufacturing"],
];
const industryFrom = (text: string) => INDUSTRY_RULES.find(([re]) => re.test(text))?.[1] ?? null;

const sizeFrom = (n: number | null) => (n == null ? null : n <= 10 ? "1-10" : n <= 50 ? "11-50" : n <= 200 ? "51-200" : n <= 1000 ? "201-1000" : n <= 5000 ? "1001-5000" : "5000+");

// Whole sentences, 80–800 characters, no links: a starting point that passes the form's rules.
function tidyAbout(text: string | null) {
  if (!text) return null;
  const clean = text.replace(/\s*\([^)]*\)/g, "").replace(/https?:\/\/\S+|www\.\S+/g, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  for (const s of sentences) { if ((out + s).length > 780) break; out += s; }
  out = out.trim();
  return out.length >= 80 ? out : null;
}

const latestYear = (vals: unknown[]) => {
  const years = vals.map((v) => Number(String((v as { time?: string })?.time ?? "").slice(1, 5))).filter((y) => y >= 1800 && y <= new Date().getFullYear());
  return years.length ? Math.min(...years) : null;
};
const latestAmount = (e: Entity, prop: string) => {
  const claims = (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated");
  const preferred = claims.find((c) => c.rank === "preferred") ?? claims.at(-1);
  const amount = Number(String((preferred?.mainsnak?.datavalue?.value as { amount?: string })?.amount ?? "").replace("+", ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

// Per-instance cache: re-checking the same website within an hour doesn't call Wikidata again.
const cache = new Map<string, { at: number; facts: Facts }>();
const CACHE_MS = 60 * 60_000;

export async function gatherFacts(site: SiteInfo): Promise<Facts> {
  const hit = cache.get(site.domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts;
  const facts = await gatherFresh(site);
  // Only remember useful answers, so a temporary failure (e.g. rate limit) is retried next time.
  if (facts.sources.includes("wikidata") || facts.filled.length >= 3) {
    if (cache.size > 500) cache.clear();
    cache.set(site.domain, { at: Date.now(), facts });
  }
  return facts;
}

async function gatherFresh(site: SiteInfo): Promise<Facts> {
  const org = site.org;
  const siteGuess = (site.siteName ?? site.title ?? "").split(/\s[|–—:·-]\s|\s\|\s?/)[0]!.trim() || null;
  const entity = await findEntity(site.domain, [org?.name ?? "", siteGuess ?? ""]).catch(() => null);

  let wd: { name: string | null; description: string | null; founded: number | null; hq: string | null; employees: number | null; industry: string | null; wikiTitle: string | null } | null = null;
  if (entity) {
    const hqIds = values(entity, "P159").map(idOf).filter((x): x is string => !!x);
    const industryIds = values(entity, "P452").map(idOf).filter((x): x is string => !!x);
    const names = await labels([...hqIds.slice(0, 1), ...industryIds.slice(0, 5)]);
    wd = {
      name: entity.labels?.en?.value ?? null,
      description: entity.descriptions?.en?.value ?? null,
      founded: latestYear(values(entity, "P571")),
      hq: hqIds[0] ? names.get(hqIds[0]) ?? null : null,
      employees: latestAmount(entity, "P1128"),
      industry: industryIds.map((id) => names.get(id) ?? "").join(" "),
      wikiTitle: entity.sitelinks?.enwiki?.title ?? null,
    };
  }

  // A fuller description from the company's Wikipedia article, when the site offers little.
  const siteAbout = tidyAbout(org?.description ?? null) ?? tidyAbout(site.description);
  let wikiAbout: string | null = null;
  if (!siteAbout && wd?.wikiTitle) {
    const w = await fetchJson<{ extract?: string; type?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wd.wikiTitle.replace(/ /g, "_"))}`);
    if (w?.type !== "disambiguation") wikiAbout = tidyAbout(w?.extract ?? null);
  }

  const facts: Facts = {
    name: org?.name ?? wd?.name ?? siteGuess,
    about: siteAbout ?? wikiAbout,
    aboutSource: siteAbout ? "website" : wikiAbout ? "wikipedia" : null,
    industry: industryFrom(`${wd?.industry ?? ""} ${wd?.description ?? ""} ${site.title ?? ""} ${site.description ?? ""} ${org?.description ?? ""}`),
    size: sizeFrom(org?.employees ?? wd?.employees ?? null),
    hqCity: org?.city ?? wd?.hq ?? null,
    founded: org?.founded ?? wd?.founded ?? null,
    careersUrl: site.careersUrl,
    filled: [],
    sources: [],
  };
  // Clip values to what the form accepts, and drop anything that wouldn't pass.
  if (facts.name) facts.name = facts.name.slice(0, 80);
  // Headquarters must be a city: some entries only name the country.
  const COUNTRIES = /^(india|united states( of america)?|usa|united kingdom|uk|china|japan|germany|france|canada|australia|netherlands|israel|ireland|sweden|switzerland|south korea|brazil)$/i;
  if (facts.hqCity && (!/^[\p{L} .'-]{2,60}$/u.test(facts.hqCity) || COUNTRIES.test(facts.hqCity.trim()))) facts.hqCity = null;
  facts.filled = (["name", "about", "industry", "size", "hqCity", "founded", "careersUrl"] as const).filter((k) => facts[k] != null);
  if (site.readable && (org || site.description || site.careersUrl)) facts.sources.push("website");
  if (wd) facts.sources.push("wikidata");
  if (facts.aboutSource === "wikipedia") facts.sources.push("wikipedia");
  return facts;
}
