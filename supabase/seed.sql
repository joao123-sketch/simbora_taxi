-- Dados iniciais para desenvolvimento.
-- As tarifas da cidade são as decididas; os preços fechados entre cidades
-- abaixo são exemplos para testar, ainda não decididos.

insert into public.cities (name, state, active, center) values
  ('Guaraciaba do Norte', 'CE', true, extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography),
  ('Ubajara', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9210, -3.8545), 4326)::extensions.geography),
  ('Tianguá', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9917, -3.7322), 4326)::extensions.geography),
  ('São Benedito', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.8650, -4.0485), 4326)::extensions.geography)
on conflict (name, state) do nothing;

insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min, minimum)
select c.id, v.vehicle_type::public.vehicle_type, date '2026-10-23', v.base, v.per_km, v.per_min, v.minimum
from public.cities c
cross join (values
  ('car', 12.00, 2.00, 0.30, 10.00),
  ('moto', 7.00, 1.20, 0.20, 6.00)
) as v (vehicle_type, base, per_km, per_min, minimum)
where c.name = 'Guaraciaba do Norte'
on conflict (city_id, vehicle_type, effective_from) do nothing;

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
