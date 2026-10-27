alter table public.parking_slots
  add column if not exists is_active boolean not null default true;

create unique index if not exists parking_slots_slot_code_ci_unique_idx
  on public.parking_slots (upper(slot_code));

alter table public.manager_activity_logs
  drop constraint if exists manager_activity_logs_action_check;
alter table public.manager_activity_logs
  add constraint manager_activity_logs_action_check
  check (
    action in (
      'STAFF_CREATED',
      'STAFF_UPDATED',
      'PARKING_RATE_UPDATED',
      'INVOICE_CANCELLED',
      'INVOICE_COMPLETED_MANUALLY',
      'PARKING_SLOT_CREATED',
      'PARKING_SLOT_UPDATED',
      'PARKING_SLOT_ARCHIVED',
      'PARKING_SLOT_RESTORED'
    )
  );

create index if not exists parking_slots_active_order_idx
  on public.parking_slots (is_active, id);

create or replace function public.create_parking_slot(
  p_actor_id uuid,
  p_slot_code text,
  p_zone text,
  p_vehicle_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_slot public.parking_slots%rowtype;
  v_slot_code text := upper(btrim(coalesce(p_slot_code, '')));
  v_zone text := btrim(coalesce(p_zone, ''));
begin
  select *
  into v_actor
  from public.staff_profiles
  where user_id = p_actor_id
    and role = 'MANAGER'
    and is_active;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'actor_not_manager',
      'message', 'Chỉ quản lý đang hoạt động mới được quản lý vị trí đỗ.'
    );
  end if;

  if v_slot_code !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
    or length(v_zone) not between 1 and 80
    or p_vehicle_type is null
    or p_vehicle_type not in ('CAR', 'MOTORBIKE') then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_slot',
      'message', 'Mã ô, khu vực hoặc loại xe không hợp lệ.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_slot_code, 0));

  if exists (
    select 1 from public.parking_slots
    where upper(slot_code) = v_slot_code
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_code_exists',
      'message', 'Mã vị trí này đã được sử dụng, kể cả vị trí đã ngừng hoạt động.'
    );
  end if;

  insert into public.parking_slots (
    slot_code,
    zone,
    vehicle_type,
    status,
    is_active
  )
  values (
    v_slot_code,
    v_zone,
    p_vehicle_type,
    'AVAILABLE',
    true
  )
  returning * into v_slot;

  insert into public.manager_activity_logs (
    actor_id,
    actor_email,
    actor_name,
    action,
    target_type,
    target_id,
    details
  )
  values (
    v_actor.user_id,
    v_actor.email,
    v_actor.full_name,
    'PARKING_SLOT_CREATED',
    'PARKING_SLOT',
    v_slot.id::text,
    jsonb_build_object(
      'slotCode', v_slot.slot_code,
      'zone', v_slot.zone,
      'vehicleType', v_slot.vehicle_type
    )
  );

  return jsonb_build_object('success', true, 'slot', to_jsonb(v_slot));
end;
$$;

create or replace function public.update_parking_slot(
  p_actor_id uuid,
  p_slot_id bigint,
  p_slot_code text,
  p_zone text,
  p_vehicle_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_slot public.parking_slots%rowtype;
  v_old_slot public.parking_slots%rowtype;
  v_slot_code text := upper(btrim(coalesce(p_slot_code, '')));
  v_zone text := btrim(coalesce(p_zone, ''));
begin
  select *
  into v_actor
  from public.staff_profiles
  where user_id = p_actor_id
    and role = 'MANAGER'
    and is_active;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'actor_not_manager',
      'message', 'Chỉ quản lý đang hoạt động mới được quản lý vị trí đỗ.'
    );
  end if;

  if p_slot_id is null
    or v_slot_code !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
    or length(v_zone) not between 1 and 80
    or p_vehicle_type is null
    or p_vehicle_type not in ('CAR', 'MOTORBIKE') then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_slot',
      'message', 'Mã ô, khu vực hoặc loại xe không hợp lệ.'
    );
  end if;

  select *
  into v_old_slot
  from public.parking_slots
  where id = p_slot_id
  for update;

  if not found or not v_old_slot.is_active then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_not_found',
      'message', 'Không tìm thấy vị trí đang hoạt động.'
    );
  end if;

  if v_old_slot.status <> 'AVAILABLE'
    or exists (
      select 1
      from public.tickets
      where slot_id = p_slot_id
        and status = 'ACTIVE'
    ) then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_occupied',
      'message', 'Không thể sửa vị trí khi đang có xe hoặc vé còn hoạt động.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_slot_code, 0));

  if exists (
    select 1
    from public.parking_slots
    where upper(slot_code) = v_slot_code
      and id <> p_slot_id
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_code_exists',
      'message', 'Mã vị trí này đã được sử dụng.'
    );
  end if;

  update public.parking_slots
  set slot_code = v_slot_code,
      zone = v_zone,
      vehicle_type = p_vehicle_type
  where id = p_slot_id
  returning * into v_slot;

  insert into public.manager_activity_logs (
    actor_id,
    actor_email,
    actor_name,
    action,
    target_type,
    target_id,
    details
  )
  values (
    v_actor.user_id,
    v_actor.email,
    v_actor.full_name,
    'PARKING_SLOT_UPDATED',
    'PARKING_SLOT',
    v_slot.id::text,
    jsonb_build_object(
      'before', jsonb_build_object(
        'slotCode', v_old_slot.slot_code,
        'zone', v_old_slot.zone,
        'vehicleType', v_old_slot.vehicle_type
      ),
      'after', jsonb_build_object(
        'slotCode', v_slot.slot_code,
        'zone', v_slot.zone,
        'vehicleType', v_slot.vehicle_type
      )
    )
  );

  return jsonb_build_object('success', true, 'slot', to_jsonb(v_slot));
end;
$$;

create or replace function public.set_parking_slot_active(
  p_actor_id uuid,
  p_slot_id bigint,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_slot public.parking_slots%rowtype;
  v_action text;
begin
  select *
  into v_actor
  from public.staff_profiles
  where user_id = p_actor_id
    and role = 'MANAGER'
    and is_active;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'actor_not_manager',
      'message', 'Chỉ quản lý đang hoạt động mới được quản lý vị trí đỗ.'
    );
  end if;

  if p_slot_id is null or p_is_active is null then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_request',
      'message', 'Yêu cầu cập nhật trạng thái vị trí không hợp lệ.'
    );
  end if;

  select *
  into v_slot
  from public.parking_slots
  where id = p_slot_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_not_found',
      'message', 'Không tìm thấy vị trí đỗ.'
    );
  end if;

  if v_slot.is_active = p_is_active then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_status_unchanged',
      'message', 'Vị trí đã ở trạng thái được chọn.'
    );
  end if;

  if not p_is_active and (
    v_slot.status <> 'AVAILABLE'
    or exists (
      select 1
      from public.tickets
      where slot_id = p_slot_id
        and status = 'ACTIVE'
    )
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_occupied',
      'message', 'Không thể ngừng sử dụng vị trí khi đang có xe hoặc vé còn hoạt động.'
    );
  end if;

  update public.parking_slots
  set is_active = p_is_active
  where id = p_slot_id
  returning * into v_slot;

  v_action := case
    when p_is_active then 'PARKING_SLOT_RESTORED'
    else 'PARKING_SLOT_ARCHIVED'
  end;

  insert into public.manager_activity_logs (
    actor_id,
    actor_email,
    actor_name,
    action,
    target_type,
    target_id,
    details
  )
  values (
    v_actor.user_id,
    v_actor.email,
    v_actor.full_name,
    v_action,
    'PARKING_SLOT',
    v_slot.id::text,
    jsonb_build_object(
      'slotCode', v_slot.slot_code,
      'zone', v_slot.zone,
      'vehicleType', v_slot.vehicle_type
    )
  );

  return jsonb_build_object('success', true, 'slot', to_jsonb(v_slot));
end;
$$;

create or replace function public.check_in_vehicle(
  p_license_plate text,
  p_slot_id bigint
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_slot public.parking_slots%rowtype;
  v_ticket public.tickets%rowtype;
begin
  if p_license_plate is null or btrim(p_license_plate) = '' then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_plate',
      'message', 'Vui lòng cung cấp biển số xe hợp lệ.'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(upper(btrim(p_license_plate)), 0)
  );

  if exists (
    select 1
    from public.tickets
    where license_plate = upper(btrim(p_license_plate))
      and status = 'ACTIVE'
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'duplicate_plate',
      'message', format(
        'Xe mang biển số [%s] hiện đang ở trong bãi!',
        upper(btrim(p_license_plate))
      )
    );
  end if;

  select *
  into v_slot
  from public.parking_slots
  where id = p_slot_id
  for update;

  if not found or not v_slot.is_active then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_not_found',
      'message', 'Không tìm thấy vị trí đỗ đang hoạt động.'
    );
  end if;

  if v_slot.status <> 'AVAILABLE' then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_unavailable',
      'message', 'Vị trí này vừa được xe khác sử dụng. Vui lòng chọn ô khác.'
    );
  end if;

  insert into public.tickets (
    ticket_code,
    license_plate,
    slot_id,
    check_in_time,
    status
  )
  values (
    'PK-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
    upper(btrim(p_license_plate)),
    p_slot_id,
    clock_timestamp(),
    'ACTIVE'
  )
  returning * into v_ticket;

  update public.parking_slots
  set status = 'OCCUPIED'
  where id = p_slot_id;

  return jsonb_build_object(
    'success', true,
    'ticket', to_jsonb(v_ticket)
  );
end;
$$;

revoke all on function public.create_parking_slot(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_parking_slot(uuid, bigint, text, text, text)
  from public, anon, authenticated;
revoke all on function public.set_parking_slot_active(uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.create_parking_slot(uuid, text, text, text)
  to service_role;
grant execute on function public.update_parking_slot(uuid, bigint, text, text, text)
  to service_role;
grant execute on function public.set_parking_slot_active(uuid, bigint, boolean)
  to service_role;
