alter table public.tickets
  add column if not exists payment_status text not null default 'UNPAID',
  add column if not exists payment_reference uuid,
  add column if not exists payment_code text,
  add column if not exists sepay_transaction_id bigint;

update public.tickets
set payment_status = 'UNKNOWN'
where status = 'COMPLETED'
  and payment_status = 'UNPAID';

create unique index if not exists tickets_payment_reference_unique
  on public.tickets (payment_reference)
  where payment_reference is not null;

create unique index if not exists tickets_payment_code_unique
  on public.tickets (payment_code)
  where payment_code is not null;

create unique index if not exists tickets_sepay_transaction_unique
  on public.tickets (sepay_transaction_id)
  where sepay_transaction_id is not null;

drop function if exists public.check_out_vehicle(text);

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

create or replace function public.confirm_sepay_payment(
  p_sepay_transaction_id bigint,
  p_payment_code text,
  p_amount numeric,
  p_account_number text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if p_sepay_transaction_id is null or p_sepay_transaction_id <= 0
    or p_payment_code is null or p_amount is null or p_amount <= 0
    or p_account_number is null then
    return jsonb_build_object('success', false, 'code', 'invalid_transaction');
  end if;

  if exists (
    select 1
    from public.tickets
    where sepay_transaction_id = p_sepay_transaction_id
      and payment_status = 'PAID'
  ) then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  select *
  into v_ticket
  from public.tickets
  where payment_code = upper(p_payment_code)
    and status = 'ACTIVE'
    and payment_status = 'PENDING'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'payment_not_found');
  end if;

  if p_amount <> v_ticket.total_amount then
    return jsonb_build_object('success', false, 'code', 'amount_mismatch');
  end if;

  update public.tickets
  set payment_status = 'PAID',
      sepay_transaction_id = p_sepay_transaction_id,
      status = 'COMPLETED'
  where id = v_ticket.id
    and payment_status = 'PENDING';

  if not found then
    return jsonb_build_object('success', false, 'code', 'payment_already_processed');
  end if;

  update public.parking_slots
  set status = 'AVAILABLE'
  where id = v_ticket.slot_id;

  return jsonb_build_object('success', true, 'duplicate', false);
end;
$$;

revoke all on function public.check_out_vehicle(text, uuid) from public;
revoke all on function public.confirm_sepay_payment(bigint, text, numeric, text)
  from public, anon, authenticated;

grant execute on function public.check_out_vehicle(text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.confirm_sepay_payment(bigint, text, numeric, text)
  to service_role;
