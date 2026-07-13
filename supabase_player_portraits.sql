alter table public.jugadores
add column if not exists original_image text,
add column if not exists processed_image text,
add column if not exists portrait_style text not null default 'original';

comment on column public.jugadores.original_image is
'URL de la fotografia original subida para el jugador. No se modifica al aplicar estilos visuales.';

comment on column public.jugadores.processed_image is
'URL de la fotografia normalizada con estilo APPCAUDAL para uso visual en la plantilla.';

comment on column public.jugadores.portrait_style is
'Estilo aplicado al retrato del jugador. Valores previstos: original, appcaudal_classic.';
