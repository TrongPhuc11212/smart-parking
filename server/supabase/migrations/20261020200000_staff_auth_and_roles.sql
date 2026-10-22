create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'STAFF'
    check (role in ('MANAGER', 'STAFF')),
  created_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

insert into public.staff_profiles (user_id, email, full_name, role)
select
  id,
  lower(email),
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  'STAFF'
from auth.users
where email is not null
on conflict (user_id) do nothing;

create or replace function public.has_staff_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
  );
$$;

revoke all on function public.has_staff_access() from public, anon;
grant execute on function public.has_staff_access() to authenticated;

drop policy if exists "Staff can read own profile" on public.staff_profiles;
create policy "Staff can read own profile"
  on public.staff_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.create_staff_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff_profiles (user_id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'STAFF'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_staff_profile on auth.users;
create trigger on_auth_user_created_staff_profile
  after insert on auth.users
  for each row execute procedure public.create_staff_profile_for_auth_user();

grant select on public.staff_profiles to authenticated;

revoke all on public.parking_slots, public.tickets from anon;
grant select on public.parking_slots, public.tickets to authenticated;

drop policy if exists "Staff can read parking slots" on public.parking_slots;
create policy "Staff can read parking slots"
  on public.parking_slots
  for select
  to authenticated
  using (public.has_staff_access());

drop policy if exists "Require staff access for parking slots" on public.parking_slots;
create policy "Require staff access for parking slots"
  on public.parking_slots
  as restrictive
  for all
  to authenticated
  using (public.has_staff_access())
  with check (public.has_staff_access());

drop policy if exists "Staff can read tickets" on public.tickets;
create policy "Staff can read tickets"
  on public.tickets
  for select
  to authenticated
  using (public.has_staff_access());

drop policy if exists "Require staff access for tickets" on public.tickets;
create policy "Require staff access for tickets"
  on public.tickets
  as restrictive
  for all
  to authenticated
  using (public.has_staff_access())
  with check (public.has_staff_access());

revoke all on function public.check_in_vehicle(text, bigint)
  from public, anon, authenticated;
grant execute on function public.check_in_vehicle(text, bigint)
  to service_role;

revoke all on function public.check_out_vehicle(text, uuid)
  from public, anon, authenticated;
grant execute on function public.check_out_vehicle(text, uuid)
  to service_role;

revoke all on function public.confirm_sepay_payment(bigint, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.confirm_sepay_payment(bigint, text, numeric, text)
  to service_role;
