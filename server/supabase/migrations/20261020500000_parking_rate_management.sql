create table if not exists public.parking_rates (
  vehicle_type text primary key
    check (vehicle_type in ('MOTORBIKE', 'CAR')),
  first_two_hours_amount integer not null
    check (first_two_hours_amount >= 0),
  additional_hour_amount integer not null
    check (additional_hour_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.parking_rates (
  vehicle_type,
  first_two_hours_amount,
  additional_hour_amount
)
values
  ('MOTORBIKE', 5000, 2000),
  ('CAR', 20000, 10000)
on conflict (vehicle_type) do nothing;

alter table public.parking_rates enable row level security;
revoke all on public.parking_rates from public, anon, authenticated;
grant select, insert, update, delete on public.parking_rates to service_role;

create or replace function public.update_parking_rate(
  p_actor_id uuid,
  p_vehicle_type text,
  p_first_two_hours_amount integer,
  p_additional_hour_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate public.parking_rates%rowtype;
begin
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
      'message', 'Chỉ quản lý đang hoạt động mới được thay đổi bảng giá.'
    );
  end if;

  if p_vehicle_type is null
    or p_vehicle_type not in ('MOTORBIKE', 'CAR')
    or p_first_two_hours_amount is null
    or p_first_two_hours_amount < 0
    or p_additional_hour_amount is null
    or p_additional_hour_amount < 0 then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_rate',
      'message', 'Thông tin giá gửi xe không hợp lệ.'
    );
  end if;

  update public.parking_rates
  set first_two_hours_amount = p_first_two_hours_amount,
      additional_hour_amount = p_additional_hour_amount,
      updated_at = now()
  where vehicle_type = p_vehicle_type
  returning * into v_rate;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'rate_not_found',
      'message', 'Không tìm thấy loại phương tiện cần cập nhật.'
    );
  end if;

  return jsonb_build_object('success', true, 'rate', to_jsonb(v_rate));
end;
$$;

revoke all on function public.update_parking_rate(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.update_parking_rate(uuid, text, integer, integer)
  to service_role;

create or replace function public.check_out_vehicle(
  p_license_plate text,
  p_payment_reference uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_slot public.parking_slots%rowtype;
  v_rate public.parking_rates%rowtype;
  v_check_out_time timestamptz := clock_timestamp();
  v_duration_seconds numeric;
  v_total_hours integer;
  v_amount numeric;
  v_vehicle_type text;
  v_payment_code text;
begin
  if p_license_plate is null or btrim(p_license_plate) = ''
    or p_payment_reference is null then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_request',
      'message', 'Thông tin check-out không hợp lệ.'
    );
  end if;

  select *
  into v_ticket
  from public.tickets
  where license_plate = upper(btrim(p_license_plate))
    and status = 'ACTIVE'
  order by check_in_time desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'active_ticket_not_found',
      'message', format(
        'Không tìm thấy lượt xe %s nào đang gửi trong bãi!',
        upper(btrim(p_license_plate))
      )
    );
  end if;

  select *
  into v_slot
  from public.parking_slots
  where id = v_ticket.slot_id
  for update;

  if not found then
    raise exception 'Không tìm thấy ô đỗ của vé %s.', v_ticket.ticket_code;
  end if;

  v_vehicle_type := coalesce(v_slot.vehicle_type, 'MOTORBIKE');

  if v_ticket.payment_status = 'PENDING' then
    return jsonb_build_object(
      'success', true,
      'receipt', jsonb_build_object(
        'ticketCode', v_ticket.ticket_code,
        'licensePlate', v_ticket.license_plate,
        'vehicleType', v_vehicle_type,
        'slotCode', v_slot.slot_code,
        'checkInTime', v_ticket.check_in_time,
        'checkOutTime', v_ticket.check_out_time,
        'duration', format(
          '%sh %sm',
          floor(extract(epoch from (v_ticket.check_out_time - v_ticket.check_in_time)) / 3600)::integer,
          floor(mod(extract(epoch from (v_ticket.check_out_time - v_ticket.check_in_time)), 3600) / 60)::integer
        ),
        'totalHours', greatest(
          1,
          ceil(extract(epoch from (v_ticket.check_out_time - v_ticket.check_in_time)) / 3600)::integer
        ),
        'amount', v_ticket.total_amount,
        'paymentStatus', v_ticket.payment_status,
        'paymentReference', v_ticket.payment_reference,
        'paymentCode', v_ticket.payment_code
      )
    );
  end if;

  select *
  into v_rate
  from public.parking_rates
  where vehicle_type = v_vehicle_type;

  if not found then
    raise exception 'Chưa cấu hình giá gửi xe cho loại phương tiện %.', v_vehicle_type;
  end if;

  v_duration_seconds := greatest(
    0,
    extract(epoch from (v_check_out_time - v_ticket.check_in_time))
  );
  v_total_hours := greatest(1, ceil(v_duration_seconds / 3600)::integer);
  v_amount := v_rate.first_two_hours_amount;

  if v_total_hours > 2 then
    v_amount := v_amount
      + (v_total_hours - 2) * v_rate.additional_hour_amount;
  end if;

  v_payment_code := 'SP' || upper(substr(replace(p_payment_reference::text, '-', ''), 1, 24));

  update public.tickets
  set check_out_time = v_check_out_time,
      total_amount = v_amount,
      payment_status = 'PENDING',
      payment_reference = p_payment_reference,
      payment_code = v_payment_code
  where id = v_ticket.id;

  return jsonb_build_object(
    'success', true,
    'receipt', jsonb_build_object(
      'ticketCode', v_ticket.ticket_code,
      'licensePlate', v_ticket.license_plate,
      'vehicleType', v_vehicle_type,
      'slotCode', v_slot.slot_code,
      'checkInTime', v_ticket.check_in_time,
      'checkOutTime', v_check_out_time,
      'duration', format(
        '%sh %sm',
        floor(v_duration_seconds / 3600)::integer,
        floor(mod(v_duration_seconds, 3600) / 60)::integer
      ),
      'totalHours', v_total_hours,
      'amount', v_amount,
      'paymentStatus', 'PENDING',
      'paymentReference', p_payment_reference,
      'paymentCode', v_payment_code
    )
  );
end;
$$;

revoke all on function public.check_out_vehicle(text, uuid) from public;
grant execute on function public.check_out_vehicle(text, uuid)
  to anon, authenticated, service_role;
