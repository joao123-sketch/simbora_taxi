-- Dados iniciais para desenvolvimento.
-- As tarifas da cidade são as decididas; os preços fechados entre cidades
-- abaixo são exemplos para testar, ainda não decididos.

insert into public.cities (name, state, active, center) values
  ('Guaraciaba do Norte', 'CE', true, extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography),
  ('Ubajara', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9210, -3.8545), 4326)::extensions.geography),
  ('Tianguá', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9917, -3.7322), 4326)::extensions.geography),
  ('São Benedito', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.8650, -4.0485), 4326)::extensions.geography)
on conflict (name, state) do nothing;

insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min, intercity_per_km, intercity_rate2, intercity_rate3, intercity_wait_per_min, city_far_per_km)
select c.id, v.vehicle_type::public.vehicle_type, date '2026-11-02', v.base, v.per_km, v.per_min, v.ipk, v.r2, v.r3, v.wait, v.far
from public.cities c
cross join (values
  ('car', 8.00, 2.20, 0.30, 1.70, 6.70, 2.72, 0.10, 0.60),
  ('moto', 5.00, 1.40, 0.20, 1.20, 4.70, 1.90, 0.07, 0.40)
) as v (vehicle_type, base, per_km, per_min, ipk, r2, r3, wait, far)
where c.name = 'Guaraciaba do Norte'
on conflict (city_id, vehicle_type, effective_from) do nothing;
