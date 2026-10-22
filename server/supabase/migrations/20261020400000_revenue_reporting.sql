create or replace function public.get_parking_revenue_report(
  p_from_date date,
  p_to_date date
)
returns table (
  report_date date,
  checkout_tickets bigint,
  paid_tickets bigint,
  paid_revenue numeric,
  pending_tickets bigint,
  pending_amount numeric
)
language sql
stable
set search_path = public
as $$
  select
    (tickets.check_out_time at time zone 'Asia/Ho_Chi_Minh')::date as report_date,
    count(*)::bigint as checkout_tickets,
    count(*) filter (where tickets.payment_status = 'PAID')::bigint as paid_tickets,
    coalesce(
      sum(tickets.total_amount) filter (where tickets.payment_status = 'PAID'),
      0
    )::numeric as paid_revenue,
    count(*) filter (where tickets.payment_status = 'PENDING')::bigint as pending_tickets,
    coalesce(
      sum(tickets.total_amount) filter (where tickets.payment_status = 'PENDING'),
      0
    )::numeric as pending_amount
  from public.tickets
  where tickets.check_out_time >=
      (p_from_date::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and tickets.check_out_time <
      ((p_to_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
  group by (tickets.check_out_time at time zone 'Asia/Ho_Chi_Minh')::date
  order by report_date;
$$;

revoke all on function public.get_parking_revenue_report(date, date)
  from public, anon, authenticated;
grant execute on function public.get_parking_revenue_report(date, date)
  to service_role;
