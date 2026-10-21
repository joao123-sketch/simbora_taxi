-- Dados iniciais para desenvolvimento.
-- ATENÇÃO: as tarifas abaixo são exemplos para testar o app, não valores decididos.

insert into public.cities (name, state, active) values
  ('Guaraciaba do Norte', 'CE', true),
  ('Ubajara', 'CE', false),
  ('Tianguá', 'CE', false),
  ('São Benedito', 'CE', false);

insert into public.fares (city_id, vehicle_type, base, per_km, per_min, minimum)
select id, 'car', 10.00, 2.00, 0.30, 10.00 from public.cities where name = 'Guaraciaba do Norte'
union all
select id, 'moto', 6.00, 1.20, 0.20, 6.00 from public.cities where name = 'Guaraciaba do Norte';
