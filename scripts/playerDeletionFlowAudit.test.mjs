import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const deletionStore = readFileSync(new URL('../src/data/ownPlayerDeletion.js', import.meta.url), 'utf8');
const migrationSql = readFileSync(new URL('../supabase_almadina_player_deletion_history_guard_MANUAL.sql', import.meta.url), 'utf8');
const verifySql = readFileSync(new URL('../supabase_almadina_player_deletion_history_guard_verify.sql', import.meta.url), 'utf8');

// 1. Menu de tres puntos contiene la opcion "Eliminar jugador" como accion destructiva
assert.match(
  app,
  /<button[^>]*onClick=\{[^}]*openDeletePlayerDialog\(player\)[^}]*\}[^>]*text-rose-300[^>]*>Eliminar jugador<\/button>/,
  'El menu flotante de tres puntos debe incluir la accion destructiva Eliminar jugador',
);

// 2. Ventana de confirmacion con el nombre del jugador y explicacion clara
assert.match(app, /deletePlayerDialog \?/, 'Debe renderizarse el modal de confirmacion para deletePlayerDialog');
assert.match(app, /displayPlayerName\(deletePlayerDialog\)/, 'El modal debe mostrar el nombre del jugador');
assert.match(app, /¿Qué ocurrirá con sus datos\?/, 'El modal debe incluir la seccion explicativa sobre sus datos');

// 3. Diferenciacion de las dos situaciones
assert.match(app, /Jugador con historial deportivo/, 'El modal debe identificar jugadores con historial deportivo');
assert.match(app, /Jugador sin historial deportivo/, 'El modal debe identificar jugadores sin historial');
assert.match(app, /Retirar de la plantilla/, 'Accion para jugadores con historial debe ser retirarlos de la plantilla');
assert.match(app, /Eliminar definitivamente/, 'Accion para jugadores sin historial debe ser eliminacion definitiva');
assert.match(app, /Se conservan todos sus partidos, alineaciones, actas y minutos jugados/, 'Debe explicar la conservacion deportiva');
assert.match(app, /eliminará definitivamente su ficha y registro/, 'Debe explicar la eliminacion limpia sin dependencias');

// 4. Respeto al sistema de clubes, equipos y temporadas
assert.match(migrationSql, /update public\.player_team_memberships set is_current = false/, 'Solo se cierra la etapa exacta');
assert.match(migrationSql, /update public\.club_team_season_players set has_departed = true/, 'Se marca baja en el CTS activo');
assert.match(migrationSql, /other_ctsp\.player_id = ficha\.global_player_id[\s\S]*?other_ctsp\.id <> ctsp_id/, 'Protege vinculaciones con otras temporadas o equipos');

// 5. Permisos y proteccion de temporadas cerradas
assert.match(app, /!rosterAccess\.canWrite/, 'La UI debe bloquear eliminacion sin permiso de escritura');
assert.match(migrationSql, /if season_status is not null and season_status <> 'open' then/, 'La RPC debe proteger temporadas cerradas');
assert.match(migrationSql, /raise exception 'SEASON_CLOSED'/, 'Debe lanzar excepcion SEASON_CLOSED');
assert.match(migrationSql, /if auth\.uid\(\) is null or public\.is_app_staff\(\) is not true then/, 'Debe validar membresia de staff');

// 6. Actualizacion automatica de plantilla y contadores sin recargar pagina
assert.match(
  app,
  /setPlayers\(\(current\) => current\.filter\(\(p\) => p\.id !== playerToDelete\.id\)\)/,
  'Debe actualizar localmente el estado de jugadores para recalcular contadores y plantilla sin recargar',
);

// 7. Mensajes claros y no ocultar al jugador si falla la operacion
assert.match(app, /setDeletePlayerError\(err\.message/, 'Debe guardar el mensaje de error');
assert.match(app, /setDeletePlayerNotice/, 'Debe mostrar mensaje de exito');
// setPlayers solo ocurre en el try antes de catch
const confirmBlock = app.slice(app.indexOf('const confirmDeletePlayer = async'), app.indexOf('const openStatsCallupPanel'));
assert.ok(
  confirmBlock.indexOf('setPlayers(') < confirmBlock.indexOf('catch (err)'),
  'El jugador no debe ocultarse si falla la llamada al servidor',
);

// 8. Integridad de la migracion SQL
assert.match(migrationSql, /public\.delete_own_player_atomic_v1\(p_jugador_id uuid\)/);
assert.match(migrationSql, /security definer/);
assert.match(migrationSql, /revoke all on function public\.delete_own_player_atomic_v1\(uuid\) from public, anon/);
assert.match(migrationSql, /grant execute on function public\.delete_own_player_atomic_v1\(uuid\) to authenticated/);
assert.match(migrationSql, /has_table_privilege\('authenticated','public\.jugadores','DELETE'\)/);
assert.match(verifySql, /to_regprocedure\('public\.delete_own_player_atomic_v1\(uuid\)'\)/);

// 9. Store de eliminacion
assert.match(deletionStore, /delete_own_player_atomic_v1/);
assert.match(deletionStore, /SEASON_CLOSED/);
assert.match(deletionStore, /getPlayerHistoricalSummary/);

console.log('playerDeletionFlowAudit: Todos los requisitos de eliminacion/retirada de plantilla validados con exito.');
