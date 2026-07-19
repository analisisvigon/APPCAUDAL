-- 1. AUDITORÍA: ejecutar primero y revisar manualmente todas las filas devueltas.
select id, equipo_rival_id, name, position, specific_position, age, foot, height
from public.jugadores_rivales
where lower(trim(coalesce(position, ''))) in ('sin posición', 'sin posicion', '-', 'pendiente')
   or lower(trim(coalesce(specific_position, ''))) in ('sin posición', 'sin posicion', '-', 'pendiente')
   or lower(trim(coalesce(age, ''))) in ('edad pendiente', 'sin información', 'sin informacion', '-', 'pendiente')
   or lower(trim(coalesce(foot, ''))) in ('no indicada', 'no indicado', 'sin información', 'sin informacion', '-', 'pendiente')
   or lower(trim(coalesce(height, ''))) in ('sin información', 'sin informacion', '-', 'pendiente')
order by equipo_rival_id, name;

-- 2. LIMPIEZA CONTROLADA: descomentar solo después de validar la auditoría anterior.
-- begin;
-- update public.jugadores_rivales set position = null
-- where lower(trim(position)) in ('sin posición', 'sin posicion', '-', 'pendiente');
-- update public.jugadores_rivales set specific_position = null
-- where lower(trim(specific_position)) in ('sin posición', 'sin posicion', '-', 'pendiente');
-- update public.jugadores_rivales set age = null
-- where lower(trim(age)) in ('edad pendiente', 'sin información', 'sin informacion', '-', 'pendiente');
-- update public.jugadores_rivales set foot = null
-- where lower(trim(foot)) in ('no indicada', 'no indicado', 'sin información', 'sin informacion', '-', 'pendiente');
-- update public.jugadores_rivales set height = null
-- where lower(trim(height)) in ('sin información', 'sin informacion', '-', 'pendiente');
-- commit;
