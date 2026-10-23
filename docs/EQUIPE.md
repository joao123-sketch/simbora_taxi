# Guia da equipe Simbora Car

Tudo é feito no painel do Supabase (supabase.com → projeto Simbora Car → **Table Editor**).

## Aprovar um motorista (depois da reunião presencial)

1. Abra a tabela **drivers**.
2. Ache a linha pela placa (coluna `vehicle_plate`).
3. Confira com os documentos originais: modelo, cor, placa e ano batem com o CRLV.
4. Mude `status` de `pending` para `approved`.
5. Em `approved_at`, coloque a data de hoje.
6. Avise o motorista: ele abre o app, toca em **Sou motorista** e depois em **Já fui aprovado**.

## Suspender ou bloquear

Na mesma tabela, mude `status` para:

- `suspended`: afastado por um tempo (reclamação, documento vencido).
- `blocked`: fora do Simbora Car.

Se ele estiver online, mude também `is_online` para `false`.

## Ver corridas

Tabela **rides**. Filtre por `status`:

- `requested`: esperando motorista
- `accepted`, `arrived`, `in_progress`: em andamento
- `completed`: concluídas
- `cancelled`: canceladas
