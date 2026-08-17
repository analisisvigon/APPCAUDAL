import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const calendarStart = app.indexOf('Calendario general');
const calendarEnd = app.indexOf(') : selectedMatch ? (', calendarStart);
const calendar = app.slice(calendarStart, calendarEnd);

assert.ok(calendarStart >= 0 && calendarEnd > calendarStart, 'localiza el calendario general');
assert.match(calendar, /className="grid items-start gap-4 xl:grid-cols-2"/, 'el grid no estira las tarjetas a la altura de la fila');
assert.match(calendar, /className={`relative self-start overflow-hidden/, 'cada tarjeta conserva su altura intrínseca');
assert.match(calendar, /played \? 'max-w-\[620px\]' : 'max-w-\[540px\]'/, 'el partido programado acerca los equipos al centro sin reducir escudos');
assert.match(calendar, /statusPresentation\.status === 'scheduled'[\s\S]*?rounded-full[\s\S]*?text-2xl/, 'VS tiene una composición compacta propia');
assert.match(calendar, />\s*Finalizado\s*</, 'el partido con marcador muestra el estado FINALIZADO');
assert.match(calendar, /formatMatchCalendarRound\(match\.round\)/, 'la jornada/ronda se presenta con etiqueta comprensible');
assert.match(calendar, /getMatchMdLabel\(\)[\s\S]*?rounded-full|rounded-full[\s\S]*?getMatchMdLabel\(\)/, 'MD se presenta como badge secundario');
assert.match(calendar, /match-card-\$\{match\.id\}/, 'cada tarjeta dispone de menú contextual propio');
assert.match(calendar, /<FloatingActionMenu[\s\S]*?>[\s\S]*?>Editar<[\s\S]*?>Eliminar</, 'el menú contextual conserva editar y eliminar');
assert.match(app, /createPortal\([\s\S]*?document\.body/, 'el menú se porta al body y no queda recortado por overflow');
assert.match(calendar, /max-h-72 overflow-y-auto overscroll-contain/, 'un timeline largo queda limitado verticalmente');
assert.match(calendar, /timelineExpanded \? 'Ver menos'/, 'el timeline puede expandirse y volver a contraerse');
assert.match(calendar, /\['PRE', 'ESTADÍSTICAS', 'POST', 'IMPRESIÓN'\]/, 'la navegación inferior permanece intacta');
assert.match(calendar, /grid-cols-\[54px_28px_minmax\(0,1fr\)\]/, 'el timeline mantiene ancho seguro en móvil');
assert.equal(calendar.includes('overflow-x-auto'), false, 'las tarjetas no introducen scroll horizontal');

console.log('match calendar cards UI audit passed');
