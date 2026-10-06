# Application routes

TanStack Start uses file-based routing. Every `.tsx` file in this directory defines a route, and `__root.tsx` is the shared application shell.

| File | Public URL |
| --- | --- |
| `index.tsx` | `/` |
| `auth.tsx` | `/auth` |
| `dashboard.tsx` | `/dashboard` (`?view=` selects a dashboard view) |
| `u.$id.tsx` | `/u/:id` using a 15-digit public user ID |
| `c.$slug.tsx` | `/c/:slug` |
| `compare.tsx` | `/compare?a=:slug&b=:slug` (two companies side by side; noindex) |
| `s.$id.tsx` | `/s/:id` using a 15-digit public story ID |
| `feedback.tsx` | `/feedback` |
| `invite.tsx` | `/invite` (levels, XP and streaks, your level and invite link; `?ref=CODE` is the landing for an invite link) |
| `for-hr.tsx` | `/for-hr` (public front door for companies: what HR gets and can never do, anonymity, "Verify as {company}"; `?company=slug` adds request counts and stage/outcome counts, `&story=<id>` the story an author pointed them to) |
| `pulse.$slug.tsx` | `/pulse/$slug` (Company Pulse: private aggregates for that company's verified reps, printable one-page summary; `noindex`, disallowed in robots.txt) |
| `about.tsx`, `privacy.tsx`, `terms.tsx`, `community.tsx` | Company and legal pages |
| `moderation.tsx` | `/moderation`: how moderation works (automatic checks, held posts, reports, strikes, human review, appeals). Content: `moderationDoc` in `src/content/legal.ts`, kept in step with the backend rules |

Do not expose database UUIDs in route parameters. Do not create `src/pages/`, Next.js layouts, or additional routes without an approved product need. `routeTree.gen.ts` is generated automatically and must not be edited by hand.
