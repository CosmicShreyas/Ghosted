# Application routes

TanStack Start uses file-based routing. Every `.tsx` file in this directory defines a route, and `__root.tsx` is the shared application shell.

| File | Public URL |
| --- | --- |
| `index.tsx` | `/` |
| `auth.tsx` | `/auth` |
| `dashboard.tsx` | `/dashboard` (`?view=` selects a dashboard view) |
| `u.$id.tsx` | `/u/:id` using a 15-digit public user ID |
| `c.$slug.tsx` | `/c/:slug` |
| `s.$id.tsx` | `/s/:id` using a 15-digit public story ID |
| `feedback.tsx` | `/feedback` |
| `about.tsx`, `privacy.tsx`, `terms.tsx`, `community.tsx` | Company and legal pages |

Do not expose database UUIDs in route parameters. Do not create `src/pages/`, Next.js layouts, or additional routes without an approved product need. `routeTree.gen.ts` is generated automatically and must not be edited by hand.
