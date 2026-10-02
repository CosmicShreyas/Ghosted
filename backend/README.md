# Ghosted API

TypeScript API for Ghosted: [Hono](https://hono.dev) on Vercel, with Supabase (Postgres + Auth).
It is part of the source-available Ghosted repository and is covered by the root [license](../LICENSE.md).

## Setup

1. **Create a Supabase project** (free tier). Then:
   - Open **SQL Editor** and run the complete `supabase/init_database.sql` once. See `supabase/README.md` for the schema reference and security notes.
   - Sign-up emails (6-digit codes) are sent by this API through Gmail SMTP, not by Supabase. Users are created already confirmed once their code checks out.
   - Enable 2-Step Verification on the dedicated Gmail account, create one Google App Password, and follow the email settings in `env.example`. The same credential sends OTPs, security notices, notifications, and digests. Run `npx tsx scripts/preview-email.ts` to see the email in a browser.
   - **Authentication → URL Configuration**: set *Site URL* to your frontend URL.
2. **Configure secrets**: `cp env.example .env`, then fill in the values from *Project Settings → API*.
   Generate `IP_HASH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **Run locally**: `npm install`, then `npm run dev`. The API prints its development address when ready.
4. **Point the frontend at it**: in the repo root `.env`, set `VITE_API_URL` to the address printed by the API.

Before opening a pull request that changes the API, run `npm run typecheck` in this directory.

## Deploy to Vercel

1. Import the repo in Vercel as a new project and set **Root Directory** to `backend`. Vercel detects Hono automatically (`src/index.ts`).
2. Add every variable from `env.example` under *Settings → Environment Variables*. Set `ALLOWED_ORIGINS` to your frontend's URL.
3. Deploy, then set `VITE_API_URL=/api` on the public frontend project; the root `vercel.json`
   proxies that same-origin path to this API so member session cookies work. The admin project may
   continue using the API's full URL because admin authentication uses explicit bearer tokens.

## Security model

- **The database is closed to the public.** Every table has RLS enabled and no policies, so the anon key can't read anything. Only this API, using the service-role key, can.
- **No internal IDs leave the API.** User, story and company UUIDs stay on the server. URLs use random 15-digit `publicId`s, and the author's UUID is never returned.
- **Anonymity is enforced on the server.**
  - Real details are returned only if the user turned on `show_real`, and only the fields listed in `shared_fields`.
  - Anonymous stories by users who have revealed their identity show a masked author with no link to them.
  - Public profiles of revealed users hide their anonymous stories.
- **Auth** uses Supabase JWTs, which are checked on every request with `auth.getUser`.
  - Passwords must be 10–72 characters.
  - Sign-up and forgot-password give the same response whether or not the email exists, so accounts can't be discovered.
  - Log-out revokes the refresh token on the server.
- **Sessions:** tokens never reach page JavaScript ([src/session-cookies.ts](src/session-cookies.ts)).
  - Access and refresh tokens live in two **HttpOnly, Secure, SameSite=Lax** cookies, each **AES-256-GCM encrypted**, so any change is detected.
  - Every issue uses a **new random cookie name and IV**. The server finds its cookies by decrypting them, not by name.
  - Lifetimes: access cookie 3 days, refresh cookie 30 days (renewed on every refresh).
  - If the access token has expired, the next request **refreshes on the server** and sets new cookies, so users never see a log-in bounce.
  - CSRF: requests that change data need the `X-Ghosted-Client: web` header, and CORS only allows listed origins, with credentials.
  - For long access tokens, set Supabase → **Authentication → Sessions / JWT expiry** to `259200` (3 days). Otherwise Supabase's default 1-hour tokens are just refreshed quietly.
  - **Hosting:** cookies only flow when the frontend and API are the *same site*, such as `localhost` on different ports. Two separate `*.vercel.app` project domains count as different sites, so the frontend deployment must proxy API requests through its own Vercel URL. Do not point the browser directly at a separate backend `*.vercel.app` URL when using these cookies.
- **Rate limiting** uses fixed windows stored in Postgres, so it works across all serverless instances. It's keyed by an HMAC of the IP address (raw IPs are never stored), or by user ID for logged-in actions. Responses include `RateLimit-*` headers and `Retry-After`.

  | Action | Limit |
  |---|---|
  | Send a sign-up or reset code | Per IP: 6 per 15 minutes and 20 per day. Per email: 60 s between codes, 5 per hour, 10 per day |
  | Check a code | Per IP: 20 per 15 minutes. Per email: 15 per hour. Per code: 5 wrong tries, then it locks |
  | Sign-up | 8 per hour per IP |
  | Log-in | 15 per 15 minutes per IP |
  | Post a story | 8 per hour and 25 per day per user, plus 1 per company every 30 days |
  | Comment | 30 per hour per user |
  | Reaction | 90 per minute per user |
  | Report | 15 per hour per IP |
  | Reads | 180 per minute per IP |

- **Hardening:**
  - Strict CORS allow-list.
  - Secure headers (HSTS, CSP `default-src 'none'`, nosniff, no framing, no referrer).
  - 32 KB body limit.
  - JSON-only requests that change data.
  - Every input is validated with Zod, and control and bidirectional-override characters are stripped.
  - Logged-in responses are marked `no-store`.
  - Errors return a request ID and never show internals.
- **Bot protection: Ghosted Shield** ([src/captcha.ts](src/captcha.ts)). It's our own system, with no third party, and it runs on log-in, sign-up codes, forgot password and posting stories.
  1. **Proof-of-work.** An HMAC-signed puzzle (`GET /v1/captcha`) that takes about a second for a person and has to be paid on every bot attempt. Puzzles are single-use and expire in 5 minutes.
  2. **Environment and behaviour scoring.** Automation markers (`webdriver`, headless browsers, synthetic events) are blocked. Robotic pointer paths, machine-regular typing, instant submits and zero input add risk.
  3. **Escalation.** A risky session gets a ~5x harder puzzle plus a "hide the ghost" drag to a signed random spot, and the drag's path is checked too.

  Only aggregate numbers are collected (no keystrokes, no coordinates). A determined, custom-built bot can still fake browser signals; the rate limits are the backstop.
- **Account deletion (the DPDP right to erasure):** `DELETE /v1/me` removes the auth user, and the database deletes their profile, stories, reactions and comments with it.

## Compression

Story bodies and comments are stored as `bytea`, compressed with Brotli level 11 in text mode ([src/lib/compression.ts](src/lib/compression.ts)).
- Each value starts with 1 codec byte (0 = raw, 1 = Brotli). Anything Brotli can't shrink is stored raw, so a value never grows by more than that 1 byte.
- Postgres's own compression is turned off for these columns, because the data is already compressed.
- Run `npx tsx scripts/bench-compression.ts` to compare gzip, deflate, Brotli and zstd (with and without a custom dictionary) on sample text.

## Endpoints (all under `/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/otp/send` | – | Email a 6-digit code (`email`, optional `name`). 60 s resend cooldown |
| POST | `/auth/otp/verify` | – | Check the code (5 tries, 10 min) and get a 20-minute `verificationToken` |
| POST | `/auth/signup` | – | Create account: `fullName`, `email`, `password`, `verificationToken`, `acceptTerms: true`, optional `handle`, `avatarSeed`, `pastel` |
| POST | `/auth/login` | – | Get a session |
| POST | `/auth/refresh` | – | Swap refresh token for a new session |
| POST | `/auth/password/forgot` | – | Email a 6-digit reset code (only if the account exists, but the response is always the same) |
| POST | `/auth/password/reset` | – | `email`, `code`, `password`: sets the new password, logs out other devices, returns a session |
| POST | `/auth/logout` | ✓ | Revoke session |
| GET / PATCH / DELETE | `/me` | ✓ | Own profile, privacy settings, handle re-roll, delete account (`{"confirm":"DELETE"}`) |
| GET | `/me/stories` | ✓ | Own stories |
| GET | `/stats` | – | Landing-page numbers |
| GET | `/companies?sort=score\|worst\|stories\|recent&q=` | – | Rated companies / search |
| GET | `/companies/:slug` | – | Company scores + recent stories |
| POST | `/companies` | ✓ | Add a company |
| GET | `/stories?company=&outcome=&before=&limit=` | – | Feed (cursor pagination) |
| GET / DELETE | `/stories/:publicId` | – / ✓ | Read / remove own story |
| POST | `/stories` | ✓ | Post a story |
| POST | `/stories/:publicId/reactions` | ✓ | Toggle `relatable` / `flag` |
| GET / POST | `/stories/:publicId/comments` | – / ✓ | Read / add comments |
| DELETE | `/stories/:publicId/comments/:commentId` | ✓ | Remove own comment |
| POST | `/stories/:publicId/report` | – | Report a story |
| GET | `/profiles/:publicId` | – | Public pseudonym profile |

Errors always look like `{ "error": { "code": "...", "message": "...", "fields"?: {...} } }`.

## Moderation

Reports land in the `reports` table and are managed through the separately deployed admin panel. Hidden and removed stories disappear from every endpoint.
