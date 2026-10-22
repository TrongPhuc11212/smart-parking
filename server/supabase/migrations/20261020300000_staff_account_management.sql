alter table public.staff_profiles
  add column if not exists is_active boolean not null default true;

create index if not exists staff_profiles_role_active_idx
  on public.staff_profiles (role, is_active);

create or replace function public.update_staff_profile(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.staff_profiles%rowtype;
  v_manager_count bigint;
  v_updated public.staff_profiles%rowtype;
begin
  if p_role is null
    or p_role not in ('MANAGER', 'STAFF')
    or p_email is null
    or btrim(p_email) = ''
    or p_full_name is null
    or btrim(p_full_name) = ''
    or p_is_active is null then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_profile',
      'message', 'Thông tin nhân viên không hợp lệ.'
    );
  end if;

  if p_actor_id = p_target_user_id
    and (not p_is_active or p_role <> 'MANAGER') then
    return jsonb_build_object(
      'success', false,
      'code', 'self_change_forbidden',
      'message', 'Bạn không thể tự khóa tài khoản hoặc tự hạ quyền quản lý.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-manager-count', 0));

  if not exists (
    select 1
    from public.staff_profiles
    where user_id = p_actor_id
      and role = 'MANAGER'
      and is_active
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'actor_not_manager',
      'message', 'Bạn không có quyền cập nhật nhân viên.'
    );
  end if;

  select *
  into v_target
  from public.staff_profiles
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'staff_not_found',
      'message', 'Không tìm thấy nhân viên.'
    );
  end if;

  if v_target.role = 'MANAGER'
    and v_target.is_active
    and (not p_is_active or p_role <> 'MANAGER') then
    select count(*)
    into v_manager_count
    from public.staff_profiles
    where role = 'MANAGER'
      and is_active;

    if v_manager_count <= 1 then
      return jsonb_build_object(
        'success', false,
        'code', 'last_manager',
        'message', 'Không thể khóa hoặc hạ quyền quản lý cuối cùng.'
      );
    end if;
  end if;

  begin
    update public.staff_profiles
    set email = lower(btrim(p_email)),
        full_name = btrim(p_full_name),
        role = p_role,
        is_active = p_is_active
    where user_id = p_target_user_id
    returning * into v_updated;
  exception
    when unique_violation then
      return jsonb_build_object(
        'success', false,
        'code', 'email_in_use',
        'message', 'Email này đã được sử dụng.'
      );
  end;

  return jsonb_build_object(
    'success', true,
    'staff', jsonb_build_object(
      'user_id', v_updated.user_id,
      'email', v_updated.email,
      'full_name', v_updated.full_name,
      'role', v_updated.role,
      'is_active', v_updated.is_active,
      'created_at', v_updated.created_at
    )
  );
end;
$$;

revoke all on function public.update_staff_profile(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_staff_profile(uuid, uuid, text, text, text, boolean)
  to service_role;
