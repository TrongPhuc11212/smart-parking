-- Adds 200 sample parking slots: 100 car spaces and 100 motorcycle spaces.
-- Run after all migrations, including 20261021100000_parking_slot_management.sql.
-- Existing tickets and non-demo slots are not modified; rerunning is safe.
-- Reclassifies slots created by the earlier version of this demo seed.
update public.parking_slots
set zone = case vehicle_type
  when 'CAR' then 'Khu ô tô'
  else 'Khu xe máy'
end
where vehicle_type in ('CAR', 'MOTORBIKE')
  and (
    (vehicle_type = 'CAR' and slot_code ~ '^[A-D]-C[0-9]{3}$')
    or (vehicle_type = 'MOTORBIKE' and slot_code ~ '^[A-D]-M[0-9]{3}$')
  );

insert into public.parking_slots (
  slot_code,
  zone,
  vehicle_type,
  status,
  is_active
)
select
  zone_code || '-' || vehicle_code || lpad(slot_number::text, 3, '0'),
  case vehicle_code
    when 'C' then 'Khu ô tô'
    else 'Khu xe máy'
  end,
  case vehicle_code
    when 'C' then 'CAR'
    else 'MOTORBIKE'
  end,
  'AVAILABLE',
  true
from generate_series(1, 4) as zones(zone_number)
cross join generate_series(1, 2) as vehicle_types(vehicle_index)
cross join generate_series(1, 25) as slots(slot_number)
cross join lateral (
  select chr(64 + zones.zone_number) as zone_code,
    case vehicle_types.vehicle_index
      when 1 then 'C'
      else 'M'
    end as vehicle_code
) as codes
on conflict do nothing;
