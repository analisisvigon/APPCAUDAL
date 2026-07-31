-- APPCAUDAL · Auditoría de solo lectura del histórico Wellness.
-- Este archivo no inserta, actualiza ni elimina datos.

-- 1. Clave efectiva de wellness_entries.
select
  constraint_name,
  constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name = 'wellness_entries'
  and constraint_type in ('PRIMARY KEY', 'UNIQUE')
order by constraint_type, constraint_name;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'wellness_entries'
order by indexname;

-- 2. Registros reales de los jugadores y fechas que requieren revisión.
with target_players as (
  select id, name, shirt_name, google_forms_name
  from public.jugadores
  where upper(coalesce(shirt_name, '')) in (
    'ACERETE',
    'M.BARROSO',
    'AGUS PORTO',
    'ALEX GLEZ',
    'BORJA RGUEZ',
    'D. PALACIO',
    'DAVO'
  )
  or upper(name) = 'JULIO DELGADO'
)
select
  player.id as jugador_id,
  player.name,
  player.shirt_name,
  player.google_forms_name,
  wellness.id as wellness_id,
  wellness.entry_date,
  wellness.created_at,
  wellness.updated_at,
  wellness.sleep_hours,
  wellness.sleep_quality,
  wellness.fatigue,
  wellness.muscle_soreness,
  wellness.stress,
  wellness.mood,
  wellness.weight,
  wellness.health_ratio,
  wellness.discomfort,
  wellness.comment
from target_players player
left join public.wellness_entries wellness
  on wellness.jugador_id = player.id
 and wellness.entry_date between date '2026-07-27' and date '2026-07-31'
order by player.name, wellness.entry_date, wellness.created_at;

-- 3. Pares consecutivos exactamente iguales en todos los datos Wellness.
-- Son candidatos de auditoría, no prueba suficiente para borrar.
with normalized as (
  select
    wellness.*,
    jsonb_build_object(
      'sleep_hours', wellness.sleep_hours,
      'sleep_quality', wellness.sleep_quality,
      'fatigue', wellness.fatigue,
      'muscle_soreness', wellness.muscle_soreness,
      'stress', wellness.stress,
      'mood', wellness.mood,
      'weight', wellness.weight,
      'health_ratio', wellness.health_ratio,
      'discomfort', nullif(btrim(wellness.discomfort), ''),
      'comment', nullif(btrim(wellness.comment), '')
    ) as data_signature
  from public.wellness_entries wellness
)
select
  player.name,
  player.shirt_name,
  previous.jugador_id,
  previous.id as previous_id,
  previous.entry_date as previous_date,
  previous.created_at as previous_created_at,
  current.id as current_id,
  current.entry_date as current_date,
  current.created_at as current_created_at,
  abs(extract(epoch from (current.created_at - previous.created_at))) as created_at_distance_seconds,
  current.comment,
  current.discomfort
from normalized current
join normalized previous
  on previous.jugador_id = current.jugador_id
 and previous.entry_date = current.entry_date - 1
 and previous.data_signature = current.data_signature
join public.jugadores player on player.id = current.jugador_id
order by current.entry_date desc, player.name;

-- 4. Comentarios repetidos en fechas consecutivas con comparación de métricas.
-- El comentario nunca se usa por sí solo como prueba de duplicidad.
select
  player.name,
  previous.id as previous_id,
  previous.entry_date as previous_date,
  current.id as current_id,
  current.entry_date as current_date,
  current.comment,
  (previous.sleep_quality is not distinct from current.sleep_quality)::int
    + (previous.fatigue is not distinct from current.fatigue)::int
    + (previous.muscle_soreness is not distinct from current.muscle_soreness)::int
    + (previous.stress is not distinct from current.stress)::int
    + (previous.mood is not distinct from current.mood)::int
    + (previous.weight is not distinct from current.weight)::int
    + (previous.health_ratio is not distinct from current.health_ratio)::int
      as equal_metric_count,
  previous.created_at as previous_created_at,
  current.created_at as current_created_at
from public.wellness_entries current
join public.wellness_entries previous
  on previous.jugador_id = current.jugador_id
 and previous.entry_date = current.entry_date - 1
join public.jugadores player on player.id = current.jugador_id
where nullif(btrim(current.comment), '') is not null
  and lower(btrim(previous.comment)) = lower(btrim(current.comment))
order by current.entry_date desc, player.name;

-- 5. Búsqueda concreta de los textos comunicados.
select
  player.id as jugador_id,
  player.name,
  player.shirt_name,
  wellness.id as wellness_id,
  wellness.entry_date,
  wellness.created_at,
  wellness.discomfort,
  wellness.comment
from public.wellness_entries wellness
join public.jugadores player on player.id = wellness.jugador_id
where concat_ws(' ', wellness.discomfort, wellness.comment) ilike any (array[
  '%Cuádriceps derecho%',
  '%Bastante cargado de la semana%',
  '%Irritación del tendón de Aquiles%',
  '%Pequeña molestia isquio aductor arriba%',
  '%Todo bien%'
])
order by wellness.entry_date desc, wellness.created_at desc, player.name;
