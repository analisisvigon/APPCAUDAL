alter table public.jugadores
  add column if not exists google_forms_name text;

comment on column public.jugadores.google_forms_name is
'Nombre exacto o abreviado con el que el jugador aparece en Google Forms. NULL utiliza jugadores.name como fallback.';
