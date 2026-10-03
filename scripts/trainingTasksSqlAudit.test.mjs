import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_training_tasks.sql', import.meta.url), 'utf8');
assert.match(sql, /create table if not exists public\.training_tasks/i);
assert.match(sql, /create table if not exists public\.training_task_shares/i);
assert.match(sql, /author_user_id uuid not null references auth\.users/i);
assert.match(sql, /alter table public\.training_tasks enable row level security/i);
assert.match(sql, /training_tasks_insert[\s\S]*author_user_id = auth\.uid\(\)/i);
assert.match(sql, /training_task_files/i);
assert.match(sql, /values[\s\S]*'training-task-files'[\s\S]*false/i);
assert.doesNotMatch(sql, /drop table/i);
console.log('training tasks SQL audit passed');
