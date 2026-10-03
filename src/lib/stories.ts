// One story shape for the whole dashboard, whether it came from the API or the sample data
// (mock mode). Components only ever see `StoryModel`, so switching data sources never touches
// the UI. The author is included directly: identity is account-level, so every story shows its
// author the way that person currently appears, with the public id their page lives at.
import { useQuery } from "@tanstack/react-query";
import { api, apiEnabled, API_URL } from "@/lib/api";
import { companies as sampleCompanies, getCompany, getUser, stories as sampleStories, type Company, type Story } from "@/mock/data";

export type Author = { publicId: string; name: string; avatarSeed: string; pastel: string; revealed: Revealed | null };
export type Revealed = { name: string | null; role: string | null; experience: string | null; city: string | null; linkedin: string | null };

export const STORY_REACTIONS = ["relatable", "insightful", "creative", "support", "love"] as const;
export type StoryReaction = (typeof STORY_REACTIONS)[number];
export type StoryReactionCounts = Record<StoryReaction, number>;

export type StoryModel = {
  id: string; // public id (API) or sample id
  company: Company;
  outcome: string; // machine value: ghosted | rejected | offer | offer_revoked | ghost_job
  outcomeLabel: string;
  role: string | null;
  title: string | null;
  body: string;
  relatable: number;
  flags: number;
  reactions: StoryReactionCounts;
  comments: number;
  createdAt: string | null;
  timeLabel: string;
  author: Author;
  mine: { relatable: boolean; flag: boolean };
  myReaction: StoryReaction | null;
  // Present on real (API) stories: when it was last edited, and the raw values behind it, so the
  // author can edit it with everything pre-filled.
  editedAt?: string | null;
  // Goofy published it with a person's name hidden as [name].
  goofy?: "redacted" | null;
  stage?: string;
  ratings?: { hiring: number; communication: number; culture: number; pay: number; growth: number };
  salary?: [number, number] | null;
  daysWaited?: number | null;
};

export const OUTCOME_LABEL: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Offer", offer_revoked: "Offer revoked", ghost_job: "Ghost job" };

export const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 172800) return "Yesterday";
  return `${Math.floor(s / 86400)} days ago`;
};

// ---------- sample data (no API) ----------

// Sample people get stable 15-digit ids so their pages work in the preview too.
export const samplePublicId = (userId: string) => `1000000000000${userId.replace(/\D/g, "").padStart(2, "0")}`;
export const sampleUserIdFor = (publicId: string) => `u${Number(publicId.slice(-2))}`;

const OUTCOME_FROM_TEXT: [RegExp, string][] = [[/revoked/i, "offer_revoked"], [/ghost job/i, "ghost_job"], [/ghost|vanish|silence/i, "ghosted"], [/offer|lowball|matched/i, "offer"]];

export function fromSample(s: Story): StoryModel {
  const user = getUser(s.userId);
  const [outcomeText = "", role = null] = s.stage.split(" · ");
  const outcome = OUTCOME_FROM_TEXT.find(([re]) => re.test(outcomeText))?.[1] ?? "rejected";
  return {
    id: s.id, company: getCompany(s.companyId), outcome, outcomeLabel: outcomeText, role, title: null, body: s.excerpt,
    relatable: s.relatable, flags: s.flags, reactions: { relatable: s.relatable, insightful: Math.round(s.flags * .35), creative: Math.round(s.flags * .15), support: Math.round(s.flags * .3), love: Math.round(s.flags * .2) }, comments: s.comments, createdAt: null, timeLabel: s.time,
    author: { publicId: samplePublicId(user.id), name: user.handle, avatarSeed: user.seed, pastel: user.pastel, revealed: null },
    mine: { relatable: false, flag: false },
    myReaction: null,
  };
}

export const sampleModels = () => sampleStories.map(fromSample);

// ---------- API ----------

export type CompanyDto = {
  slug: string; name: string; initial: string; color: string; summary: string | null; flagScore: number | null; badges: string[];
  scores: Company["scores"] | null; salary: [number, number] | null; storyCount: number; avgDaysWaited: number | null;
  domain: string | null; website: string | null; logoUrl: string | null; about: string | null; industry: string | null;
  size: string | null; hqCity: string | null; founded: number | null; careersUrl: string | null;
};

export function companyFromApi(c: CompanyDto): Company {
  return {
    id: c.slug, name: c.name, initial: c.initial, color: c.color, summary: c.summary ?? "", badges: c.badges,
    // No stories yet: a neutral 50 until the first ratings arrive (UI shows "New" for these).
    score: c.flagScore ?? 50,
    scores: c.scores ?? { hiring: 50, communication: 50, culture: 50, pay: 50, growth: 50 },
    salary: c.salary ?? [0, 0],
    storyCount: c.storyCount, avgDaysWaited: c.avgDaysWaited,
    logoUrl: c.logoUrl && API_URL ? `${API_URL}/v1/companies/${c.slug}/logo?v=2` : c.logoUrl,
    website: c.website, domain: c.domain,
    about: c.about, industry: c.industry, size: c.size, hqCity: c.hqCity, founded: c.founded, careersUrl: c.careersUrl,
  };
}

// Sample companies count as rated; real ones only once someone has shared a story.
export const isRated = (c: Company) => c.storyCount === undefined || c.storyCount > 0;

export type StoryDto = {
  publicId: string; outcome: string; stage: string; role: string | null; title: string; body: string;
  company: { slug: string; name: string; color: string } | null;
  author: { publicId: string; name: string; avatarSeed: string; pastel: string; revealed: Revealed | null } | null;
  counts: StoryReactionCounts & { flags: number; comments: number };
  myReaction: StoryReaction | null;
  myReactions?: { relatable: boolean; flag: boolean } | null;
  createdAt: string;
  editedAt?: string | null;
  goofy?: "redacted" | null;
  ratings?: { hiring: number; communication: number; culture: number; pay: number; growth: number };
  salary?: [number, number] | null;
  daysWaited?: number | null;
};

export function fromApi(s: StoryDto, index: Map<string, Company>): StoryModel {
  const known = s.company ? index.get(s.company.slug) : undefined;
  const company: Company = known ?? (s.company
    ? { id: s.company.slug, name: s.company.name, initial: s.company.name.charAt(0).toUpperCase(), color: s.company.color, score: 50, summary: "", badges: [], scores: { hiring: 50, communication: 50, culture: 50, pay: 50, growth: 50 }, salary: [0, 0] }
    : getCompany("nimbus"));
  return {
    id: s.publicId, company, outcome: s.outcome, outcomeLabel: OUTCOME_LABEL[s.outcome] ?? s.outcome, role: s.role, title: s.title, body: s.body,
    relatable: s.counts.relatable, flags: s.counts.flags, reactions: { relatable: s.counts.relatable, insightful: s.counts.insightful, creative: s.counts.creative, support: s.counts.support, love: s.counts.love }, comments: s.counts.comments, createdAt: s.createdAt, timeLabel: timeAgo(s.createdAt),
    author: s.author ?? { publicId: "", name: "Former member", avatarSeed: "ghost", pastel: "bg-avatar-lilac", revealed: null },
    mine: s.myReactions ?? { relatable: false, flag: false },
    myReaction: s.myReaction,
    editedAt: s.editedAt ?? null, goofy: s.goofy ?? null, stage: s.stage,
    ...(s.ratings && { ratings: s.ratings }),
    salary: s.salary ?? null, daysWaited: s.daysWaited ?? null,
  };
}

// Every company with its current Flag Score, used to decorate stories and fill the share picker.
export function useCompanyIndex() {
  const q = useQuery({
    queryKey: ["companies", "all"],
    // Every listed company (pages of 50, up to 2,000), so the pickers can search all of them.
    queryFn: async () => {
      const all: CompanyDto[] = [];
      let offset: number | null = 0;
      while (offset !== null && all.length < 2000) {
        const r: { companies: CompanyDto[]; nextOffset?: number | null } = await api(`/v1/companies?all=1&limit=50&sort=stories&offset=${offset}`);
        all.push(...r.companies);
        offset = r.nextOffset ?? null;
      }
      return all.map(companyFromApi);
    },
    enabled: apiEnabled,
    staleTime: 5 * 60_000,
  });
  const list = apiEnabled ? q.data ?? [] : sampleCompanies;
  return { list, index: new Map(list.map((c) => [c.id, c])), ready: !apiEnabled || q.isSuccess };
}

// Toggles a reaction on the server; resolves to the server's counts and your reactions.
export async function react(storyId: string, kind: StoryReaction) {
  return api<{ counts: StoryDto["counts"]; myReaction: StoryReaction | null }>(`/v1/stories/${storyId}/reactions`, { method: "POST", body: { kind } });
}
