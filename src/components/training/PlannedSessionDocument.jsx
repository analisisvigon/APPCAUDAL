import { useEffect, useRef, useState } from 'react';
import {
  getPlannedDuration, getPlannedLibrarySource, getPlannedLibraryValue, PLANNED_PHASES,
} from '../../utils/plannedSessions';
import { planPlannedSessionSheets } from '../../utils/plannedSessionSheetPages';
import { getPlannedSessionBoardTeams } from '../../utils/plannedSessionBoardTeams';
import { readTrainingTaskEditorPayload } from '../../utils/trainingTaskEditorPayload';
import TrainingTaskBoardPreview from './TrainingTaskBoardPreview';
import TrainingTaskBoardEditor from './TrainingTaskBoardEditor';
import './plannedSessionDocument.css';

const PhaseName = ({ phase }) => PLANNED_PHASES.find((entry) => entry.key === phase)?.label || phase;
const CAUDAL_TEAM_ID = '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
const A4_LANDSCAPE_WIDTH_PX = 297 * 96 / 25.4;

function SheetField({ label, value, onChange, disabled, issue, type = 'text', multiline = false,
  printMirror = false, className = '' }) {
  return <label className={`planned-sheet-field ${printMirror ? 'planned-sheet-field-print-mirror' : ''} ${className}`}>
    <span>{label}</span>
    {multiline ? <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled}
      aria-invalid={Boolean(issue)} /> : <input type={type} value={value ?? ''}
      onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-invalid={Boolean(issue)} />}
    {printMirror ? <span className="planned-sheet-print-text" aria-hidden="true">{value ?? ''}</span> : null}
    {issue ? <small role="alert">{issue}</small> : null}
  </label>;
}

function PendingArea({ label, children, className = '' }) {
  return <div className={`planned-sheet-pending ${className}`} aria-label={`${label}: área reservada`}>
    <b>{label}</b>{children}
  </div>;
}

function PitchOutline() {
  return <div className="planned-sheet-pitch" aria-hidden="true">
    <i className="planned-sheet-pitch-midline" /><i className="planned-sheet-pitch-circle" />
    <i className="planned-sheet-pitch-box planned-sheet-pitch-box-top" />
    <i className="planned-sheet-pitch-box planned-sheet-pitch-box-bottom" />
  </div>;
}

function SheetIdentity({ selected, page }) {
  return <header className="planned-sheet-identity">
    {selected.team_id === CAUDAL_TEAM_ID
      ? <img src="/pwa-512x512.png" alt="Escudo del C.D. Caudal" />
      : <div className="planned-sheet-team-crest-pending" aria-label="Espacio reservado para el escudo del equipo"><span className="planned-sheet-reserved-hint">Escudo pendiente</span></div>}
    <div><strong>{selected.team_name}</strong><span>{selected.label} · Hoja {page}</span></div>
    <div className="planned-sheet-federation" aria-label="Espacio reservado para el escudo de competición"><span className="planned-sheet-reserved-hint">Escudo de competición</span></div>
  </header>;
}

function LibraryTaskPicker({ task, slotId, tasks, loading, error, disabled, onSelect, onFree }) {
  const [query, setQuery] = useState('');
  const [taskType, setTaskType] = useState('');
  const types = [...new Set(tasks.map((row) => row.task_type).filter(Boolean))].sort();
  const matched = tasks.filter((row) =>
    (!taskType || row.task_type === taskType) &&
    row.name?.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  return <div className="planned-sheet-library-picker">
    <span>{task.kind === 'library_task' ? 'Copia de Biblioteca' : 'Actividad libre'}</span>
    {!disabled ? <details>
      <summary>{task.kind === 'library_task' ? 'Cambiar tarea de Biblioteca' : 'Añadir tarea desde Biblioteca'}</summary>
      <div className="planned-sheet-library-panel">
        <label>Buscar por nombre <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {types.length > 1 ? <label>Tipo deportivo <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
          <option value="">Todos</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select></label> : null}
        {loading ? <p>Cargando tareas autorizadas…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && !error && !matched.length ? <p>No hay tareas visibles para este filtro y club.</p> : null}
        <div className="planned-sheet-library-results">
          {matched.slice(0, 30).map((row) => <button type="button" key={row.id}
            onClick={(event) => { onSelect(slotId, task.id, row.id); event.currentTarget.closest('details').open = false; }}>
            <strong>{row.name}</strong><small>{[row.task_type, row.game_phase, row.duration_minutes && `${row.duration_minutes} min`].filter(Boolean).join(' · ')}</small>
          </button>)}
        </div>
        {matched.length > 30 ? <p>Mostrando 30 de {matched.length}; acota la búsqueda.</p> : null}
      </div>
    </details> : null}
    {!disabled && task.kind === 'library_task' ? <button type="button" onClick={() => onFree(slotId, task.id)}>Crear actividad libre</button> : null}
  </div>;
}

function ExerciseBlock({ slot, number, phase, canEdit, busy, issue, updateSlot, updateTask,
  moveSlot, phaseIndex, phaseCount, changePhase, removeSlot, addTask, removeTask,
  swapTasks, moveTaskToSlot, targets, fieldIssue, libraryTasks, libraryLoading,
  libraryError, selectLibraryTask, switchToFreeTask, openBoard }) {
  if (!slot) return <div className="planned-sheet-exercise planned-sheet-exercise-empty">
    <h3><PhaseName phase={phase} /></h3><p className="planned-sheet-reserved-hint">Sin ejercicio planificado en esta fase.</p>
  </div>;
  const dual = slot.items.length === 2;
  return <section className={`planned-sheet-exercise ${dual ? 'planned-sheet-exercise-dual' : ''} ${issue ? 'planned-sheet-exercise-error' : ''}`}
    data-planned-slot-id={slot.id}>
    <div className="planned-sheet-exercise-heading">
      <strong>{phase === 'main' ? `Tarea ${number}` : <PhaseName phase={phase} />}</strong>
      <span>Ejercicio {number}{dual ? ' · Tareas A y B simultáneas' : ''}</span>
    </div>
    <div className={`planned-sheet-task-columns ${dual ? 'planned-sheet-task-columns-dual' : ''}`}>
      {slot.items.map((task, index) => {
        const boardPayload = task.kind === 'library_task'
          ? getPlannedLibraryValue(task, 'editor_payload') || {} : {};
        const boardKind = readTrainingTaskEditorPayload(boardPayload).kind;
        const boardTeams = task.kind === 'library_task' ? getPlannedSessionBoardTeams(boardPayload) : [];
        const secondary = [
          ['objective', 'Objetivo'], ['technical_content', 'Contenido técnico'],
          ['tactical_content', 'Contenido táctico'], ['observations', 'Observaciones de la tarea'],
        ];
        const hasSecondary = secondary.some(([field]) => String(getPlannedLibraryValue(task, field) ?? '').trim());
        return <div className={`planned-sheet-task ${task.kind === 'library_task' ? 'planned-sheet-library-task' : ''}`} key={task.id}>
        <div className="planned-sheet-task-head">Tarea {String.fromCharCode(65 + index)}{index === 0 ? ' · principal' : ' · simultánea'}</div>
        <LibraryTaskPicker task={task} slotId={slot.id} tasks={libraryTasks} loading={libraryLoading}
          error={libraryError} disabled={!canEdit || busy} onSelect={selectLibraryTask} onFree={switchToFreeTask} />
        {task.kind === 'library_task' ? <>
          {!task.snapshot ? <p className="planned-sheet-copy-note">Vista previa. Guarda para crear el snapshot en el servidor; después podrás editar la copia.</p> : null}
          <SheetField label="Nombre" value={getPlannedLibraryValue(task, 'name')} disabled={!canEdit || busy || !task.snapshot}
            issue={fieldIssue('name', slot.id, task.id)}
            onChange={(value) => updateTask(slot.id, task.id, 'name', value)} />
          <div className="planned-sheet-task-body">
            <div className="planned-sheet-explanation"><b>EXPLICACIÓN</b>
              <SheetField label="DESARROLLO" value={getPlannedLibraryValue(task, 'description')} multiline printMirror
                disabled={!canEdit || busy || !task.snapshot}
                onChange={(value) => updateTask(slot.id, task.id, 'description', value)} />
              {(canEdit && task.snapshot) || String(getPlannedLibraryValue(task, 'material') ?? '').trim()
                ? <SheetField label="Material" value={getPlannedLibraryValue(task, 'material')} multiline printMirror
                  disabled={!canEdit || busy || !task.snapshot}
                  onChange={(value) => updateTask(slot.id, task.id, 'material', value)} /> : null}
              {(canEdit && task.snapshot) || hasSecondary ? <details className="planned-sheet-task-details">
                <summary>Más detalles{hasSecondary ? ' · con contenido' : ''}</summary>
                {secondary.map(([field, label]) => (canEdit && task.snapshot) ||
                    String(getPlannedLibraryValue(task, field) ?? '').trim()
                  ? <SheetField key={field} label={label} value={getPlannedLibraryValue(task, field)} multiline
                    disabled={!canEdit || busy || !task.snapshot}
                    onChange={(value) => updateTask(slot.id, task.id, field, value)} /> : null)}
              </details> : null}
            </div>
            <div className="planned-sheet-representation"><b>REPRESENTACIÓN GRÁFICA</b>
              <div className="planned-sheet-board-visual"><TrainingTaskBoardPreview payload={boardPayload} /></div>
              {boardTeams.length ? <div className="planned-sheet-team-lists" aria-label="Equipos y jugadores asignados en la pizarra">
                {boardTeams.map((team) => <div className="planned-sheet-team-line" key={team.key}
                  style={{ borderLeftColor: team.colorValue || '#333' }}>
                  <strong>{team.colorName.toLocaleUpperCase('es')}</strong>
                  <span className="planned-sheet-team-name"> · {team.teamName}:</span>
                  <span> {team.players.join(', ')}</span>
                </div>)}
              </div> : null}
              {task.snapshot && canEdit && !busy && ['empty', 'v1'].includes(boardKind)
                ? <button type="button" className="planned-sheet-board-edit" onClick={() => openBoard(task.id)}>Editar pizarra de la copia</button> : null}
              {['unsupported', 'invalid'].includes(boardKind)
                ? <small>Formato de pizarra no compatible: solo lectura.</small> : null}
            </div>
          </div>
          <div className="planned-sheet-task-foot">
            <SheetField label="Tiempo propio · min (opcional)" type="number" value={task.minutes}
              disabled={!canEdit || busy} issue={fieldIssue('minutes', slot.id, task.id)}
              onChange={(value) => updateTask(slot.id, task.id, 'minutes', value)} />
            <div className="planned-sheet-copy-space">Espacio · {getPlannedLibrarySource(task).space_width_m ?? '—'} × {getPlannedLibrarySource(task).space_length_m ?? '—'} m</div>
          </div>
        </> : <>
        <SheetField label="Nombre" value={task.title} disabled={!canEdit || busy}
          issue={fieldIssue('title', slot.id, task.id)} onChange={(value) => updateTask(slot.id, task.id, 'title', value)} />
        <div className="planned-sheet-task-body">
          <div className="planned-sheet-explanation">
            <b>EXPLICACIÓN</b>
            <SheetField label="DESARROLLO" value={task.description} multiline disabled={!canEdit || busy}
              issue={fieldIssue('description', slot.id, task.id)} onChange={(value) => updateTask(slot.id, task.id, 'description', value)} />
            <SheetField label="Comentarios" value={task.comments} multiline disabled={!canEdit || busy}
              issue={fieldIssue('comments', slot.id, task.id)} onChange={(value) => updateTask(slot.id, task.id, 'comments', value)} />
          </div>
          <div className="planned-sheet-representation">
            <b>REPRESENTACIÓN GRÁFICA</b>
            <PendingArea label="Pizarra de tarea" />
          </div>
        </div>
        <div className="planned-sheet-task-foot">
          <SheetField label="Tiempo propio · min (opcional)" type="number" value={task.minutes}
            disabled={!canEdit || busy} issue={fieldIssue('minutes', slot.id, task.id)}
            onChange={(value) => updateTask(slot.id, task.id, 'minutes', value)} />
          <SheetField label="Enlace HTTPS" type="url" value={task.url} disabled={!canEdit || busy}
            issue={fieldIssue('url', slot.id, task.id)} onChange={(value) => updateTask(slot.id, task.id, 'url', value)} />
        </div>
        </>}
        {canEdit && slot.items.length > 1 ? <div className="planned-sheet-task-tools">
          {index > 0 ? <button type="button" disabled={busy} onClick={() => swapTasks(slot.id, task.id, -1)}>Pasar a Tarea A</button> : null}
          {index > 0 ? <button type="button" disabled={busy} onClick={() => removeTask(slot.id, task.id)}>Retirar segunda tarea</button> : null}
          {targets.length ? <label>Mover tarea a ejercicio
            <select value={slot.id} disabled={busy} onChange={(event) => moveTaskToSlot(slot.id, task.id, event.target.value)}>
              <option value={slot.id}>Ejercicio {number}</option>
              {targets.map((target) => <option value={target.id} key={target.id}>Ejercicio {target.number}</option>)}
            </select>
          </label> : null}
        </div> : null}
      </div>;
      })}
      {!slot.items.length ? <p className="planned-sheet-empty-task planned-sheet-reserved-hint">Tarea A pendiente · añade una tarea para poder guardar.</p> : null}
    </div>
    <div className="planned-sheet-exercise-foot">
      <SheetField label="Tº total · min" type="number" value={slot.duration} disabled={!canEdit || busy}
        issue={fieldIssue('duration', slot.id)} onChange={(value) => updateSlot(slot.id, (current) => ({ ...current, duration: value }))} />
      <PendingArea label="Espacio de trabajo" className="planned-sheet-space-pending" />
    </div>
    {fieldIssue('items', slot.id) ? <p className="planned-sheet-inline-error">{fieldIssue('items', slot.id)}</p> : null}
    {canEdit ? <div className="planned-sheet-tools" aria-label={`Edición del ejercicio ${number}`}>
      <button type="button" disabled={busy || phaseIndex === 0} onClick={() => moveSlot(slot.id, -1)}>↑ Subir ejercicio</button>
      <button type="button" disabled={busy || phaseIndex === phaseCount - 1} onClick={() => moveSlot(slot.id, 1)}>↓ Bajar ejercicio</button>
      <label>Cambiar de fase <select value={slot.phase} disabled={busy} onChange={(event) => changePhase(slot.id, event.target.value)}>
        {PLANNED_PHASES.map((entry) => <option value={entry.key} key={entry.key}>{entry.label}</option>)}
      </select></label>
      {slot.items.length < 2 ? <button type="button" disabled={busy} onClick={() => addTask(slot.id)}>
        {slot.items.length ? '+ Añadir segunda tarea' : '+ Añadir Tarea A'}</button> : null}
      <button type="button" disabled={busy} onClick={() => removeSlot(slot.id, number)}>Retirar ejercicio</button>
    </div> : null}
  </section>;
}

export default function PlannedSessionDocument({ editor, selected, canEdit, busy, fieldIssue,
  updateEditor, updateSlot, updateTask, moveSlot, moveItem, moveItemToSlot,
  addExercise, addTask, removeTask, removeSlot, changePhase, libraryTasks, libraryLoading,
  libraryError, selectLibraryTask, switchToFreeTask }) {
  const [zoom, setZoom] = useState(100);
  const [fitZoom, setFitZoom] = useState(100);
  const viewportRef = useRef(null);
  const [boardTaskId, setBoardTaskId] = useState(null);
  useEffect(() => { setBoardTaskId(null); }, [editor.id, editor.revision]);
  useEffect(() => {
    if (zoom !== 'fit' || !viewportRef.current) return undefined;
    const viewport = viewportRef.current;
    const updateFitZoom = () => setFitZoom(Math.min(100,
      Math.max(25, Math.floor((viewport.clientWidth - 16) / A4_LANDSCAPE_WIDTH_PX * 100))));
    updateFitZoom();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateFitZoom);
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateFitZoom);
    return () => window.removeEventListener('resize', updateFitZoom);
  }, [zoom]);
  const sheets = planPlannedSessionSheets(editor.slots);
  const ordered = PLANNED_PHASES.flatMap((phase) => editor.slots.filter((slot) => slot.phase === phase.key));
  const numberOf = (id) => ordered.findIndex((slot) => slot.id === id) + 1;
  const field = (label, value, onChange, issue, options = {}) =>
    <SheetField label={label} value={value} onChange={onChange} issue={issue}
      disabled={!canEdit || busy} {...options} />;
  const renderExercise = (slot, phase) => {
    const siblings = ordered.filter((entry) => entry.phase === phase);
    return <ExerciseBlock key={slot?.id || `empty-${phase}`} slot={slot} phase={phase}
      number={slot ? numberOf(slot.id) : 0} canEdit={canEdit} busy={busy}
      issue={slot && ['duration', 'items', 'title', 'name', 'description', 'comments', 'url', 'minutes', 'library']
        .some((key) => fieldIssue(key, slot.id) || slot.items.some((item) => fieldIssue(key, slot.id, item.id)))}
      updateSlot={updateSlot} updateTask={updateTask} moveSlot={moveSlot}
      phaseIndex={slot ? siblings.findIndex((entry) => entry.id === slot.id) : 0} phaseCount={siblings.length}
      changePhase={changePhase} removeSlot={removeSlot} addTask={addTask} removeTask={removeTask}
      swapTasks={moveItem} moveTaskToSlot={moveItemToSlot}
      targets={slot ? ordered.filter((entry) => entry.id !== slot.id && entry.items.length < 2)
        .map((entry) => ({ id: entry.id, number: numberOf(entry.id) })) : []}
      fieldIssue={fieldIssue} libraryTasks={libraryTasks} libraryLoading={libraryLoading}
      libraryError={libraryError} selectLibraryTask={selectLibraryTask}
      switchToFreeTask={switchToFreeTask} openBoard={setBoardTaskId} />;
  };

  const boardLocation = editor.slots.flatMap((slot) => slot.items.map((item) => ({ slotId: slot.id, item })))
    .find(({ item }) => item.id === boardTaskId);

  return <div className="planned-document" data-planned-session-document>
    <div className="planned-document-toolbar" aria-label="Vista de hojas">
      <span>Plantilla de sesión · A4 horizontal · {sheets.length} {sheets.length === 1 ? 'hoja' : 'hojas'}</span>
      <label>Vista <select value={zoom} onChange={(event) => setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}>
        <option value="fit">Ajustar a pantalla</option>
        <option value={75}>75 %</option><option value={100}>100 %</option><option value={125}>125 %</option>
      </select></label>
      <span>Desliza horizontalmente en móvil para recorrer la hoja.</span>
    </div>
    <div className="planned-document-viewport" ref={viewportRef}>
      <div className="planned-document-pages" style={{ zoom: `${zoom === 'fit' ? fitZoom : zoom}%` }}>
        {sheets.map((sheet, index) => <article className="planned-session-sheet" key={`${sheet.kind}-${index}`}
          data-planned-sheet={sheet.kind}>
          <SheetIdentity selected={selected} page={index + 1} />
          {sheet.kind === 'cover' ? <>
            <div className="planned-sheet-cover-meta">
              {field('Día', editor.session_date, (value) => updateEditor((current) => ({ ...current, session_date: value })), fieldIssue('session_date'), { type: 'date' })}
              {field('Hora', editor.header.starts_at, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, starts_at: value } })), fieldIssue('starts_at'), { type: 'time' })}
              {field('Lugar', editor.header.location, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, location: value } })), fieldIssue('location'))}
              <PendingArea label="Nº jugadores" />
              {field('Periodo', editor.header.period_label, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, period_label: value } })), fieldIssue('period_label'))}
              {field('Morf. patrón', editor.header.morphology_pattern, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, morphology_pattern: value } })), fieldIssue('morphology_pattern'))}
              {field('Rival', editor.header.next_opponent_label, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, next_opponent_label: value } })), fieldIssue('next_opponent_label'))}
              <PendingArea label="Lesionados" />
            </div>
            <div className="planned-sheet-cover-objectives">
              <div className="planned-sheet-side-metrics">
                <span>Nº sesión <b>{editor.session_number ?? '—'}</b></span>
                <span>Tº sesión <b>{getPlannedDuration(editor.slots)} min</b></span>
              </div>
              <div className="planned-sheet-cover-notes">
                {field('Observaciones', editor.header.notes, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, notes: value } })), fieldIssue('notes'), { multiline: true })}
                {field('Objetivos', editor.header.objectives, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, objectives: value } })), fieldIssue('objectives'), { multiline: true })}
                {field('Material', editor.header.material, (value) => updateEditor((current) => ({ ...current, header: { ...current.header, material: value } })), fieldIssue('material'), { multiline: true })}
                {field('Observaciones del cuerpo técnico', editor.header.staff_observations,
                  (value) => updateEditor((current) => ({ ...current, header: { ...current.header, staff_observations: value } })),
                  fieldIssue('staff_observations'), { multiline: true })}
              </div>
              <div className="planned-sheet-side-metrics"><PendingArea label="Valor (0–10)" /><PendingArea label="UA Tom Scale" /></div>
            </div>
            <div className="planned-sheet-roster">
              {['Porteros', 'Defensas', 'Centrocampistas', 'Delanteros'].map((position) =>
                <PendingArea key={position} label={position} />)}
            </div>
            <div className="planned-sheet-cover-lower">
              <PendingArea label="Distribución jugadores disponibles sesión"><PitchOutline /></PendingArea>
              <PendingArea label="Distribución del espacio"><PitchOutline /></PendingArea>
              <div className="planned-sheet-cover-activation">
                {renderExercise(sheet.activation[0], 'activation')}
                {canEdit ? <button type="button" className="planned-sheet-add" disabled={busy}
                  onClick={() => addExercise('activation')}>+ Añadir ejercicio de activación</button> : null}
              </div>
            </div>
          </> : <>
            <div className="planned-sheet-section-title">
              {sheet.kind === 'main' ? 'PARTE PRINCIPAL' : sheet.kind === 'cooldown' ? 'VUELTA A LA CALMA' : 'ACTIVACIÓN · CONTINUACIÓN'}
            </div>
            <div className="planned-sheet-quadrants">
              {(sheet.slots || []).map((slot) => <div key={slot.id} className={slot.items.length > 1 ? 'planned-sheet-quadrant-wide' : ''}>
                {renderExercise(slot, slot.phase)}
              </div>)}
              {(sheet.cooldown || []).map((slot) => <div key={slot.id} className={slot.items.length > 1 ? 'planned-sheet-quadrant-wide' : ''}>
                {renderExercise(slot, 'cooldown')}
              </div>)}
              {sheet.kind === 'main' && !sheet.cooldown?.length && sheet.slots.length < 4 ?
                <div className="planned-sheet-cooldown-placeholder"><span className="planned-sheet-reserved-hint">VUELTA A LA CALMA · sin ejercicio planificado</span></div> : null}
            </div>
            <PendingArea label="Datos POST y valoración final" className="planned-sheet-post-pending" />
            {canEdit ? <div className="planned-sheet-page-tools">
              <button type="button" disabled={busy} onClick={() => addExercise(sheet.kind === 'activation' ? 'activation' : sheet.kind === 'cooldown' ? 'cooldown' : 'main')}>
                + Añadir ejercicio {sheet.kind === 'main' ? 'principal' : sheet.kind === 'cooldown' ? 'de vuelta a la calma' : 'de activación'}
              </button>
              {sheet.kind === 'main' ? <button type="button" disabled={busy} onClick={() => addExercise('cooldown')}>+ Añadir vuelta a la calma</button> : null}
            </div> : null}
          </>}
        </article>)}
      </div>
    </div>
    <p className="planned-document-note">Vista editorial de 03B. La exportación PDF definitiva y las zonas marcadas como pendientes no están activadas.</p>
    {boardLocation?.item.kind === 'library_task' ? <div className="planned-board-dialog-backdrop">
      <div className="planned-board-dialog" role="dialog" aria-modal="true" aria-label="Editar pizarra de la copia">
        <div className="planned-board-dialog-head"><strong>Pizarra de la copia de Sesiones</strong>
          <button type="button" onClick={() => setBoardTaskId(null)}>Cerrar pizarra</button></div>
        <TrainingTaskBoardEditor key={boardLocation.item.id} players={[]}
          payload={getPlannedLibraryValue(boardLocation.item, 'editor_payload') || {}}
          readOnly={!canEdit || busy || !boardLocation.item.snapshot}
          onPayloadChange={(payload) => updateTask(boardLocation.slotId, boardLocation.item.id, 'editor_payload', payload)} />
      </div>
    </div> : null}
  </div>;
}
