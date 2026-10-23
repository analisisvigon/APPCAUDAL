-- DEFINICIONES EXTRAIDAS DE METADATOS COMPARTIDOS EN EL CHAT.
-- Solo material documental; NO ejecutar este archivo en produccion.
-- En estas diez tablas solo se reportaron dos triggers NO internos.
-- No se reportaron triggers en competitions ni partido_estadisticas_jugador.

-- jugadores | enabled O
-- CREATE TRIGGER jugadores_project_global_shirt_name BEFORE INSERT OR UPDATE OF global_player_id ON jugadores FOR EACH ROW EXECUTE FUNCTION project_global_player_shirt_name_on_legacy_insert();
-- function_definition_hash: eeaac3a2eac8b0ff634e6ead972633a0
CREATE OR REPLACE FUNCTION public.project_global_player_shirt_name_on_legacy_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.global_player_id is not null then
    new.shirt_name := (
      select nullif(trim(profile.shirt_name), '')
      from public.players_database profile
      where profile.id = new.global_player_id
    );
  end if;
  return new;
end;
$function$;

-- partido_eventos_sustitucion | enabled O
-- CREATE TRIGGER partido_eventos_sustitucion_updated_at BEFORE UPDATE ON partido_eventos_sustitucion FOR EACH ROW EXECUTE FUNCTION set_club_core_updated_at();
-- function_definition_hash: 4578c9c28e770283dedd2676221c7534
CREATE OR REPLACE FUNCTION public.set_club_core_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
