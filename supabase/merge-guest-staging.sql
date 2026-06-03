-- Optional: merge anonymous staging into a permanent signed-in account.
-- Not used by the device-only app. Run only if you restore email/OAuth login and guest merge.
--
-- Prerequisites (Dashboard → Authentication → Providers):
--   • Anonymous sign-ins enabled
--   • Manual linking enabled (for linkIdentity / updateUser on guest users)
--
-- Legacy client called: rpc('merge_guest_staging_data', { p_guest_user_id, p_installation_id })

create or replace function public.merge_guest_staging_data(
  p_guest_user_id uuid,
  p_installation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_target uuid := auth.uid();
  v_guest_prefix text;
  v_target_prefix text;
  v_sessions_updated int := 0;
  v_storage_updated int := 0;
begin
  if v_target is null then
    raise exception 'not authenticated';
  end if;

  if p_guest_user_id is null or p_guest_user_id = v_target then
    return jsonb_build_object(
      'sessions_updated', 0,
      'storage_updated', 0,
      'skipped', true
    );
  end if;

  if p_installation_id is null or length(trim(p_installation_id)) = 0 then
    raise exception 'installation_id required';
  end if;

  v_guest_prefix := 'users/' || p_guest_user_id::text || '/';
  v_target_prefix := 'users/' || v_target::text || '/';

  -- Reassign session rows created on this device under the guest account.
  update public.staging_sessions
  set
    user_id = v_target,
    folder = v_target_prefix || substring(folder from length(v_guest_prefix) + 1)
  where user_id = p_guest_user_id
    and installation_id = p_installation_id;

  get diagnostics v_sessions_updated = row_count;

  -- Move all guest storage under users/<guest>/ so the permanent user can read via RLS.
  update storage.objects
  set name = v_target_prefix || substring(name from length(v_guest_prefix) + 1)
  where bucket_id = 'homeai-uploads'
    and name like v_guest_prefix || '%';

  get diagnostics v_storage_updated = row_count;

  -- Subscription profile: reassign guest row to permanent user (one row per user_id).
  begin
    update public.subscription_profiles
    set user_id = v_target, installation_id = p_installation_id, updated_at = now()
    where user_id = p_guest_user_id;
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object(
    'sessions_updated', v_sessions_updated,
    'storage_updated', v_storage_updated,
    'skipped', false
  );
end;
$$;

revoke all on function public.merge_guest_staging_data(uuid, text) from public;
grant execute on function public.merge_guest_staging_data(uuid, text) to authenticated;
