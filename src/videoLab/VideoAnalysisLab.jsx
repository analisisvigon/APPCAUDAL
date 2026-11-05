import { useEffect, useMemo, useRef, useState } from 'react';
import {
  annotationVisible, clamp, containedVideoRect, createAnnotation,
  clipOutReached, createClip, formatTime, isMp4File, normalizedPoint,
  removeClipFromDraft, updateClip, validRange,
} from './model';
import {
  ANALYSIS_VERSION, findLocalAnalysisByFingerprint, fingerprintLocalFile, listLocalAnalyses,
  newLocalAnalysis, saveLocalAnalysis, snapshotLocalAnalysis,
} from './localAnalysisStore';
import {
  associateLocalAnalysis, canSeeLocalAnalysis, isAnalysisForMatch, preparePreMatches,
} from './matchAssociations';
import './videoLab.css';

const uid = () => crypto.randomUUID();
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const COLORS = ['#facc15', '#fb7185', '#38bdf8', '#4ade80', '#ffffff'];

function Drawing({ annotation, selected = false, onSelect }) {
  const { x1, y1, x2, y2 } = annotation.geometry;
  const props = {
    stroke: annotation.style.color,
    strokeWidth: annotation.style.width,
    vectorEffect: 'non-scaling-stroke',
    fill: 'none',
    className: selected ? 'drawing selected' : 'drawing',
    onPointerDown: onSelect,
  };
  if (annotation.type === 'ellipse') {
    return <ellipse {...props} cx={(x1 + x2) * 500} cy={(y1 + y2) * 500}
      rx={Math.abs(x2 - x1) * 500} ry={Math.abs(y2 - y1) * 500} />;
  }
  return <line {...props} x1={x1 * 1000} y1={y1 * 1000}
    x2={x2 * 1000} y2={y2 * 1000} markerEnd="url(#arrow-tip)" />;
}

export default function VideoAnalysisLab({ embedded = false, context = null, matches = [], userId = '' }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const fileSelectionModeRef = useRef('relink');
  const fileBusyRef = useRef(false);
  const transitionBusyRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const activeRangeRef = useRef(null);
  const drawingRef = useRef(null);
  const [source, setSource] = useState(null);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [draftTitle, setDraftTitle] = useState('');
  const [draft, setDraft] = useState(null);
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('loading');
  const [fingerprintProgress, setFingerprintProgress] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [clipDraft, setClipDraft] = useState(null);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [drawing, setDrawing] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [message, setMessage] = useState('');
  const [fileMismatch, setFileMismatch] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const preMatches = useMemo(() => preparePreMatches(matches, context), [matches, context]);
  const selectedMatch = preMatches.find((match) => match.id === selectedMatchId) || null;
  const scopedMode = embedded;
  const scopeWritable = !scopedMode || context?.seasonStatus === 'open';
  const analysis = draft?.analysis || null;
  const clips = draft?.clips || [];
  const sourceVerified = Boolean(source && analysis && source.id === analysis.id);
  const canView = sourceVerified && duration > 0 &&
    (!scopedMode || (selectedMatch && (!analysis.matchPreId || isAnalysisForMatch(analysis, selectedMatch.id, context))));
  const canEdit = canView && scopeWritable && !transitionBusyRef.current &&
    !['verifying', 'switching'].includes(saveStatus);
  const propertiesDirty = Boolean(selectedId && clipDraft && clips.some((clip) => clip.id === selectedId &&
    (clip.title !== clipDraft.title || clip.in !== Number(clipDraft.in) ||
      clip.out !== Number(clipDraft.out) || clip.observations !== clipDraft.observations)));
  const draftRef = useRef(null);
  draftRef.current = draft;
  const visibleRows = (rows) => scopedMode
    ? rows.filter((row) => canSeeLocalAnalysis(row, { userId, ownerRole: context?.role, context }))
    : rows;
  const displayedAnalyses = scopedMode
    ? savedAnalyses.filter((row) => selectedMatch && (isAnalysisForMatch(row, selectedMatch.id, context) || !row.matchPreId))
    : savedAnalyses;

  const queueSave = (record) => {
    const next = saveQueueRef.current.catch(() => {}).then(() => saveLocalAnalysis(record));
    saveQueueRef.current = next;
    return next;
  };
  const setClips = (update) => setDraft((current) => {
    if (!current || !sourceVerified || transitionBusyRef.current || fileBusyRef.current) return current;
    const nextClips = typeof update === 'function' ? update(current.clips) : update;
    return { ...current, clips: nextClips, revision: current.revision + 1 };
  });

  useEffect(() => {
    let active = true;
    const previous = draftRef.current;
    if (previous?.revision) void queueSave(snapshotLocalAnalysis(previous.analysis, previous.clips));
    setSource(null);
    setDraft(null);
    setSavedAnalyses([]);
    setSelectedMatchId('');
    setSelectedId(null);
    if (scopedMode && (!context?.id || !userId)) {
      setSaveStatus('error');
      setMessage('No se pudo verificar la identidad y el equipo-temporada.');
      return undefined;
    }
    listLocalAnalyses().then((rows) => {
      if (!active) return;
      const accessible = visibleRows(rows);
      setSavedAnalyses(accessible);
      if (!scopedMode && accessible.length) {
        setDraft({ analysis: accessible[0], clips: accessible[0].clips, revision: 0 });
      }
      setSaveStatus(!scopedMode && accessible.length ? 'saved' : 'idle');
      setLibraryReady(true);
    }).catch(() => {
      if (!active) return;
      setMessage('No se pudo abrir el almacenamiento local. No se iniciará un análisis sin guardado.');
      setSaveStatus('error');
    });
    return () => { active = false; };
  }, [scopedMode, context?.id, context?.role, context?.seasonStatus, userId]);

  useEffect(() => {
    if (!draft?.revision) return;
    const currentDraft = draft;
    setSaveStatus('saving');
    queueSave(snapshotLocalAnalysis(draft.analysis, draft.clips))
      .then(async () => {
        if (draftRef.current === currentDraft) setSaveStatus('saved');
        const rows = await listLocalAnalyses();
        setSavedAnalyses(visibleRows(rows));
      }).catch(() => {
        if (draftRef.current === currentDraft) {
          setSaveStatus('error');
          setMessage('Error al guardar en este navegador. Conserva la pestaña abierta y vuelve a intentarlo.');
        }
      });
  }, [draft]);

  useEffect(() => {
    if (!['saving', 'switching', 'error'].includes(saveStatus)) return undefined;
    const warnBeforeExit = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeExit);
    return () => window.removeEventListener('beforeunload', warnBeforeExit);
  }, [saveStatus]);

  useEffect(() => () => {
    const current = draftRef.current;
    if (current?.revision) {
      const record = snapshotLocalAnalysis(current.analysis, current.clips);
      saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveLocalAnalysis(record));
    }
  }, []);

  const selectedClip = useMemo(() => clips.find((item) => item.id === selectedId) || null,
    [clips, selectedId]);
  const imageRect = useMemo(() => containedVideoRect(
    stageSize.width, stageSize.height, videoSize.width, videoSize.height,
  ), [stageSize, videoSize]);
  const visibleAnnotations = selectedClip?.annotations.filter((item) =>
    annotationVisible(item, time)) || [];
  const selectedDrawing = selectedClip?.annotations.find((item) =>
    item.id === selectedDrawingId) || null;

  useEffect(() => () => {
    if (source?.url) URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setClipDraft(selectedClip ? {
      title: selectedClip.title, in: selectedClip.in, out: selectedClip.out,
      observations: selectedClip.observations,
    } : null);
    setSelectedDrawingId(null);
    setHistory({ past: [], future: [] });
  }, [selectedId]); // Clip edits are staged locally until the user applies them.

  const openFilePicker = (mode) => {
    fileSelectionModeRef.current = mode;
    fileRef.current?.click();
  };

  const pickFile = async (file, mode = 'relink') => {
    if (!file) return;
    if (!isMp4File(file)) {
      setMessage('Selecciona un archivo MP4 local. No se subirá a ningún servidor.');
      return;
    }
    if (!libraryReady || fileBusyRef.current || transitionBusyRef.current) return;
    if (scopedMode && !selectedMatch) {
      setMessage('Selecciona primero el partido PRE de este equipo y temporada.');
      return;
    }
    if (scopedMode && !scopeWritable && mode === 'switch') {
      setMessage('Temporada cerrada: puedes consultar vídeos asociados, pero no añadir otro análisis.');
      return;
    }
    if (mode === 'switch' && propertiesDirty &&
        !window.confirm('Hay cambios del corte sin aplicar. ¿Descartarlos y cambiar de vídeo?')) return;
    fileBusyRef.current = true;
    const previousStatus = saveStatus;
    setSaveStatus('verifying');
    setFingerprintProgress(0);
    let fingerprint;
    try {
      fingerprint = await fingerprintLocalFile(file, setFingerprintProgress);
      if (mode === 'relink' && analysis && fingerprint !== analysis.source.fingerprint) {
        setFileMismatch(true);
        setMessage(scopeWritable
          ? 'Este MP4 no coincide con el vídeo original. Los cortes siguen protegidos; selecciona el archivo correcto o pulsa «Otro vídeo».'
          : 'Este MP4 no coincide con el vídeo original. La temporada cerrada permite consultar solo el archivo correcto.');
        setSaveStatus(previousStatus);
        return;
      }
      if (mode === 'switch' && analysis && fingerprint !== analysis.source.fingerprint &&
          !window.confirm('¿Cambiar de vídeo? El análisis actual se conservará por separado en este navegador.')) {
        setSaveStatus(previousStatus);
        return;
      }
      if (draft?.revision) {
        await queueSave(snapshotLocalAnalysis(draft.analysis, draft.clips));
      }
      const found = await findLocalAnalysisByFingerprint(fingerprint);
      if (found && (found.version !== ANALYSIS_VERSION || !Array.isArray(found.clips))) {
        throw new Error('Versión de análisis local no compatible.');
      }
      if (scopedMode && found && !canSeeLocalAnalysis(found,
        { userId, ownerRole: context?.role, context })) {
        throw new Error('Este análisis local pertenece a otra identidad o a otro equipo-temporada.');
      }
      if (scopedMode && found?.matchPreId && !isAnalysisForMatch(found, selectedMatch.id, context)) {
        throw new Error('Este MP4 ya está asociado a otro partido PRE. Selecciona ese partido para abrirlo.');
      }
      if (scopedMode && !scopeWritable && !found?.matchPreId) {
        throw new Error('Temporada cerrada: no se pueden vincular análisis nuevos o sin partido.');
      }
      const freshAnalysis = newLocalAnalysis({ id: uid(), file, fingerprint,
        ownerUserId: scopedMode ? userId : null });
      const nextAnalysis = found || (scopedMode
        ? associateLocalAnalysis(freshAnalysis, selectedMatch, context, userId)
        : freshAnalysis);
      if (!nextAnalysis) throw new Error('El partido no coincide con el equipo-temporada autorizado.');
      if (!found || found.id !== analysis?.id) {
        setDraft({ analysis: nextAnalysis, clips: nextAnalysis.clips, revision: found ? 0 : 1 });
        setSelectedId(null);
      }
      videoRef.current?.pause();
      activeRangeRef.current = null;
      setSource({ id: nextAnalysis.id, url: URL.createObjectURL(file), name: file.name });
      setDuration(0);
      setVideoSize({ width: 0, height: 0 });
      setTime(0);
      setInPoint(0);
      setOutPoint(0);
      setDraftTitle('');
      setDrawing(null);
      setHistory({ past: [], future: [] });
      setSaveStatus(found ? 'saved' : 'saving');
      setFileMismatch(false);
      setMessage(found ? 'MP4 verificado. Análisis local recuperado.' : 'Nuevo análisis local creado. El MP4 no se almacenará.');
    } catch (error) {
      setSaveStatus('error');
      setMessage(`No se pudo abrir o guardar el análisis local: ${error.message}`);
    } finally {
      fileBusyRef.current = false;
    }
  };

  const chooseMatch = async (matchId) => {
    if (transitionBusyRef.current || fileBusyRef.current) return;
    if (matchId === selectedMatchId) return;
    if (matchId && !preMatches.some((match) => match.id === matchId)) return;
    if (propertiesDirty && !window.confirm('Hay cambios del corte sin aplicar. ¿Descartarlos y cambiar de partido?')) return;
    transitionBusyRef.current = true;
    setSaveStatus('switching');
    try {
      if (draft?.revision) await queueSave(snapshotLocalAnalysis(draft.analysis, draft.clips));
      videoRef.current?.pause();
      activeRangeRef.current = null;
      setSource(null);
      setDraft(null);
      setSelectedId(null);
      setDuration(0);
      setTime(0);
      setVideoSize({ width: 0, height: 0 });
      setSelectedMatchId(matchId);
      setSaveStatus('idle');
      setFileMismatch(false);
      setMessage(matchId ? 'Selecciona un vídeo del partido o añade un MP4 local.' : 'Selecciona un partido PRE.');
    } catch {
      setSaveStatus('error');
      setMessage('No se pudo guardar el análisis actual; se ha cancelado el cambio de partido.');
    } finally {
      transitionBusyRef.current = false;
    }
  };

  const attachCurrentAnalysis = () => {
    if (!scopeWritable || !scopedMode || !selectedMatch || !draft || analysis.matchPreId ||
        transitionBusyRef.current || fileBusyRef.current) return;
    const linked = associateLocalAnalysis(analysis, selectedMatch, context, userId);
    if (!linked) {
      setMessage('No se pudo vincular este análisis al partido y equipo-temporada seleccionados.');
      return;
    }
    setDraft((current) => ({ ...current, analysis: linked, revision: current.revision + 1 }));
    setMessage('Análisis anterior vinculado a este PRE. Se está guardando localmente.');
  };

  const changeOriginalEncounter = (value) => {
    if (!scopeWritable || !draft || !analysis || transitionBusyRef.current || fileBusyRef.current) return;
    setDraft((current) => ({ ...current,
      analysis: { ...current.analysis, originalEncounterName: value },
      revision: current.revision + 1 }));
  };

  const selectSavedAnalysis = async (row) => {
    if (transitionBusyRef.current || fileBusyRef.current) return;
    if (row.id === analysis?.id) return;
    if (scopedMode && (!selectedMatch || !canSeeLocalAnalysis(row,
      { userId, ownerRole: context?.role, context }) ||
      (row.matchPreId && !isAnalysisForMatch(row, selectedMatch.id, context)))) return;
    if (propertiesDirty &&
        !window.confirm('Hay cambios del corte sin aplicar. ¿Descartarlos y abrir otro análisis?')) return;
    transitionBusyRef.current = true;
    setSaveStatus('switching');
    try {
      if (draft?.revision) await queueSave(snapshotLocalAnalysis(draft.analysis, draft.clips));
      videoRef.current?.pause();
      activeRangeRef.current = null;
      setSource(null);
      setDraft({ analysis: row, clips: row.clips, revision: 0 });
      setSelectedId(null);
      setDuration(0);
      setTime(0);
      setVideoSize({ width: 0, height: 0 });
      setSaveStatus('saved');
      setFileMismatch(false);
      setMessage('Análisis recuperado. Selecciona su MP4 original para editar o reproducir los cortes.');
    } catch {
      setSaveStatus('error');
      setMessage('No se pudo guardar el análisis actual; se ha cancelado el cambio.');
    } finally {
      transitionBusyRef.current = false;
    }
  };

  const retrySave = async () => {
    if (!draft) return;
    const current = draft;
    setSaveStatus('saving');
    try {
      await queueSave(snapshotLocalAnalysis(current.analysis, current.clips));
      if (draftRef.current === current) setSaveStatus('saved');
      setSavedAnalyses(visibleRows(await listLocalAnalyses()));
      setMessage('Análisis guardado en este navegador.');
    } catch {
      setSaveStatus('error');
      setMessage('El guardado local sigue fallando. Mantén abierta esta pestaña.');
    }
  };

  const seek = (seconds) => {
    if (!videoRef.current || !duration) return;
    videoRef.current.currentTime = clamp(Number(seconds) || 0, 0, duration);
    setTime(videoRef.current.currentTime);
  };

  const play = async (range = null) => {
    if (!videoRef.current || !duration) return;
    activeRangeRef.current = range;
    if (range) seek(range.in);
    else if (videoRef.current.currentTime >= duration) seek(0);
    try {
      await videoRef.current.play();
      setMessage('');
    } catch {
      setMessage('El navegador no pudo iniciar la reproducción. Comprueba el archivo MP4.');
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const range = activeRangeRef.current;
    if (clipOutReached(range, video.currentTime)) {
      video.pause();
      video.currentTime = range.out;
      activeRangeRef.current = null;
    }
    setTime(video.currentTime);
  };

  const addClip = () => {
    if (!canEdit || !validRange(inPoint, outPoint, duration)) {
      setMessage('El corte necesita un IN y OUT válidos, separados al menos 0,1 s.');
      return;
    }
    const clip = createClip({ id: uid(), sourceId: source.id,
      title: draftTitle || `Corte ${clips.length + 1}`,
      start: inPoint, end: outPoint, duration });
    if (!clip) return;
    setClips((current) => [...current, clip]);
    setSelectedId(clip.id);
    setDraftTitle('');
    setMessage('Corte añadido al borrador local.');
  };

  const chooseClip = (clip) => {
    if (!canView) return;
    videoRef.current?.pause();
    activeRangeRef.current = null;
    setSelectedId(clip.id);
    setInPoint(clip.in);
    setOutPoint(clip.out);
    seek(clip.in);
  };

  const saveClipProperties = () => {
    if (!canEdit || !selectedClip || !clipDraft) return;
    const next = updateClip(selectedClip, {
      title: clipDraft.title,
      in: clipDraft.in === '' ? NaN : Number(clipDraft.in),
      out: clipDraft.out === '' ? NaN : Number(clipDraft.out),
      observations: clipDraft.observations,
    }, duration);
    if (!next) {
      setMessage('Revisa título y tiempos. Los dibujos existentes deben permanecer dentro del corte.');
      return;
    }
    setClips((current) => current.map((item) => item.id === next.id ? next : item));
    setInPoint(next.in);
    setOutPoint(next.out);
    setMessage('Propiedades del corte actualizadas en memoria.');
  };

  const changeClipProperty = (field, value) => {
    if (!canEdit || !selectedClip || !clipDraft) return;
    const nextDraft = { ...clipDraft, [field]: value };
    setClipDraft(nextDraft);
    const next = updateClip(selectedClip, {
      title: nextDraft.title,
      in: nextDraft.in === '' ? NaN : Number(nextDraft.in),
      out: nextDraft.out === '' ? NaN : Number(nextDraft.out),
      observations: nextDraft.observations,
    }, duration);
    if (next) setClips((current) => current.map((item) => item.id === next.id ? next : item));
  };

  const removeClip = (clipId) => {
    if (!canEdit) return;
    if (activeRangeRef.current?.id === clipId) {
      videoRef.current?.pause();
      activeRangeRef.current = null;
    }
    setClips((current) => removeClipFromDraft(current, clipId));
    if (selectedId === clipId) setSelectedId(null);
    setMessage('Corte eliminado del borrador.');
  };

  const commitAnnotations = (next) => {
    if (!canEdit || !selectedClip) return;
    setHistory((current) => ({ past: [...current.past, selectedClip.annotations], future: [] }));
    setClips((current) => current.map((item) => item.id === selectedClip.id
      ? { ...item, annotations: next } : item));
  };

  const undo = () => {
    if (!selectedClip || !history.past.length) return;
    const previous = history.past.at(-1);
    setHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [selectedClip.annotations, ...current.future],
    }));
    setClips((current) => current.map((item) => item.id === selectedClip.id
      ? { ...item, annotations: previous } : item));
    setSelectedDrawingId(null);
  };

  const redo = () => {
    if (!selectedClip || !history.future.length) return;
    const next = history.future[0];
    setHistory((current) => ({
      past: [...current.past, selectedClip.annotations],
      future: current.future.slice(1),
    }));
    setClips((current) => current.map((item) => item.id === selectedClip.id
      ? { ...item, annotations: next } : item));
    setSelectedDrawingId(null);
  };

  const removeDrawing = () => {
    if (!selectedClip || !selectedDrawingId) return;
    commitAnnotations(selectedClip.annotations.filter((item) => item.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target?.isContentEditable) return;
      if (event.key === 'Delete' || event.key === 'Backspace') removeDrawing();
      if (event.key === 'Escape') setSelectedDrawingId(null);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const pointAt = (event) => normalizedPoint(event.clientX, event.clientY,
    event.currentTarget.getBoundingClientRect());
  const startDrawing = (event) => {
    if (tool === 'select') {
      setSelectedDrawingId(null);
      return;
    }
    if (!canEdit || !selectedClip || !imageRect) {
      setMessage('Selecciona primero un corte para asociar el dibujo.');
      return;
    }
    videoRef.current?.pause();
    activeRangeRef.current = null;
    if (time < selectedClip.in || time > selectedClip.out) seek(selectedClip.in);
    const point = pointAt(event);
    drawingRef.current = { start: point, end: point };
    setDrawing(drawingRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrawing = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = { ...drawingRef.current, end: pointAt(event) };
    setDrawing(drawingRef.current);
  };
  const finishDrawing = (event) => {
    if (!canEdit || !drawingRef.current || !selectedClip) return;
    const next = createAnnotation({ id: uid(), type: tool,
      start: drawingRef.current.start, end: pointAt(event),
      color, width: Number(lineWidth), clip: selectedClip,
      at: clamp(time, selectedClip.in, selectedClip.out),
    });
    drawingRef.current = null;
    setDrawing(null);
    if (next) {
      commitAnnotations([...selectedClip.annotations, next]);
      setSelectedDrawingId(next.id);
    }
  };

  const updateDrawingTiming = (field, value) => {
    if (!canEdit || !selectedClip || !selectedDrawing) return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const timing = { ...selectedDrawing.timing, [field]: number };
    if (timing.start < selectedClip.in || timing.end > selectedClip.out ||
        timing.start > timing.end) {
      setMessage('La anotación debe quedar dentro del corte y su inicio no puede superar el final.');
      return;
    }
    commitAnnotations(selectedClip.annotations.map((item) => item.id === selectedDrawing.id
      ? { ...item, timing } : item));
    setMessage('');
  };

  return <div className={`lab-shell${embedded ? ' is-embedded' : ''}`}>
    {!embedded && <header className="lab-header">
      <div className="brand"><span className="brand-mark">N</span>
        <div><strong>NEXO CLUB</strong><small>Laboratorio · Videoanálisis</small></div></div>
      <div className="header-center"><span className="live-dot" /> PROTOTIPO LOCAL <span className="header-divider">/</span> SIN CONEXIÓN</div>
      <span className="memory-notice">Metadatos guardados en este navegador · MP4 externo</span>
    </header>}

    <main className="lab-grid">
      <section className="workspace" aria-label="Mesa de análisis">
        {scopedMode && <div className="match-scope">
          <div><span className="eyebrow">PARTIDO PRE · EQUIPO Y TEMPORADA AUTORIZADOS</span>
            <strong>{context.teamName} · {context.seasonLabel}</strong>
            <small>{context.seasonStatus === 'closed' ? 'Temporada cerrada · consulta local' : 'Temporada abierta · edición local'}</small>
          </div>
          <label>Partido que estás preparando
            <select value={selectedMatchId} onChange={(event) => { void chooseMatch(event.target.value); }}>
              <option value="">Selecciona un partido PRE</option>
              {preMatches.map((match) => <option key={match.id} value={match.id}>
                {match.date || 'Sin fecha'} · {match.opponent} · {match.status}
              </option>)}
            </select>
          </label>
          {!preMatches.length && <span className="match-scope-empty">No hay partidos vinculados a este equipo-temporada. Videoanálisis no crea partidos.</span>}
        </div>}
        <div className="workspace-heading">
          <div><span className="eyebrow">FUENTE DE VÍDEO</span><h1>{analysis?.source?.name || 'Nuevo análisis'}</h1>
            <span className={`save-indicator ${saveStatus}`}>{saveStatus === 'verifying'
              ? `Verificando MP4 · ${Math.round(fingerprintProgress * 100)} %`
              : ({ loading: 'Abriendo almacenamiento local…', idle: 'Sin análisis', saving: 'Guardando cambios…',
                switching: 'Guardando antes de cambiar…',
                saved: 'Guardado en este navegador', error: 'Guardado pendiente · error' })[saveStatus]}</span>
          </div>
          <input ref={fileRef} className="visually-hidden" type="file" accept="video/mp4,.mp4"
            onChange={(event) => { void pickFile(event.target.files?.[0], fileSelectionModeRef.current); event.target.value = ''; }} />
        </div>

        <div className="source-actions" aria-label="Gestión de vídeos locales">
          <button className="button button-secondary" disabled={!libraryReady || ['verifying', 'switching'].includes(saveStatus) ||
            (scopedMode && (!selectedMatch || (!scopeWritable && !analysis)))}
            onClick={() => openFilePicker(analysis ? 'relink' : 'switch')}>
            {analysis ? 'Seleccionar MP4 original' : 'Abrir MP4 local'}
          </button>
          {(analysis || (scopedMode && selectedMatch && scopeWritable)) && <button className="button button-primary"
            disabled={!libraryReady || ['verifying', 'switching'].includes(saveStatus) || (scopedMode && !scopeWritable)}
            onClick={() => openFilePicker('switch')}>Otro vídeo</button>}
        </div>
        {scopedMode && analysis && <div className="video-link-details">
          {analysis.matchPreId ? <span>Asociado a PRE: {selectedMatch?.opponent || analysis.matchPre?.opponent}</span>
            : <button className="button button-primary" disabled={!scopeWritable || !selectedMatch}
              onClick={attachCurrentAnalysis}>Vincular este análisis anterior al PRE</button>}
          <label>Encuentro original del vídeo (opcional)
            <input value={analysis.originalEncounterName || ''} disabled={!scopeWritable}
              placeholder="Ej.: Rival contra otro equipo · no se crea un partido"
              onChange={(event) => changeOriginalEncounter(event.target.value)} />
          </label>
        </div>}

        <div className="stage-wrap" onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); void pickFile(event.dataTransfer.files?.[0], sourceVerified ? 'switch' : 'relink'); }}>
          <div className="video-stage" ref={stageRef}>
            {source ? <video ref={videoRef} src={source.url} playsInline preload="metadata"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const length = Number.isFinite(video.duration) ? video.duration : 0;
                setDuration(length); setOutPoint(length);
                setVideoSize({ width: video.videoWidth, height: video.videoHeight });
                video.playbackRate = speed;
              }}
              onTimeUpdate={onTimeUpdate} onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)} onEnded={() => {
                activeRangeRef.current = null; setPlaying(false);
              }} onError={() => setMessage('No se puede reproducir este MP4 con el códec disponible en el navegador.')} />
              : <div className="stage-empty" onClick={() => {
                if (!scopedMode || (selectedMatch && scopeWritable)) openFilePicker(analysis ? 'relink' : 'switch');
              }} role="button" tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' && (!scopedMode || (selectedMatch && scopeWritable)))
                  openFilePicker(analysis ? 'relink' : 'switch'); }}>
                <span className="stage-empty-icon">▶</span><h2>{analysis ? 'Vuelve a seleccionar el MP4 original' : 'Tu mesa de análisis empieza aquí'}</h2>
                <p>{scopedMode && !selectedMatch ? 'Selecciona primero el partido PRE.'
                  : analysis ? `${clips.length} cortes recuperados. El archivo se verificará antes de habilitarlos.`
                    : 'Arrastra un MP4 al campo o selecciónalo desde el equipo.'}</p>
                <span>El MP4 no se sube ni se copia a IndexedDB.</span>
              </div>}
            {source && imageRect && <svg className={`video-overlay ${tool === 'select' ? 'select-mode' : 'draw-mode'}`}
              style={{ left: imageRect.left, top: imageRect.top,
                width: imageRect.width, height: imageRect.height }}
              viewBox="0 0 1000 1000" preserveAspectRatio="none"
              onPointerDown={startDrawing} onPointerMove={moveDrawing}
              onPointerUp={finishDrawing} onPointerCancel={() => {
                drawingRef.current = null; setDrawing(null);
              }}>
              <defs><marker id="arrow-tip" markerWidth="7" markerHeight="7"
                refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" /></marker></defs>
              {visibleAnnotations.map((item) => <Drawing key={item.id} annotation={item}
                selected={item.id === selectedDrawingId}
                onSelect={(event) => {
                  if (tool !== 'select') return;
                  event.stopPropagation(); setSelectedDrawingId(item.id);
                }} />)}
              {drawing && <Drawing annotation={{ type: tool,
                geometry: { x1: drawing.start.x, y1: drawing.start.y,
                  x2: drawing.end.x, y2: drawing.end.y },
                style: { color, width: Number(lineWidth) } }} />}
            </svg>}
          </div>
        </div>

        <div className="tool-strip">
          <span className="strip-label">ANOTAR</span>
          {[['select', 'Seleccionar'], ['arrow', 'Flecha'], ['ellipse', 'Círculo / elipse']]
            .map(([key, label]) => <button key={key} className={`tool-button ${tool === key ? 'active' : ''}`}
              onClick={() => setTool(key)} title={label} disabled={!canEdit}>{label}</button>)}
          <span className="strip-separator" />
          <div className="color-row" aria-label="Color del dibujo">{COLORS.map((item) =>
            <button key={item} className={`color-dot ${color === item ? 'active' : ''}`}
              style={{ backgroundColor: item }} onClick={() => setColor(item)}
              title={`Color ${item}`} aria-label={`Color ${item}`} />)}</div>
          <label className="width-field">Grosor <select value={lineWidth}
            onChange={(event) => setLineWidth(Number(event.target.value))}>
            {[2, 3, 4, 6, 8].map((value) => <option key={value} value={value}>{value}px</option>)}
          </select></label>
          <span className="strip-separator" />
          <button className="tool-button" onClick={undo} disabled={!canEdit || !history.past.length}>Deshacer</button>
          <button className="tool-button" onClick={redo} disabled={!canEdit || !history.future.length}>Rehacer</button>
          <button className="tool-button danger" onClick={removeDrawing} disabled={!canEdit || !selectedDrawing}>Eliminar dibujo</button>
        </div>

        <div className="transport">
          <div className="transport-top">
            <div className="transport-actions">
              <button className="play-button" disabled={!canView}
                onClick={() => playing ? videoRef.current?.pause() : play()}>{playing ? 'Ⅱ' : '▶'}</button>
              <button disabled={!canView} onClick={() => seek(time - 5)}>− 5 s</button>
              <button disabled={!canView} onClick={() => seek(time + 5)}>+ 5 s</button>
              <span className="timecode">{formatTime(time)} <em>/ {formatTime(duration)}</em></span>
            </div>
            <label className="speed-control">Velocidad <select value={speed} onChange={(event) => {
              const next = Number(event.target.value); setSpeed(next);
              if (videoRef.current) videoRef.current.playbackRate = next;
            }}>{SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
          </div>
          <div className="timeline">
            <div className="timeline-rail">
              {duration > 0 && clips.map((clip) => <div key={clip.id}
                className={`clip-rail ${clip.id === selectedId ? 'active' : ''}`}
                style={{ left: `${clip.in / duration * 100}%`,
                  width: `${(clip.out - clip.in) / duration * 100}%` }} />)}
              {duration > 0 && <><span className="mark in" style={{ left: `${inPoint / duration * 100}%` }} />
                <span className="mark out" style={{ left: `${outPoint / duration * 100}%` }} /></>}
              <input type="range" aria-label="Línea temporal" min="0" max={duration || 1}
                value={Math.min(time, duration || 1)} step="0.04" disabled={!canView}
                onChange={(event) => seek(event.target.value)} />
            </div>
            <div className="timeline-scale"><span>00:00</span><span>{formatTime(duration / 2)}</span><span>{formatTime(duration)}</span></div>
          </div>
          <div className="mark-controls">
            <button disabled={!canEdit} onClick={() => setInPoint(time)}>Marcar IN <strong>{formatTime(inPoint)}</strong></button>
            <button disabled={!canEdit} onClick={() => setOutPoint(time)}>Marcar OUT <strong>{formatTime(outPoint)}</strong></button>
            <input aria-label="Título del nuevo corte" placeholder="Título del nuevo corte (opcional)"
              value={draftTitle} disabled={!canEdit} onChange={(event) => setDraftTitle(event.target.value)} />
            <button className="button button-primary" disabled={!canEdit} onClick={addClip}>+ Crear corte</button>
          </div>
          {message && <div className="status-message" role="status">{message}
            {fileMismatch && scopeWritable && <button type="button" className="button button-primary mismatch-switch"
              onClick={() => openFilePicker('switch')}>Otro vídeo</button>}
          </div>}
        </div>
      </section>

      <aside className="side-panel" aria-label="Biblioteca de cortes">
        <div className="local-analyses">
          <span className="eyebrow">{scopedMode ? 'VÍDEOS DEL PARTIDO Y ANÁLISIS SIN VINCULAR' : 'ANÁLISIS EN ESTE NAVEGADOR'}</span>
          {displayedAnalyses.length ? displayedAnalyses.map((row) =>
            <button key={row.id} className={`local-analysis-item ${row.id === analysis?.id ? 'active' : ''}`}
              onClick={() => void selectSavedAnalysis(row)} disabled={row.id === analysis?.id || ['verifying', 'switching'].includes(saveStatus)}>
              <strong>{row.source.name}</strong>
              <small>{scopedMode ? (row.matchPreId ? 'Vinculado al PRE' : 'Sin partido · selecciónalo para vincular') + ' · ' : ''}
                {row.clips.length} cortes · {new Date(row.updatedAt).toLocaleString('es-ES')}</small>
            </button>) : <p>{scopedMode && !selectedMatch ? 'Selecciona primero un partido PRE.'
              : 'Aún no hay vídeos asociados a este partido.'}</p>}
          {saveStatus === 'error' && draft && <button className="retry-save" onClick={() => void retrySave()}>Reintentar guardado</button>}
        </div>
        <div className="side-heading"><div><span className="eyebrow">BORRADOR ACTUAL</span>
          <h2>Biblioteca de cortes</h2></div><span className="count-badge">{clips.length}</span></div>
        <div className="clip-list">
          {clips.length ? clips.map((clip, index) => <div key={clip.id}
            className={`clip-card ${clip.id === selectedId ? 'active' : ''}`}>
            <button className="clip-select" onClick={() => chooseClip(clip)} disabled={!canView}>
              <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
              <span><strong>{clip.title}</strong><small>{formatTime(clip.in)} → {formatTime(clip.out)} · {(clip.out - clip.in).toFixed(1)} s</small></span>
            </button>
            <button className="clip-play" title={`Reproducir ${clip.title}`} disabled={!canView} onClick={() => {
              chooseClip(clip); play({ id: clip.id, in: clip.in, out: clip.out });
            }}>▶</button>
          </div>) : <div className="side-empty"><span>✂</span><p>Marca IN y OUT en la línea temporal para crear el primer corte.</p></div>}
        </div>

        {selectedClip && clipDraft && <div className="properties">
          <div className="properties-heading"><span className="eyebrow">CORTE SELECCIONADO</span><h3>Propiedades</h3></div>
          {propertiesDirty && <p className="property-pending">Cambios del corte sin aplicar</p>}
          <label>Título<input value={clipDraft.title} disabled={!canEdit}
            onChange={(event) => changeClipProperty('title', event.target.value)} /></label>
          <div className="property-times"><label>IN · segundos<input type="number" min="0" max={duration} disabled={!canEdit}
            step="0.1" value={clipDraft.in}
            onChange={(event) => changeClipProperty('in', event.target.value)} /></label>
            <label>OUT · segundos<input type="number" min="0" max={duration} disabled={!canEdit}
              step="0.1" value={clipDraft.out}
              onChange={(event) => changeClipProperty('out', event.target.value)} /></label></div>
          <label>Observaciones del clip<textarea rows="3" value={clipDraft.observations} disabled={!canEdit}
            placeholder="Análisis particular de este corte…"
            onChange={(event) => changeClipProperty('observations', event.target.value)} /></label>
          <div className="property-actions"><button className="button button-primary" onClick={saveClipProperties} disabled={!canEdit}>Aplicar cambios</button>
            <button className="button button-secondary" disabled={!canView} onClick={() => play({ id: selectedClip.id,
              in: selectedClip.in, out: selectedClip.out })}>Reproducir corte</button></div>
          <button className="text-danger" disabled={!canEdit} onClick={() => removeClip(selectedClip.id)}>Eliminar corte del borrador</button>
          <div className="annotation-panel"><span className="eyebrow">DIBUJOS DEL CORTE · {selectedClip.annotations.length}</span>
            {selectedDrawing ? <><strong>{selectedDrawing.type === 'arrow' ? 'Flecha' : 'Elipse'} seleccionada</strong>
              <div className="property-times"><label>Desde · s<input type="number" step="0.1" disabled={!canEdit}
                value={selectedDrawing.timing.start}
                onChange={(event) => updateDrawingTiming('start', event.target.value)} /></label>
                <label>Hasta · s<input type="number" step="0.1" disabled={!canEdit}
                  value={selectedDrawing.timing.end}
                  onChange={(event) => updateDrawingTiming('end', event.target.value)} /></label></div></>
              : <p>Pausa el vídeo, elige Flecha o Elipse y dibuja sobre la imagen. Cada dibujo pertenece a este corte.</p>}
          </div>
        </div>}
        <div className="side-footer">Futura conexión: Partido PRE · jugadas canónicas · Modo Charla</div>
      </aside>
    </main>
  </div>;
}
