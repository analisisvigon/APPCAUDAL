-- LIBIA / SOLO LECTURA. Ejecutar manualmente en el proyecto NUEVO de Libia.
-- Confirmar el project ref en el panel: PostgreSQL no conoce ese dato.
-- Todas las filas deben indicar listo=true antes de importar el esquema base.
with checks(name, listo) as (values
  ('sin_clubs', to_regclass('public.clubs') is null),
  ('sin_jugadores', to_regclass('public.jugadores') is null),
  ('sin_partidos', to_regclass('public.partidos') is null),
  ('sin_biblioteca', to_regclass('public.training_library') is null),
  ('auth_disponible', to_regclass('auth.users') is not null),
  ('storage_disponible', to_regclass('storage.objects') is not null),
  ('rol_authenticated', to_regrole('authenticated') is not null),
  ('rol_anon', to_regrole('anon') is not null)
)
select * from checks order by name;

-- Solo recuento; no devuelve cuentas ni credenciales. Una instalación nueva
-- debe estar vacía antes de crear usuarios propios de Libia.
select count(*) = 0 as sin_usuarios_preexistentes from auth.users;
