-- Dados iniciais para desenvolvimento.
-- ATENÇÃO: as tarifas abaixo são exemplos para testar o app, não valores decididos.

insert into public.cities (name, state, active) values
  ('Guaraciaba do Norte', 'CE', true),
  ('Ubajara', 'CE', false),
  ('Tianguá', 'CE', false),
  ('São Benedito', 'CE', false)
on conflict (name, state) do nothing;

insert into public.fares (city_id, vehicle_type, base, per_km, per_min, minimum)
select id, 'car'::public.vehicle_type, 10.00, 2.00, 0.30, 10.00 from public.cities where name = 'Guaraciaba do Norte'
union all
select id, 'moto'::public.vehicle_type, 6.00, 1.20, 0.20, 6.00 from public.cities where name = 'Guaraciaba do Norte'
on conflict (city_id, vehicle_type) do nothing;

-- Preços fechados de exemplo saindo de Guaraciaba.
insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
select o.id, d.id, v.vehicle_type::public.vehicle_type, v.price
from public.cities o
cross join (values
  ('São Benedito', 'car', 40.00), ('São Benedito', 'moto', 25.00),
  ('Ubajara', 'car', 60.00), ('Ubajara', 'moto', 35.00),
  ('Tianguá', 'car', 80.00), ('Tianguá', 'moto', 45.00)
) as v (destination, vehicle_type, price)
join public.cities d on d.name = v.destination
where o.name = 'Guaraciaba do Norte'
on conflict do nothing;
