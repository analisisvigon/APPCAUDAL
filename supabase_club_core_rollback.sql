-- APPCAUDAL · Reversion operativa de Etapa A.
-- Conserva clubs, memberships y permisos; no elimina datos.
-- Como el frontend aun no depende del nucleo, revocar el acceso API lo desactiva.

begin;

revoke all on table public.clubs from authenticated, anon;
revoke all on table public.club_memberships from authenticated, anon;
revoke all on table public.club_member_permissions from authenticated, anon;

revoke all on function public.is_club_member(uuid) from authenticated, anon;
revoke all on function public.has_club_role(uuid, text[]) from authenticated, anon;
revoke all on function public.can_edit_club_data(uuid) from authenticated, anon;
revoke all on function public.can_manage_club(uuid) from authenticated, anon;
revoke all on function public.has_club_permission(uuid, text) from authenticated, anon;

comment on table public.clubs is
'Etapa A desactivada operativamente: datos conservados, acceso API revocado.';

commit;
