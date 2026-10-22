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

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_not_found',
      'message', 'Không tìm thấy vị trí đỗ đã chọn.'
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

create or replace function public.check_out_vehicle(
  p_license_plate text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_slot public.parking_slots%rowtype;
  v_check_out_time timestamptz := clock_timestamp();
  v_duration_seconds numeric;
  v_total_hours integer;
  v_amount numeric;
  v_vehicle_type text;
begin
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
  v_duration_seconds := greatest(
    0,
    extract(epoch from (v_check_out_time - v_ticket.check_in_time))
  );
  v_total_hours := greatest(1, ceil(v_duration_seconds / 3600)::integer);
  v_amount := case
    when v_vehicle_type = 'CAR' then 20000
    else 5000
  end;

  if v_total_hours > 2 then
    v_amount := v_amount + (v_total_hours - 2) * case
      when v_vehicle_type = 'CAR' then 10000
      else 2000
    end;
  end if;

  update public.tickets
  set check_out_time = v_check_out_time,
      total_amount = v_amount,
      status = 'COMPLETED'
  where id = v_ticket.id
    and status = 'ACTIVE';

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'active_ticket_not_found',
      'message', 'Vé này vừa được check-out bởi thao tác khác.'
    );
  end if;

  update public.parking_slots
  set status = 'AVAILABLE'
  where id = v_ticket.slot_id;

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
      'amount', v_amount
    )
  );
end;
$$;

revoke all on function public.check_in_vehicle(text, bigint) from public;
revoke all on function public.check_out_vehicle(text) from public;
grant execute on function public.check_in_vehicle(text, bigint)
  to anon, authenticated, service_role;
grant execute on function public.check_out_vehicle(text)
  to anon, authenticated, service_role;
