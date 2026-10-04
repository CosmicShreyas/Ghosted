// Ask candidates (company Q&A), Right of Reply and removal / correction requests, on the site side.
// The rules live in backend/src/routes/company-voice.ts. Without the API (preview mode) these
// sections show their empty state.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiEnabled } from "@/lib/api";
import { useLive } from "@/lib/live";

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

export type RequestKind = "removal" | "factual_error";
export type Relationship = "author" | "company" | "subject" | "other";
export const sendContentRequest = (b: { kind: RequestKind; targetUrl: string; email: string; relationship: Relationship; details: string; captchaToken?: string | undefined }) =>
  api<{ reference: string; acknowledgeHours: number; resolveDays: number }>("/v1/voice/requests", { method: "POST", body: b });
