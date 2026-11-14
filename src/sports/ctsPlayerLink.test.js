import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkAndConfirmCtsPlayer } from './ctsPlayerLink.js';
import { SportsContextCoordinator, loadAuthorizedSportsContexts } from './authorizedContext.js';
import { loadCtsRoster } from './ctsSportsData.js';
const coordinator = new SportsContextCoordinator();
let linked=false, closed=false, allowed=true, failure=null, writes=0;
const client={rpc: async(name,args)=> {
  if(name==='my_access_contexts_v1') return {data:[{membership_id:'m',club_id:'club',role:'staff',is_active:true,
    contexts:[{club_team_season_id:'cts',club_id:'club',team_id:'team',season_id:'season',season_status:closed?'closed':'open',season_is_active:!closed}]}]};
  if(name==='can_write_club_team_season') return {data:allowed};
  if(name==='incorporate_global_player_cts_v1') {
    assert.deepEqual(args,{p_cts_id:'cts',p_player_id:'global'});
    writes++;
    if(failure) return {error:failure};
    const status=linked?'already_linked':'linked'; linked=true;
    return {data:{status,playerId:'global',ctsId:'cts',ownPlayerId:'ficha',membershipId:'stage'}};
  }
  if(name==='my_cts_jugadores_v1') return {data:linked?[{id:'ficha',global_player_id:'global',membership_id:'stage'}]:[]};
  if(name==='my_cts_roster_links_v1') return {data:linked?[{legacy_jugador_id:'ficha',player_id:'global',legacy_ficha_count:1,has_departed:false}]:[]};
  throw new Error(name);
}};
const context=(await loadAuthorizedSportsContexts(client))[0];
const token=coordinator.change(context), request={playerId:'global',teamId:'team'};
assert.equal((await linkAndConfirmCtsPlayer(client,coordinator,token,request)).length,1);
assert.equal((await linkAndConfirmCtsPlayer(client,coordinator,token,request)).length,1);
const reload=new SportsContextCoordinator();
assert.equal((await loadCtsRoster(client,reload,reload.change(context))).length,1);
await assert.rejects(linkAndConfirmCtsPlayer(client,coordinator,token,{...request,teamId:'other'}));
assert.equal(writes,2);
allowed=false; await assert.rejects(linkAndConfirmCtsPlayer(client,coordinator,token,request)); allowed=true;
closed=true; await assert.rejects(linkAndConfirmCtsPlayer(client,coordinator,token,request)); closed=false;
assert.equal(writes,2);
for(const error of [{code:'PGRST202'},{message:'CTS_PLAYER_DEPARTED'},{message:'CTS_LINK_REVIEW_REQUIRED'}]) {
  failure=error; await assert.rejects(linkAndConfirmCtsPlayer(client,coordinator,token,request));
}
const sql=readFileSync('supabase_cts_player_incorporation_v1.sql','utf8');
assert.doesNotMatch(sql,/\b(update|delete from) public\./i);
for(const table of ['jugadores','club_team_season_players','legacy_jugador_cts_links_v1','legacy_own_player_migration']) assert.ok(sql.includes(`insert into public.${table}`));
assert.ok(sql.includes('for update of s') && sql.includes('pg_advisory_xact_lock'));
assert.ok(sql.includes('CTS_PLAYER_DEPARTED'));
const app=readFileSync('src/App.jsx','utf8');
const flow=app.slice(app.indexOf('const linkExistingGlobalPlayerToTeam'),app.indexOf('const openPlayerTeamManager'));
assert.ok(flow.includes('linkAndConfirmCtsPlayer'));
assert.ok(!flow.includes('assignGlobalPlayerToTeam'));
console.log('CTS existing profile: linkage, reload, retry, permissions, closed season and static isolation OK. SQL not executed.');
