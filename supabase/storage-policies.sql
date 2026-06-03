-- HomeAI: user-scoped private uploads + per-user session tracking.
--
-- 1) Dashboard → Storage: bucket id must match app config (default: homeai-uploads)
--    or set EXPO_PUBLIC_SUPABASE_STAGING_BUCKET.
-- 2) Keep the bucket PRIVATE (recommended).
-- 3) SQL Editor → run this whole script once (re-run after bucket name changes).
-- 4) History delete needs DELETE policies on staging_sessions + storage.objects; if deletes
--    only disappear locally, you skipped an older script — run this file again.
-- 5) Optional (not used by device-only app): merge-guest-staging.sql for guest → permanent account.
-- 6) Optional (not used by device-only app): account-sync.sql for cross-device Pro + daily quota.
--    Current app uses anonymous sign-in per install only; enable Anonymous in Auth → Providers.

-- Remove old permissive policies from earlier setups.
drop policy if exists "homeai_allow_anon_insert" on storage.objects;
drop policy if exists "homeai_allow_select" on storage.objects;
drop policy if exists "homeai_allow_insert_public" on storage.objects;
drop policy if exists "homeai_allow_select_public" on storage.objects;
drop policy if exists "homeai_user_insert_own_prefix" on storage.objects;
drop policy if exists "homeai_user_select_own_prefix" on storage.objects;

-- INSERT: authenticated users may only write under users/<auth.uid()>/...
-- Replace 'homeai-uploads' if your bucket id differs.
create policy "homeai_user_insert_own_prefix"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'homeai-uploads'
  and split_part(name, '/', 1) = 'users'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- SELECT: needed for signed URL generation and reads of own files.
create policy "homeai_user_select_own_prefix"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'homeai-uploads'
  and split_part(name, '/', 1) = 'users'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- DELETE: remove session folders/files when user deletes history (RLS denies without this).
drop policy if exists "homeai_user_delete_own_prefix" on storage.objects;

create policy "homeai_user_delete_own_prefix"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'homeai-uploads'
  and split_part(name, '/', 1) = 'users'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Optional but recommended: per-user metadata table for staging sessions.
create table if not exists public.staging_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  folder text not null,
  original_path text not null,
  staged_path text not null,
  original_source_uri text,
  staged_source_uri text,
  room_type text,
  style text,
  photo_mode text,
  palette_id text,
  created_at timestamptz not null default now()
);

alter table public.staging_sessions enable row level security;

drop policy if exists "homeai_sessions_insert_own" on public.staging_sessions;
drop policy if exists "homeai_sessions_select_own" on public.staging_sessions;

create policy "homeai_sessions_insert_own"
on public.staging_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "homeai_sessions_select_own"
on public.staging_sessions
for select
to authenticated
using (auth.uid() = user_id);

-- DELETE: required for in-app history removal (without this, deletes fail under RLS).
drop policy if exists "homeai_sessions_delete_own" on public.staging_sessions;

create policy "homeai_sessions_delete_own"
on public.staging_sessions
for delete
to authenticated
using (auth.uid() = user_id);

-- Installation-id column (per-device identity used for cross-account history view).
-- Without this column every insert from the app silently fails (the writer always sends
-- `installation_id`), so brand-new staging sessions never get a row → Gallery/History falls
-- back to the generic "Staging style" / "Room" labels. Safe to re-run.
alter table public.staging_sessions add column if not exists installation_id text;
create index if not exists staging_sessions_installation_id_idx
  on public.staging_sessions (installation_id);

-- Exterior design mode + taxonomy (safe to re-run).
alter table public.staging_sessions add column if not exists design_mode text;
alter table public.staging_sessions add column if not exists exterior_scene_type text;
alter table public.staging_sessions add column if not exists exterior_style text;

-- Walls-only refresh (paint, wallpaper, paneling, tile, mural, custom). Safe to re-run.
alter table public.staging_sessions add column if not exists wall_treatment text;
alter table public.staging_sessions add column if not exists wall_style text;
alter table public.staging_sessions add column if not exists wall_color_hex text;
alter table public.staging_sessions add column if not exists wall_custom_prompt text;
