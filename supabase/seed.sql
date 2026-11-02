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

-- Preço único por par de cidades, igual nos dois sentidos (tabela B, distância de estrada medida).
insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
select p.o, p.d, v.vehicle_type::public.vehicle_type, v.price
from (values
  ('Guaraciaba do Norte', 'São Benedito', 'car', 50.00), ('Guaraciaba do Norte', 'São Benedito', 'moto', 30.00),
  ('Guaraciaba do Norte', 'Ubajara', 'car', 90.00), ('Guaraciaba do Norte', 'Ubajara', 'moto', 55.00),
  ('Guaraciaba do Norte', 'Tianguá', 'car', 115.00), ('Guaraciaba do Norte', 'Tianguá', 'moto', 70.00),
  ('São Benedito', 'Ubajara', 'car', 50.00), ('São Benedito', 'Ubajara', 'moto', 30.00),
  ('São Benedito', 'Tianguá', 'car', 80.00), ('São Benedito', 'Tianguá', 'moto', 45.00),
  ('Ubajara', 'Tianguá', 'car', 40.00), ('Ubajara', 'Tianguá', 'moto', 25.00)
) as v (a, b, vehicle_type, price)
join public.cities ca on ca.name = v.a
join public.cities cb on cb.name = v.b
cross join lateral (values (ca.id, cb.id), (cb.id, ca.id)) as p (o, d)
on conflict do nothing;
