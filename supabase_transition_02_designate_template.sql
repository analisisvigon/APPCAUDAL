-- TRANSICION 02 / PLANTILLA FUTURA. NO EJECUTAR AHORA.
-- Sustituir ambos NULL por los UUID exactos verificados del CTS de Libia y
-- de la cuenta owner. El archivo sin completar aborta y no cambia nada.
-- Designar no habilita escrituras: writes_enabled permanece false.
begin;
do $designate$
declare
  target_cts_id uuid := null;
  owner_account_id uuid := null;
begin
  if auth.uid() is not null then raise exception 'Ejecutar sin JWT de usuario'; end if;
  if target_cts_id is null or owner_account_id is null then
    raise exception 'Completar UUID exactos antes de designar';
  end if;
  if exists (select 1 from public.operational_cts_v1) then
    raise exception 'Ya existe un CTS operativo: revisar manualmente';
  end if;
  insert into public.operational_cts_v1 (
    singleton, club_team_season_id, owner_user_id, writes_enabled
  ) values (true, target_cts_id, owner_account_id, false);
  if (select count(*) from public.operational_cts_v1
      where club_team_season_id = target_cts_id
        and owner_user_id = owner_account_id and not writes_enabled) <> 1 then
    raise exception 'Designacion no verificada';
  end if;
end $designate$;
commit;
