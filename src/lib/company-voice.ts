// Ask candidates (company Q&A), Right of Reply and removal / correction requests, on the site side.
// The rules live in backend/src/routes/company-voice.ts. Without the API (preview mode) these
// sections show their empty state.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";
import type { Pledge } from "@/lib/stories";

export type Answer = { publicId: string; body: string; basis: "story" | "follower"; createdAt: string; mine: boolean; best: boolean };
export type Question = { publicId: string; body: string; createdAt: string; mine: boolean; answers: Answer[] };
type QA = { canAsk: boolean; canAnswer: boolean; questionsLeftToday: number; questions: Question[] };

export function useQuestions(slug: string) {
  const qc = useQueryClient();
  const key = ["qa", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<QA>(`/v1/voice/companies/${slug}/questions`), enabled: apiEnabled, staleTime: 30_000 });
  useLive(apiEnabled ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return {
    data: q.data ?? null, loading: apiEnabled && q.isPending, error: q.isError,
    // Each returns a message when the post was held for a check (shown by the composer), else nothing.
    ask: async (body: string) => { const r = await api<{ pending?: boolean; message?: string }>(`/v1/voice/companies/${slug}/questions`, { method: "POST", body: { body } }); await refresh(); return r.pending ? r.message ?? "Saved. It appears after a quick check." : null; },
    answer: async (questionId: string, body: string) => { const r = await api<{ pending?: boolean; message?: string }>(`/v1/voice/questions/${questionId}/answers`, { method: "POST", body: { body } }); await refresh(); return r.pending ? r.message ?? "Saved. It appears after a quick check." : null; },
    pin: async (questionId: string, answerId: string | null) => { await api(`/v1/voice/questions/${questionId}/best`, { method: "POST", body: { answerId } }); await refresh(); },
    removeQuestion: async (id: string) => { await api(`/v1/voice/questions/${id}`, { method: "DELETE" }); await refresh(); },
    removeAnswer: async (id: string) => { await api(`/v1/voice/answers/${id}`, { method: "DELETE" }); await refresh(); },
  };
}

export type RepReply = { publicId: string; body: string; createdAt: string; storyPublicId: string | null };
type Replies = { company: { name: string; domain: string | null }; viewerIsRep: boolean; replies: RepReply[] };

// A company's official replies (one per story, one on the page), and whether you can post one.
export function useRepReplies(slug: string | null) {
  const qc = useQueryClient();
  const key = ["rep-replies", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<Replies>(`/v1/voice/companies/${slug}/rep-replies`), enabled: apiEnabled && !!slug, staleTime: 60_000 });
  useLive(apiEnabled && slug ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  const data = q.data ?? null;
  return {
    data,
    forStory: (storyPublicId: string) => data?.replies.find((r) => r.storyPublicId === storyPublicId) ?? null,
    onPage: data?.replies.find((r) => r.storyPublicId === null) ?? null,
    post: async (body: string, storyPublicId?: string) => {
      const r = await api<{ pending?: boolean; message?: string }>(`/v1/voice/companies/${slug}/rep-reply`, { method: "POST", body: { body, ...(storyPublicId && { storyPublicId }) } });
      await qc.invalidateQueries({ queryKey: key });
      return r.pending ? r.message ?? "Saved. It appears after a moderator's check." : null;
    },
  };
}

export const repsApi = {
  start: (companySlug: string, email: string) => api<{ sent?: boolean; alreadyVerified?: boolean; domain?: string }>("/v1/voice/reps/start", { method: "POST", body: { companySlug, email } }),
  verify: (companySlug: string, email: string, code: string) => api<{ verified: boolean; company: { slug: string; name: string } }>("/v1/voice/reps/verify", { method: "POST", body: { companySlug, email, code } }),
};

// ---------- the impact ladder (backend/src/impact.ts) ----------

export type ImpactStatus = "heard" | "looking_into_it" | "fixed";
export type Impact = {
  repViews: number; firstSeenAt: string | null;
  steps: { status: ImpactStatus; at: string; note: string | null }[];
  replied: boolean;
  cited: { at: string; changePublicId: string }[];
};
type StoryImpact = { company: { name: string; slug: string } | null; impact: Impact; viewerIsRep: boolean };

export function useStoryImpact(storyPublicId: string) {
  const qc = useQueryClient();
  const key = ["impact", storyPublicId];
  const q = useQuery({ queryKey: key, queryFn: () => api<StoryImpact>(`/v1/voice/stories/${storyPublicId}/impact`), enabled: apiEnabled, staleTime: 30_000 });
  useLive(apiEnabled ? `story:${storyPublicId}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  return {
    data: q.data ?? null,
    setStatus: async (status: ImpactStatus, note?: string) => {
      const r = await api<{ ok: boolean; notePending: boolean }>(`/v1/voice/stories/${storyPublicId}/status`, { method: "POST", body: { status, ...(note?.trim() && { note: note.trim() }) } });
      await qc.invalidateQueries({ queryKey: key });
      return r;
    },
  };
}

// The ladders for all your own stories (My Stories), keyed by story public id.
export function useMyImpact() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-impact"], queryFn: async () => (await api<{ impact: Record<string, Impact | undefined> }>("/v1/voice/me/impact")).impact, enabled: apiEnabled, staleTime: 30_000 });
  useLive(apiEnabled ? "notifications" : null, () => void qc.invalidateQueries({ queryKey: ["my-impact"] }));
  return q.data ?? {};
}

// ---------- "You said, we did" (backend/src/changes.ts) ----------

export type ChangeNote = { publicId: string; body: string; createdAt: string; stories: { publicId: string; title: string }[] };
type Changes = { changes: ChangeNote[]; viewerIsRep: boolean; leftThisMonth: number; perMonth?: number; maxCited?: number };

export function useChanges(slug: string) {
  const qc = useQueryClient();
  const key = ["changes", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<Changes>(`/v1/voice/companies/${slug}/changes`), enabled: apiEnabled, staleTime: 60_000 });
  useLive(apiEnabled ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  return {
    data: q.data ?? null, loading: apiEnabled && q.isPending,
    post: async (body: string, storyPublicIds: string[]) => {
      const r = await api<{ pending?: boolean; message?: string }>(`/v1/voice/companies/${slug}/changes`, { method: "POST", body: { body, storyPublicIds } });
      await qc.invalidateQueries({ queryKey: key });
      return r.pending ? r.message ?? "Saved. It appears after a moderator's check." : null;
    },
  };
}

// ---------- demand and the HR front door (backend/src/demand.ts) ----------

type Demand = { count: number | null; asked: boolean; viewerIsRep: boolean };
export function useDemand(slug: string) {
  const qc = useQueryClient();
  const key = ["demand", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<Demand>(`/v1/voice/companies/${slug}/demand`), enabled: apiEnabled, staleTime: 60_000 });
  useLive(apiEnabled ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  return {
    data: q.data ?? null,
    toggle: async (on: boolean) => {
      const r = await api<{ asked: boolean; count: number | null }>(`/v1/voice/companies/${slug}/ask-response`, { method: on ? "POST" : "DELETE" });
      qc.setQueryData<Demand>(key, (d) => (d ? { ...d, asked: r.asked, count: r.count } : d));
    },
  };
}

export type Bucket = { key: string; count: number };
export type HrThemes = { company: { slug: string; name: string; domain: string | null }; stories: number; requests: number | null; stages: Bucket[]; outcomes: Bucket[] };
export const fetchHr = (slug: string) => api<HrThemes>(`/v1/voice/hr/${slug}`);

export type Pulse = { company: { slug: string; name: string } } & (
  | { locked: true; stories: number; need: number }
  | { locked: false; stories: number; requests: number | null; medianDaysToReply: number | null; repliedSample: number | null; outcomes: Bucket[]; outcomesHidden: number; quietStages: Bucket[]; quietHidden: number; flagTrend: { month: string; value: number | null }[]; flagNow: number | null }
);
export const fetchPulse = (slug: string) => api<Pulse>(`/v1/voice/companies/${slug}/pulse`);

// ---------- reply pledges (backend/src/pledges.ts) ----------

export function usePledge(slug: string) {
  const qc = useQueryClient();
  const key = ["pledge", slug];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ pledge: Pledge | null; viewerIsRep: boolean }>(`/v1/voice/companies/${slug}/pledge`), enabled: apiEnabled, staleTime: 60_000 });
  useLive(apiEnabled ? `company:${slug}` : null, () => void qc.invalidateQueries({ queryKey: key }));
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  return {
    data: q.data ?? null,
    make: async (days: 7 | 14 | 30) => { await api(`/v1/voice/companies/${slug}/pledge`, { method: "POST", body: { days } }); await refresh(); },
    withdraw: async () => { await api(`/v1/voice/companies/${slug}/pledge/withdraw`, { method: "POST" }); await refresh(); },
  };
}

export type RequestKind = "removal" | "factual_error";
export type Relationship = "author" | "company" | "subject" | "other";
export const sendContentRequest = (b: { kind: RequestKind; targetUrl: string; email: string; relationship: Relationship; details: string; captchaToken?: string | undefined }) =>
  api<{ reference: string; acknowledgeHours: number; resolveDays: number }>("/v1/voice/requests", { method: "POST", body: b });
