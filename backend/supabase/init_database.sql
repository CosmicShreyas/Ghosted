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
  kind       text not null check (kind in ('relatable','insightful','creative','support','love')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
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
  count(r.*) filter (where r.kind = 'insightful')::int as insightful,
  count(r.*) filter (where r.kind = 'creative')::int   as creative,
  count(r.*) filter (where r.kind = 'support')::int    as support,
  count(r.*) filter (where r.kind = 'love')::int       as love,
  0::int as flags,
  (select count(*) from public.comments c where c.story_id = s.id and c.status = 'published')::int as comments
from public.stories s
left join public.reactions r on r.story_id = s.id
group by s.id;
revoke all on public.story_counts from anon, authenticated;
grant select on public.story_counts to service_role;

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
  -- Which emails you want. Keys: relatable, chitchatReplies, newFollowers, flaggedCompanies, weeklyDigest.
  add column if not exists notify jsonb not null default '{"relatable":true,"chitchatReplies":true,"newFollowers":true,"flaggedCompanies":false,"weeklyDigest":true}',
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

-- ============================================================================
-- Built-in major-company catalogue
-- ============================================================================
-- Major-company catalogue for Ghosted.
-- Safe to run repeatedly in the Supabase SQL Editor: existing slugs or domains are skipped.
-- Catalogue rows are platform-provided, so created_by intentionally remains null.

begin;

with source(name, domain, industry, hq_city, founded, summary) as (
 values
  ('Accenture','accenture.com','consulting','Dublin',1989,'Global professional services company providing technology, operations and consulting services.'),
  ('Anthropic','anthropic.com','software','San Francisco',2021,'Artificial intelligence company researching and building reliable and interpretable AI systems.'),
  ('Deloitte','deloitte.com','consulting','London',1845,'Global professional services organization providing audit, consulting, tax and advisory services.'),
  ('Infosys','infosys.com','it_services','Bengaluru',1981,'Global technology consulting and digital services company headquartered in Bengaluru.'),
  ('Tata Consultancy Services','tcs.com','it_services','Mumbai',1968,'Global IT services, consulting and business solutions company within the Tata Group.'),
  ('Wipro','wipro.com','it_services','Bengaluru',1945,'Technology services and consulting company serving businesses across global markets.'),
  ('HCLTech','hcltech.com','it_services','Noida',1976,'Global technology company providing engineering, cloud, software and digital services.'),
  ('Tech Mahindra','techmahindra.com','it_services','Pune',1986,'Technology consulting and digital solutions company within the Mahindra Group.'),
  ('LTIMindtree','ltimindtree.com','it_services','Mumbai',1996,'Global technology consulting and digital solutions company within Larsen and Toubro.'),
  ('Mphasis','mphasis.com','it_services','Bengaluru',1998,'Information technology services company focused on cloud and cognitive transformation.'),
  ('Persistent Systems','persistent.com','it_services','Pune',1990,'Digital engineering and enterprise modernization company serving global organizations.'),
  ('Cognizant','cognizant.com','it_services','Teaneck',1994,'Global professional services company focused on technology and business modernization.'),
  ('Capgemini','capgemini.com','consulting','Paris',1967,'Global consulting, technology services and digital transformation company.'),
  ('IBM','ibm.com','software','Armonk',1911,'Global technology company providing hybrid cloud, artificial intelligence and consulting services.'),
  ('Oracle','oracle.com','software','Austin',1977,'Enterprise software and cloud infrastructure company known for database technologies.'),
  ('SAP','sap.com','software','Walldorf',1972,'Enterprise software company providing business applications and cloud platforms.'),
  ('Salesforce','salesforce.com','software','San Francisco',1999,'Cloud software company focused on customer relationship management and business applications.'),
  ('ServiceNow','servicenow.com','software','Santa Clara',2004,'Cloud software company providing digital workflows for enterprises and public organizations.'),
  ('Adobe','adobe.com','software','San Jose',1982,'Software company building creative, document and digital experience products.'),
  ('Google','google.com','software','Mountain View',1998,'Technology company building internet services, cloud platforms, devices and artificial intelligence products.'),
  ('Microsoft','microsoft.com','software','Redmond',1975,'Technology company building software, cloud services, devices and artificial intelligence products.'),
  ('Apple','apple.com','software','Cupertino',1976,'Technology company designing consumer electronics, software and digital services.'),
  ('Amazon','amazon.com','ecommerce','Seattle',1994,'Global technology company operating e-commerce, cloud computing and digital services businesses.'),
  ('Meta','meta.com','software','Menlo Park',2004,'Technology company building social platforms, communication products and virtual reality systems.'),
  ('NVIDIA','nvidia.com','software','Santa Clara',1993,'Computing company designing accelerated hardware and software for graphics and artificial intelligence.'),
  ('Intel','intel.com','manufacturing','Santa Clara',1968,'Semiconductor company designing processors, platforms and computing technologies.'),
  ('Cisco','cisco.com','telecom','San Jose',1984,'Technology company providing networking, security, collaboration and observability products.'),
  ('Siemens','siemens.com','manufacturing','Munich',1847,'Global technology company focused on industrial automation, infrastructure and mobility.'),
  ('Bosch','bosch.com','manufacturing','Gerlingen',1886,'Global engineering and technology company serving mobility, industrial and consumer markets.'),
  ('Samsung','samsung.com','manufacturing','Suwon',1969,'Global electronics company producing devices, semiconductors, displays and digital appliances.'),
  ('Dell Technologies','dell.com','manufacturing','Round Rock',1984,'Technology company providing computers, infrastructure, storage and enterprise solutions.'),
  ('Qualcomm','qualcomm.com','manufacturing','San Diego',1985,'Semiconductor and telecommunications company developing wireless computing technologies.'),
  ('McKinsey & Company','mckinsey.com','consulting','New York',1926,'Global management consulting firm advising organizations across industries and functions.'),
  ('Boston Consulting Group','bcg.com','consulting','Boston',1963,'Global management consulting firm working with businesses, governments and social organizations.'),
  ('Bain & Company','bain.com','consulting','Boston',1973,'Global management consulting firm advising companies on strategy, operations and transformation.'),
  ('PwC','pwc.com','consulting','London',1998,'Global professional services network providing assurance, consulting and tax services.'),
  ('EY','ey.com','consulting','London',1989,'Global professional services organization providing assurance, consulting, strategy and tax services.'),
  ('KPMG','kpmg.com','consulting','Amstelveen',1987,'Global professional services network providing audit, tax and advisory services.'),
  ('JPMorgan Chase','jpmorganchase.com','bfsi','New York',2000,'Global financial services firm providing banking, markets, payments and asset management services.'),
  ('Goldman Sachs','goldmansachs.com','bfsi','New York',1869,'Global financial institution providing investment banking, markets and asset management services.'),
  ('Morgan Stanley','morganstanley.com','bfsi','New York',1935,'Global financial services firm focused on securities, wealth and investment management.'),
  ('HSBC','hsbc.com','bfsi','London',1865,'International banking and financial services organization serving individuals and businesses.'),
  ('Barclays','barclays.com','bfsi','London',1896,'Global bank providing consumer, corporate and investment banking services.'),
  ('Deutsche Bank','db.com','bfsi','Frankfurt',1870,'International bank providing corporate, investment, private and retail banking services.'),
  ('American Express','americanexpress.com','bfsi','New York',1850,'Global payments company providing cards, merchant services and travel-related products.'),
  ('Visa','visa.com','fintech','San Francisco',1958,'Global payments technology company connecting consumers, businesses and financial institutions.'),
  ('Mastercard','mastercard.com','fintech','Purchase',1966,'Global payments technology company providing transaction processing and digital payment services.'),
  ('State Bank of India','sbi.co.in','bfsi','Mumbai',1955,'Indian public sector bank providing retail, corporate and international financial services.'),
  ('HDFC Bank','hdfcbank.com','bfsi','Mumbai',1994,'Indian private sector bank providing retail, wholesale and digital banking services.'),
  ('ICICI Bank','icicibank.com','bfsi','Mumbai',1994,'Indian private sector bank offering retail, corporate and digital financial services.'),
  ('Axis Bank','axisbank.com','bfsi','Mumbai',1993,'Indian private sector bank serving retail, small business and corporate customers.'),
  ('Kotak Mahindra Bank','kotak.com','bfsi','Mumbai',1985,'Indian financial services group providing banking, investment and insurance products.'),
  ('Razorpay','razorpay.com','fintech','Bengaluru',2014,'Indian financial technology company providing payments and banking tools for businesses.'),
  ('Paytm','paytm.com','fintech','Noida',2010,'Indian digital payments and financial services company serving consumers and merchants.'),
  ('PhonePe','phonepe.com','fintech','Bengaluru',2015,'Indian digital payments and financial services platform serving consumers and merchants.'),
  ('Flipkart','flipkart.com','ecommerce','Bengaluru',2007,'Indian e-commerce marketplace offering consumer products, logistics and digital services.'),
  ('Myntra','myntra.com','ecommerce','Bengaluru',2007,'Indian fashion and lifestyle e-commerce platform serving consumers across the country.'),
  ('Meesho','meesho.com','ecommerce','Bengaluru',2015,'Indian e-commerce marketplace connecting consumers, sellers and small businesses.'),
  ('Swiggy','swiggy.com','ecommerce','Bengaluru',2014,'Indian on-demand convenience platform for food delivery, groceries and local services.'),
  ('Zomato','zomato.com','ecommerce','Gurugram',2008,'Indian food technology platform offering restaurant discovery and delivery services.'),
  ('Uber','uber.com','logistics','San Francisco',2009,'Technology platform connecting people with mobility, delivery and logistics services.'),
  ('Ola','olacabs.com','logistics','Bengaluru',2010,'Indian mobility platform providing ride-hailing and related transportation services.'),
  ('Reliance Industries','ril.com','other','Mumbai',1973,'Indian conglomerate operating across energy, retail, telecommunications and digital services.'),
  ('Jio Platforms','jio.com','telecom','Mumbai',2019,'Indian digital services company operating telecommunications, apps and technology platforms.'),
  ('Bharti Airtel','airtel.com','telecom','New Delhi',1995,'Telecommunications company providing mobile, broadband and enterprise connectivity services.'),
  ('Vodafone Idea','myvi.in','telecom','Mumbai',2018,'Indian telecommunications company providing mobile voice, data and enterprise services.'),
  ('Tata Motors','tatamotors.com','manufacturing','Mumbai',1945,'Indian automotive manufacturer producing passenger, commercial and electric vehicles.'),
  ('Mahindra & Mahindra','mahindra.com','manufacturing','Mumbai',1945,'Indian multinational group active in automobiles, farm equipment and technology services.'),
  ('Larsen & Toubro','larsentoubro.com','manufacturing','Mumbai',1938,'Indian multinational engaged in engineering, construction, manufacturing and technology services.'),
  ('Maruti Suzuki','marutisuzuki.com','manufacturing','New Delhi',1981,'Indian automobile manufacturer producing and selling passenger vehicles across the country.'),
  ('Zoho','zoho.com','software','Chennai',1996,'Indian software company building cloud applications for businesses and organizations.'),
  ('Freshworks','freshworks.com','software','San Mateo',2010,'Software company providing customer support, IT service and business engagement products.'),
  ('Atlassian','atlassian.com','software','Sydney',2002,'Software company building collaboration, project management and developer tools.'),
  ('Walmart Global Tech','tech.walmart.com','ecommerce','Bentonville',2005,'Technology organization building digital commerce, supply chain and retail platforms for Walmart.'),
  ('Target','target.com','ecommerce','Minneapolis',1902,'Retail company operating stores, digital commerce and technology teams across global markets.'),
  ('Wells Fargo','wellsfargo.com','bfsi','San Francisco',1852,'Financial services company providing banking, lending, payments and wealth management.'),
  ('Bank of America','bankofamerica.com','bfsi','Charlotte',1998,'Global financial institution serving individuals, businesses and institutional clients.'),
  ('Standard Chartered','sc.com','bfsi','London',1969,'International banking group serving corporate, institutional and retail customers.'),
  ('Amdocs','amdocs.com','it_services','Chesterfield',1982,'Software and services company supporting communications, media and financial providers.'),
  ('Genpact','genpact.com','consulting','New York',1997,'Professional services company focused on data, technology and business process transformation.'),
  ('Concentrix','concentrix.com','it_services','Newark',1983,'Global technology and services company focused on customer experience and business operations.'),
  ('Teleperformance','teleperformance.com','it_services','Paris',1978,'Global digital business services company providing customer experience and operational support.'),
  ('Nagarro','nagarro.com','it_services','Munich',1996,'Digital engineering company building software products and technology solutions for enterprises.'),
  ('EPAM Systems','epam.com','it_services','Newtown',1993,'Digital engineering and consulting company delivering software and transformation services.')
),
prepared as (
  select
    trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as slug,
    name,
    domain,
    'https://' || domain as website,
    industry,
    hq_city,
    founded,
    summary,
    summary || ' This verified catalog entry helps candidates find and share hiring experiences connected to the correct organization.' as about,
    (array['bg-logo-violet','bg-logo-coral','bg-logo-blue','bg-logo-green','bg-logo-pink','bg-logo-amber','bg-logo-red'])
      [1 + ((row_number() over (order by name) - 1) % 7)::int] as color
  from source
)
insert into public.companies (
  slug, name, color, summary, created_by, domain, website, logo_url, about,
  industry, size, hq_city, founded, careers_url, status
)
select
  slug, name, color, summary, null, domain, website,
  'https://unavatar.io/' || domain || '?fallback=false', about,
  industry, '5000+', hq_city, founded, null, 'listed'
from prepared
on conflict do nothing;


-- High-growth and startup employers frequently encountered by Indian candidates.
with startup_source(name, domain, industry, size, hq_city, founded, summary) as (
 values
  ('Vibgyor Interiors','vibgyorinteriors.com','other','51-200','Bengaluru',1975,'Bengaluru interior design company providing home interiors, renovation, manufacturing and automation services.'),
  ('Headout','headout.com','ecommerce','201-1000','New York',2014,'Travel technology company helping people discover and book experiences in cities around the world.'),
  ('Rippling','rippling.com','software','1001-5000','San Francisco',2016,'Business software company unifying human resources, information technology and finance operations.'),
  ('BrowserStack','browserstack.com','software','1001-5000','Mumbai',2011,'Cloud testing platform helping developers test websites and mobile applications across devices.'),
  ('Postman','postman.com','software','1001-5000','San Francisco',2014,'API development platform helping teams design, test, document and manage application interfaces.'),
  ('Hasura','hasura.io','software','201-1000','San Francisco',2017,'Software company providing data access and GraphQL infrastructure for application developers.'),
  ('Chargebee','chargebee.com','software','1001-5000','Chennai',2011,'Subscription management and revenue operations platform serving businesses around the world.'),
  ('Druva','druva.com','software','1001-5000','Santa Clara',2008,'Cloud data security company providing backup, recovery and governance services for enterprises.'),
  ('InMobi','inmobi.com','media','1001-5000','Singapore',2007,'Advertising technology company helping brands and publishers engage mobile audiences.'),
  ('CRED','cred.club','fintech','1001-5000','Bengaluru',2018,'Indian financial technology platform offering payments, credit and member-focused financial products.'),
  ('Zerodha','zerodha.com','fintech','1001-5000','Bengaluru',2010,'Indian financial services company providing online investing and trading platforms.'),
  ('Groww','groww.in','fintech','1001-5000','Bengaluru',2016,'Indian investment platform offering stocks, mutual funds and other financial products.'),
  ('Zepto','zeptonow.com','ecommerce','1001-5000','Mumbai',2021,'Indian quick-commerce company delivering groceries and everyday products through a digital platform.'),
  ('Blinkit','blinkit.com','ecommerce','1001-5000','Gurugram',2013,'Indian quick-commerce platform delivering groceries and daily essentials to consumers.'),
  ('Urban Company','urbancompany.com','ecommerce','1001-5000','Gurugram',2014,'Indian marketplace connecting consumers with trained professionals for services at home.'),
  ('Delhivery','delhivery.com','logistics','5000+','Gurugram',2011,'Indian logistics and supply-chain company serving e-commerce and enterprise customers.'),
  ('Porter','porter.in','logistics','1001-5000','Bengaluru',2014,'Indian logistics platform providing intra-city delivery and commercial vehicle services.'),
  ('Udaan','udaan.com','ecommerce','1001-5000','Bengaluru',2016,'Indian business-to-business commerce platform connecting retailers, wholesalers and manufacturers.'),
  ('OYO','oyo.com','other','5000+','Gurugram',2012,'Hospitality technology company providing accommodation and operational tools across global markets.'),
  ('MakeMyTrip','makemytrip.com','ecommerce','5000+','Gurugram',2000,'Indian online travel company offering flights, hotels, holidays and transportation bookings.'),
  ('Dream11','dream11.com','gaming','1001-5000','Mumbai',2008,'Indian fantasy sports platform offering skill-based contests across multiple sports.'),
  ('Games24x7','games24x7.com','gaming','1001-5000','Mumbai',2006,'Indian digital gaming company building skill games and casual entertainment products.'),
  ('Mobile Premier League','mpl.live','gaming','1001-5000','Bengaluru',2018,'Mobile gaming and esports platform offering competitive and casual digital games.'),
  ('Practo','practo.com','healthtech','1001-5000','Bengaluru',2008,'Indian health technology platform connecting patients, doctors, clinics and diagnostic providers.'),
  ('Tata 1mg','1mg.com','healthtech','1001-5000','Gurugram',2015,'Indian digital healthcare platform providing medicines, diagnostics and online consultations.'),
  ('PharmEasy','pharmeasy.in','healthtech','1001-5000','Mumbai',2015,'Indian digital healthcare company offering medicines, diagnostics and pharmacy services.'),
  ('cult.fit','cult.fit','healthtech','1001-5000','Bengaluru',2016,'Indian health and fitness company operating digital services and physical fitness centres.'),
  ('Ather Energy','atherenergy.com','manufacturing','1001-5000','Bengaluru',2013,'Indian electric vehicle company designing scooters, charging infrastructure and connected software.'),
  ('Ola Electric','olaelectric.com','manufacturing','5000+','Bengaluru',2017,'Indian electric mobility company designing and manufacturing electric two-wheelers and related technology.'),
  ('boAt','boat-lifestyle.com','manufacturing','1001-5000','Gurugram',2016,'Indian consumer electronics company offering audio products, wearables and accessories.'),
  ('Lenskart','lenskart.com','ecommerce','5000+','Gurugram',2010,'Indian eyewear company operating online services, retail stores and manufacturing facilities.'),
  ('Nykaa','nykaa.com','ecommerce','5000+','Mumbai',2012,'Indian consumer technology company selling beauty, wellness and fashion products online and in stores.'),
  ('Policybazaar','policybazaar.com','fintech','5000+','Gurugram',2008,'Indian insurance technology marketplace helping consumers compare and purchase financial protection products.'),
  ('Pine Labs','pinelabs.com','fintech','1001-5000','Noida',1998,'Financial technology company providing merchant commerce, payments and credit solutions.'),
  ('BharatPe','bharatpe.com','fintech','1001-5000','New Delhi',2018,'Indian financial technology company offering payment acceptance and financial services to merchants.'),
  ('CoinDCX','coindcx.com','fintech','201-1000','Mumbai',2018,'Indian digital asset platform providing cryptocurrency trading and related financial technology services.'),
  ('CoinSwitch','coinswitch.co','fintech','201-1000','Bengaluru',2017,'Indian financial technology platform providing digital asset and investment products.'),
  ('Slice','sliceit.com','fintech','1001-5000','Bengaluru',2016,'Indian financial technology company building consumer payment, credit and banking products.'),
  ('Navi','navi.com','fintech','1001-5000','Bengaluru',2018,'Indian financial services company offering lending, insurance and investment products through technology.'),
  ('Juspay','juspay.in','fintech','1001-5000','Bengaluru',2012,'Payments technology company building checkout, authentication and payment orchestration infrastructure.'),
  ('Niyo','goniyo.com','fintech','201-1000','Bengaluru',2015,'Indian financial technology company offering digital banking and travel-focused financial products.'),
  ('KreditBee','kreditbee.in','fintech','1001-5000','Bengaluru',2018,'Indian financial technology platform providing personal credit and other consumer finance products.'),
  ('ShareChat','sharechat.com','media','1001-5000','Bengaluru',2015,'Indian social media company building multilingual community and short-video platforms.'),
  ('Dailyhunt','dailyhunt.com','media','1001-5000','Bengaluru',2009,'Indian content technology company providing news and entertainment in multiple languages.'),
  ('Inshorts','inshorts.com','media','201-1000','Noida',2013,'Indian news technology company delivering concise news and location-based content products.'),
  ('Pocket FM','pocketfm.com','media','1001-5000','Bengaluru',2018,'Audio entertainment company producing serialized fiction and spoken-word content for global audiences.'),
  ('apna','apna.co','software','1001-5000','Bengaluru',2019,'Indian jobs and professional networking platform serving frontline and skilled workers.'),
  ('Info Edge','infoedge.in','software','5000+','Noida',1995,'Indian internet company operating recruitment, real estate, matrimony and education platforms.'),
  ('Darwinbox','darwinbox.com','software','1001-5000','Hyderabad',2015,'Cloud human capital management platform serving enterprises across multiple regions.'),
  ('Whatfix','whatfix.com','software','1001-5000','San Jose',2014,'Digital adoption platform helping organizations guide users through enterprise software.'),
  ('LeadSquared','leadsquared.com','software','1001-5000','Bengaluru',2011,'Sales execution and marketing automation platform serving consumer-facing businesses.'),
  ('CleverTap','clevertap.com','software','1001-5000','Mountain View',2013,'Customer engagement platform helping digital businesses analyze, personalize and automate communications.'),
  ('MoEngage','moengage.com','software','1001-5000','San Francisco',2014,'Customer engagement platform helping consumer brands personalize communications across digital channels.'),
  ('WebEngage','webengage.com','software','201-1000','Mumbai',2011,'Customer data and engagement platform helping businesses automate personalized communication.'),
  ('Yellow.ai','yellow.ai','software','1001-5000','San Mateo',2016,'Conversational artificial intelligence company building automated customer service and employee experiences.'),
  ('Gupshup','gupshup.io','software','1001-5000','San Francisco',2004,'Conversational messaging platform helping businesses communicate with customers across digital channels.'),
  ('Exotel','exotel.com','telecom','1001-5000','Bengaluru',2011,'Cloud communications company providing contact centre, voice and messaging infrastructure.'),
  ('Uniphore','uniphore.com','software','1001-5000','Palo Alto',2008,'Enterprise artificial intelligence company building conversational and automation products.'),
  ('Fractal','fractal.ai','software','5000+','New York',2000,'Artificial intelligence and analytics company helping enterprises make data-driven decisions.'),
  ('Mu Sigma','mu-sigma.com','consulting','1001-5000','Chicago',2004,'Data analytics and decision sciences company serving large global enterprises.'),
  ('Tredence','tredence.com','consulting','1001-5000','San Jose',2013,'Data science and artificial intelligence company providing analytics solutions to enterprises.'),
  ('Quantiphi','quantiphi.com','consulting','5000+','Marlborough',2013,'Artificial intelligence engineering company building cloud and data solutions for enterprises.'),
  ('Zeta','zeta.tech','fintech','1001-5000','Bengaluru',2015,'Banking technology company providing payment processing and digital banking infrastructure.'),
  ('Open Financial Technologies','open.money','fintech','201-1000','Bengaluru',2017,'Indian business banking platform offering payments, accounting and financial management tools.'),
  ('Cashfree Payments','cashfree.com','fintech','1001-5000','Bengaluru',2015,'Indian payments company providing collections, payouts and banking infrastructure for businesses.'),
  ('Perfios','perfios.com','fintech','1001-5000','Bengaluru',2008,'Financial technology company providing data, decisioning and lending automation products.'),
  ('OfBusiness','ofbusiness.com','fintech','1001-5000','Gurugram',2015,'Indian business platform providing industrial commerce and financing services to small enterprises.'),
  ('Infra.Market','infra.market','ecommerce','1001-5000','Thane',2016,'Indian construction materials platform serving businesses through technology and private-label products.'),
  ('Livspace','livspace.com','other','5000+','Bengaluru',2014,'Home interiors company providing design, renovation and project execution through a digital platform.'),
  ('HomeLane','homelane.com','other','1001-5000','Bengaluru',2014,'Indian home interiors company providing personalized design and installation services.'),
  ('NoBroker','nobroker.in','other','1001-5000','Bengaluru',2014,'Indian property technology platform connecting owners, tenants, buyers and service providers.'),
  ('CARS24','cars24.com','ecommerce','5000+','Gurugram',2015,'Automotive technology platform enabling people to buy, sell and finance used vehicles.'),
  ('Spinny','spinny.com','ecommerce','1001-5000','Gurugram',2015,'Indian automotive marketplace providing inspected used cars and related ownership services.'),
  ('Physics Wallah','pw.live','edtech','5000+','Noida',2020,'Indian education technology company providing online and offline learning programs.'),
  ('Unacademy','unacademy.com','edtech','1001-5000','Bengaluru',2015,'Indian education technology platform offering courses and test preparation programs.'),
  ('upGrad','upgrad.com','edtech','5000+','Mumbai',2015,'Education technology company providing higher education and professional learning programs.'),
  ('Simplilearn','simplilearn.com','edtech','1001-5000','Bengaluru',2010,'Digital learning company providing professional certification and technology training programs.'),
  ('Scaler','scaler.com','edtech','1001-5000','Bengaluru',2019,'Education technology company providing software engineering and data science career programs.'),
  ('Great Learning','mygreatlearning.com','edtech','1001-5000','Gurugram',2013,'Professional learning company offering technology, business and higher education programs.')
),
startup_prepared as (
  select
    trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) as slug,
    name, domain, 'https://' || domain as website, industry, size, hq_city, founded, summary,
    summary || ' This catalog entry helps candidates find and share hiring experiences connected to the correct organization.' as about,
    (array['bg-logo-violet','bg-logo-coral','bg-logo-blue','bg-logo-green','bg-logo-pink','bg-logo-amber','bg-logo-red'])
      [1 + ((row_number() over (order by name) - 1) % 7)::int] as color
  from startup_source
)
insert into public.companies (
  slug, name, color, summary, created_by, domain, website, logo_url, about,
  industry, size, hq_city, founded, careers_url, status
)
select
  slug, name, color, summary, null, domain, website,
  'https://unavatar.io/' || domain || '?fallback=false', about,
  industry, size, hq_city, founded, null, 'listed'
from startup_prepared
on conflict do nothing;


-- Existing catalogue rows may predate logo seeding or carry the former low-resolution favicon.
-- The frontend receives these images through Ghosted's backend logo proxy.
update public.companies
set logo_url = 'https://unavatar.io/' || domain || '?fallback=false'
where domain is not null
  and (logo_url is null or logo_url like 'https://icons.duckduckgo.com/%');

-- ============================================================================
-- Ratings by journey. A story only carries the ratings that fit what happened:
--   every story          hiring, communication
--   offer / offer_revoked  + pay (and salary)
--   offer and joined     + culture, growth
-- So the five rating columns become nullable, rating_avg averages only the ratings a story has,
-- and company_scores averages each dimension over the stories that rated it.
-- Flag Score = average over stories of (rating_avg - 1) * 25, identical to the old formula when
-- all five exist. Mirrored in src/lib/score.ts and backend/src/score.ts. Safe to run again.
-- ============================================================================
alter table public.stories alter column rating_culture drop not null;
alter table public.stories alter column rating_pay drop not null;
alter table public.stories alter column rating_growth drop not null;
alter table public.stories alter column rating_hiring drop not null;
alter table public.stories alter column rating_communication drop not null;
alter table public.stories add column if not exists joined boolean;
alter table public.stories add column if not exists quick boolean not null default false;

drop view if exists public.company_scores;
drop index if exists public.stories_company_rating;
alter table public.stories drop column if exists rating_avg;
alter table public.stories add column rating_avg numeric(3,2) generated always as (
  (coalesce(rating_hiring, 0) + coalesce(rating_communication, 0) + coalesce(rating_culture, 0) + coalesce(rating_pay, 0) + coalesce(rating_growth, 0))::numeric
  / nullif((rating_hiring is not null)::int + (rating_communication is not null)::int + (rating_culture is not null)::int + (rating_pay is not null)::int + (rating_growth is not null)::int, 0)
) stored;
create index if not exists stories_company_rating on public.stories (company_id, rating_avg);

create view public.company_scores as
select
  c.id, c.slug, c.name, c.color, c.summary, c.domain, c.website, c.logo_url, c.about, c.industry, c.size, c.hq_city, c.founded, c.careers_url, c.created_at,
  count(s.id)::int as story_count,
  round(avg((s.rating_hiring - 1) * 25))::int        as score_hiring,
  round(avg((s.rating_communication - 1) * 25))::int as score_communication,
  round(avg((s.rating_culture - 1) * 25))::int       as score_culture,
  round(avg((s.rating_pay - 1) * 25))::int           as score_pay,
  round(avg((s.rating_growth - 1) * 25))::int        as score_growth,
  count(s.rating_hiring)::int        as count_hiring,
  count(s.rating_communication)::int as count_communication,
  count(s.rating_culture)::int       as count_culture,
  count(s.rating_pay)::int           as count_pay,
  count(s.rating_growth)::int        as count_growth,
  round(avg((s.rating_avg - 1) * 25))::int as flag_score,
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
-- "I want to know about this company": members waiting for a company's first story. The page shows
-- how many are waiting; when a story about the company is published, each one gets a notification
-- and an email once (notified_at). Safe to run again.
-- ============================================================================
create table if not exists public.company_interest (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (company_id, user_id)
);
create index if not exists company_interest_waiting on public.company_interest (company_id) where notified_at is null;
alter table public.company_interest enable row level security;
revoke all on public.company_interest from anon, authenticated;
grant select, insert, update, delete on public.company_interest to service_role;

-- ============================================================================
-- Invites and flair. Each member gets a private invite code; someone who joins with it is linked
-- through referred_by. Rewards unlock when the invited person publishes a story (never for a bare
-- sign-up), so invites can't be farmed with empty accounts. Flair is the cosmetic a member picked
-- from what they've unlocked (invites and missions); it colours their avatar ring and page banner.
-- Safe to run again.
-- ============================================================================
alter table public.profiles add column if not exists ref_code text;
create unique index if not exists profiles_ref_code on public.profiles (ref_code) where ref_code is not null;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists referred_at timestamptz;
alter table public.profiles add column if not exists flair text check (flair is null or flair in ('violet','sunrise','mint','gold','cosmic'));
create index if not exists profiles_referred_by on public.profiles (referred_by) where referred_by is not null;

-- ============================================================================
-- Storage use, for the admin panel's Storage page: the whole database's size and every public
-- table's size on disk (data, indexes and TOAST) with an estimated row count. Read-only; callable
-- by the API (service role) only. Safe to run again.
-- ============================================================================
create or replace function public.admin_storage_stats()
returns table (table_name text, row_estimate bigint, total_bytes bigint, index_bytes bigint, database_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select c.relname::text, greatest(c.reltuples, 0)::bigint, pg_total_relation_size(c.oid), pg_indexes_size(c.oid), pg_database_size(current_database())
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by pg_total_relation_size(c.oid) desc;
$$;
revoke all on function public.admin_storage_stats() from public, anon, authenticated;
grant execute on function public.admin_storage_stats() to service_role;

-- ============================================================================
-- Funnel counters and Waiting Room nudges.
--   funnel_daily   one counter per event per day (visits, tool uses, searches, sign-ups, first
--                  stories). Counts only: no user ids, no IPs, nothing that identifies anyone.
--   applications.nudged_at   when we last suggested sharing what happened with a tracked
--                  application that went quiet (one nudge per application).
-- Safe to run again.
-- ============================================================================
create table if not exists public.funnel_daily (
  day   date not null default current_date,
  event text not null check (event in ('visit','ghostometer','timeline_check','followup','company_search','signup','first_story','invite_open')),
  count integer not null default 0,
  primary key (day, event)
);
alter table public.funnel_daily enable row level security;
revoke all on public.funnel_daily from anon, authenticated;
grant select, insert, update, delete on public.funnel_daily to service_role;

create or replace function public.funnel_hit(p_event text)
returns void language sql security definer set search_path = '' as $$
  insert into public.funnel_daily as f (day, event, count) values (current_date, p_event, 1)
  on conflict (day, event) do update set count = f.count + 1;
$$;
revoke all on function public.funnel_hit(text) from public, anon, authenticated;
grant execute on function public.funnel_hit(text) to service_role;

alter table public.applications add column if not exists nudged_at timestamptz;

-- ============================================================================
-- Ghost Blasters leaderboard (cosmetic only).
--   game_scores   each member's best run: Experience, level, offers and run length. One row per
--                 member, replaced only by a higher score. Shown with anonymous handles only, never
--                 real names. The API caps every score by how long the run really lasted.
-- Safe to run again.
-- ============================================================================
create table if not exists public.game_scores (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  xp         integer not null check (xp between 0 and 10000000),
  level      integer not null check (level between 1 and 10000),
  offers     integer not null check (offers between 0 and 10000),
  seconds    integer not null check (seconds between 0 and 86400),
  updated_at timestamptz not null default now()
);
create index if not exists game_scores_xp_idx on public.game_scores (xp desc, updated_at asc);
alter table public.game_scores enable row level security;
revoke all on public.game_scores from anon, authenticated;
grant select, insert, update, delete on public.game_scores to service_role;

-- ============================================================================
-- Company requests.
--   company_requests   "Not listed yet? Request it" from someone who can't list the company right
--                      now (daily or weekly listing limit, or a brand-new account). Keyed by the
--                      company's website domain. When anyone lists that domain, every requester
--                      gets one notification and notified_at is set. One request per member per domain.
-- Safe to run again.
-- ============================================================================
create table if not exists public.company_requests (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  domain      text not null check (char_length(domain) between 3 and 200),
  name        text check (char_length(name) <= 80),
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, domain)
);
create index if not exists company_requests_pending_idx on public.company_requests (domain) where notified_at is null;
alter table public.company_requests enable row level security;
revoke all on public.company_requests from anon, authenticated;
grant select, insert, update, delete on public.company_requests to service_role;

-- ============================================================================
-- Ask candidates (company Q&A), Right of Reply, and removal / correction requests.
--   company_questions   anonymous questions on a company page (any member; 3 open per day).
--   company_answers     anonymous answers, only from members with a story about the company or
--                       who follow it. The asker can pin one as best (best_answer_id).
--   company_reps        members verified as a company's representative by a code sent to a work
--                       email on the company's own domain. Only the domain is kept, never the email.
--   rep_replies         a verified rep's ONE official reply per story, plus one on the company page
--                       (story_id null). Reps can't edit or delete; only moderators remove them.
--   content_requests    removal and factual-error requests from anyone (signed in or not), with the
--                       times we acknowledged and resolved them (24 h / 15 day promise).
-- Bodies are Brotli-compressed like stories and chitchats. Safe to run again.
-- ============================================================================
create table if not exists public.company_questions (
  id             uuid primary key default gen_random_uuid(),
  public_id      bigint not null unique default gen_public_id(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body_z         bytea not null check (octet_length(body_z) between 2 and 4096),
  status         text not null default 'published' check (status in ('published','pending','removed')),
  best_answer_id uuid,
  moderation     jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists company_questions_company_idx on public.company_questions (company_id, created_at desc) where status = 'published';
create index if not exists company_questions_author_idx on public.company_questions (author_id, created_at desc);

create table if not exists public.company_answers (
  id          uuid primary key default gen_random_uuid(),
  public_id   bigint not null unique default gen_public_id(),
  question_id uuid not null references public.company_questions (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body_z      bytea not null check (octet_length(body_z) between 2 and 4096),
  basis       text not null check (basis in ('story','follower')),
  status      text not null default 'published' check (status in ('published','pending','removed')),
  moderation  jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists company_answers_question_idx on public.company_answers (question_id, created_at) where status = 'published';
create index if not exists company_answers_author_idx on public.company_answers (author_id, created_at desc);

create table if not exists public.company_reps (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  company_id   uuid not null references public.companies (id) on delete cascade,
  email_domain text not null check (char_length(email_domain) between 3 and 200),
  verified_at  timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (user_id, company_id)
);

create table if not exists public.rep_replies (
  id         uuid primary key default gen_random_uuid(),
  public_id  bigint not null unique default gen_public_id(),
  company_id uuid not null references public.companies (id) on delete cascade,
  story_id   uuid references public.stories (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body_z     bytea not null check (octet_length(body_z) between 2 and 4096),
  status     text not null default 'published' check (status in ('published','pending','removed')),
  moderation jsonb,
  removed_reason text,
  created_at timestamptz not null default now()
);
-- One live reply per story per company, and one on the company page.
create unique index if not exists rep_replies_one_per_story on public.rep_replies (company_id, story_id) where story_id is not null and status <> 'removed';
create unique index if not exists rep_replies_one_on_page on public.rep_replies (company_id) where story_id is null and status <> 'removed';

create table if not exists public.content_requests (
  id              uuid primary key default gen_random_uuid(),
  public_id       bigint not null unique default gen_public_id(),
  kind            text not null check (kind in ('removal','factual_error')),
  target_url      text not null check (char_length(target_url) between 8 and 500),
  requester_id    uuid references public.profiles (id) on delete set null,
  email           text not null check (char_length(email) between 5 and 254),
  relationship    text not null check (relationship in ('author','company','subject','other')),
  details         text not null check (char_length(details) between 20 and 3000),
  status          text not null default 'open' check (status in ('open','acknowledged','resolved','declined')),
  resolution      text check (char_length(resolution) <= 2000),
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at     timestamptz
);
create index if not exists content_requests_open_idx on public.content_requests (created_at) where status in ('open','acknowledged');

alter table public.company_questions enable row level security;
alter table public.company_answers   enable row level security;
alter table public.company_reps      enable row level security;
alter table public.rep_replies       enable row level security;
alter table public.content_requests  enable row level security;
revoke all on public.company_questions, public.company_answers, public.company_reps, public.rep_replies, public.content_requests from anon, authenticated;
grant select, insert, update, delete on public.company_questions, public.company_answers, public.company_reps, public.rep_replies, public.content_requests to service_role;

-- ============================================================================
-- Green flag shout-outs.
--   story_green_flags   the up-to-3 things a company did well, for stories posted as a "Green flag
--                       shout-out". The story itself is an ordinary quick story (so it counts toward
--                       the Founding 50 and the Flag Score like any other); this table only adds the
--                       ticks and the green card style. Kept separate so stories never depend on it.
-- Safe to run again.
-- ============================================================================
create table if not exists public.story_green_flags (
  story_id   uuid primary key references public.stories (id) on delete cascade,
  flags      text[] not null check (cardinality(flags) between 1 and 3 and flags <@ array['replied_48h','clear_pay','respectful_rejection','quick_process','gave_feedback']::text[]),
  created_at timestamptz not null default now()
);
alter table public.story_green_flags enable row level security;
revoke all on public.story_green_flags from anon, authenticated;
grant select, insert, update, delete on public.story_green_flags to service_role;

-- ============================================================================
-- Phone notifications (Web Push).
--   push_subscriptions   one row per device a member turned notifications on for (an Android phone,
--                        an iPhone/iPad with Ghosted on the Home Screen, a desktop browser). The
--                        endpoint is the push service's address for that device; p256dh and auth are
--                        the device's public encryption keys. Rows are removed when the member turns
--                        notifications off, signs the device out, or the push service says the
--                        device is gone (404 / 410).
-- Safe to run again.
-- ============================================================================
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh       text not null check (char_length(p256dh) between 40 and 200),
  auth         text not null check (char_length(auth) between 10 and 100),
  device       text check (char_length(device) <= 120),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- ============================================================================
-- Waiting Room reminders.
--   applications.reminder_level   follow-up pushes already sent for the current wait: 0 none, 1 the
--                                 day-7 one, 2 the day-14 one
--   applications.reminder_since   the waiting_since those reminders were for; when the clock restarts
--                                 (a new round, or "heard back"), they start over
-- Safe to run again.
-- ============================================================================
alter table public.applications add column if not exists reminder_level smallint not null default 0 check (reminder_level between 0 and 2);
alter table public.applications add column if not exists reminder_since date;
create index if not exists applications_reminders on public.applications (waiting_since) where status = 'waiting';

-- ============================================================================
-- Levels, XP and streaks (replaces invite levels, missions and avatar rings).
--   xp_events          one row per thing that earned XP: kind + ref is unique per member, so the
--                      same story, reaction or follow can never pay twice (un-react and re-react
--                      earns nothing). `day` is the India date, for daily caps and streaks.
--   profiles.xp        lifetime XP; profiles.level is worked out from it (level_for_xp)
--   profiles.streak    consecutive India days with at least one XP event; best_streak is the record
--   award_xp()         the only way XP is added: checks the daily cap, scales the XP down as the
--                      level goes up, adds the daily streak bonus on the day's first event, and
--                      returns what happened (including whether the member levelled up)
-- The backfill at the end credits existing activity once (no multiplier, no streak). Safe to run
-- again: every insert ignores rows that already exist.
-- ============================================================================
create table if not exists public.xp_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('read','react','chitchat','story','follow','invite_join','invite','daily')),
  ref        text not null check (char_length(ref) between 1 and 80),
  day        date not null default ((now() at time zone 'Asia/Kolkata')::date),
  xp         integer not null check (xp between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists xp_events_user_day on public.xp_events (user_id, day, kind);
alter table public.xp_events enable row level security;
revoke all on public.xp_events from anon, authenticated;
grant select, insert, update, delete on public.xp_events to service_role;

alter table public.profiles add column if not exists xp integer not null default 0 check (xp >= 0);
alter table public.profiles add column if not exists level smallint not null default 1 check (level between 1 and 99);
alter table public.profiles add column if not exists streak smallint not null default 0 check (streak >= 0);
alter table public.profiles add column if not exists best_streak smallint not null default 0 check (best_streak >= 0);
alter table public.profiles add column if not exists streak_day date;

-- XP needed to go from level L to L+1: 100 × L^1.5 (100, 283, 520, 800, 1118…), so every level
-- takes longer than the one before. Keep in step with backend/src/levels.ts.
create or replace function public.level_for_xp(p_xp integer) returns smallint
language plpgsql immutable as $$
declare lvl integer := 1; need bigint := 0; step bigint;
begin
  loop
    step := round(100 * power(lvl, 1.5));
    exit when p_xp < need + step or lvl >= 99;
    need := need + step;
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.award_xp(p_user uuid, p_kind text, p_ref text, p_base integer, p_cap integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  p record;
  mult numeric;
  gain integer;
  bonus integer := 0;
  new_streak integer;
  new_xp integer;
  new_level smallint;
begin
  if p_cap > 0 and (select count(*) from xp_events where user_id = p_user and kind = p_kind and day = today) >= p_cap then
    return jsonb_build_object('awarded', 0, 'reason', 'cap');
  end if;
  select xp, level, streak, best_streak, streak_day into p from profiles where id = p_user for update;
  if not found then return jsonb_build_object('awarded', 0, 'reason', 'no_profile'); end if;
  -- Higher levels earn less per action: level 1 gets it all, level 11 about half, level 26 a third.
  mult := 1.0 / (1 + 0.1 * (p.level - 1));
  gain := greatest(1, round(p_base * mult));
  insert into xp_events (user_id, kind, ref, day, xp) values (p_user, p_kind, p_ref, today, gain) on conflict (user_id, kind, ref) do nothing;
  if not found then return jsonb_build_object('awarded', 0, 'reason', 'duplicate'); end if;
  -- The day's first XP: keep (or start) the streak and pay the streak bonus, 5 + 1 per streak day up to 30.
  new_streak := coalesce(p.streak, 0);
  if p.streak_day is distinct from today then
    new_streak := case when p.streak_day = today - 1 then new_streak + 1 else 1 end;
    bonus := greatest(1, round((5 + least(new_streak, 30)) * mult));
    insert into xp_events (user_id, kind, ref, day, xp) values (p_user, 'daily', today::text, today, bonus) on conflict (user_id, kind, ref) do nothing;
  end if;
  new_xp := p.xp + gain + bonus;
  new_level := level_for_xp(new_xp);
  update profiles set xp = new_xp, level = new_level, streak = new_streak, best_streak = greatest(p.best_streak, new_streak), streak_day = today where id = p_user;
  return jsonb_build_object('awarded', gain + bonus, 'bonus', bonus, 'xp', new_xp, 'level', new_level, 'from_level', p.level, 'streak', new_streak);
end $$;
revoke all on function public.award_xp(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.award_xp(uuid, text, text, integer, integer) to service_role;
grant execute on function public.level_for_xp(integer) to service_role;

-- Backfill: what members already did counts once, at base XP.
insert into public.xp_events (user_id, kind, ref, day, xp)
  select author_id, 'story', id::text, (created_at at time zone 'Asia/Kolkata')::date, 50 from public.stories where status = 'published'
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select user_id, 'react', story_id::text, (created_at at time zone 'Asia/Kolkata')::date, 4 from public.reactions
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select author_id, 'chitchat', id::text, (created_at at time zone 'Asia/Kolkata')::date, 10 from public.comments where status = 'published'
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select user_id, 'follow', 'c:' || company_id::text, (created_at at time zone 'Asia/Kolkata')::date, 5 from public.company_follows
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select follower_id, 'follow', 'p:' || followee_id::text, (created_at at time zone 'Asia/Kolkata')::date, 5 from public.follows
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select referred_by, 'invite_join', id::text, (coalesce(referred_at, created_at) at time zone 'Asia/Kolkata')::date, 30 from public.profiles where referred_by is not null
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, ref, day, xp)
  select distinct p.referred_by, 'invite', p.id::text, (now() at time zone 'Asia/Kolkata')::date, 120
  from public.profiles p where p.referred_by is not null and exists (select 1 from public.stories s where s.author_id = p.id and s.status = 'published')
  on conflict (user_id, kind, ref) do nothing;
update public.profiles p set xp = t.total, level = public.level_for_xp(t.total)
  from (select user_id, sum(xp)::integer as total from public.xp_events group by user_id) t
  where t.user_id = p.id and p.xp < t.total;

-- ============================================================================
-- Levels: streak freezes, milestones and the invite welcome bonus. Run after the section above.
--   profiles.streak_freezes   earned one per 7 streak days (hold up to 2); a single missed day
--                             spends one automatically and the streak carries on
--   kind 'milestone'          bonus XP at 7, 30, 100 and 365 streak days (once each, ever)
--   kind 'welcome'            +25 XP for someone who joins through an invite link
-- award_xp() is replaced with the version that handles all three, and reports what happened
-- (freeze_used, milestone) so the API can tell the member. Safe to run again.
-- ============================================================================
alter table public.xp_events drop constraint if exists xp_events_kind_check;
alter table public.xp_events add constraint xp_events_kind_check check (kind in ('read','react','chitchat','story','follow','invite_join','invite','daily','welcome','milestone'));
alter table public.profiles add column if not exists streak_freezes smallint not null default 0 check (streak_freezes between 0 and 2);

create or replace function public.award_xp(p_user uuid, p_kind text, p_ref text, p_base integer, p_cap integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  p record;
  mult numeric;
  gain integer;
  bonus integer := 0;
  extra integer := 0;
  new_streak integer;
  freezes integer;
  froze boolean := false;
  milestone integer := null;
  new_xp integer;
  new_level smallint;
begin
  if p_cap > 0 and (select count(*) from xp_events where user_id = p_user and kind = p_kind and day = today) >= p_cap then
    return jsonb_build_object('awarded', 0, 'reason', 'cap');
  end if;
  select xp, level, streak, best_streak, streak_day, streak_freezes into p from profiles where id = p_user for update;
  if not found then return jsonb_build_object('awarded', 0, 'reason', 'no_profile'); end if;
  -- Higher levels earn less per action: level 1 gets it all, level 11 about half, level 26 a third.
  mult := 1.0 / (1 + 0.1 * (p.level - 1));
  gain := greatest(1, round(p_base * mult));
  insert into xp_events (user_id, kind, ref, day, xp) values (p_user, p_kind, p_ref, today, gain) on conflict (user_id, kind, ref) do nothing;
  if not found then return jsonb_build_object('awarded', 0, 'reason', 'duplicate'); end if;
  new_streak := coalesce(p.streak, 0);
  freezes := coalesce(p.streak_freezes, 0);
  if p.streak_day is distinct from today then
    -- Yesterday: the streak grows. The day before, with a freeze: the freeze covers the gap.
    if p.streak_day = today - 1 then new_streak := new_streak + 1;
    elsif p.streak_day = today - 2 and freezes > 0 then new_streak := new_streak + 1; freezes := freezes - 1; froze := true;
    else new_streak := 1;
    end if;
    -- A freeze for every 7 days kept, up to 2 in the bank.
    if new_streak % 7 = 0 then freezes := least(freezes + 1, 2); end if;
    bonus := greatest(1, round((5 + least(new_streak, 30)) * mult));
    insert into xp_events (user_id, kind, ref, day, xp) values (p_user, 'daily', today::text, today, bonus) on conflict (user_id, kind, ref) do nothing;
    -- Streak milestones pay once each, ever.
    if new_streak in (7, 30, 100, 365) then
      extra := greatest(1, round((case new_streak when 7 then 50 when 30 then 200 when 100 then 500 else 1000 end) * mult));
      insert into xp_events (user_id, kind, ref, day, xp) values (p_user, 'milestone', 'streak:' || new_streak, today, extra) on conflict (user_id, kind, ref) do nothing;
      if found then milestone := new_streak; else extra := 0; end if;
    end if;
  end if;
  new_xp := p.xp + gain + bonus + extra;
  new_level := level_for_xp(new_xp);
  update profiles set xp = new_xp, level = new_level, streak = new_streak, best_streak = greatest(p.best_streak, new_streak), streak_day = today, streak_freezes = freezes where id = p_user;
  return jsonb_build_object('awarded', gain + bonus + extra, 'bonus', bonus, 'xp', new_xp, 'level', new_level, 'from_level', p.level, 'streak', new_streak,
    'freeze_used', froze, 'freezes', freezes, 'milestone', milestone, 'milestone_xp', extra);
end $$;
revoke all on function public.award_xp(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.award_xp(uuid, text, text, integer, integer) to service_role;

-- ============================================================================
-- Impact ladder: a candidate's story visibly leading somewhere (backend/src/impact.ts).
--   rep_story_views    a verified rep of the story's company opened it; once per rep per story.
--                      Authors see the count, never which rep.
--   story_responses    append-only steps a rep sets: heard, looking_into_it, fixed. Each step once
--                      per story (unique), forward only (checked by the API), never edited or deleted
--                      (no update/delete grants beyond the service role, and the API has no route).
--                      An optional short note goes through review: note_status pending until checked.
--   notifications      new kind 'rep_update' for every step of the ladder.
--   xp_events          new kind 'impact' (a company responded to, or cited, your story).
-- Safe to run again.
-- ============================================================================
create table if not exists public.rep_story_views (
  story_id      uuid not null references public.stories (id) on delete cascade,
  rep_user_id   uuid not null references public.profiles (id) on delete cascade,
  company_id    uuid not null references public.companies (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (story_id, rep_user_id)
);
create index if not exists rep_story_views_company on public.rep_story_views (company_id, first_seen_at desc);
alter table public.rep_story_views enable row level security;
revoke all on public.rep_story_views from anon, authenticated;
grant select, insert on public.rep_story_views to service_role;

create table if not exists public.story_responses (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  company_id  uuid not null references public.companies (id) on delete cascade,
  rep_user_id uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('heard','looking_into_it','fixed')),
  note_z      bytea check (note_z is null or octet_length(note_z) between 2 and 2048),
  note_status text check (note_status is null or note_status in ('published','pending','removed')),
  moderation  jsonb,
  created_at  timestamptz not null default now(),
  unique (story_id, status)
);
create index if not exists story_responses_company on public.story_responses (company_id, created_at desc);
create index if not exists story_responses_notes on public.story_responses (note_status) where note_status = 'pending';
alter table public.story_responses enable row level security;
revoke all on public.story_responses from anon, authenticated;
-- Moderators may only hide a note (note_status), never change or remove the step itself.
grant select, insert on public.story_responses to service_role;
grant update (note_status) on public.story_responses to service_role;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('relatable','reply','company','system','following','follower','goofy','rep_update'));

alter table public.xp_events drop constraint if exists xp_events_kind_check;
alter table public.xp_events add constraint xp_events_kind_check check (kind in ('read','react','chitchat','story','follow','invite_join','invite','daily','welcome','milestone','impact'));

-- Written at sign-in (devices.ts) but never declared: added here so it always exists.
alter table public.session_devices add column if not exists ip_masked text check (ip_masked is null or char_length(ip_masked) <= 64);

-- ============================================================================
-- You said, we did (backend/src/changes.ts): a verified rep's public note about what changed,
-- linked to the candidate stories behind it.
--   company_changes        the note (reviewed; held as 'pending' if unsure). No edits: the API has
--                          no edit or delete route; only moderators set status 'removed'.
--   company_change_stories 1 to 5 cited stories per note, only stories about that company (the
--                          API checks both, and the trigger below caps the count).
-- At most 4 notes per rep per calendar month (India time), checked by the API. Safe to run again.
-- ============================================================================
create table if not exists public.company_changes (
  id             uuid primary key default gen_random_uuid(),
  public_id      bigint not null unique default gen_public_id(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  rep_user_id    uuid not null references public.profiles (id) on delete cascade,
  body_z         bytea not null check (octet_length(body_z) between 2 and 4096),
  status         text not null default 'published' check (status in ('published','pending','removed')),
  moderation     jsonb,
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 300),
  created_at     timestamptz not null default now()
);
create index if not exists company_changes_company on public.company_changes (company_id, created_at desc) where status = 'published';
create index if not exists company_changes_rep_month on public.company_changes (rep_user_id, created_at desc);
alter table public.company_changes enable row level security;
revoke all on public.company_changes from anon, authenticated;
grant select, insert on public.company_changes to service_role;
grant update (status, removed_reason) on public.company_changes to service_role;

create table if not exists public.company_change_stories (
  change_id uuid not null references public.company_changes (id) on delete cascade,
  story_id  uuid not null references public.stories (id) on delete cascade,
  primary key (change_id, story_id)
);
create index if not exists company_change_stories_story on public.company_change_stories (story_id);
alter table public.company_change_stories enable row level security;
revoke all on public.company_change_stories from anon, authenticated;
grant select, insert on public.company_change_stories to service_role;

-- No more than 5 stories on one note, and only stories about the note's company.
create or replace function public.company_change_stories_check() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.company_change_stories where change_id = new.change_id) >= 5 then
    raise exception 'A change note can cite at most 5 stories';
  end if;
  if not exists (select 1 from public.company_changes ch join public.stories s on s.company_id = ch.company_id where ch.id = new.change_id and s.id = new.story_id) then
    raise exception 'A change note can only cite stories about its own company';
  end if;
  return new;
end $$;
drop trigger if exists company_change_stories_check on public.company_change_stories;
create trigger company_change_stories_check before insert on public.company_change_stories for each row execute function public.company_change_stories_check();

-- ============================================================================
-- Demand (backend/src/demand.ts): "Ask {company} to respond", one per member per company, can be
-- taken back. Shown as "N candidates asked" only from 3. Safe to run again.
-- ============================================================================
create table if not exists public.response_requests (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
alter table public.response_requests enable row level security;
revoke all on public.response_requests from anon, authenticated;
grant select, insert, delete on public.response_requests to service_role;

-- ============================================================================
-- Reply pledges (backend/src/pledges.ts, badge rules in backend/src/lib/pledge.ts): a verified rep
-- publicly pledges that candidates hear back within 7, 14 or 30 days. The badge (made, holding,
-- mixed, slipping, withdrawn) is computed nightly from candidate stories posted after the pledge,
-- always labelled "Based on N candidate stories, not verified by the company". One live pledge per
-- company; withdrawing keeps the row and shows "Pledge withdrawn". Never purchasable.
-- Also: the funnel counts the company side of the loop. Safe to run again.
-- ============================================================================
create table if not exists public.company_pledges (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  rep_user_id  uuid references public.profiles (id) on delete set null,
  days         smallint not null check (days in (7, 14, 30)),
  made_at      timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by text check (withdrawn_by is null or withdrawn_by in ('rep','moderator')),
  badge        text not null default 'made' check (badge in ('made','holding','mixed','slipping','withdrawn')),
  stories_n    integer not null default 0 check (stories_n >= 0),
  kept_n       integer not null default 0 check (kept_n >= 0),
  computed_at  timestamptz
);
create unique index if not exists company_pledges_one_live on public.company_pledges (company_id) where withdrawn_at is null;
create index if not exists company_pledges_company on public.company_pledges (company_id, made_at desc);
alter table public.company_pledges enable row level security;
revoke all on public.company_pledges from anon, authenticated;
grant select, insert on public.company_pledges to service_role;
grant update (withdrawn_at, withdrawn_by, badge, stories_n, kept_n, computed_at) on public.company_pledges to service_role;

alter table public.funnel_daily drop constraint if exists funnel_daily_event_check;
alter table public.funnel_daily add constraint funnel_daily_event_check check (event in ('visit','ghostometer','timeline_check','followup','company_search','signup','first_story','invite_open',
  'rep_start','rep_verified','rep_viewed_story','rep_status','change_posted','ask_response','pledge_made'));

-- ============================================================================
-- More company industries (keep in step with backend/src/lib/industries.ts). Every original value
-- is still allowed, so existing companies keep theirs; this only adds new ones. Safe to run again.
-- ============================================================================
alter table public.companies drop constraint if exists companies_industry_check;
alter table public.companies add constraint companies_industry_check check (industry is null or industry in (
  'software','it_services','ai_ml','cybersecurity','cloud','semiconductors','electronics','robotics','iot','gaming','crypto','gcc',
  'fintech','payments','bfsi','lending','insurtech','wealth','accounting',
  'ecommerce','quick_commerce','d2c','retail','fmcg','fashion','beauty','food_beverage','foodtech',
  'healthtech','hospitals','pharma','medical_devices','fitness',
  'edtech','education','hrtech','staffing',
  'media','entertainment','publishing','advertising','social',
  'manufacturing','automotive','aerospace','chemicals','metals_mining','textiles','construction','real_estate','energy','renewables','oil_gas','climate','agritech',
  'logistics','mobility','aviation','travel','hospitality',
  'consulting','bpo','kpo','legal','telecom','government','nonprofit','research',
  'other'));

-- ============================================================================
-- Goofy, fairer (backend/src/goofy/index.ts, backend/src/algorithms/moderation.ts).
--   * New private actions: 'struck' (a strike: only when PUBLISHED content is taken down) and
--     'refused' (a post turned away at the door: never a strike, the author just edits and retries).
--   * Pauses caused by the old rule (refused or held attempts counted as strikes) are lifted.
--   * Words Goofy had learned from those refused attempts are retired; it relearns tonight from
--     real removals only. Everyday words ("heck", "hell", "fuck", "how on earth") are never learned.
-- Safe to run again.
-- ============================================================================
alter table public.goofy_actions drop constraint if exists goofy_actions_action_check;
alter table public.goofy_actions add constraint goofy_actions_action_check check (action in (
  'removed_story','removed_chitchat','held','released','redacted','took_down','restored',
  'reported_story','reported_chitchat','reported_company','asked_rephrase','warned','paused',
  'welcomed','ghost_job_alert','dismissed_reports','escalated','lists_updated','learned','struck','refused'));
update public.profiles set posting_paused_until = null where posting_paused_until > now();
update public.moderation_terms set status = 'retired', updated_at = now() where source = 'learned' and status = 'active';
update public.moderation_terms set status = 'retired', updated_at = now()
  where status = 'active' and term in ('heck','hell','hella','damn','dang','darn','fuck','fucking','fucked','fuckin','fck','wtf','omg','crap','bloody','shit','shitty','bullshit','earth','world','freaking','frick');

-- ============================================================================
-- While you're away (backend/src/away.ts): members who haven't opened Ghosted for 2+ days get one
-- personalised "here's what you missed" email, notification and push, at most once every 7 days.
-- profiles.away_nudged_at remembers the last one. Members turn it off in Settings (notify.comeBack).
-- Safe to run again.
-- ============================================================================
alter table public.profiles add column if not exists away_nudged_at timestamptz;
create index if not exists session_devices_last_seen on public.session_devices (last_seen_at desc);

-- ============================================================================
-- Takedown process (backend/src/takedown.ts, public page /takedown): removal and correction
-- requests record their reason (`basis`), a company's good-faith statement, and the decision's
-- `outcome`. Requesters are emailed at each step and can check status with their reference and
-- email; a story's author is told at acknowledgement (72 hours to respond) and at the decision.
-- Safe to run again.
-- ============================================================================
alter table public.content_requests add column if not exists basis text check (basis is null or basis in ('defamation','false_fact','personal_data','confidential','harassment','impersonation','copyright','other'));
alter table public.content_requests add column if not exists good_faith boolean;
alter table public.content_requests add column if not exists outcome text check (outcome is null or outcome in ('no_action','author_corrected','redacted','removed','other'));

-- ============================================================================
-- Ad results (backend/src/ads.ts): how many visits and sign-ups each ad brought, per day. An ad
-- link carries utm_campaign and utm_content; the site keeps them for that browser tab only and
-- the API adds one to the matching counter. Counts only: no user ids, no IPs, nothing that
-- identifies anyone.
-- Safe to run again.
-- ============================================================================
create table if not exists public.ad_daily (
  day      date not null default current_date,
  campaign text not null check (campaign ~ '^[a-z0-9_-]{1,40}$'),
  content  text not null check (content ~ '^[a-z0-9_-]{1,40}$'),
  event    text not null check (event in ('visit','signup')),
  count    integer not null default 0,
  primary key (day, campaign, content, event)
);
alter table public.ad_daily enable row level security;
revoke all on public.ad_daily from anon, authenticated;
grant select, insert, update, delete on public.ad_daily to service_role;

create or replace function public.ad_hit(p_campaign text, p_content text, p_event text)
returns void language sql security definer set search_path = '' as $$
  insert into public.ad_daily as a (day, campaign, content, event, count) values (current_date, p_campaign, p_content, p_event, 1)
  on conflict (day, campaign, content, event) do update set count = a.count + 1;
$$;
revoke all on function public.ad_hit(text, text, text) from public, anon, authenticated;
grant execute on function public.ad_hit(text, text, text) to service_role;

commit;
