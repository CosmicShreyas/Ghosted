# Ghosted Supabase database

This folder contains the complete database setup for a new Ghosted Supabase project.

## Install

1. Create a fresh Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Open [`init_database.sql`](./init_database.sql), copy the whole file, and run it once.
4. Wait for a successful result before starting the API.
5. Configure the API values described in `backend/env.example`; never place the service-role key in the frontend.

The initializer includes the platform's major-company catalogue. To add that catalogue to an
already initialized database, run [`major_companies.sql`](./major_companies.sql) once in the
Supabase SQL Editor. It is idempotent, so running it again safely skips existing slugs or domains.

The initializer contains the former migrations `0001` through `0021` in their original order. Its `-- Source:` headings are traceability markers only. It is intended for a fresh database, not as a repeatable reset script. Running it against a populated or partially initialized database is not supported because the earliest schema statements deliberately use plain `create table`.

The API is the only database client. Row Level Security is enabled on application tables; `anon` and `authenticated` are denied direct access, while the backend uses Supabase's `service_role` key. Internal UUIDs stay server-side. Routes and public payloads use the unique 15-digit `public_id` values.

## Core identity and content

### `profiles`

One application profile for each `auth.users` account.

- `id`: internal Auth user UUID and primary key.
- `public_id`: random 15-digit identifier used in URLs and public API data.
- `handle`: anonymous display name; it is not unique and must not be used as identity.
- `avatar_seed`, `pastel`: Open Peeps avatar seed and display colour.
- `show_real`: whether the member elected to expose selected real-profile fields.
- `details_z`: compressed, AES-256-GCM-encrypted private details such as name, role, experience, city and LinkedIn.
- `shared_fields`: allow-list of encrypted detail keys that may be shown when `show_real` is true.
- `tone`: `sassy` or `calm`, used by interface and email copy.
- `notify`: member email choices: `relatable`, `chitchatReplies`, `newFollowers`, `flaggedCompanies`, and `weeklyDigest`.
- `email_theme`: `light` or `dark` email palette.
- `mfa_method`: `none`, `totp`, or `email`.
- `totp_secret_z`, `totp_pending_z`: encrypted active and pending authenticator secrets.
- `totp_last_step`: last accepted TOTP time step, preventing code replay.
- `recovery_z`: encrypted collection of hashed one-use recovery codes.
- `digest_sent_at`: last time the weekly digest account was evaluated/sent.
- `kind`: `person` or `bot`; Goofy is a bot profile.
- `posting_paused_until`: end of a posting-only timeout.
- `goofy_welcomed`: prevents duplicate Goofy welcome messages.
- `banned_at`: when an account suspension began; null means not banned.
- `banned_until`: timed suspension end; null while `banned_at` is set means permanent.
- `ban_reason`: moderator reason shown to the member.
- `created_at`: profile creation time.

### `companies`

Community-maintained company catalogue.

- `id`: internal UUID.
- `slug`: unique public company URL key.
- `name`, `color`, `summary`: display identity and short description.
- `created_by`: member who listed it; null when unavailable.
- `domain`: normalized registrable domain, unique when present.
- `website`, `careers_url`, `logo_url`: verified HTTPS URLs.
- `about`: longer company description.
- `industry`: controlled industry category.
- `size`: `1-10`, `11-50`, `51-200`, `201-1000`, `1001-5000`, or `5000+`.
- `hq_city`, `founded`: headquarters and founding year.
- `status`: `listed` or moderator-hidden `hidden`.
- `created_at`: listing time.

### `stories`

Anonymous hiring-experience stories.

- `id`: internal UUID; `public_id`: 15-digit story URL ID.
- `author_id`, `company_id`: internal profile and company relations.
- `outcome`: `ghosted`, `rejected`, `offer`, `offer_revoked`, or `ghost_job`.
- `stage`: `application`, `screening`, `technical`, `final`, or `offer`.
- `job_role`, `title`: display metadata.
- `body_z`: Brotli-compressed UTF-8 story body.
- `rating_hiring`, `rating_communication`, `rating_culture`, `rating_pay`, `rating_growth`: 1–5 ratings.
- `rating_avg`: derived cached rating used for company sorting.
- `salary_min_lpa`, `salary_max_lpa`: optional annual salary range in lakh rupees.
- `days_waited`: optional wait length, 0–730 days.
- `anonymous`: whether the story uses the anonymous identity.
- `status`: `published`, `pending`, `hidden`, or `removed` after moderation extensions.
- `moderation`: Goofy's decision, score and reasons as JSON.
- `edited_at`, `created_at`: edit and creation timestamps.

### `comments`

Public story chitchats and replies.

- `id`: internal UUID; `public_id`: public 15-digit ID.
- `story_id`, `author_id`: owning story and author.
- `parent_id`: optional parent comment for a reply thread.
- `body_z`: Brotli-compressed body.
- `status`: `published`, `pending`, or `removed`.
- `moderation`: Goofy moderation JSON.
- `edited_at`, `created_at`: edit and creation times.

### Reactions and social relationships

- `reactions`: one active positive reaction per person and story, selected from `relatable`, `insightful`, `creative`, `support`, or `love`; the API replaces the previous selection and `created_at` records when.
- `comment_reactions`: one relatable reaction per `(comment_id, user_id)`.
- `follows`: member-to-member follows; `notify` controls new-story alerts.
- `mutes`: member-to-member mute relationships.
- `company_follows`: followed companies; `notify` controls immediate company alerts.

## Reports and moderation

### Report tables

- `reports`: story reports with `reason`, optional `details`, reporter, resolution state and time.
- `comment_reports`: equivalent reports for chitchats.
- `profile_reports`: profile reports (`impersonation`, `harassment`, `spam`, `identifies_person`, `fake_stories`, `other`).
- `company_reports`: listing reports (`fake`, `wrong_website`, `duplicate`, `offensive`, `other`).
- Story and comment reports also store `priority`, `auto_hidden`, final `outcome` (`upheld` or `dismissed`) and `resolved_at`.

### Goofy and automation

- `moderation_terms`: active/retired vocabulary. `tier` is `slur`, `severe`, `profanity`, or `watch`; `source` identifies imported, learned or variant data; `weight`, `pattern`, `exceptions`, and `evidence` explain matching.
- `moderation_allow`: terms that must never be flagged and the reason they are safe.
- `search_concepts`: learned `(seed, term)` associations, confidence `weight`, supporting document count and update time.
- `automation_runs`: one row per job with its last run and JSON statistics.
- `goofy_actions`: append-style history of Goofy's moderation, report, welcome, alert, escalation and learning actions. Public-safe story/company pointers are separate from private `user_id` strike tracking.

## Member features

### `applications`

Private Waiting Room entries.

- `public_id`: 15-digit application ID; `user_id`: owner.
- `company_id`: optional listed company; `company_name`: durable display name.
- `role`, `stage`: job and hiring stage.
- `status`: `waiting` or `closed`.
- `outcome`: final result, including `withdrew`.
- `applied_on`, `waiting_since`: start and most recent employer-contact dates.
- `followups`, `last_followup`: follow-up count and date.
- `note_z`: sealed private note.
- `story_id`: optional story created from the application.
- `closed_at`, `created_at`, `updated_at`: lifecycle times.

### `feedback`

Member submissions from the feedback area.

- `kind`: `bug`, `feature`, `feedback`, or mood `pulse`.
- `title`, `body`, `area`: submission content and app area.
- `severity`: `minor`, `annoying`, or `blocking`; `rating`: 1–5.
- `steps`, `device`: reproduction instructions and non-identifying device JSON.
- `status`: `new`, `seen`, `planned`, `in_progress`, `done`, or `wont_do`.
- `reply`: team response shown to the author.
- `public_id`, `user_id`, `created_at`, `updated_at`: public reference, author and timestamps.

### `donations`

Razorpay donation ledger.

- `amount_paise`: INR amount in paise, constrained to ₹10–₹1,00,000.
- `currency`: always `INR`.
- `razorpay_order_id`, `razorpay_payment_id`: unique provider references.
- `status`: `created`, `paid`, or `failed`.
- `message`, `show_name`: optional wall message and attribution choice.
- `public_id`, `user_id`, `created_at`, `paid_at`: reference, donor and times.

### `notifications`

In-app notification inbox.

- `public_id`, `user_id`: public notification ID and recipient.
- `kind`: `relatable`, `reply`, `company`, `system`, `following`, `follower`, or `goofy`.
- `body`: already-worded message, maximum 300 characters.
- `story_public_id`, `profile_public_id`, `company_slug`: optional public link targets.
- `created_at`, `read_at`: delivery and read times.

## Sessions, mail safety and live updates

- `session_devices`: one row per member session/device. Stores Supabase `session_id`, public device ID, kind, browser, OS, coarse location, keyed `device_hash`, masked IP, keyed `ip_hash`, and activity timestamps. Raw IP addresses are not stored.
- `email_otps`: keyed email hash, hashed code, expiry, attempts and resend time. It never stores email addresses or OTPs in clear text.
- `rate_limits`: counter per hashed/derived key and time window.
- `live_versions`: monotonically increasing topic versions used by polling clients.
- `ip_bans`: keyed IP hash, optional masked display value, reason, associated public member ID, banning admin, expiry and creation time.

## Admin panel

### `admin_users`

Separate admin identities; these are not member profiles.

- `email`, `name`: lowercase login identity and display name.
- `password_hash`: scrypt password hash; nullable until first-time setup.
- `role`: `owner`, `admin`, `moderator`, or `viewer`.
- `permissions`: optional custom permission array overriding role defaults.
- `active`, `disabled_at`, `disabled_by`: access state and deliberate disable record.
- `failed_attempts`, `locked_until`, `last_login_at`: login protection and history.
- `setup_code_hash`, `setup_expires_at`, `setup_attempts`, `from_env`: first-time setup state and whether `ADMIN_EMAILS` owns the account definition.
- `avatar_seed`, `tone`, `email_theme`: admin presentation and email preferences.
- `notify`, `notif_seen_at`: bell/email choices and last notification read time.
- `mfa_method`, `totp_secret_z`, `totp_pending_z`, `totp_last_step`, `recovery_z`: two-step state.
- `mfa_code_hash`, `mfa_expires_at`, `mfa_attempts`: short-lived email MFA challenge.
- `added_by`, `created_at`: provenance and creation time.

### `admin_sessions`

- `admin_id`: session owner.
- `token_hash`: SHA-256 access-token hash; raw access tokens are memory-only in the browser.
- `refresh_hash`, `prev_refresh_hash`: current and retired refresh-token hashes for rotation/reuse detection.
- `expires_at`, `session_expires_at`, `revoked_at`: access, absolute session and revocation times.
- `rotations`: refresh count; `last_used_at`, `created_at`: activity times.
- `ip_hash`, `user_agent`, `device_hash`: keyed connection/device identity and browser description.

### Admin control tables

- `admin_audit`: immutable admin action ledger with preserved admin name, action, target type/reference, JSON detail and timestamp. A trigger rejects updates and deletes.
- `platform_settings`: JSON value per platform switch/setting key, plus updater and timestamp.

## Views

- `company_scores`: listed-company details plus story count, category/overall scores, salary range, outcome counts, average wait and latest story time. Each category averages only the stories that rated it and has a matching `count_*` column ("based on N stories"); `flag_score` is the average over stories of `(rating_avg - 1) * 25`.

### Invites, missions and flair

`profiles.ref_code` is a member's private invite code (unique, created on first use); `referred_by` and `referred_at` record who invited a member, set when the profile is created from sign-up metadata (never self, never from the inviter's own network). A "voice" is an invited member with a published story; rewards count voices only. Missions are computed live from existing activity. `profiles.flair` is the cosmetic a member picked from what they've unlocked (`backend/src/referral.ts`). The section is at the end of `init_database.sql` and is safe to run again.

### Waiting for a company's first story

`company_interest` records members who tapped "I want to know about this company" on a page with no stories (primary key: company and member). Company pages show how many are waiting. When a story about the company is published, `backend/src/interest.ts` sends each waiting member one in-app notification and one email, then sets `notified_at`. Stories published by other routes (Goofy releasing a held story, an admin approving one) are picked up by the automation sweep. The section is at the end of `init_database.sql` and is safe to run again.

### Ratings by journey

A story carries only the ratings that fit what happened: hiring and communication always; pay (and salary) for `offer` and `offer_revoked`; culture and growth only for `offer` with `joined = true`. The five `rating_*` columns are nullable, `stories.joined` and `stories.quick` record the journey and the quick path, and `rating_avg` is the mean of the ratings present. The API enforces the same rules (`backend/src/score.ts`, checked by `npx tsx scripts/check-score.ts`). The section is at the end of `init_database.sql` and is safe to run again on an existing database.
- `platform_stats`: aggregate counts for profiles, companies, published stories, reactions and comments.
- `story_counts`: per-story counts for each positive reaction plus published chitchats. Its legacy `flags` column remains zero for older analytics consumers; moderation uses reports instead of public dislike reactions.

### Existing database reaction upgrade

Before deploying backend code that uses the five-reaction picker, run this once in the Supabase SQL editor. It removes legacy public red-flag reactions; formal reports are stored separately and are not affected.

```sql
begin;

drop view if exists public.story_counts;
delete from public.reactions where kind = 'flag';
alter table public.reactions drop constraint if exists reactions_kind_check;
alter table public.reactions add constraint reactions_kind_check
  check (kind in ('relatable','insightful','creative','support','love'));
alter table public.reactions drop constraint if exists reactions_pkey;
alter table public.reactions add primary key (story_id, user_id);

create view public.story_counts as
select
  s.id as story_id,
  count(r.*) filter (where r.kind = 'relatable')::int as relatable,
  count(r.*) filter (where r.kind = 'insightful')::int as insightful,
  count(r.*) filter (where r.kind = 'creative')::int as creative,
  count(r.*) filter (where r.kind = 'support')::int as support,
  count(r.*) filter (where r.kind = 'love')::int as love,
  0::int as flags,
  (select count(*) from public.comments c where c.story_id = s.id and c.status = 'published')::int as comments
from public.stories s
left join public.reactions r on r.story_id = s.id
group by s.id;

revoke all on public.story_counts from anon, authenticated;
grant select on public.story_counts to service_role;
commit;
```

## Service-role functions

- `gen_public_id()`: generates non-sequential 15-digit public IDs.
- `rate_limit_hit(key, seconds)`: atomically increments a window and returns its hit count.
- `rate_limit_peek(key, seconds)`: reads the current count without incrementing it.
- `user_id_by_email(email)`: service-only Auth lookup used by signup duplicate checks and password recovery.
- `live_sessions(user)`: returns current Supabase session IDs for a member.
- `revoke_session(user, public_id)`: revokes one owned member session.
- `replace_device_sessions(...)`: replaces older sessions from the same recognized device.
- `live_bump(keys)`: atomically advances live-update topic versions.
- `admin_audit_append_only()`: trigger function that prevents audit mutation.

## Security invariants

- Never expose internal UUIDs; use `public_id` or company `slug` outside the API.
- Never expose `service_role`, encryption, session-cookie or hashing secrets to either frontend.
- Encrypted `_z` and compressed `body_z` values are opaque to SQL clients; decode them only through backend helpers.
- RLS plus revoked `anon`/`authenticated` privileges is intentional. Do not add browser-facing table policies; the frontend calls the API.
- `admin_audit` is append-only. Corrections are new audit events, not edits.
- A null `banned_until` with non-null `banned_at`, or null `ip_bans.expires_at`, means the ban is permanent until lifted.
