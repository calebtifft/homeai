-- Optional: cross-device subscription + daily free-tier quota (permanent accounts).
-- Not used by the device-only app (anonymous session per install). Run only if you add login/sync.
-- Run in Supabase SQL Editor after storage-policies.sql.

-- ---------------------------------------------------------------------------
-- Subscription profiles (one row per auth user; Pro fallback when RevenueCat offline)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null,
  status text not null default 'active',
  installation_id text,
  updated_at timestamptz not null default now()
);

create index if not exists subscription_profiles_installation_id_idx
  on public.subscription_profiles (installation_id);

alter table public.subscription_profiles enable row level security;

drop policy if exists "homeai_subscription_select_own" on public.subscription_profiles;
drop policy if exists "homeai_subscription_upsert_own" on public.subscription_profiles;
drop policy if exists "homeai_subscription_update_own" on public.subscription_profiles;

create policy "homeai_subscription_select_own"
on public.subscription_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "homeai_subscription_insert_own"
on public.subscription_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "homeai_subscription_update_own"
on public.subscription_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Daily free staging usage (global per user per calendar day, UTC day_key from app)
-- ---------------------------------------------------------------------------
create table if not exists public.user_staging_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key text not null,
  count int not null default 0 check (count >= 0 and count <= 99),
  updated_at timestamptz not null default now(),
  primary key (user_id, day_key)
);

alter table public.user_staging_daily enable row level security;

drop policy if exists "homeai_staging_usage_select_own" on public.user_staging_daily;
drop policy if exists "homeai_staging_usage_insert_own" on public.user_staging_daily;
drop policy if exists "homeai_staging_usage_update_own" on public.user_staging_daily;

create policy "homeai_staging_usage_select_own"
on public.user_staging_daily
for select
to authenticated
using (auth.uid() = user_id);

create policy "homeai_staging_usage_insert_own"
on public.user_staging_daily
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "homeai_staging_usage_update_own"
on public.user_staging_daily
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Atomically increment today's count for auth.uid().
create or replace function public.increment_user_staging_daily(p_day_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_day_key is null or length(trim(p_day_key)) = 0 then
    raise exception 'day_key required';
  end if;

  insert into public.user_staging_daily (user_id, day_key, count)
  values (v_uid, trim(p_day_key), 1)
  on conflict (user_id, day_key)
  do update set
    count = least(99, public.user_staging_daily.count + 1),
    updated_at = now()
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_user_staging_daily(text) from public;
grant execute on function public.increment_user_staging_daily(text) to authenticated;

-- Merge guest user's today count into permanent user (called from merge_guest_staging_data).
create or replace function public.merge_user_staging_daily(
  p_guest_user_id uuid,
  p_day_key text,
  p_daily_limit int default 3
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := auth.uid();
  v_guest_count int := 0;
  v_target_count int := 0;
begin
  if v_target is null then
    raise exception 'not authenticated';
  end if;
  if p_guest_user_id is null or p_guest_user_id = v_target then
    return 0;
  end if;

  select count into v_guest_count
  from public.user_staging_daily
  where user_id = p_guest_user_id and day_key = p_day_key;

  if v_guest_count is null then
    v_guest_count := 0;
  end if;

  if v_guest_count <= 0 then
    select count into v_target_count
    from public.user_staging_daily
    where user_id = v_target and day_key = p_day_key;
    return coalesce(v_target_count, 0);
  end if;

  insert into public.user_staging_daily (user_id, day_key, count)
  values (v_target, p_day_key, v_guest_count)
  on conflict (user_id, day_key)
  do update set
    count = least(p_daily_limit, public.user_staging_daily.count + excluded.count),
    updated_at = now()
  returning count into v_target_count;

  delete from public.user_staging_daily
  where user_id = p_guest_user_id and day_key = p_day_key;

  return v_target_count;
end;
$$;

revoke all on function public.merge_user_staging_daily(uuid, text, int) from public;
grant execute on function public.merge_user_staging_daily(uuid, text, int) to authenticated;
