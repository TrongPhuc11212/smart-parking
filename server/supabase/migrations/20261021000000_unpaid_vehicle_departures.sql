alter table public.tickets
  add column if not exists departed_unpaid_at timestamptz,
  add column if not exists departed_unpaid_by uuid
    references public.staff_profiles(user_id) on delete set null,
  add column if not exists departure_reason text;

alter table public.staff_activity_logs
  drop constraint if exists staff_activity_logs_action_check;
alter table public.staff_activity_logs
  add constraint staff_activity_logs_action_check
  check (
    action in ('CHECK_IN', 'CHECK_OUT', 'CHECK_OUT_UNPAID_DEPARTURE')
  );

create index if not exists tickets_unpaid_departures_idx
  on public.tickets (departed_unpaid_at desc)
  where departed_unpaid_at is not null and payment_status = 'PENDING';

create or replace function public.record_unpaid_vehicle_departure(
  p_actor_id uuid,
  p_ticket_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_actor public.staff_profiles%rowtype;
  v_slot public.parking_slots%rowtype;
  v_departed_at timestamptz := clock_timestamp();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select *
  into v_actor
  from public.staff_profiles
  where user_id = p_actor_id
    and is_active;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'actor_not_staff',
      'message', 'Tài khoản nhân viên không hợp lệ hoặc đã bị khóa.'
    );
  end if;

  if p_ticket_code is null or length(btrim(p_ticket_code)) not between 1 and 64
    or length(v_reason) not between 3 and 500 then
    return jsonb_build_object(
      'success', false,
      'code', 'invalid_request',
      'message', 'Mã vé hoặc lý do ghi nhận không hợp lệ.'
    );
  end if;

  select *
  into v_ticket
  from public.tickets
  where ticket_code = btrim(p_ticket_code)
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'ticket_not_found',
      'message', 'Không tìm thấy vé gửi xe.'
    );
  end if;

  if v_ticket.status <> 'ACTIVE'
    or v_ticket.payment_status <> 'PENDING'
    or v_ticket.check_out_time is null
    or v_ticket.departed_unpaid_at is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'invoice_not_eligible',
      'message', 'Chỉ có thể ghi nhận xe đang có hóa đơn chờ thanh toán.'
    );
  end if;

  select *
  into v_slot
  from public.parking_slots
  where id = v_ticket.slot_id
  for update;

  if not found or v_slot.status <> 'OCCUPIED' then
    return jsonb_build_object(
      'success', false,
      'code', 'slot_not_occupied',
      'message', 'Không thể xác nhận ô đỗ hiện đang được vé này sử dụng.'
    );
  end if;

  update public.tickets
  set status = 'COMPLETED',
      departed_unpaid_at = v_departed_at,
      departed_unpaid_by = v_actor.user_id,
      departure_reason = v_reason
  where id = v_ticket.id
    and status = 'ACTIVE'
    and payment_status = 'PENDING';

  if not found then
    raise exception 'Vé % đã được xử lý đồng thời.', v_ticket.ticket_code;
  end if;

  update public.parking_slots
  set status = 'AVAILABLE'
  where id = v_ticket.slot_id
    and status = 'OCCUPIED';

  if not found then
    raise exception 'Không thể giải phóng ô đỗ của vé %.', v_ticket.ticket_code;
  end if;

  insert into public.staff_activity_logs (
    event_key,
    actor_id,
    actor_email,
    actor_name,
    action,
    ticket_code,
    license_plate,
    slot_code,
    amount,
    payment_reference,
    details
  )
  values (
    'UNPAID_DEPARTURE:' || v_ticket.ticket_code,
    v_actor.user_id,
    v_actor.email,
    v_actor.full_name,
    'CHECK_OUT_UNPAID_DEPARTURE',
    v_ticket.ticket_code,
    v_ticket.license_plate,
    v_slot.slot_code,
    v_ticket.total_amount,
    v_ticket.payment_reference,
    jsonb_build_object(
      'reason', v_reason,
      'paymentCode', v_ticket.payment_code,
      'paymentStatus', v_ticket.payment_status,
      'departedAt', v_departed_at
    )
  );

  return jsonb_build_object(
    'success', true,
    'ticketCode', v_ticket.ticket_code,
    'licensePlate', v_ticket.license_plate,
    'slotCode', v_slot.slot_code,
    'paymentStatus', 'PENDING',
    'status', 'COMPLETED',
    'amount', v_ticket.total_amount,
    'departedAt', v_departed_at,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.record_unpaid_vehicle_departure(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_unpaid_vehicle_departure(uuid, text, text)
  to service_role;

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
    and payment_status = 'PENDING'
    and (
      status = 'ACTIVE'
      or (status = 'COMPLETED' and departed_unpaid_at is not null)
    )
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'payment_not_found');
  end if;

  if p_amount <> v_ticket.total_amount then
    return jsonb_build_object('success', false, 'code', 'amount_mismatch');
  end if;

  update public.tickets
  set payment_status = 'PAID',
      settlement_method = 'SEPAY',
      sepay_transaction_id = p_sepay_transaction_id,
      status = 'COMPLETED'
  where id = v_ticket.id
    and payment_status = 'PENDING';

  if not found then
    return jsonb_build_object('success', false, 'code', 'payment_already_processed');
  end if;

  if v_ticket.status = 'ACTIVE' then
    update public.parking_slots
    set status = 'AVAILABLE'
    where id = v_ticket.slot_id;
  end if;

  return jsonb_build_object('success', true, 'duplicate', false);
end;
$$;

revoke all on function public.confirm_sepay_payment(bigint, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.confirm_sepay_payment(bigint, text, numeric, text)
  to service_role;
