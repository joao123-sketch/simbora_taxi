-- Dados iniciais para desenvolvimento.
-- As tarifas da cidade são as decididas; os preços fechados entre cidades
-- abaixo são exemplos para testar, ainda não decididos.

insert into public.cities (name, state, active, center) values
  ('Guaraciaba do Norte', 'CE', true, extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography),
  ('Ubajara', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9210, -3.8545), 4326)::extensions.geography),
  ('Tianguá', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.9917, -3.7322), 4326)::extensions.geography),
  ('São Benedito', 'CE', false, extensions.st_setsrid(extensions.st_makepoint(-40.8650, -4.0485), 4326)::extensions.geography)
on conflict (name, state) do nothing;

insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min)
select c.id, v.vehicle_type::public.vehicle_type, date '2026-11-02', v.base, v.per_km, v.per_min
from public.cities c
cross join (values
  ('car', 8.00, 2.20, 0.30),
  ('moto', 5.00, 1.40, 0.20)
) as v (vehicle_type, base, per_km, per_min)
where c.name = 'Guaraciaba do Norte'
on conflict (city_id, vehicle_type, effective_from) do nothing;
