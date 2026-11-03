-- NEXO CLUB: series opcionales en Biblioteca y copias históricas de Sesiones.
-- Instalación manual. No actualiza tareas ni sesiones existentes.
begin;

do $pre$
declare v_name text; v_oid oid; v_hash text;
begin
  if to_regclass('public.training_tasks') is null or
     to_regclass('public.planned_session_items') is null then
    raise exception 'Faltan tablas de Biblioteca o Sesiones 03C';
  end if;
  if not exists(select 1 from pg_catalog.pg_attribute
      where attrelid='public.training_tasks'::regclass and attname='duration_minutes'
      and atttypid='pg_catalog.int4'::regtype and not attisdropped) then
    raise exception 'training_tasks.duration_minutes no es int4';
  end if;
  if exists(select 1 from pg_catalog.pg_attribute
      where attrelid='public.training_tasks'::regclass and
        attname in ('series_count','minutes_per_series') and not attisdropped
        and (atttypid<>'pg_catalog.int4'::regtype or attnotnull)) then
    raise exception 'Columna de series preexistente incompatible';
  end if;
  foreach v_name in array array[
    'public.planned_library_snapshot(uuid)',
    'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'] loop
    v_oid:=to_regprocedure(v_name)::oid;
    if v_oid is null then raise exception 'Falta función %',v_name; end if;
    select md5(pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g'))
      into v_hash from pg_catalog.pg_proc p where p.oid=v_oid
        and p.prosecdef and p.proowner='postgres'::regrole
        and p.proconfig @> array['search_path=pg_catalog'];
    if v_hash is null or (v_name='public.planned_library_snapshot(uuid)' and
        v_hash not in ('27cb3f0ecb53a2cb02aeeb82c61327f7','dc709201ad400bca07da23e6a3ee33dc')) or
       (v_name='public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])' and
        v_hash not in ('d4838f0ee66a2d653d34f412d27994b7','42ca2b394d5545da2789c9b687f99ed8')) then
      raise exception 'Función 03C divergente o configuración insegura: %',v_name;
    end if;
  end loop;
  if to_regprocedure('public.planned_task_series_ready_v1()') is not null and
     not exists(select 1 from pg_catalog.pg_proc p
       where p.oid=to_regprocedure('public.planned_task_series_ready_v1()')::oid
         and not p.prosecdef and p.provolatile='s'
         and p.proowner='postgres'::regrole
         and p.proconfig @> array['search_path=pg_catalog']
         and pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g')='selecttrue') then
    raise exception 'Capacidad de series preexistente incompatible';
  end if;
end $pre$;

alter table public.training_tasks add column if not exists series_count integer;
alter table public.training_tasks add column if not exists minutes_per_series integer;

do $constraint$
begin
  if not exists(select 1 from pg_catalog.pg_constraint
      where conrelid='public.training_tasks'::regclass
        and conname='training_tasks_series_duration_ck') then
    alter table public.training_tasks add constraint training_tasks_series_duration_ck
      check (
        (series_count is null and minutes_per_series is null) or
        (series_count is not null and minutes_per_series is not null and
         series_count > 0 and minutes_per_series > 0 and duration_minutes is not null
         and duration_minutes::numeric = series_count::numeric * minutes_per_series::numeric)
      );
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint
      where conrelid='public.training_tasks'::regclass and
        conname='training_tasks_series_duration_ck' and contype='c' and convalidated and
        lower(pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(oid),'[[:space:]()]','','g'))
          = lower(pg_catalog.regexp_replace(
            'CHECK (((series_count IS NULL) AND (minutes_per_series IS NULL)) OR ((series_count IS NOT NULL) AND (minutes_per_series IS NOT NULL) AND (series_count > 0) AND (minutes_per_series > 0) AND (duration_minutes IS NOT NULL) AND ((duration_minutes)::numeric = ((series_count)::numeric * (minutes_per_series)::numeric))))',
            '[[:space:]()]','','g'))) then
    raise exception 'Constraint de series ausente o incompatible';
  end if;
end $constraint$;

create or replace function public.planned_library_snapshot(p_task_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $fn$
declare v_task public.training_tasks%rowtype; v_media jsonb; v_result jsonb;
begin
  if auth.uid() is null or p_task_id is null or
     public.training_task_authorized(p_task_id,'read') is not true then
    raise exception 'Tarea no autorizada' using errcode='42501';
  end if;
  select * into v_task from public.training_tasks t where t.id=p_task_id for update;
  if not found or public.training_task_authorized(p_task_id,'read') is not true then
    raise exception 'Tarea no autorizada' using errcode='42501';
  end if;
  if public.planned_editor_payload_snapshot_safe(v_task.editor_payload) is not true then
    raise exception '03C: pizarra con formato o recurso no incorporable sin copia histórica'
      using errcode='0A000';
  end if;
  -- La FK media.task_id -> task.id obliga a inserciones concurrentes a esperar
  -- el lock FOR UPDATE de la tarea; las filas existentes se bloquean antes
  -- de comprobar el tipo, para no aceptar una conversión URL -> upload.
  perform 1 from public.training_task_media m
    where m.task_id=p_task_id for share of m;
  if exists(select 1 from public.training_task_media m
      where m.task_id=p_task_id and m.club_id is distinct from v_task.club_id) then
    raise exception 'Multimedia de Biblioteca con club incoherente' using errcode='23514';
  end if;
  if v_task.preview_path is not null or v_task.attachment_path is not null or
     exists(select 1 from public.training_task_media m
       where m.task_id=p_task_id and
         (m.source is distinct from 'url' or m.storage_path is not null)) then
    raise exception '03C: los archivos subidos requieren copia histórica verificada'
      using errcode='0A000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'kind',m.kind,'source',m.source,'original_url',m.original_url,
    'provider',m.provider,'provider_key',m.provider_key,'title',m.title,
    'caption',m.caption,'sort_order',m.sort_order,'is_primary',m.is_primary)
    order by m.sort_order,m.created_at,m.id),'[]'::jsonb)
    into v_media from public.training_task_media m where m.task_id=p_task_id;
  v_result:=jsonb_build_object(
    'snapshot_version',1,'source_task_id',v_task.id,
    'source_club_id',v_task.club_id,
    'source',jsonb_build_object(
      'name',v_task.name,'task_code',v_task.task_code,
      'description',v_task.description,
      'objective',v_task.objective,'task_type',v_task.task_type,
      'players_spec',v_task.players_spec,'players_min',v_task.players_min,
      'players_max',v_task.players_max,'duration_minutes',v_task.duration_minutes,
      'series_count',v_task.series_count,'minutes_per_series',v_task.minutes_per_series,
      'space_width_m',v_task.space_width_m,'space_length_m',v_task.space_length_m,
      'material',v_task.material,'technical_content',v_task.technical_content,
      'tactical_content',v_task.tactical_content,'game_phase',v_task.game_phase,
      'game_moment',v_task.game_moment,'observations',v_task.observations,
      'stage_keys',v_task.stage_keys,'variants',v_task.variants,
      'editor_payload',v_task.editor_payload),
    'working','{}'::jsonb,'media',v_media);
  if octet_length(v_result::text)>262144 then
    raise exception '03C: snapshot completo supera el límite de 256 KiB'
      using errcode='22001';
  end if;
  if public.training_task_authorized(p_task_id,'read') is not true then
    raise exception 'Tarea no autorizada' using errcode='42501';
  end if;
  return v_result;
end $fn$;

create or replace function public.save_planned_session_03c(
  p_session_id uuid,p_expected_revision integer,p_session_date date,
  p_header jsonb,p_slots jsonb,p_requested_number integer default null,
  p_removed_slot_ids uuid[] default '{}'::uuid[],
  p_removed_item_ids uuid[] default '{}'::uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_s public.planned_training_sessions%rowtype;
  v_old_item public.planned_session_items%rowtype;
  v_cts uuid; v_club uuid; v_start date; v_end date; v_status text; v_actor uuid;
  v_header jsonb; v_slot jsonb; v_item jsonb; v_cslot jsonb; v_citem jsonb;
  v_citems jsonb; v_cslots jsonb:='[]'::jsonb; v_snapshot jsonb; v_working jsonb;
  v_series_text text; v_per_series_text text; v_duration_text text;
  v_key text; v_slot_id uuid; v_item_id uuid;
  v_seen_slots uuid[]:='{}'::uuid[]; v_seen_items uuid[]:='{}'::uuid[];
  v_number integer; v_high integer; v_before jsonb; v_after jsonb; v_desired jsonb;
  v_sections text[]:='{}'::text[]; v_revision integer;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null or
     p_session_date is null or jsonb_typeof(p_header) is distinct from 'object' or
     jsonb_typeof(p_slots) is distinct from 'array' or
     octet_length(p_slots::text)>1048576 or octet_length(p_header::text)>40000 or
     p_removed_slot_ids is null or p_removed_item_ids is null or
     array_position(p_removed_slot_ids,null) is not null or
     array_position(p_removed_item_ids,null) is not null then
    raise exception 'Guardado inválido' using errcode='22023';
  end if;
  select s.club_team_season_id into v_cts from public.planned_training_sessions s
    where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  -- Mismo orden de locks que 03A: temporada -> sesión -> contador.
  select cts.club_id,se.starts_on,se.ends_on,se.status
    into v_club,v_start,v_end,v_status from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select * into v_s from public.planned_training_sessions s
    where s.id=p_session_id for update;
  if not found or v_s.revision<>p_expected_revision then
    raise exception 'Revisión obsoleta' using errcode='40001';
  end if;
  if p_session_date<v_start or p_session_date>v_end then
    raise exception 'Fecha fuera de temporada' using errcode='23514';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if v_actor is null then raise exception 'Membresía no autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.club_memberships m
      where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_cts for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  for v_key in select jsonb_object_keys(p_header) loop
    if v_key<>all(array['starts_at','location','period_label','morphology_pattern',
      'next_opponent_label','objectives','notes','material','staff_observations']) or
       jsonb_typeof(p_header->v_key) not in ('string','null') then
      raise exception 'Campo de cabecera no admitido' using errcode='22023';
    end if;
  end loop;
  v_header:=jsonb_build_object(
    'starts_at',v_s.starts_at,'location',v_s.location,
    'period_label',v_s.period_label,'morphology_pattern',v_s.morphology_pattern,
    'next_opponent_label',v_s.next_opponent_label,'objectives',v_s.objectives,
    'notes',v_s.notes,'material',v_s.material,
    'staff_observations',v_s.staff_observations) || p_header;
  if p_requested_number is not null and
     (v_s.planning_state<>'confirmed' or p_requested_number<=0) then
    raise exception 'Numeración manual no permitida' using errcode='22023';
  end if;
  v_number:=coalesce(p_requested_number,v_s.session_number);
  for v_slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) is distinct from 'object' or
       jsonb_typeof(v_slot->'items') is distinct from 'array' or
       (v_slot ?& array['id','phase','sort_order','duration_minutes','items']) is not true then
      raise exception 'Franja inválida' using errcode='22023';
    end if;
    for v_key in select jsonb_object_keys(v_slot) loop
      if v_key<>all(array['id','phase','sort_order','duration_minutes','items']) then
        raise exception 'Campo de franja no admitido' using errcode='22023';
      end if;
    end loop;
    v_slot_id:=(v_slot->>'id')::uuid;
    if v_slot_id is null or v_slot_id=any(v_seen_slots) then
      raise exception 'UUID de franja ausente o duplicado' using errcode='22023';
    end if;
    v_seen_slots:=array_append(v_seen_slots,v_slot_id);
    if v_s.planning_state='confirmed' and jsonb_array_length(v_slot->'items')=0 then
      raise exception 'Franja confirmada sin actividad' using errcode='23514';
    end if;
    v_citems:='[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_slot->'items') loop
      if jsonb_typeof(v_item) is distinct from 'object' or
         (v_item ?& array['id','sort_order','kind','activity_minutes']) is not true then
        raise exception 'Actividad inválida' using errcode='22023';
      end if;
      v_item_id:=(v_item->>'id')::uuid;
      if v_item_id is null or v_item_id=any(v_seen_items) then
        raise exception 'UUID de actividad ausente o duplicado' using errcode='22023';
      end if;
      v_seen_items:=array_append(v_seen_items,v_item_id);
      if (v_item->>'activity_minutes')::integer>
         (v_slot->>'duration_minutes')::integer then
        raise exception 'Actividad supera franja' using errcode='23514';
      end if;
      select * into v_old_item from public.planned_session_items it
        where it.id=v_item_id and it.session_id=p_session_id;
      if v_item->>'kind'='free' then
        if (v_item ?& array['free_title','free_description','free_comments','free_url']) is not true or
           (v_old_item.id is not null and v_old_item.kind<>'free') then
          raise exception 'Actividad libre incompatible' using errcode='22023';
        end if;
        for v_key in select jsonb_object_keys(v_item) loop
          if v_key<>all(array['id','sort_order','kind','activity_minutes',
            'free_title','free_description','free_comments','free_url']) then
            raise exception 'Campo libre no admitido' using errcode='22023';
          end if;
        end loop;
        v_citem:=jsonb_build_object('id',v_item_id,'sort_order',(v_item->>'sort_order')::integer,
          'kind','free','source_task_uuid_snapshot',null,'task_snapshot',null,
          'free_title',v_item->>'free_title','free_description',v_item->>'free_description',
          'free_comments',v_item->>'free_comments','free_url',v_item->>'free_url',
          'activity_minutes',(v_item->>'activity_minutes')::integer);
      elsif v_item->>'kind'='library_task' then
        if v_old_item.id is null then
          if (v_item ? 'source_task_id') is not true or (v_item ? 'working') then
            raise exception 'La incorporación solo admite source_task_id' using errcode='22023';
          end if;
          for v_key in select jsonb_object_keys(v_item) loop
            if v_key<>all(array['id','sort_order','kind','activity_minutes','source_task_id']) then
              raise exception 'Campo de incorporación no admitido' using errcode='22023';
            end if;
          end loop;
          if not exists(select 1 from public.training_tasks t
              where t.id=(v_item->>'source_task_id')::uuid
                and t.club_id=v_club) then
            raise exception 'Tarea de otro club no incorporable' using errcode='42501';
          end if;
          v_snapshot:=public.planned_library_snapshot((v_item->>'source_task_id')::uuid);
          if v_snapshot->>'source_task_id' is null then
            raise exception 'Origen de Biblioteca inválido' using errcode='22023';
          end if;
        else
          if v_old_item.kind<>'library_task' or (v_item ? 'source_task_id') then
            raise exception 'Origen de Biblioteca inmutable' using errcode='42501';
          end if;
          for v_key in select jsonb_object_keys(v_item) loop
            if v_key<>all(array['id','sort_order','kind','activity_minutes','working']) then
              raise exception 'Campo de copia no admitido' using errcode='22023';
            end if;
          end loop;
          v_snapshot:=v_old_item.task_snapshot;
          if v_item ? 'working' then
            v_working:=v_item->'working';
            if jsonb_typeof(v_working) is distinct from 'object' then
              raise exception 'Edición de copia inválida' using errcode='22023';
            end if;
            for v_key in select jsonb_object_keys(v_working) loop
              if v_key<>all(array['name','description','objective','material',
                'technical_content','tactical_content','observations','editor_payload',
                'series_count','minutes_per_series','duration_minutes']) or
                 (v_key='editor_payload' and
                   jsonb_typeof(v_working->v_key) is distinct from 'object') or
                 (v_key=any(array['series_count','minutes_per_series','duration_minutes']) and
                   jsonb_typeof(v_working->v_key) not in ('number','null')) or
                 (v_key<>all(array['editor_payload','series_count','minutes_per_series','duration_minutes']) and
                   jsonb_typeof(v_working->v_key) not in ('string','null')) then
                raise exception 'Campo de copia no admitido' using errcode='22023';
              end if;
            end loop;
            -- PATCH superficial: conserva las ediciones anteriores de otros
            -- campos. editor_payload, si se envía, es un objeto completo.
            if v_working ? 'editor_payload' and
               (public.planned_editor_payload_snapshot_safe(
                  v_snapshot->'source'->'editor_payload') is not true or
                public.planned_editor_payload_snapshot_safe(
                  v_working->'editor_payload') is not true) then
              raise exception '03C: pizarra no editable o con recursos externos'
                using errcode='0A000';
            end if;
            v_snapshot:=jsonb_set(v_snapshot,'{working}',
              (v_snapshot->'working') || v_working,false);
          end if;
        end if;
        -- Los snapshots anteriores, sin claves de series, permanecen intactos.
        v_series_text:=case when v_snapshot->'working' ? 'series_count'
          then v_snapshot->'working'->>'series_count'
          else v_snapshot->'source'->>'series_count' end;
        v_per_series_text:=case when v_snapshot->'working' ? 'minutes_per_series'
          then v_snapshot->'working'->>'minutes_per_series'
          else v_snapshot->'source'->>'minutes_per_series' end;
        if v_snapshot->'working' ? 'duration_minutes' then
          v_duration_text:=v_snapshot->'working'->>'duration_minutes';
          if (v_duration_text is not null and
              (v_duration_text !~ '^[1-9][0-9]*$' or v_duration_text::numeric > 2147483647)) or
             (v_item->>'activity_minutes')::numeric is distinct from v_duration_text::numeric then
            raise exception 'Duracion propia incoherente' using errcode='22023';
          end if;
        end if;
        if (v_series_text is null) <> (v_per_series_text is null) then
          raise exception 'Series incompletas' using errcode='22023';
        end if;
        if v_series_text is not null then
          v_duration_text:=case when v_snapshot->'working' ? 'duration_minutes'
            then v_snapshot->'working'->>'duration_minutes'
            else v_snapshot->'source'->>'duration_minutes' end;
          if v_series_text !~ '^[1-9][0-9]*$' or
             v_per_series_text !~ '^[1-9][0-9]*$' or
             v_series_text::numeric * v_per_series_text::numeric > 2147483647 or
             v_duration_text is null or v_duration_text !~ '^[1-9][0-9]*$' or
             v_duration_text::numeric is distinct from
               v_series_text::numeric * v_per_series_text::numeric or
             (v_item->>'activity_minutes')::numeric is distinct from
               v_series_text::numeric * v_per_series_text::numeric then
            raise exception 'Duracion por series incoherente' using errcode='22023';
          end if;
        end if;
        if octet_length(v_snapshot::text)>262144 then
          raise exception 'Snapshot supera el límite de 256 KiB' using errcode='22001';
        end if;
        v_citem:=jsonb_build_object('id',v_item_id,'sort_order',(v_item->>'sort_order')::integer,
          'kind','library_task','source_task_uuid_snapshot',
          (v_snapshot->>'source_task_id')::uuid,'task_snapshot',v_snapshot,
          'free_title',null,'free_description',null,'free_comments',null,'free_url',null,
          'activity_minutes',(v_item->>'activity_minutes')::integer);
      else
        raise exception 'Tipo de actividad no admitido' using errcode='22023';
      end if;
      v_citems:=v_citems||jsonb_build_array(v_citem);
    end loop;
    v_cslot:=jsonb_build_object('id',v_slot_id,'phase',v_slot->>'phase',
      'sort_order',(v_slot->>'sort_order')::integer,
      'duration_minutes',(v_slot->>'duration_minutes')::integer,'items',v_citems);
    v_cslots:=v_cslots||jsonb_build_array(v_cslot);
  end loop;
  if cardinality(p_removed_slot_ids)<>
       (select count(distinct removed.id) from unnest(p_removed_slot_ids) removed(id)) or
     cardinality(p_removed_item_ids)<>
       (select count(distinct removed.id) from unnest(p_removed_item_ids) removed(id)) then
    raise exception 'UUID de retirada duplicado' using errcode='22023';
  end if;
  if exists(select 1 from public.planned_session_slots sl
       where sl.id=any(v_seen_slots) and sl.session_id<>p_session_id) or
     exists(select 1 from public.planned_session_items it
       where it.id=any(v_seen_items) and it.session_id<>p_session_id) then
    raise exception 'Elemento pertenece a otra sesión' using errcode='42501';
  end if;
  if exists(select 1 from public.planned_session_slots sl
       where sl.session_id=p_session_id and sl.id<>all(v_seen_slots)
         and sl.id<>all(p_removed_slot_ids)) or
     exists(select 1 from unnest(p_removed_slot_ids) removed(id)
       where removed.id=any(v_seen_slots) or not exists(
         select 1 from public.planned_session_slots sl
         where sl.id=removed.id and sl.session_id=p_session_id)) or
     exists(select 1 from public.planned_session_items it
       where it.session_id=p_session_id and it.id<>all(v_seen_items)
         and it.id<>all(p_removed_item_ids)) or
     exists(select 1 from unnest(p_removed_item_ids) removed(id)
       where removed.id=any(v_seen_items) or not exists(
         select 1 from public.planned_session_items it
         where it.id=removed.id and it.session_id=p_session_id)) then
    raise exception 'Las retiradas explícitas no coinciden con el documento completo'
      using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',(sl.x->>'id')::uuid,'phase',sl.x->>'phase',
    'sort_order',(sl.x->>'sort_order')::integer,
    'duration_minutes',(sl.x->>'duration_minutes')::integer,
    'items',coalesce((select jsonb_agg(it.y order by
       (it.y->>'sort_order')::integer,(it.y->>'id')::uuid)
       from jsonb_array_elements(sl.x->'items') it(y)),'[]'::jsonb))
    order by sl.x->>'phase',(sl.x->>'sort_order')::integer,(sl.x->>'id')::uuid),'[]'::jsonb)
    into v_cslots from jsonb_array_elements(v_cslots) sl(x);
  v_desired:=jsonb_build_object(
    'session_date',p_session_date,'starts_at',(v_header->>'starts_at')::time,
    'location',v_header->'location','period_label',v_header->'period_label',
    'morphology_pattern',v_header->'morphology_pattern',
    'next_opponent_label',v_header->'next_opponent_label',
    'objectives',v_header->'objectives','notes',v_header->'notes',
    'material',v_header->'material','staff_observations',v_header->'staff_observations',
    'planning_state',v_s.planning_state,'session_number',v_number,'slots',v_cslots);
  v_before:=public.planned_session_state(p_session_id);
  if v_before=v_desired then return v_s.revision; end if;
  if v_number is distinct from v_s.session_number then
    insert into public.planned_session_number_state(club_team_season_id)
      values (v_cts) on conflict do nothing;
    select highest_ever_assigned into v_high from public.planned_session_number_state
      where club_team_season_id=v_cts for update;
    if exists(select 1 from public.planned_training_sessions other
      where other.club_team_season_id=v_cts and other.session_number=v_number
        and other.id<>p_session_id) then
      raise exception 'Número ya ocupado' using errcode='23505';
    end if;
    update public.planned_session_number_state
      set highest_ever_assigned=greatest(highest_ever_assigned,v_number)
      where club_team_season_id=v_cts;
  end if;
  update public.planned_training_sessions set
    session_date=p_session_date,starts_at=(v_header->>'starts_at')::time,
    location=v_header->>'location',period_label=v_header->>'period_label',
    morphology_pattern=v_header->>'morphology_pattern',
    next_opponent_label=v_header->>'next_opponent_label',
    objectives=v_header->>'objectives',notes=v_header->>'notes',
    material=v_header->>'material',staff_observations=v_header->>'staff_observations',
    session_number=v_number,revision=revision+1
  where id=p_session_id returning revision into v_revision;
  if v_before->'slots' is distinct from v_desired->'slots' then
    for v_slot in select value from jsonb_array_elements(v_cslots) loop
      v_slot_id:=(v_slot->>'id')::uuid;
      if exists(select 1 from public.planned_session_slots sl
          where sl.id=v_slot_id and sl.session_id=p_session_id) then
        update public.planned_session_slots sl set
          phase=v_slot->>'phase',sort_order=(v_slot->>'sort_order')::integer,
          duration_minutes=(v_slot->>'duration_minutes')::integer
        where sl.id=v_slot_id and sl.session_id=p_session_id
          and row(sl.phase,sl.sort_order,sl.duration_minutes) is distinct from
              row(v_slot->>'phase',(v_slot->>'sort_order')::integer,
                  (v_slot->>'duration_minutes')::integer);
      else
        insert into public.planned_session_slots
          (id,session_id,phase,sort_order,duration_minutes)
        values (v_slot_id,p_session_id,v_slot->>'phase',
          (v_slot->>'sort_order')::integer,(v_slot->>'duration_minutes')::integer);
      end if;
    end loop;
    for v_slot in select value from jsonb_array_elements(v_cslots) loop
      v_slot_id:=(v_slot->>'id')::uuid;
      for v_item in select value from jsonb_array_elements(v_slot->'items') loop
        v_item_id:=(v_item->>'id')::uuid;
        if exists(select 1 from public.planned_session_items it
            where it.id=v_item_id and it.session_id=p_session_id) then
          update public.planned_session_items it set
            slot_id=v_slot_id,sort_order=(v_item->>'sort_order')::integer,
            free_title=v_item->>'free_title',
            free_description=v_item->>'free_description',
            free_comments=v_item->>'free_comments',free_url=v_item->>'free_url',
            task_snapshot=nullif(v_item->'task_snapshot','null'::jsonb),
            activity_minutes=(v_item->>'activity_minutes')::integer
          where it.id=v_item_id and it.session_id=p_session_id
            and row(it.slot_id,it.sort_order,it.free_title,it.free_description,
              it.free_comments,it.free_url,it.task_snapshot,it.activity_minutes)
              is distinct from
              row(v_slot_id,(v_item->>'sort_order')::integer,
                v_item->>'free_title',v_item->>'free_description',
                v_item->>'free_comments',v_item->>'free_url',
                nullif(v_item->'task_snapshot','null'::jsonb),
                (v_item->>'activity_minutes')::integer);
        else
          insert into public.planned_session_items
            (id,session_id,slot_id,sort_order,kind,source_task_uuid_snapshot,
             task_snapshot,free_title,free_description,free_comments,free_url,
             activity_minutes)
          values (v_item_id,p_session_id,v_slot_id,(v_item->>'sort_order')::integer,
            v_item->>'kind',(v_item->>'source_task_uuid_snapshot')::uuid,
            nullif(v_item->'task_snapshot','null'::jsonb),v_item->>'free_title',
            v_item->>'free_description',v_item->>'free_comments',
            v_item->>'free_url',(v_item->>'activity_minutes')::integer);
        end if;
      end loop;
    end loop;
    delete from public.planned_session_items it
      where it.session_id=p_session_id and it.id=any(p_removed_item_ids);
    delete from public.planned_session_slots sl
      where sl.session_id=p_session_id and sl.id=any(p_removed_slot_ids);
  end if;
  if v_s.planning_state='confirmed' and exists(
       select 1 from public.planned_session_slots sl
       where sl.session_id=p_session_id and not exists(
         select 1 from public.planned_session_items it where it.slot_id=sl.id)) then
    raise exception 'Franja confirmada sin actividad' using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_items it
      join public.planned_session_slots sl on sl.id=it.slot_id
      where it.session_id=p_session_id and it.activity_minutes>sl.duration_minutes) then
    raise exception 'Actividad supera franja' using errcode='23514';
  end if;
  v_after:=public.planned_session_state(p_session_id);
  if v_after is distinct from v_desired then
    raise exception 'El estado guardado difiere de la solicitud' using errcode='23514';
  end if;
  if v_before->'session_date' is distinct from v_after->'session_date' then
    v_sections:=array_append(v_sections,'date'); end if;
  if v_before->'session_number' is distinct from v_after->'session_number' then
    v_sections:=array_append(v_sections,'number'); end if;
  if v_before->'slots' is distinct from v_after->'slots' then
    v_sections:=array_append(v_sections,'slots'); end if;
  if (v_before - 'session_date' - 'session_number' - 'slots') is distinct from
     (v_after - 'session_date' - 'session_number' - 'slots') then
    v_sections:=array_append(v_sections,'header'); end if;
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash)
  values (p_session_id,v_revision,v_actor,
    case when v_number is distinct from v_s.session_number then 'renumbered'
      when v_s.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
    v_sections,md5(v_before::text),md5(v_after::text));
  return v_revision;
end $fn$;

-- La capacidad se anuncia únicamente tras instalar ambas funciones.
create or replace function public.planned_task_series_ready_v1()
returns boolean language sql stable security invoker set search_path=pg_catalog
as $ready$ select true $ready$;
alter function public.planned_task_series_ready_v1() owner to postgres;
revoke all on function public.planned_task_series_ready_v1() from public,anon,authenticated,service_role;
grant execute on function public.planned_task_series_ready_v1() to authenticated;

do $post$
begin
  if (select md5(pg_catalog.regexp_replace(prosrc,'[[:space:]]+','','g'))
      from pg_catalog.pg_proc where oid=to_regprocedure('public.planned_library_snapshot(uuid)')::oid)
       is distinct from 'dc709201ad400bca07da23e6a3ee33dc' or
     (select md5(pg_catalog.regexp_replace(prosrc,'[[:space:]]+','','g'))
      from pg_catalog.pg_proc where oid=to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid)
       is distinct from '42ca2b394d5545da2789c9b687f99ed8' or
     not pg_catalog.has_function_privilege('authenticated','public.planned_task_series_ready_v1()','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.planned_task_series_ready_v1()','EXECUTE') or
     not exists(select 1 from pg_catalog.pg_proc p
       where p.oid=to_regprocedure('public.planned_task_series_ready_v1()')::oid
         and not p.prosecdef and p.provolatile='s'
         and p.proowner='postgres'::regrole
         and p.proconfig @> array['search_path=pg_catalog']
         and pg_catalog.regexp_replace(p.prosrc,'[[:space:]]+','','g')='selecttrue') then
    raise exception 'Postflight de series fallido';
  end if;
end $post$;
commit;
