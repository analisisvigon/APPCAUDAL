-- SOLO ENSAYO 04C. Ejecutar despues de crear las tablas canonicas,
-- players_database, player_team_memberships e is_app_staff().
-- Conserva las politicas legacy para reproducir el estado previo a 03C.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres' then
    raise exception '04C exige SQL Editor postgres sin JWT de usuario';
  end if;
  if (select count(*) from auth.users) <> 0
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regprocedure('public.is_app_staff()') is null
    or to_regclass('public.players_database') is null
    or to_regclass('public.player_team_memberships') is null
    or to_regclass('public.club_team_seasons') is null then
    raise exception '04C: falta bootstrap o proyecto ya sembrado';
  end if;
end $guard$;


alter table public."jugadores" add CONSTRAINT "jugadores_global_player_id_fkey" FOREIGN KEY (global_player_id) REFERENCES public.players_database(id) ON DELETE SET NULL;

alter table public."jugadores" add CONSTRAINT "jugadores_membership_id_fkey" FOREIGN KEY (membership_id) REFERENCES public.player_team_memberships(id) ON DELETE SET NULL;

alter table public."jugadores_rivales" add CONSTRAINT "jugadores_rivales_global_player_id_fkey" FOREIGN KEY (global_player_id) REFERENCES public.players_database(id) ON DELETE SET NULL;

alter table public."jugadores_rivales" add CONSTRAINT "jugadores_rivales_membership_id_fkey" FOREIGN KEY (membership_id) REFERENCES public.player_team_memberships(id) ON DELETE SET NULL;

alter table public."partidos" add CONSTRAINT "partidos_club_team_season_id_fkey" FOREIGN KEY (club_team_season_id) REFERENCES public.club_team_seasons(id) ON DELETE RESTRICT;

alter table public."partido_alineacion_slots" add CONSTRAINT "partido_alineacion_slots_global_player_id_fkey" FOREIGN KEY (global_player_id) REFERENCES public.players_database(id) ON DELETE SET NULL;

alter table public."partido_alineacion_slots" add CONSTRAINT "partido_alineacion_slots_membership_id_fkey" FOREIGN KEY (membership_id) REFERENCES public.player_team_memberships(id) ON DELETE SET NULL;

alter table public."equipo_rival_alineacion" add CONSTRAINT "equipo_rival_alineacion_global_player_id_fkey" FOREIGN KEY (global_player_id) REFERENCES public.players_database(id) ON DELETE SET NULL;

alter table public."equipo_rival_alineacion" add CONSTRAINT "equipo_rival_alineacion_membership_id_fkey" FOREIGN KEY (membership_id) REFERENCES public.player_team_memberships(id) ON DELETE SET NULL;

alter table public."equipo_rival_banquillo" add CONSTRAINT "equipo_rival_banquillo_global_player_id_fkey" FOREIGN KEY (global_player_id) REFERENCES public.players_database(id) ON DELETE SET NULL;

alter table public."equipo_rival_banquillo" add CONSTRAINT "equipo_rival_banquillo_membership_id_fkey" FOREIGN KEY (membership_id) REFERENCES public.player_team_memberships(id) ON DELETE SET NULL;

create policy "allow anon all equipo_rival_alineacion" on public."equipo_rival_alineacion" for all to anon using (true) with check (true);

create policy "allow authenticated all equipo_rival_alineacion" on public."equipo_rival_alineacion" for all to authenticated using (true) with check (true);

create policy "allow anon all equipo_rival_banquillo" on public."equipo_rival_banquillo" for all to anon using (true) with check (true);

create policy "allow authenticated all equipo_rival_banquillo" on public."equipo_rival_banquillo" for all to authenticated using (true) with check (true);

create policy "equipos_rivales_staff_delete" on public."equipos_rivales" for delete to authenticated using (public.is_app_staff());

create policy "equipos_rivales_staff_insert" on public."equipos_rivales" for insert to authenticated with check (public.is_app_staff());

create policy "equipos_rivales_staff_select" on public."equipos_rivales" for select to authenticated using (public.is_app_staff());

create policy "equipos_rivales_staff_update" on public."equipos_rivales" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

create policy "player_perimeter_staff_delete" on public."jugadores" for delete to authenticated using (public.is_app_staff());

create policy "player_perimeter_staff_insert" on public."jugadores" for insert to authenticated with check (public.is_app_staff());

create policy "player_perimeter_staff_select" on public."jugadores" for select to authenticated using (public.is_app_staff());

create policy "player_perimeter_staff_update" on public."jugadores" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

create policy "allow anon all jugadores_rivales" on public."jugadores_rivales" for all to anon using (true) with check (true);

create policy "allow authenticated all jugadores_rivales" on public."jugadores_rivales" for all to authenticated using (true) with check (true);

create policy "player_sports_staff_delete" on public."partido_alineacion_slots" for delete to authenticated using (public.is_app_staff());

create policy "player_sports_staff_insert" on public."partido_alineacion_slots" for insert to authenticated with check (public.is_app_staff());

create policy "player_sports_staff_select" on public."partido_alineacion_slots" for select to authenticated using (public.is_app_staff());

create policy "player_sports_staff_update" on public."partido_alineacion_slots" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

create policy "player_sports_staff_delete" on public."partidos" for delete to authenticated using (public.is_app_staff());

create policy "player_sports_staff_insert" on public."partidos" for insert to authenticated with check (public.is_app_staff());

create policy "player_sports_staff_select" on public."partidos" for select to authenticated using (public.is_app_staff());

create policy "player_sports_staff_update" on public."partidos" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

create policy "player_sports_staff_delete" on public."competitions" for delete to authenticated using (public.is_app_staff());

create policy "player_sports_staff_insert" on public."competitions" for insert to authenticated with check (public.is_app_staff());

create policy "player_sports_staff_select" on public."competitions" for select to authenticated using (public.is_app_staff());

create policy "player_sports_staff_update" on public."competitions" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

create policy "player_sports_staff_delete" on public."partido_estadisticas_jugador" for delete to authenticated using (public.is_app_staff());

create policy "player_sports_staff_insert" on public."partido_estadisticas_jugador" for insert to authenticated with check (public.is_app_staff());

create policy "player_sports_staff_select" on public."partido_estadisticas_jugador" for select to authenticated using (public.is_app_staff());

create policy "player_sports_staff_update" on public."partido_estadisticas_jugador" for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff());

grant select, insert, update, delete on table public."equipo_rival_alineacion" to authenticated;

grant select, insert, update, delete on table public."equipo_rival_banquillo" to authenticated;

grant select, insert, update, delete on table public."jugadores" to authenticated;

grant select, insert, update, delete on table public."jugadores_rivales" to authenticated;

grant select, insert, update, delete on table public."equipos_rivales" to authenticated;

grant select, insert, update, delete on table public."partido_alineacion_slots" to authenticated;

grant select, insert, update, delete on table public."partidos" to authenticated;

grant select, insert, update, delete on table public."competitions" to authenticated;

grant select, insert, update, delete on table public."partido_estadisticas_jugador" to authenticated;

commit;
