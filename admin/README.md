# Ghosted Admin

The moderation and operations panel. Source-available like the rest of Ghosted, built from the same
components and styles, but a **separate app**: it lives in `admin/`, builds on its own, and is never
part of the public site's bundle. Nothing on ghosted links to it.

## How it stays safe

- **Separate admin accounts.** Admins are not Ghosted users: their own table (`admin_users`),
  passwords hashed with scrypt, created only from the command line. Nobody can become an admin from
  the website.
- **Sign-in** needs email, password and the same human check as the site. Five wrong passwords lock
  the account for 15 minutes; there's also a per-IP limit. Unknown emails take as long as real ones,
  so timing doesn't reveal who's an admin.
- **Sessions** use an access token (15 minutes, kept only in memory) and a refresh token (kept in
  `sessionStorage`, gone when the tab closes). Every refresh retires the old refresh token; if a
  retired one is ever used again, the session is revoked on the spot. Sessions end 8 hours after
  sign-in regardless. Only hashes of the tokens are stored. Nothing renders until the server
  confirms the session, and the sign-in screen isn't reachable while you're signed in.
- **Two-step sign-in** (Settings): authenticator app or email codes, plus one-time recovery codes.
- **Roles and permissions** (Team): owner, admin, moderator, viewer, each with a default set of
  permissions an owner can change per person. Owners can switch anyone's sign-in off; it stays off
  even for people listed in `ADMIN_EMAILS`. The server checks the permission on every request.
- **The admin API** (`/v1/admin/*`) only answers requests from `ADMIN_ORIGINS` that carry a live
  session. Everything else gets a plain 404, so it can't even be confirmed to exist.
- **Audit log.** Every action is recorded; the database refuses edits and deletes to it.
- **Privacy.** By default the panel shows what was posted and the public handle only. Admins with
  the "private" permission (owners have it) can open a member's email, real name and sign-in
  devices (with masked IPs); each look is written to the audit log. Raw IPs are never stored: IP
  bans use a keyed hash. There is no "sign in as a member".
- **Content Security Policy** in `index.html` and `noindex` so it never shows up in search.

## Who the admins are

Admins are listed in the API's environment, with no passwords:

```
ADMIN_EMAILS=you@example.com:Your Name:owner,teammate@example.com:Their Name:moderator
```

Each person opens the panel → **First time here, or forgot your password?** → gets a 6-digit code
by email (15 minutes, 5 tries) → sets their own password (14+ characters). Nobody else ever sees
it, and it works on Vercel with no console. Taking someone out of the list switches their account
off and ends their sessions within a minute. The same flow resets a forgotten password.

(`cd backend && npm run admin:create` still works from your own machine, as an alternative.)

## Run it locally

1. Run the complete `backend/supabase/init_database.sql` in Supabase. It includes the admin schema.
2. In `backend/.env`: `ADMIN_ORIGINS=http://localhost:5300` and your `ADMIN_EMAILS`.
3. Start (or restart) the API (`cd backend && npm run dev`) and the panel (`npm run admin:dev`),
   open http://localhost:5300 and choose **Set your password**.

## Deploy

Create a **second Vercel project** from the same repository:

- Build command: `npm run admin:build`
- Output directory: `dist-admin`
- Environment variables: `VITE_API_URL` (the API) and `VITE_SITE_URL` (the public site, for
  "open on Ghosted" links)

Give it an address you don't publish, then in the **API** project's environment variables add that
exact address to `ADMIN_ORIGINS`, and set `ADMIN_EMAILS`. Redeploy the API, open the panel and set
your passwords.

For a second lock in front of the sign-in page, turn on **Vercel Deployment Protection** (Settings →
Deployment Protection) or put **Cloudflare Access** in front of the domain. Then strangers who find
the address meet a sign-in wall before the panel even loads.
