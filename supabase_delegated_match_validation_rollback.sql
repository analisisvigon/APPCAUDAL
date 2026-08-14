-- Rollback de supabase_delegated_match_validation.sql.
-- No elimina ni modifica match_quick_events.

drop function if exists public.set_delegated_match_status(uuid, text);

alter table public.partidos
drop column if exists delegated_reviewed_at;
