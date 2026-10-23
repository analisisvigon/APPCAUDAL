-- SOLO ENSAYO 04C. Generado desde staging/metadata/04c.
-- NO ejecutar en produccion. No contiene filas deportivas ni usuarios.
-- Verificar visualmente el project ref y usar un proyecto Supabase nuevo.
begin;
do $guard$
begin
  if auth.uid() is not null or current_user <> 'postgres' then
    raise exception '04C exige SQL Editor postgres sin JWT de usuario';
  end if;
  if (select count(*) from auth.users) <> 0 then
    raise exception '04C exige proyecto nuevo sin cuentas';
  end if;
  if to_regclass('public.clubs') is not null
    or to_regclass('public.nexoclub_04c_staging_guard') is not null
    or to_regclass('public.equipos_rivales') is not null
    or to_regclass('public.jugadores') is not null
    or to_regclass('public.partidos') is not null then
    raise exception '04C exige esquema deportivo vacio; revisar proyecto';
  end if;
end $guard$;


create table public."equipos_rivales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" bigint,
  "name" text NOT NULL,
  "source_url" text DEFAULT ''::text,
  "crest" text DEFAULT ''::text,
  "stadium" text DEFAULT ''::text,
  "kit_color" text DEFAULT '#ef233c'::text,
  "system" text DEFAULT '4-4-2'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "field_sources" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "team_kind" text NOT NULL DEFAULT 'rival'::text,
  "tactical_variants" text[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT "equipos_rivales_legacy_id_key" UNIQUE (legacy_id),
  CONSTRAINT "equipos_rivales_pkey" PRIMARY KEY (id),
  CONSTRAINT "equipos_rivales_team_kind_check" CHECK (team_kind = ANY (ARRAY['own'::text, 'rival'::text]))
);

create table public."jugadores" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" bigint,
  "name" text NOT NULL,
  "dob" date,
  "number" integer DEFAULT 0,
  "position" text DEFAULT ''::text,
  "foot" text DEFAULT ''::text,
  "image" text DEFAULT ''::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "shirt_name" text,
  "original_image" text,
  "processed_image" text,
  "portrait_style" text NOT NULL DEFAULT 'original'::text,
  "global_player_id" uuid,
  "membership_id" uuid,
  "active_in_squad" boolean NOT NULL DEFAULT true,
  "google_forms_name" text,
  "availability_status" text NOT NULL DEFAULT 'available'::text,
  "suspension_matches_remaining" integer NOT NULL DEFAULT 0,
  "suspension_cycle_id" uuid,
  "suspension_started_at" timestamp with time zone,
  CONSTRAINT "jugadores_availability_status_check" CHECK (availability_status = ANY (ARRAY['available'::text, 'injured'::text, 'suspended'::text, 'unavailable'::text])),
  CONSTRAINT "jugadores_legacy_id_key" UNIQUE (legacy_id),
  CONSTRAINT "jugadores_pkey" PRIMARY KEY (id),
  CONSTRAINT "jugadores_suspension_matches_remaining_check" CHECK (suspension_matches_remaining >= 0),
  CONSTRAINT "jugadores_suspension_state_check" CHECK (availability_status = 'suspended'::text AND suspension_matches_remaining > 0 AND suspension_cycle_id IS NOT NULL AND suspension_started_at IS NOT NULL OR availability_status <> 'suspended'::text AND suspension_matches_remaining = 0 AND suspension_cycle_id IS NULL AND suspension_started_at IS NULL)
);

create table public."jugadores_rivales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" text,
  "equipo_rival_id" uuid,
  "name" text NOT NULL,
  "image" text DEFAULT ''::text,
  "number" text DEFAULT ''::text,
  "position" text DEFAULT ''::text,
  "age" text DEFAULT ''::text,
  "role" text DEFAULT 'Reserva'::text,
  "is_key" boolean DEFAULT false,
  "yellow_risk" boolean DEFAULT false,
  "suspended" boolean DEFAULT false,
  "injured" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "specific_position" text,
  "dob" date,
  "foot" text,
  "height" text,
  "notes" text,
  "captain" boolean NOT NULL DEFAULT false,
  "observed" boolean NOT NULL DEFAULT false,
  "source_profile_url" text,
  "image_source" text,
  "yellow_cards_count" integer,
  "card_alert" boolean NOT NULL DEFAULT false,
  "sent_off_alert" boolean NOT NULL DEFAULT false,
  "suspended_alert" boolean NOT NULL DEFAULT false,
  "injured_alert" boolean NOT NULL DEFAULT false,
  "alert_since" date,
  "alert_match" text,
  "alert_note" text,
  "external_source" text,
  "external_player_id" text,
  "doubtful" boolean NOT NULL DEFAULT false,
  "active_in_squad" boolean NOT NULL DEFAULT true,
  "field_sources" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tactical_role" text,
  "tactical_slot" integer,
  "tactical_reserve_slot" integer,
  "global_player_id" uuid,
  "membership_id" uuid,
  CONSTRAINT "jugadores_rivales_equipo_rival_id_fkey" FOREIGN KEY (equipo_rival_id) REFERENCES public.equipos_rivales(id) ON DELETE CASCADE,
  CONSTRAINT "jugadores_rivales_pkey" PRIMARY KEY (id),
  CONSTRAINT "jugadores_rivales_tactical_placement_check" CHECK (tactical_role IS NULL AND tactical_slot IS NULL AND tactical_reserve_slot IS NULL OR tactical_role = 'Titular'::text AND tactical_slot IS NOT NULL AND tactical_reserve_slot IS NULL OR tactical_role = 'Reserva'::text AND tactical_slot IS NOT NULL AND tactical_reserve_slot IS NOT NULL),
  CONSTRAINT "jugadores_rivales_tactical_reserve_slot_check" CHECK (tactical_reserve_slot IS NULL OR tactical_reserve_slot >= 0 AND tactical_reserve_slot <= 1),
  CONSTRAINT "jugadores_rivales_tactical_role_check" CHECK (tactical_role IS NULL OR (tactical_role = ANY (ARRAY['Titular'::text, 'Reserva'::text]))),
  CONSTRAINT "jugadores_rivales_tactical_slot_check" CHECK (tactical_slot IS NULL OR tactical_slot >= 0 AND tactical_slot <= 10)
);

create table public."competitions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "club_id" uuid,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "short_name" text,
  "logo_url" text,
  "fallback_icon" text,
  "competition_type" text,
  "season" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "competitions_key_check" CHECK (key = ANY (ARRAY['league'::text, 'copa_rfef'::text, 'playoff'::text, 'friendly'::text])),
  CONSTRAINT "competitions_key_key" UNIQUE (key),
  CONSTRAINT "competitions_pkey" PRIMARY KEY (id)
);

create table public."partidos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "legacy_id" bigint,
  "equipo_rival_id" uuid,
  "date" date,
  "time" text DEFAULT ''::text,
  "type" text DEFAULT 'Liga'::text,
  "round" text DEFAULT ''::text,
  "stadium" text DEFAULT ''::text,
  "opponent" text DEFAULT ''::text,
  "opponent_crest" text DEFAULT ''::text,
  "home_team" text DEFAULT 'C.D. Caudal'::text,
  "away_team" text DEFAULT ''::text,
  "is_home" boolean DEFAULT true,
  "status" text DEFAULT 'Previa'::text,
  "home_score" text DEFAULT ''::text,
  "away_score" text DEFAULT ''::text,
  "goals_for" text DEFAULT ''::text,
  "goals_against" text DEFAULT ''::text,
  "shots" text DEFAULT ''::text,
  "shots_on_target" text DEFAULT ''::text,
  "possession" text DEFAULT ''::text,
  "corners" text DEFAULT ''::text,
  "yellow_cards" text DEFAULT ''::text,
  "red_cards" text DEFAULT ''::text,
  "clean_sheet" boolean DEFAULT false,
  "pre_notes" text DEFAULT ''::text,
  "plan_con_balon" text DEFAULT ''::text,
  "plan_sin_balon" text DEFAULT ''::text,
  "plan_transiciones" text DEFAULT ''::text,
  "plan_clave" text DEFAULT ''::text,
  "plan_objetivo" text DEFAULT ''::text,
  "abp_enlace" text DEFAULT ''::text,
  "abp_ofensiva" text DEFAULT ''::text,
  "abp_defensiva" text DEFAULT ''::text,
  "pre_canva_link" text DEFAULT ''::text,
  "pre_rival_report_text" text DEFAULT ''::text,
  "pre_rival_report_extraction" jsonb,
  "pre_caudal_system" text DEFAULT '4-4-2'::text,
  "pre_rival_system" text DEFAULT ''::text,
  "pre_rival_style" text DEFAULT ''::text,
  "pre_rival_strengths" text DEFAULT ''::text,
  "pre_rival_weaknesses" text DEFAULT ''::text,
  "pre_rival_build_up" text DEFAULT 'Combinativo'::text,
  "pre_rival_defensive_block" text DEFAULT 'Medio'::text,
  "pre_rival_pressure" text DEFAULT 'Media'::text,
  "pre_rival_transitions" text DEFAULT 'Equilibradas'::text,
  "pre_rival_offensive_organization" text DEFAULT ''::text,
  "pre_rival_base_system" text DEFAULT ''::text,
  "pre_rival_start_play" text DEFAULT ''::text,
  "pre_rival_progression" text DEFAULT ''::text,
  "pre_rival_finishing" text DEFAULT ''::text,
  "pre_rival_offensive_key_players" text DEFAULT ''::text,
  "pre_rival_danger_zones" text DEFAULT ''::text,
  "pre_rival_wide_attack" text DEFAULT ''::text,
  "pre_rival_box_occupation" text DEFAULT ''::text,
  "pre_rival_defensive_organization" text DEFAULT ''::text,
  "pre_rival_defensive_system" text DEFAULT ''::text,
  "pre_rival_block_height_detail" text DEFAULT ''::text,
  "pre_rival_pressure_type" text DEFAULT ''::text,
  "pre_rival_spaces_allowed" text DEFAULT ''::text,
  "pre_rival_defends_crosses" text DEFAULT ''::text,
  "pre_rival_defends_back" text DEFAULT ''::text,
  "pre_rival_second_ball_defense" text DEFAULT ''::text,
  "pre_rival_after_loss" text DEFAULT ''::text,
  "pre_rival_after_recovery" text DEFAULT ''::text,
  "pre_rival_transition_launchers" text DEFAULT ''::text,
  "pre_rival_best_running_zones" text DEFAULT ''::text,
  "pre_rival_corners_for" text DEFAULT ''::text,
  "pre_rival_corners_against" text DEFAULT ''::text,
  "pre_rival_wide_free_kicks" text DEFAULT ''::text,
  "pre_rival_set_piece_takers" text DEFAULT ''::text,
  "pre_rival_main_headers" text DEFAULT ''::text,
  "pre_caudal_intent" text DEFAULT ''::text,
  "pre_caudal_build_plan" text DEFAULT ''::text,
  "pre_caudal_start_play" text DEFAULT ''::text,
  "pre_caudal_progression_plan" text DEFAULT ''::text,
  "pre_caudal_attack_zones" text DEFAULT ''::text,
  "pre_caudal_players_to_activate" text DEFAULT ''::text,
  "pre_caudal_spaces_to_find" text DEFAULT ''::text,
  "pre_caudal_press_plan" text DEFAULT ''::text,
  "pre_caudal_rivals_to_block" text DEFAULT ''::text,
  "pre_caudal_defend_strengths" text DEFAULT ''::text,
  "pre_caudal_avoid" text DEFAULT ''::text,
  "pre_caudal_after_loss" text DEFAULT ''::text,
  "pre_caudal_after_recovery" text DEFAULT ''::text,
  "pre_key_matchups" text DEFAULT ''::text,
  "pre_caudal_player_to_boost" text DEFAULT ''::text,
  "pre_rival_player_to_watch" text DEFAULT ''::text,
  "pre_important_duels" text DEFAULT ''::text,
  "pre_ai_support_notes" text DEFAULT ''::text,
  "pre_ai_analysis" jsonb,
  "stats_system" text DEFAULT '4-4-2'::text,
  "post_video_link" text DEFAULT ''::text,
  "post_notes" text DEFAULT ''::text,
  "post_reality" text DEFAULT ''::text,
  "post_fulfilled" text DEFAULT ''::text,
  "post_not_fulfilled" text DEFAULT ''::text,
  "post_why" text DEFAULT ''::text,
  "post_next_adjustment" text DEFAULT ''::text,
  "post_repeat" text DEFAULT ''::text,
  "post_improve" text DEFAULT ''::text,
  "post_train_week" text DEFAULT ''::text,
  "post_individual_observations" text DEFAULT ''::text,
  "post_ai_analysis" jsonb,
  "rival_lineup_system" text DEFAULT ''::text,
  "raw_legacy" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "pre_system_reading" jsonb,
  "pre_key_matchups_table" jsonb DEFAULT '[]'::jsonb,
  "pre_plan_trigger" text DEFAULT ''::text,
  "pre_plan_avoid" text DEFAULT ''::text,
  "pre_plan_adjustment" text DEFAULT ''::text,
  "captain_player_id" uuid,
  "delegated_data_status" text NOT NULL DEFAULT 'Sin revisar'::text,
  "competition_key" text,
  "competition_logo_url" text,
  "competition_id" uuid,
  "delegated_reviewed_at" timestamp with time zone,
  "goalkeeper_protocol_primary_player_id" uuid,
  "goalkeeper_protocol_secondary_player_id" uuid,
  "player_visible" boolean NOT NULL DEFAULT false,
  "club_team_season_id" uuid,
  CONSTRAINT "partidos_captain_player_id_fkey" FOREIGN KEY (captain_player_id) REFERENCES public.jugadores(id) ON DELETE SET NULL,
  CONSTRAINT "partidos_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES public.competitions(id),
  CONSTRAINT "partidos_competition_key_check" CHECK (competition_key IS NULL OR (competition_key = ANY (ARRAY['league'::text, 'copa_rfef'::text, 'playoff'::text, 'friendly'::text]))),
  CONSTRAINT "partidos_delegated_data_status_check" CHECK (delegated_data_status = ANY (ARRAY['Sin revisar'::text, 'Revisado'::text, 'Validado'::text, 'Descartado'::text])),
  CONSTRAINT "partidos_equipo_rival_id_fkey" FOREIGN KEY (equipo_rival_id) REFERENCES public.equipos_rivales(id) ON DELETE SET NULL,
  CONSTRAINT "partidos_goalkeeper_protocol_distinct_players_check" CHECK (goalkeeper_protocol_primary_player_id IS NULL OR goalkeeper_protocol_secondary_player_id IS NULL OR goalkeeper_protocol_primary_player_id <> goalkeeper_protocol_secondary_player_id),
  CONSTRAINT "partidos_goalkeeper_protocol_primary_player_fk" FOREIGN KEY (goalkeeper_protocol_primary_player_id) REFERENCES public.jugadores(id) ON DELETE SET NULL,
  CONSTRAINT "partidos_goalkeeper_protocol_secondary_player_fk" FOREIGN KEY (goalkeeper_protocol_secondary_player_id) REFERENCES public.jugadores(id) ON DELETE SET NULL,
  CONSTRAINT "partidos_legacy_id_key" UNIQUE (legacy_id),
  CONSTRAINT "partidos_pkey" PRIMARY KEY (id)
);

create table public."partido_estadisticas_jugador" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "partido_id" uuid,
  "jugador_id" uuid,
  "player_name" text NOT NULL,
  "role" text DEFAULT 'Suplente'::text,
  "minutes" text DEFAULT ''::text,
  "yellow" boolean DEFAULT false,
  "yellow_count" integer DEFAULT 0,
  "red" boolean DEFAULT false,
  "injured" boolean DEFAULT false,
  "rating" text DEFAULT ''::text,
  "replacement_name" text DEFAULT ''::text,
  "raw_data" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "partido_estadisticas_jugador_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE SET NULL,
  CONSTRAINT "partido_estadisticas_jugador_partido_id_fkey" FOREIGN KEY (partido_id) REFERENCES public.partidos(id) ON DELETE CASCADE,
  CONSTRAINT "partido_estadisticas_jugador_partido_id_player_name_key" UNIQUE (partido_id, player_name),
  CONSTRAINT "partido_estadisticas_jugador_pkey" PRIMARY KEY (id)
);

create table public."partido_alineacion_slots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "partido_id" uuid,
  "scope" text NOT NULL,
  "slot" integer NOT NULL,
  "player_name" text DEFAULT ''::text,
  "jugador_id" uuid,
  "jugador_rival_id" uuid,
  "global_player_id" uuid,
  "membership_id" uuid,
  CONSTRAINT "partido_alineacion_slots_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.jugadores(id) ON DELETE SET NULL,
  CONSTRAINT "partido_alineacion_slots_jugador_rival_id_fkey" FOREIGN KEY (jugador_rival_id) REFERENCES public.jugadores_rivales(id) ON DELETE SET NULL,
  CONSTRAINT "partido_alineacion_slots_partido_id_fkey" FOREIGN KEY (partido_id) REFERENCES public.partidos(id) ON DELETE CASCADE,
  CONSTRAINT "partido_alineacion_slots_partido_id_scope_slot_key" UNIQUE (partido_id, scope, slot),
  CONSTRAINT "partido_alineacion_slots_pkey" PRIMARY KEY (id),
  CONSTRAINT "partido_alineacion_slots_scope_check" CHECK (scope = ANY (ARRAY['pre_caudal'::text, 'pre_rival'::text, 'stats'::text]))
);

create table public."equipo_rival_alineacion" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "equipo_rival_id" uuid,
  "jugador_rival_id" uuid,
  "player_name" text NOT NULL,
  "slot" integer,
  "role" text DEFAULT 'Titular'::text,
  "x" numeric,
  "y" numeric,
  "player_snapshot" jsonb DEFAULT '{}'::jsonb,
  "global_player_id" uuid,
  "membership_id" uuid,
  CONSTRAINT "equipo_rival_alineacion_equipo_rival_id_fkey" FOREIGN KEY (equipo_rival_id) REFERENCES public.equipos_rivales(id) ON DELETE CASCADE,
  CONSTRAINT "equipo_rival_alineacion_jugador_rival_id_fkey" FOREIGN KEY (jugador_rival_id) REFERENCES public.jugadores_rivales(id) ON DELETE SET NULL,
  CONSTRAINT "equipo_rival_alineacion_pkey" PRIMARY KEY (id)
);

create table public."equipo_rival_banquillo" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "equipo_rival_id" uuid,
  "starter_name" text NOT NULL,
  "slot" integer NOT NULL,
  "jugador_rival_id" uuid,
  "player_name" text,
  "player_snapshot" jsonb DEFAULT '{}'::jsonb,
  "global_player_id" uuid,
  "membership_id" uuid,
  CONSTRAINT "equipo_rival_banquillo_equipo_rival_id_fkey" FOREIGN KEY (equipo_rival_id) REFERENCES public.equipos_rivales(id) ON DELETE CASCADE,
  CONSTRAINT "equipo_rival_banquillo_jugador_rival_id_fkey" FOREIGN KEY (jugador_rival_id) REFERENCES public.jugadores_rivales(id) ON DELETE SET NULL,
  CONSTRAINT "equipo_rival_banquillo_pkey" PRIMARY KEY (id)
);

CREATE INDEX jugadores_active_in_squad_idx ON public.jugadores USING btree (active_in_squad, global_player_id);

CREATE INDEX jugadores_global_player_id_idx ON public.jugadores USING btree (global_player_id) WHERE (global_player_id IS NOT NULL);

CREATE UNIQUE INDEX jugadores_rivales_external_identity_uidx ON public.jugadores_rivales USING btree (equipo_rival_id, external_source, external_player_id) WHERE ((external_source IS NOT NULL) AND (external_player_id IS NOT NULL));

CREATE UNIQUE INDEX jugadores_rivales_tactical_reserve_slot_uidx ON public.jugadores_rivales USING btree (equipo_rival_id, tactical_slot, tactical_reserve_slot) WHERE ((tactical_role = 'Reserva'::text) AND (tactical_slot IS NOT NULL) AND (tactical_reserve_slot IS NOT NULL));

CREATE UNIQUE INDEX jugadores_rivales_tactical_starter_slot_uidx ON public.jugadores_rivales USING btree (equipo_rival_id, tactical_slot) WHERE ((tactical_role = 'Titular'::text) AND (tactical_slot IS NOT NULL));

CREATE INDEX partidos_captain_player_id_idx ON public.partidos USING btree (captain_player_id);

CREATE INDEX partidos_goalkeeper_protocol_primary_idx ON public.partidos USING btree (goalkeeper_protocol_primary_player_id) WHERE (goalkeeper_protocol_primary_player_id IS NOT NULL);

CREATE INDEX partidos_goalkeeper_protocol_secondary_idx ON public.partidos USING btree (goalkeeper_protocol_secondary_player_id) WHERE (goalkeeper_protocol_secondary_player_id IS NOT NULL);

alter table public."equipos_rivales" enable row level security;

revoke all on table public."equipos_rivales" from public, anon, authenticated;

alter table public."jugadores" enable row level security;

revoke all on table public."jugadores" from public, anon, authenticated;

alter table public."jugadores_rivales" enable row level security;

revoke all on table public."jugadores_rivales" from public, anon, authenticated;

alter table public."competitions" enable row level security;

revoke all on table public."competitions" from public, anon, authenticated;

alter table public."partidos" enable row level security;

revoke all on table public."partidos" from public, anon, authenticated;

alter table public."partido_estadisticas_jugador" enable row level security;

revoke all on table public."partido_estadisticas_jugador" from public, anon, authenticated;

alter table public."partido_alineacion_slots" enable row level security;

revoke all on table public."partido_alineacion_slots" from public, anon, authenticated;

alter table public."equipo_rival_alineacion" enable row level security;

revoke all on table public."equipo_rival_alineacion" from public, anon, authenticated;

alter table public."equipo_rival_banquillo" enable row level security;

revoke all on table public."equipo_rival_banquillo" from public, anon, authenticated;

commit;
