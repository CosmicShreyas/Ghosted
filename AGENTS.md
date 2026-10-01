> [!IMPORTANT]
> Avoid rewriting published Git history. Do not force push, rebase, amend, or squash commits that
> have already been pushed unless a maintainer explicitly coordinates it.

- The API lives in `backend/` (Hono + Supabase, deployed to Vercel as its own project). See `backend/README.md`. Secrets go only in `backend/.env`; never commit them or reference the service-role key from the frontend.
- The frontend talks to the API only through `src/lib/api.ts`. When `VITE_API_URL` is unset, it falls back to mock content from `src/mock/data.ts` so local UI development works without external services. Company and legal page copy lives in `src/content/legal.ts`.
- Never expose internal UUIDs; URLs use the 15-digit `publicId`. Handles are display names only and aren't unique.
- Routes (TanStack Router, file-based in `src/routes/`): `/` landing, `/auth`, `/dashboard` (`?view=` opens a view), `/u/$id` (a person's page, by 15-digit publicId), `/c/$slug` (a company's page), `/s/$id` (one story, where shared links go), `/feedback` (signed-in: feedback, bug reports, contributing, donations via Razorpay), plus the company/legal pages `/about`, `/privacy`, `/terms`, `/community`. Don't add other routes without being asked.
- The admin panel is a separate app in `admin/` (`npm run admin:dev`, built with `vite.admin.config.ts` to `dist-admin/`, deployed as its own Vercel project). It reuses `src/` components and styles through `@`, but nothing in `src/` may import from `admin/`, and the public site must never link to it. Its API is `/v1/admin/*` (see `admin/README.md`).
- Shared header/footer live in `src/components/site-chrome.tsx`; the legal pages share `src/components/legal-page.tsx`.
- Live updates go through `src/lib/live.ts` (`useLive(topic, onChange)`); the backend bumps topics with `bump()` in `backend/src/live.ts` after every change. It polls today and is built to switch to WebSockets without changing callers.
- No direct messages between users, ever (product decision: this isn't a social or dating app). People interact only in public: stories, chitchats (comments), reactions, follows and story alerts.
- Animations use Motion (`motion/react`). No emojis in the UI; use lucide-react icons.
- Anonymous handles come from `src/lib/handles.ts` (`handleFromSeed` for stable mock users, `randomHandle` for re-rolls). Avatars are DiceBear Open Peeps via plain `<img>` URLs.
- Legal copy targets Indian law (DPDP Act 2023 and Rules 2025, IT Act 2000, Intermediary Rules 2021). Placeholders in the `entity` object must be filled before launch.
