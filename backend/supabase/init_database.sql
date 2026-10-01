-- Ghosted database initializer
-- Generated from the original ordered migrations 0001 through 0021.
-- Run once in Supabase SQL Editor on a fresh project.
-- Keep the order intact: later sections extend and repair earlier schema.

-- ============================================================================
-- Source: 0001_init.sql
-- ============================================================================
-- Ghosted schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Every table has RLS enabled with NO policies: the anon/authenticated keys can't read anything.
-- Only the backend, using the service-role key, touches these tables, so author identities never leak.

create extension if not exists pgcrypto;

-- Large random public IDs (15 digits). These are the only IDs that ever appear in URLs or API responses.
create or replace function gen_public_id() returns bigint language sql volatile as $$
  select (100000000000000 + floor(random() * 899999999999999))::bigint;
$$;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  public_id     bigint not null unique default gen_public_id(),
  handle        text not null check (char_length(handle) between 3 and 40),
  avatar_seed   text not null check (char_length(avatar_seed) between 1 and 64),
  pastel        text not null default 'bg-avatar-mint',
  show_real     boolean not null default false,
  -- Full name + optional details, compressed and AES-256-GCM encrypted by the API (src/lib/sealed.ts).
  -- Only the keys listed in shared_fields are ever returned publicly, and only if show_real is on.
  details_z     bytea check (octet_length(details_z) <= 2048),
  shared_fields text[] not null default '{}'
                check (shared_fields <@ array['name','role','experience','city','linkedin']::text[]),
  created_at    timestamptz not null default now()
);

-- ---------- companies ----------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name       text not null check (char_length(name) between 2 and 80),
  color      text not null default 'bg-logo-violet',
  summary    text check (char_length(summary) <= 160),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- stories ----------
create table public.stories (
  id               uuid primary key default gen_random_uuid(),
  public_id        bigint not null unique default gen_public_id(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  company_id       uuid not null references public.companies (id) on delete cascade,
  outcome          text not null check (outcome in ('ghosted','rejected','offer','offer_revoked','ghost_job')),
  stage            text not null check (stage in ('application','screening','technical','final','offer')),
  job_role         text check (char_length(job_role) <= 80),
  title            text not null check (char_length(title) between 5 and 90),
  -- Brotli-compressed UTF-8 (see backend/src/lib/compression.ts). Length rules are enforced by the API.
  body_z           bytea not null check (octet_length(body_z) between 2 and 16384),
  rating_hiring        smallint not null check (rating_hiring between 1 and 5),
  rating_communication smallint not null check (rating_communication between 1 and 5),
  rating_culture       smallint not null check (rating_culture between 1 and 5),
  rating_pay           smallint not null check (rating_pay between 1 and 5),
  rating_growth        smallint not null check (rating_growth between 1 and 5),
  salary_min_lpa   numeric(6,2) check (salary_min_lpa >= 0),
  salary_max_lpa   numeric(6,2) check (salary_max_lpa >= salary_min_lpa),
  days_waited      smallint check (days_waited between 0 and 730),
  anonymous        boolean not null default true,
  status           text not null default 'published' check (status in ('published','hidden','removed')),
  created_at       timestamptz not null default now()
);
create index stories_company_idx on public.stories (company_id, created_at desc) where status = 'published';
create index stories_recent_idx  on public.stories (created_at desc) where status = 'published';
create index stories_author_idx  on public.stories (author_id);

-- ---------- reactions, comments, reports ----------
create table public.reactions (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('relatable','flag')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id, kind)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  public_id  bigint not null unique default gen_public_id(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body_z     bytea not null check (octet_length(body_z) between 2 and 4096), -- Brotli-compressed
  status     text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now()
);
create index comments_story_idx on public.comments (story_id, created_at);

-- Already compressed: tell Postgres not to spend CPU compressing again (TOAST would gain nothing).
alter table public.stories  alter column body_z set storage external;
alter table public.comments alter column body_z set storage external;

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('false_info','identifies_person','harassment','confidential','spam','other')),
  details     text check (char_length(details) <= 1000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- aggregates ----------
-- Ratings are 1–5; scores are 0–100.
create or replace view public.company_scores as
select
  c.id, c.slug, c.name, c.color, c.summary,
  count(s.id)::int as story_count,
  round(avg((s.rating_hiring - 1) * 25))::int        as score_hiring,
  round(avg((s.rating_communication - 1) * 25))::int as score_communication,
  round(avg((s.rating_culture - 1) * 25))::int       as score_culture,
  round(avg((s.rating_pay - 1) * 25))::int           as score_pay,
  round(avg((s.rating_growth - 1) * 25))::int        as score_growth,
  round(avg((s.rating_hiring + s.rating_communication + s.rating_culture + s.rating_pay + s.rating_growth - 5) * 5.0))::int as flag_score,
  min(s.salary_min_lpa) as salary_min_lpa,
  max(s.salary_max_lpa) as salary_max_lpa,
  count(*) filter (where s.outcome = 'ghosted')::int       as ghosted_count,
  count(*) filter (where s.outcome = 'offer_revoked')::int as revoked_count,
  round(avg(s.days_waited))::int as avg_days_waited,
  max(s.created_at) as last_story_at
from public.companies c
left join public.stories s on s.company_id = c.id and s.status = 'published'
group by c.id;

create or replace view public.platform_stats as
select
  (select count(*) from public.stories where status = 'published')::int as stories,
  (select count(distinct company_id) from public.stories where status = 'published')::int as companies,
  (select count(*) from public.stories where status = 'published' and outcome = 'ghosted')::int as ghosted,
  coalesce((select round(avg(days_waited)) from public.stories where status = 'published' and days_waited is not null), 0)::int as silence_days;

-- Views run with the caller's rights; keep them unreachable to anon as well.
revoke all on public.company_scores, public.platform_stats from anon, authenticated;

-- Per-story reaction/comment counts for feeds.
create or replace view public.story_counts as
select
  s.id as story_id,
  count(r.*) filter (where r.kind = 'relatable')::int as relatable,
  count(r.*) filter (where r.kind = 'flag')::int      as flags,
  (select count(*) from public.comments c where c.story_id = s.id and c.status = 'published')::int as comments
from public.stories s
left join public.reactions r on r.story_id = s.id
group by s.id;
revoke all on public.story_counts from anon, authenticated;

-- ---------- email verification codes ----------
-- One pending 6-digit code per email and purpose (sign-up or password reset).
-- The key is an HMAC of purpose + email, and the code is stored only as an HMAC too.
create table public.email_otps (
  email_hash   text primary key,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     smallint not null default 0,
  last_sent_at timestamptz not null default now()
);

-- ---------- rate limiting (fixed window, shared across all serverless instances) ----------
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 1,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- Records a hit and returns how many hits `key` has in the current window.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into rate_limits (key, window_start) values (p_key, v_window)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of old windows (~1% of calls).
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '1 day'; end if;
  return v_hits;
end $$;
revoke all on function public.rate_limit_hit(text, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int) to service_role;

-- Password reset needs to find an account by email. Service role only.
create or replace function public.user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = auth, public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- ---------- privileges ----------
-- Works with "Automatically expose new tables" OFF (recommended): only the backend's service role
-- gets access. anon/authenticated (the public keys) get nothing.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;

-- ---------- lock everything down ----------
alter table public.rate_limits enable row level security;
alter table public.email_otps  enable row level security;
alter table public.profiles  enable row level security;
alter table public.companies enable row level security;
alter table public.stories   enable row level security;
alter table public.reactions enable row level security;
alter table public.comments  enable row level security;
alter table public.reports   enable row level security;

-- ============================================================================
-- Source: 0002_shield.sql
-- ============================================================================
-- Ghosted Shield strikes: read a rate-limit counter without incrementing it.
-- Run this in the Supabase SQL editor after 0001_init.sql.
create or replace function public.rate_limit_peek(p_key text, p_window_seconds int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select hits from rate_limits
    where key = p_key
      and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)), 0);
$$;
revoke all on function public.rate_limit_peek(text, int) from public, anon, authenticated;
grant execute on function public.rate_limit_peek(text, int) to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Source: 0003_settings_2fa.sql
-- ============================================================================
-- Settings that live on the account (tone, notification choices) and two-factor authentication.
-- Run in the Supabase SQL editor after 0002_shield.sql.

alter table public.profiles
  -- "sassy" (default) or "calm": used for the site's copy AND every email we send you.
  add column if not exists tone text not null default 'sassy' check (tone in ('sassy','calm')),
  -- Which emails you want. Keys: relatable, chitchatReplies, flaggedCompanies, weeklyDigest.
  add column if not exists notify jsonb not null default '{"relatable":true,"chitchatReplies":true,"flaggedCompanies":false,"weeklyDigest":true}',
  -- Two-factor: 'none' | 'totp' (authenticator app) | 'email' (6-digit email code).
  add column if not exists mfa_method text not null default 'none' check (mfa_method in ('none','totp','email')),
  -- Authenticator secret, AES-256-GCM encrypted by the API (never stored in the clear).
  add column if not exists totp_secret_z bytea,
  -- Secret waiting for its first code during setup; promoted to totp_secret_z once confirmed.
  add column if not exists totp_pending_z bytea,
  -- Last 30-second step accepted, so a code can't be replayed within its window.
  add column if not exists totp_last_step bigint,
  -- One-time recovery codes, stored only as SHA-256 hashes (encrypted list).
  add column if not exists recovery_z bytea,
  add column if not exists digest_sent_at timestamptz;

notify pgrst, 'reload schema';

-- ============================================================================
-- Source: 0004_sessions.sql
-- ============================================================================
-- Devices you're signed in on (Settings → Security). Run in the Supabase SQL editor after 0003.
--
-- Supabase already keeps one row per sign-in in auth.sessions, but it records the API server's
-- details (the API signs in on your behalf), not your phone's or laptop's. This table adds what the
-- page needs, keyed by the same session id. No raw IP is stored: only a coarse, city-level location.

create table if not exists public.session_devices (
  session_id   uuid primary key,                 -- auth.sessions.id (never sent to the browser)
  public_id    bigint not null unique default gen_public_id(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('mobile', 'tablet', 'desktop')),
  browser      text not null,
  os           text not null,
  city         text,
  region       text,
  country      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists session_devices_user on public.session_devices (user_id, last_seen_at desc);

-- Service role only, like every other table (RLS on, no policies).
alter table public.session_devices enable row level security;
revoke all on public.session_devices from anon, authenticated;

-- The signed-in devices that are still alive. Rows whose Supabase session has ended (logged out,
-- expired, revoked) are tidied away first, so the list never shows ghosts. Pun intended.
create or replace function public.live_sessions(p_user uuid)
returns setof public.session_devices
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.session_devices d
  where d.user_id = p_user and not exists (select 1 from auth.sessions s where s.id = d.session_id);
  return query select * from public.session_devices d where d.user_id = p_user order by d.last_seen_at desc;
end $$;

-- Signs one device out: deleting the Supabase session also kills its refresh token, and its access
-- token stops working on the next request. Scoped to the owner, so nobody can end someone else's.
create or replace function public.revoke_session(p_user uuid, p_public_id bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  delete from public.session_devices where user_id = p_user and public_id = p_public_id returning session_id into sid;
  if sid is null then return false; end if;
  delete from auth.sessions where id = sid and user_id = p_user;
  return true;
end $$;

-- ---------- live updates ----------
-- One version number per topic ("feed" for everyone, "u:<user>:<topic>" for one account's devices,
-- sessions, stories…). Every change bumps it; open pages compare numbers and refetch only what moved.
-- Today pages poll /v1/live; a WebSocket push can later announce the same bumps.
create table if not exists public.live_versions (
  key        text primary key,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.live_versions enable row level security;
revoke all on public.live_versions from anon, authenticated;

create or replace function public.live_bump(p_keys text[])
returns void language sql security definer set search_path = '' as $$
  insert into public.live_versions as v (key, version) select k, 1 from unnest(p_keys) k
  on conflict (key) do update set version = v.version + 1, updated_at = now();
$$;
revoke all on function public.live_bump(text[]) from public, anon, authenticated;
grant execute on function public.live_bump(text[]) to service_role;

revoke all on function public.live_sessions(uuid) from public, anon, authenticated;
revoke all on function public.revoke_session(uuid, bigint) from public, anon, authenticated;
grant execute on function public.live_sessions(uuid) to service_role;
grant execute on function public.revoke_session(uuid, bigint) to service_role;

-- The API (service role) reads and writes these tables directly. New tables don't inherit the grant
-- from 0001, so it's given explicitly (without it: "permission denied for table live_versions").
grant select, insert, update, delete on public.session_devices, public.live_versions to service_role;

-- ============================================================================
-- Source: 0005_notifications.sql
-- ============================================================================
-- In-app notifications (the bell in the dashboard), with read state that survives refreshes and
-- syncs across devices. Run in the Supabase SQL editor after 0004_sessions.sql.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  public_id  bigint not null unique default gen_public_id(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- relatable | reply | company | system
  kind       text not null check (kind in ('relatable', 'reply', 'company', 'system')),
  -- Short, already-worded message (no personal data of other people: handles only).
  body       text not null check (char_length(body) <= 300),
  -- Optional story the notification is about (public id, for linking).
  story_public_id bigint,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_recent on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ============================================================================
-- Source: 0006_social.sql
-- ============================================================================
-- People pages: follow, story alerts (the bell), mute and report a person. Run in the Supabase SQL
-- editor after 0005. (An earlier version also seeded twelve sample companies; 0007 removes them,
-- and companies are now listed by people through the checked "List a company" flow.)

-- ---------- follows ----------
-- notify = the bell on someone's page: tell me when they post a new story.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  notify      boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee on public.follows (followee_id);

-- ---------- mutes ----------
-- "Keep them silent": their stories stop appearing in my feed. They're never told.
create table if not exists public.mutes (
  muter_id   uuid not null references public.profiles (id) on delete cascade,
  muted_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- ---------- reporting a person ----------
create table if not exists public.profile_reports (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('impersonation','harassment','spam','identifies_person','fake_stories','other')),
  details     text check (char_length(details) <= 1000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- New notification kinds: someone you follow posted; someone followed you.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('relatable', 'reply', 'company', 'system', 'following', 'follower'));
-- Optional person the notification is about (their public id, for linking to their page).
alter table public.notifications add column if not exists profile_public_id bigint;

alter table public.follows enable row level security;
alter table public.mutes enable row level security;
alter table public.profile_reports enable row level security;
revoke all on public.follows, public.mutes, public.profile_reports from anon, authenticated;
grant select, insert, update, delete on public.follows, public.mutes, public.profile_reports to service_role;

-- ============================================================================
-- Source: 0007_company_listings.sql
-- ============================================================================
-- Company listings by the community, with the details the "List a company" checks collect.
-- Run in the Supabase SQL editor after 0006_social.sql.

-- ---------- remove the sample companies ----------
-- An earlier 0006 seeded twelve made-up companies. Stories about them (only test posts) go too.
delete from public.stories where company_id in (select id from public.companies where slug in
  ('nimbus','orbitwave','bluepine','kindred','pixelmint','quasar','copperfox','echoverse','velvetbyte','hushloop','stacksprout','redkite') and created_by is null);
delete from public.companies where slug in
  ('nimbus','orbitwave','bluepine','kindred','pixelmint','quasar','copperfox','echoverse','velvetbyte','hushloop','stacksprout','redkite') and created_by is null;

-- ---------- listing details ----------
alter table public.companies
  -- Registrable domain, lowercase, no "www." (one listing per website).
  add column if not exists domain    text,
  add column if not exists website   text check (website is null or website ~ '^https://'),
  -- Icon found on the company's own site when it was listed (null: the initial letter is shown).
  add column if not exists logo_url  text check (logo_url is null or logo_url ~ '^https://'),
  add column if not exists about     text check (about is null or char_length(about) between 80 and 800),
  add column if not exists industry  text check (industry is null or industry in ('software','it_services','fintech','ecommerce','edtech','healthtech','media','consulting','manufacturing','bfsi','telecom','gaming','logistics','other')),
  add column if not exists size      text check (size is null or size in ('1-10','11-50','51-200','201-1000','1001-5000','5000+')),
  add column if not exists hq_city   text check (hq_city is null or char_length(hq_city) between 2 and 60),
  add column if not exists founded   int  check (founded is null or founded between 1800 and 2100),
  add column if not exists careers_url text check (careers_url is null or careers_url ~ '^https://'),
  -- listed: visible. hidden: taken down by moderators (reports, fake listing).
  add column if not exists status    text not null default 'listed' check (status in ('listed','hidden'));
create unique index if not exists companies_domain_unique on public.companies (domain) where domain is not null;

-- Reports about a listing (fake company, wrong website, duplicate…).
create table if not exists public.company_reports (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('fake','wrong_website','duplicate','offensive','other')),
  details     text check (char_length(details) <= 1000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.company_reports enable row level security;
revoke all on public.company_reports from anon, authenticated;
grant select, insert, update, delete on public.company_reports to service_role;

-- ---------- scores view, now with the listing details ----------
drop view if exists public.company_scores;
create view public.company_scores as
select
  c.id, c.slug, c.name, c.color, c.summary, c.domain, c.website, c.logo_url, c.about, c.industry, c.size, c.hq_city, c.founded, c.careers_url, c.created_at,
  count(s.id)::int as story_count,
  round(avg((s.rating_hiring - 1) * 25))::int        as score_hiring,
  round(avg((s.rating_communication - 1) * 25))::int as score_communication,
  round(avg((s.rating_culture - 1) * 25))::int       as score_culture,
  round(avg((s.rating_pay - 1) * 25))::int           as score_pay,
  round(avg((s.rating_growth - 1) * 25))::int        as score_growth,
  round(avg((s.rating_hiring + s.rating_communication + s.rating_culture + s.rating_pay + s.rating_growth - 5) * 5.0))::int as flag_score,
  min(s.salary_min_lpa) as salary_min_lpa,
  max(s.salary_max_lpa) as salary_max_lpa,
  count(*) filter (where s.outcome = 'ghosted')::int       as ghosted_count,
  count(*) filter (where s.outcome = 'offer_revoked')::int as revoked_count,
  round(avg(s.days_waited))::int as avg_days_waited,
  max(s.created_at) as last_story_at
from public.companies c
left join public.stories s on s.company_id = c.id and s.status = 'published'
where c.status = 'listed'
group by c.id;
revoke all on public.company_scores from anon, authenticated;
grant select on public.company_scores to service_role;

-- ============================================================================
-- Source: 0008_story_edits.sql
-- ============================================================================
-- Authors can edit their stories; edited stories show an "Edited" badge. Run after 0007.
alter table public.stories add column if not exists edited_at timestamptz;

-- ============================================================================
-- Source: 0009_company_follows.sql
-- ============================================================================
-- Company pages: follow a company, and ring its bell to get a notification for every new story
-- about it. Run in the Supabase SQL editor after 0008.
create table if not exists public.company_follows (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  notify     boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists company_follows_company on public.company_follows (company_id);

alter table public.company_follows enable row level security;
revoke all on public.company_follows from anon, authenticated;
grant select, insert, update, delete on public.company_follows to service_role;

-- Notifications can point at a company page.
alter table public.notifications add column if not exists company_slug text;

-- Each story's average star rating (1–5), kept by the database. Company pages use it to split
-- stories into positive (3.6 and up), mixed and critical (2.4 and below), and to filter by it.
alter table public.stories add column if not exists rating_avg numeric(3,2)
  generated always as ((rating_hiring + rating_communication + rating_culture + rating_pay + rating_growth) / 5.0) stored;
create index if not exists stories_company_rating on public.stories (company_id, rating_avg);

-- ============================================================================
-- Source: 0010_repair_and_email_theme.sql
-- ============================================================================
-- Safe to run any time (every statement is "if not exists"). Run in the Supabase SQL editor.
--
-- 1. Repair: columns added by later versions of 0006/0009 that an earlier run may have missed
--    (symptom: "column notifications.profile_public_id does not exist").
alter table public.notifications add column if not exists profile_public_id bigint;
alter table public.notifications add column if not exists company_slug text;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('relatable', 'reply', 'company', 'system', 'following', 'follower'));

-- 2. Emails follow the reader's theme: light (the default) or dark, saved from Settings → Appearance.
alter table public.profiles add column if not exists email_theme text not null default 'light' check (email_theme in ('light', 'dark'));

-- ============================================================================
-- Source: 0011_chitchats.sql
-- ============================================================================
-- Chitchats (comments): one level of replies, "relatable" reactions and reports. Run after 0010.

-- A reply points at the top-level chitchat it answers (replies to replies attach to that same one).
alter table public.comments add column if not exists parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column if not exists edited_at timestamptz;
create index if not exists comments_parent_idx on public.comments (parent_id);

-- "Relatable" on a chitchat (chitchats have no red flags).
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.comment_reports (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('harassment','identifies_person','spam','false_info','off_topic','other')),
  details     text check (char_length(details) <= 1000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.comment_reactions enable row level security;
alter table public.comment_reports enable row level security;
revoke all on public.comment_reactions, public.comment_reports from anon, authenticated;
grant select, insert, update, delete on public.comment_reactions, public.comment_reports to service_role;

-- ============================================================================
-- Source: 0012_device_dedupe.sql
-- ============================================================================
-- One row per device in Settings → Security, instead of one per sign-in. Run after 0011.
--
-- Signing in again on the same browser used to add another "Edge on Windows" every time. Now each
-- browser carries a random device id in an HttpOnly cookie (only its keyed hash is stored here), and
-- a new sign-in replaces that device's older session instead of piling up next to it.
--
-- The IP is kept masked, like 49.36.x.x (IPv6: the first four groups): enough to recognise "that's my
-- home connection" at a glance, never the full address.

alter table public.session_devices
  add column if not exists device_hash text check (device_hash is null or device_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists ip_masked   text check (ip_masked is null or char_length(ip_masked) <= 64);
create index if not exists session_devices_user_device on public.session_devices (user_id, device_hash);

-- Ends this device's other sessions, keeping the one that just signed in. A device is the same one if
-- it carries the same device id; rows from before this migration (no id, no IP) and rows from a
-- browser without the cookie match on browser + OS + kind, plus the masked IP when both have one.
create or replace function public.replace_device_sessions(
  p_user uuid, p_keep uuid, p_hash text, p_browser text, p_os text, p_kind text, p_ip text
) returns int
language plpgsql security definer set search_path = '' as $$
declare gone uuid[];
begin
  with old as (
    delete from public.session_devices d
    where d.user_id = p_user and d.session_id <> p_keep
      and (
        (p_hash is not null and d.device_hash = p_hash)
        or (d.device_hash is null and d.browser = p_browser and d.os = p_os and d.kind = p_kind
            and (d.ip_masked is null or d.ip_masked = p_ip))
      )
    returning d.session_id
  )
  select coalesce(array_agg(session_id), '{}') into gone from old;
  delete from auth.sessions where user_id = p_user and id = any(gone);
  return coalesce(array_length(gone, 1), 0);
end $$;

revoke all on function public.replace_device_sessions(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.replace_device_sessions(uuid, uuid, text, text, text, text, text) to service_role;

-- ============================================================================
-- Source: 0013_waiting_room.sql
-- ============================================================================
-- Waiting Room: your own private tracker of applications you're waiting to hear back on. Run after 0012.
--
-- Never public, never counted in any statistic, only ever returned to its owner. The private note is
-- sealed (AES-256-GCM, like personal details), so a database leak exposes no notes. Deleting your
-- account removes all of it (cascade).

create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  public_id       bigint not null unique default gen_public_id(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete set null,
  company_name    text not null check (char_length(company_name) between 1 and 80),   -- shown even if the company isn't listed
  role            text check (role is null or char_length(role) between 1 and 80),
  stage           text not null default 'application' check (stage in ('application','screening','technical','final','offer')),
  status          text not null default 'waiting' check (status in ('waiting','closed')),
  outcome         text check (outcome is null or outcome in ('ghosted','rejected','offer','offer_revoked','ghost_job','withdrew')),
  applied_on      date not null default current_date,
  waiting_since   date not null default current_date,  -- the clock: last time you heard anything
  followups       smallint not null default 0 check (followups between 0 and 99),
  last_followup   date,
  note_z          bytea,                               -- sealed private note
  story_id        uuid references public.stories (id) on delete set null,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (waiting_since >= applied_on)
);
create index if not exists applications_user on public.applications (user_id, status, waiting_since);

alter table public.applications enable row level security;
revoke all on public.applications from anon, authenticated;
grant select, insert, update, delete on public.applications to service_role;

-- ============================================================================
-- Source: 0014_moderation.sql
-- ============================================================================
-- Automatic moderation (backend/src/algorithms). Run after 0013.
--
-- Stories and chitchats can now be "pending": saved, but held until a moderator looks, because the
-- automatic review found something that needs a human (a named person, an accusation stated as fact,
-- spam, self-harm language) or several trusted people reported it. Pending content is invisible to
-- everyone except moderators. `moderation` keeps the automatic review's reasons (masked excerpt only).

alter table public.stories drop constraint if exists stories_status_check;
alter table public.stories add constraint stories_status_check check (status in ('published','pending','hidden','removed'));
alter table public.comments drop constraint if exists comments_status_check;
alter table public.comments add constraint comments_status_check check (status in ('published','pending','removed'));

alter table public.stories  add column if not exists moderation jsonb;
alter table public.comments add column if not exists moderation jsonb;

-- Report queue order (0–100, from algorithms/reports.ts) and whether the platform hid the item itself.
alter table public.reports         add column if not exists priority smallint not null default 0, add column if not exists auto_hidden boolean not null default false;
alter table public.comment_reports add column if not exists priority smallint not null default 0, add column if not exists auto_hidden boolean not null default false;
create index if not exists reports_queue on public.reports (resolved, priority desc, created_at);
create index if not exists comment_reports_queue on public.comment_reports (resolved, priority desc, created_at);
create index if not exists stories_pending on public.stories (created_at) where status = 'pending';

-- ============================================================================
-- Source: 0015_automation.sql
-- ============================================================================
-- Self-maintaining moderation and search (backend/src/automation.ts). Run after 0014.
--
-- moderation_terms     the live word list: imported from open lists daily, plus terms learned from
--                      what moderation removes; static curated rules in lexicon.ts always apply too
-- moderation_allow     words learned to be normal on Ghosted (common in clean stories), which no
--                      imported or learned term may ever flag
-- search_concepts      synonyms learned from which words keep appearing together in stories
-- automation_runs      when each job last ran, and what it did

create table if not exists public.moderation_terms (
  term       text primary key check (char_length(term) between 2 and 60),
  tier       text not null check (tier in ('slur','severe','profanity','watch')),
  source     text not null check (source in ('dsojevic','ldnoobw_en','ldnoobw_hi','learned','variant')),
  weight     real not null default 1 check (weight between 0 and 1),
  pattern    boolean not null default false,          -- term contains * wildcards
  exceptions text[] not null default '{}',             -- full words this term must never match
  status     text not null default 'active' check (status in ('active','retired')),
  evidence   jsonb,                                    -- learned terms: counts and z-score
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moderation_terms_active on public.moderation_terms (status, tier);

create table if not exists public.moderation_allow (
  term       text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.search_concepts (
  seed       text not null,
  term       text not null,
  weight     real not null check (weight between 0 and 1),
  docs       int not null,
  updated_at timestamptz not null default now(),
  primary key (seed, term)
);

create table if not exists public.automation_runs (
  job      text primary key,
  last_run timestamptz not null default now(),
  stats    jsonb
);

-- How each report ended, so reporter trust (algorithms/trust.ts) learns who reports accurately.
alter table public.reports         add column if not exists outcome text check (outcome in ('upheld','dismissed')), add column if not exists resolved_at timestamptz;
alter table public.comment_reports add column if not exists outcome text check (outcome in ('upheld','dismissed')), add column if not exists resolved_at timestamptz;
create index if not exists reports_reporter on public.reports (reporter_id, outcome);
create index if not exists comment_reports_reporter on public.comment_reports (reporter_id, outcome);

alter table public.moderation_terms enable row level security;
alter table public.moderation_allow enable row level security;
alter table public.search_concepts  enable row level security;
alter table public.automation_runs  enable row level security;
revoke all on public.moderation_terms, public.moderation_allow, public.search_concepts, public.automation_runs from anon, authenticated;
grant select, insert, update, delete on public.moderation_terms, public.moderation_allow, public.search_concepts, public.automation_runs to service_role;

-- ============================================================================
-- Source: 0016_goofy.sql
-- ============================================================================
-- Goofy, Ghosted's AutoMod (backend/src/goofy). Run after 0015.
--
-- Goofy is a real profile (people can follow him) that acts on top of the moderation algorithms:
-- removes vulgar content, files reports, holds and releases posts, warns, welcomes, alerts, and
-- escalates what needs a human. The API creates his account on first run (a sign-in-proof auth
-- user: banned, unreachable email) with the public id 600710000000001: "goofy" spelled in digits
-- (g=6, o=0, o=0, f=7, y=1), then …0001.

alter table public.profiles add column if not exists kind text not null default 'person' check (kind in ('person', 'bot'));
-- Strikes: removals Goofy had to make. Three in 30 days → a short posting cooldown.
alter table public.profiles add column if not exists posting_paused_until timestamptz;
alter table public.profiles add column if not exists goofy_welcomed boolean not null default false;

-- Everything Goofy does, as a public, anonymous activity log (never names who was moderated).
create table if not exists public.goofy_actions (
  id           uuid primary key default gen_random_uuid(),
  public_id    bigint not null unique default gen_public_id(),
  action       text not null check (action in (
                 'removed_story','removed_chitchat','held','released','redacted','took_down','restored',
                 'reported_story','reported_chitchat','reported_company','asked_rephrase','warned','paused',
                 'welcomed','ghost_job_alert','dismissed_reports','escalated','lists_updated','learned')),
  target_kind  text check (target_kind in ('story','chitchat','company','profile','system')),
  -- Only safe pointers: a story or company that's still public. Never the person moderated.
  story_public_id bigint,
  company_slug text,
  reason       text check (char_length(reason) <= 200),
  user_id      uuid references public.profiles (id) on delete set null,   -- private: for strikes, never returned
  created_at   timestamptz not null default now()
);
create index if not exists goofy_actions_recent on public.goofy_actions (created_at desc);
create index if not exists goofy_actions_user on public.goofy_actions (user_id, action, created_at desc);

-- Notifications from Goofy show his face and link to his page.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('relatable', 'reply', 'company', 'system', 'following', 'follower', 'goofy'));

alter table public.goofy_actions enable row level security;
revoke all on public.goofy_actions from anon, authenticated;
grant select, insert, update, delete on public.goofy_actions to service_role;

-- ============================================================================
-- Source: 0017_feedback.sql
-- ============================================================================
-- Feedback, bug reports, feature ideas, check-in ratings, and donations (the /feedback page).
-- Run after 0016.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  public_id   bigint not null unique default gen_public_id(),
  user_id     uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('bug','feature','feedback','pulse')),
  title       text check (title is null or char_length(title) between 3 and 120),
  body        text check (body is null or char_length(body) <= 4000),
  area        text check (area is null or char_length(area) <= 40),        -- which part of the app
  severity    text check (severity is null or severity in ('minor','annoying','blocking')),
  rating      smallint check (rating is null or rating between 1 and 5),
  steps       text check (steps is null or char_length(steps) <= 2000),    -- bug: how to reproduce
  device      jsonb,                                                       -- bug: browser, OS, screen (no IP)
  status      text not null default 'new' check (status in ('new','seen','planned','in_progress','done','wont_do')),
  reply       text check (reply is null or char_length(reply) <= 2000),    -- the team's answer, shown to the author
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists feedback_user on public.feedback (user_id, created_at desc);
create index if not exists feedback_queue on public.feedback (status, kind, created_at desc);

create table if not exists public.donations (
  id                  uuid primary key default gen_random_uuid(),
  public_id           bigint not null unique default gen_public_id(),
  user_id             uuid references public.profiles (id) on delete set null,
  amount_paise        integer not null check (amount_paise between 1000 and 10000000),  -- ₹10 … ₹1,00,000
  currency            text not null default 'INR' check (currency = 'INR'),
  razorpay_order_id   text not null unique,
  razorpay_payment_id text unique,
  status              text not null default 'created' check (status in ('created','paid','failed')),
  message             text check (message is null or char_length(message) <= 280),
  show_name           boolean not null default false,   -- appear on the thank-you wall
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists donations_user on public.donations (user_id, created_at desc);
create index if not exists donations_paid on public.donations (status, paid_at desc);

alter table public.feedback  enable row level security;
alter table public.donations enable row level security;
revoke all on public.feedback, public.donations from anon, authenticated;
grant select, insert, update, delete on public.feedback, public.donations to service_role;

-- ============================================================================
-- Source: 0018_admin.sql
-- ============================================================================
-- The admin panel (admin/ app, backend/src/routes/admin.ts). Run after 0017.
--
-- Admin accounts are NOT Ghosted user accounts: a separate table, separate sign-in (email +
-- password + the human check), separate short-lived sessions. Nobody can become an admin from the
-- website; the first one is created on the server with `npm run admin:create` (backend/scripts).
--
-- admin_audit is append-only: a trigger refuses updates and deletes, so the log of who did what
-- can't be quietly rewritten, even by an admin.

create table if not exists public.admin_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(email) and char_length(email) between 5 and 120),
  name            text not null check (char_length(name) between 1 and 60),
  password_hash   text not null,                                  -- scrypt, see admin-auth.ts
  role            text not null default 'moderator' check (role in ('owner','moderator')),
  active          boolean not null default true,
  failed_attempts smallint not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.admin_users (id) on delete cascade,
  token_hash  text not null unique,                               -- sha256 of the bearer token
  ip_hash     text,
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index if not exists admin_sessions_admin on public.admin_sessions (admin_id, created_at desc);

create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.admin_users (id) on delete set null,
  admin_name  text,                                               -- kept even if the admin is removed
  action      text not null check (char_length(action) <= 60),
  target_kind text check (target_kind is null or char_length(target_kind) <= 30),
  target_ref  text check (target_ref is null or char_length(target_ref) <= 80),
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_recent on public.admin_audit (created_at desc);

create or replace function public.admin_audit_append_only() returns trigger language plpgsql as $$
begin raise exception 'admin_audit is append-only'; end $$;
drop trigger if exists admin_audit_no_change on public.admin_audit;
create trigger admin_audit_no_change before update or delete on public.admin_audit for each row execute function public.admin_audit_append_only();

alter table public.admin_users    enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit    enable row level security;
revoke all on public.admin_users, public.admin_sessions, public.admin_audit from anon, authenticated;
grant select, insert, update, delete on public.admin_users, public.admin_sessions to service_role;
grant select, insert on public.admin_audit to service_role;

-- ============================================================================
-- Source: 0019_admin_setup.sql
-- ============================================================================
-- Admins come from the API's ADMIN_EMAILS setting and set their own password from the admin panel
-- (a 6-digit code emailed to them). Run after 0018.
--
-- So an admin can exist before they've chosen a password, and the code is stored only as a hash.

alter table public.admin_users alter column password_hash drop not null;
alter table public.admin_users add column if not exists setup_code_hash text;
alter table public.admin_users add column if not exists setup_expires_at timestamptz;
alter table public.admin_users add column if not exists setup_attempts smallint not null default 0;
alter table public.admin_users add column if not exists from_env boolean not null default false;

-- ============================================================================
-- Source: 0020_admin_powers.sql
-- ============================================================================
-- Admin panel, part 3: roles and permissions, personal settings (avatar, tone, theme, notifications,
-- two-step sign-in), platform switches, member bans and suspensions, and IP bans. Run after 0019.

-- ---------- admins: roles, permissions, personal settings, two-step sign-in ----------
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('owner','admin','moderator','viewer'));
-- null = the role's defaults; otherwise exactly these permissions (see backend/src/admin-perms.ts).
alter table public.admin_users add column if not exists permissions text[];
alter table public.admin_users add column if not exists avatar_seed text not null default 'admin' check (char_length(avatar_seed) between 1 and 64);
alter table public.admin_users add column if not exists tone text not null default 'sassy' check (tone in ('sassy','calm'));
alter table public.admin_users add column if not exists email_theme text not null default 'light' check (email_theme in ('light','dark'));
alter table public.admin_users add column if not exists notify jsonb not null default '{"dailyBrief":true,"urgentReports":true,"newBugs":true,"donations":false,"teamChanges":true}';
alter table public.admin_users add column if not exists notif_seen_at timestamptz not null default now();
alter table public.admin_users add column if not exists mfa_method text not null default 'none' check (mfa_method in ('none','totp','email'));
alter table public.admin_users add column if not exists totp_secret_z bytea;
alter table public.admin_users add column if not exists totp_pending_z bytea;
alter table public.admin_users add column if not exists totp_last_step bigint;
alter table public.admin_users add column if not exists recovery_z bytea;
alter table public.admin_users add column if not exists mfa_code_hash text;
alter table public.admin_users add column if not exists mfa_expires_at timestamptz;
alter table public.admin_users add column if not exists mfa_attempts smallint not null default 0;
alter table public.admin_users add column if not exists added_by text;
-- An owner switched this admin's sign-in off. Separate from `active` (which follows ADMIN_EMAILS),
-- so the minute-by-minute sync never turns it back on.
alter table public.admin_users add column if not exists disabled_at timestamptz;
alter table public.admin_users add column if not exists disabled_by text;

-- ---------- admin sessions: access + refresh tokens ----------
-- token_hash/expires_at are now the short-lived access token (15 min). The refresh token rotates on
-- every use; presenting the previous one again means it was copied, and the session is revoked.
alter table public.admin_sessions add column if not exists refresh_hash text unique;
alter table public.admin_sessions add column if not exists prev_refresh_hash text;
alter table public.admin_sessions add column if not exists session_expires_at timestamptz;
alter table public.admin_sessions add column if not exists rotations integer not null default 0;
create index if not exists admin_sessions_prev_refresh on public.admin_sessions (prev_refresh_hash);

-- ---------- platform switches (one row per setting) ----------
create table if not exists public.platform_settings (
  key        text primary key check (char_length(key) <= 40),
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select, insert, update, delete on public.platform_settings to service_role;

-- ---------- members: bans ----------
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists banned_until timestamptz;   -- null with banned_at set = permanent
alter table public.profiles add column if not exists ban_reason text check (ban_reason is null or char_length(ban_reason) <= 300);

-- Which (hashed) IPs a member signs in from, so an admin can ban the connection too. The hash is
-- keyed with IP_HASH_SECRET; the raw IP is never stored.
alter table public.session_devices add column if not exists ip_hash text check (ip_hash is null or char_length(ip_hash) <= 64);
create index if not exists session_devices_ip on public.session_devices (ip_hash);

create table if not exists public.ip_bans (
  ip_hash    text primary key check (char_length(ip_hash) <= 64),
  ip_masked  text,
  reason     text check (reason is null or char_length(reason) <= 300),
  user_ref   bigint,                      -- the member's public id it came from, if any
  banned_by  text not null,
  expires_at timestamptz,                 -- null = until lifted
  created_at timestamptz not null default now()
);
alter table public.ip_bans enable row level security;
revoke all on public.ip_bans from anon, authenticated;
grant select, insert, update, delete on public.ip_bans to service_role;

-- ============================================================================
-- Source: 0021_admin_devices.sql
-- ============================================================================
-- Admin sessions remember which browser they came from (a random id the panel keeps in that
-- browser, stored here only as a hash). Signing in again from the same browser replaces its old
-- session instead of adding another one. Run after 0020.
alter table public.admin_sessions add column if not exists device_hash text check (device_hash is null or char_length(device_hash) <= 64);
create index if not exists admin_sessions_device on public.admin_sessions (admin_id, device_hash);

