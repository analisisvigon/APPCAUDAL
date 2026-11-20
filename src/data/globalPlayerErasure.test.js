import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eraseGlobalPlayer } from './globalPlayerErasure.js';
const playerId='10000000-0000-4000-8000-000000000001';
const requestId='20000000-0000-4000-8000-000000000001';
let calls=0;
const client={rpc:async(name,args)=> {
  calls++;
  assert.equal(name,'erase_global_player_v1');
  assert.deepEqual(args,{p_player_id:playerId,p_request_id:requestId,p_confirmation:'ELIMINAR'});
  return {data:{status:'deleted',player_id:playerId,request_id:requestId}};
}};
for(const confirmation of ['', 'eliminar',' ELIMINAR','ELIMINAR ']) {
  await assert.rejects(eraseGlobalPlayer(client,{playerId,requestId,confirmation}));
}
assert.equal(calls,0);
await eraseGlobalPlayer(client,{playerId,requestId,confirmation:'ELIMINAR',hasHistory:true});
assert.equal(calls,1,'history is not a frontend refusal criterion');
for(const code of ['42501','PGRST202','40001']) {
  await assert.rejects(eraseGlobalPlayer({rpc:async()=>({error:{code}})}, {playerId,requestId,confirmation:'ELIMINAR'}));
}
await assert.rejects(eraseGlobalPlayer({rpc:async()=>({data:{status:'deleted',player_id:playerId,request_id:'other'}})},
  {playerId,requestId,confirmation:'ELIMINAR'}));
const ui=readFileSync('src/components/players/GlobalPlayerDatabase.jsx','utf8');
assert.match(ui,/deleteConfirmation !== 'ELIMINAR'/);
assert.match(ui,/deleteInFlight.current = true/);
assert.match(ui,/!canDelete \|\| !deleteAvailable/);
const sql=readFileSync('supabase_player_erasure_inventory_readonly.sql','utf8').replace(/--[^\n]*/g,'');
assert.doesNotMatch(sql,/\b(create|alter|drop|insert|update|delete|truncate|execute|call|do)\b/i);
assert.match(sql,/pg_get_functiondef/);
assert.match(sql,/planned_session_deletion_archive_v1/);
console.log('Erasure frontend contract and read-only inventory OK. No deletion SQL or database tested.');
