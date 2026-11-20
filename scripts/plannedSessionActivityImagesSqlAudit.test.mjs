import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase_sessions_free_activity_images_v1.sql', import.meta.url), 'utf8');
const verify = await readFile(new URL('../supabase_sessions_free_activity_images_v1_verify.sql', import.meta.url), 'utf8');
for (const fragment of [
  "planned-session-activity-images", 'planned_session_activity_images_item_fk',
  "v_item.kind is distinct from 'free'", 'can_write_club_team_season',
  'can_read_club_team_season', 'on delete cascade', 'planned_session_delete_contract_v1',
  'planned_session_activity_image_cleanup',
  'list_planned_session_activity_cleanup_v1', 'confirm_planned_session_activity_cleanup_v1',
  'planned_session_activity_storage_update', 'planned_session_activity_images_item_order_key',
  'public.planned_session_delete_contract_v1() is not true',
  "mime_type in ('image/jpeg','image/png','image/webp')", 'size_bytes between 1 and 10485760',
]) assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()), `falta contrato SQL: ${fragment}`);
assert.ok(!/disable\s+row\s+level\s+security/i.test(sql));
assert.ok(!/update\s+public\.planned_session_items|update\s+public\.training_tasks/i.test(sql));
assert.match(sql, /count\(\*\)[\s\S]*?>=7/);
assert.match(sql, /tg_op='INSERT' and new\.uploader_user_id is distinct from auth\.uid\(\)/);
assert.ok(/solo lectura/i.test(verify));
console.log('planned session activity images SQL audit passed');
