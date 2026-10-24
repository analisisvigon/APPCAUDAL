-- SOLO LECTURA / APPCAUDAL. Ejecutar manualmente ANTES y DESPUES de retirar
-- UNA ficha elegida. Sustituir REEMPLAZAR_UUID_DEL_JUGADOR por su UUID.
-- Con pagos: ficha existente e inactiva, sujetos inactivos y mismos recuentos
-- de multas/pagos que antes. Sin pagos: ficha ausente tras borrado fisico.
with target(id) as (
  values ('REEMPLAZAR_UUID_DEL_JUGADOR'::uuid)
)
select target.id as jugador_id,
       exists(select 1 from public.jugadores j where j.id = target.id)
         as ficha_existe,
       (select j.active_in_squad from public.jugadores j where j.id = target.id)
         as activo_en_plantilla,
       (select stage.is_current
        from public.jugadores j
        join public.player_team_memberships stage on stage.id = j.membership_id
        where j.id = target.id) as etapa_actual,
       (select count(*) from public.fine_subjects subject
        where subject.jugador_id = target.id) as sujetos_multas,
       (select count(*) from public.fine_subjects subject
        where subject.jugador_id = target.id and subject.active) as sujetos_activos,
       (select count(*) from public.fines fine
        join public.fine_subjects subject on subject.id = fine.subject_id
        where subject.jugador_id = target.id) as multas,
       (select count(*) from public.fine_payments payment
        join public.fines fine on fine.id = payment.fine_id
        join public.fine_subjects subject on subject.id = fine.subject_id
        where subject.jugador_id = target.id) as pagos
from target;
