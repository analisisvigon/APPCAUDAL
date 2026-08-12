-- H6: snapshot transaccional del Plan de Partido de Impresión.
-- Migración local: no ejecutar remotamente sin revisión previa.

create or replace function public.save_match_print_plan_atomic(
  p_partido_id uuid,
  p_situations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_position bigint;
  v_id uuid;
  v_tipo text;
  v_temp_base bigint;
  v_result jsonb;
begin
  if p_partido_id is null then
    raise exception using errcode = '22023', message = 'El partido es obligatorio.';
  end if;

  if p_situations is null or jsonb_typeof(p_situations) <> 'array' then
    raise exception using errcode = '22023', message = 'p_situations debe ser un array JSON.';
  end if;

  -- Serializa incluso el caso de snapshot vacío, donde no existirían filas que bloquear.
  perform pg_advisory_xact_lock(hashtextextended(p_partido_id::text, 0));

  perform 1
  from public.partidos
  where id = p_partido_id
  for key share;
  if not found then
    raise exception using errcode = '23503', message = 'El partido indicado no existe o no es accesible.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_situations) with ordinality as input(item, position)
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'tipo', '') not in ('plan_partido_sin_balon', 'plan_partido_con_balon')
      or coalesce(item->>'orden', '') !~ '^[0-9]+$'
      or (item->>'orden')::bigint <> position
      or (item ? 'partido_id' and nullif(item->>'partido_id', '')::uuid is distinct from p_partido_id)
      or jsonb_typeof(coalesce(item->'elements', '[]'::jsonb)) <> 'array'
      or (item ? 'id' and nullif(item->>'id', '') is null)
      or (item ? 'id' and item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception using errcode = '22023', message = 'El snapshot contiene una situación inválida, una fase no admitida o un orden incoherente.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_situations) as input(item)
    where item ? 'id'
    group by item->>'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'El snapshot contiene IDs duplicados.';
  end if;

  perform 1
  from public.match_set_piece_diagrams
  where partido_id = p_partido_id
    and tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon')
  for update;

  if exists (
    select 1
    from jsonb_array_elements(p_situations) as input(item)
    join public.match_set_piece_diagrams as stored
      on stored.id = (input.item->>'id')::uuid
    where input.item ? 'id'
      and (
        stored.partido_id <> p_partido_id
        or stored.tipo not in ('plan_partido_sin_balon', 'plan_partido_con_balon')
      )
  ) then
    raise exception using errcode = '22023', message = 'El snapshot contiene un ID perteneciente a otro partido o a otro tipo de diagrama.';
  end if;

  select coalesce(max(orden), 0)::bigint + jsonb_array_length(p_situations) + 1000
  into v_temp_base
  from public.match_set_piece_diagrams
  where partido_id = p_partido_id
    and tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon');

  if v_temp_base + jsonb_array_length(p_situations) > 2147483647 then
    raise exception using errcode = '22003', message = 'No existe margen seguro para reordenar el snapshot.';
  end if;

  with current_plan as (
    select id, row_number() over (order by tipo, orden, id) as temporary_order
    from public.match_set_piece_diagrams
    where partido_id = p_partido_id
      and tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon')
  )
  update public.match_set_piece_diagrams as target
  set orden = (v_temp_base + current_plan.temporary_order)::integer
  from current_plan
  where target.id = current_plan.id;

  delete from public.match_set_piece_diagrams as stored
  where stored.partido_id = p_partido_id
    and stored.tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon')
    and not exists (
      select 1
      from jsonb_array_elements(p_situations) as input(item)
      where input.item ? 'id'
        and (input.item->>'id')::uuid = stored.id
    );

  for v_item, v_position in
    select item, position
    from jsonb_array_elements(p_situations) with ordinality as input(item, position)
    order by position
  loop
    v_id := (v_item->>'id')::uuid;
    v_tipo := v_item->>'tipo';

    update public.match_set_piece_diagrams
    set tipo = v_tipo,
        titulo = nullif(btrim(v_item->>'titulo'), ''),
        consigna = nullif(v_item->>'consigna', ''),
        orden = v_position::integer,
        elements = coalesce(v_item->'elements', '[]'::jsonb)
    where id = v_id
      and partido_id = p_partido_id
      and tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon');

    if not found then
      insert into public.match_set_piece_diagrams (
        id,
        partido_id,
        tipo,
        titulo,
        consigna,
        orden,
        elements
      ) values (
        v_id,
        p_partido_id,
        v_tipo,
        nullif(btrim(v_item->>'titulo'), ''),
        nullif(v_item->>'consigna', ''),
        v_position::integer,
        coalesce(v_item->'elements', '[]'::jsonb)
      );
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(stored) order by stored.orden, stored.id), '[]'::jsonb)
  into v_result
  from public.match_set_piece_diagrams as stored
  where stored.partido_id = p_partido_id
    and stored.tipo in ('plan_partido_sin_balon', 'plan_partido_con_balon');

  return v_result;
end;
$$;

comment on function public.save_match_print_plan_atomic(uuid, jsonb) is
  'Reemplaza atómicamente el snapshot completo del Plan de Partido de Impresión y conserva sus UUID.';

revoke all on function public.save_match_print_plan_atomic(uuid, jsonb) from public;
grant execute on function public.save_match_print_plan_atomic(uuid, jsonb) to authenticated;
