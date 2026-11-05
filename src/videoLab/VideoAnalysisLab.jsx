import { useEffect, useMemo, useRef, useState } from 'react';
import {
  annotationVisible, clamp, containedVideoRect, createAnnotation,
  clipOutReached, createClip, formatTime, isMp4File, normalizedPoint,
  removeClipFromDraft, updateClip, validRange,
} from './model';
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

export default function VideoAnalysisLab() {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
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
  const [clips, setClips] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [clipDraft, setClipDraft] = useState(null);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [drawing, setDrawing] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [message, setMessage] = useState('');

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

  const pickFile = (file) => {
    if (!file) return;
    if (!isMp4File(file)) {
      setMessage('Selecciona un archivo MP4 local. No se subirá a ningún servidor.');
      return;
    }
    videoRef.current?.pause();
    activeRangeRef.current = null;
    setSource({ id: uid(), url: URL.createObjectURL(file), name: file.name });
    setDuration(0);
    setVideoSize({ width: 0, height: 0 });
    setTime(0);
    setInPoint(0);
    setOutPoint(0);
    setClips([]);
    setSelectedId(null);
    setDraftTitle('');
    setDrawing(null);
    setHistory({ past: [], future: [] });
    setMessage('Vídeo cargado solo en este navegador. Los cortes se perderán al recargar.');
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
    if (!source || !validRange(inPoint, outPoint, duration)) {
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
    videoRef.current?.pause();
    activeRangeRef.current = null;
    setSelectedId(clip.id);
    setInPoint(clip.in);
    setOutPoint(clip.out);
    seek(clip.in);
  };

  const saveClipProperties = () => {
    if (!selectedClip || !clipDraft) return;
    const next = updateClip(selectedClip, {
      title: clipDraft.title,
      in: Number(clipDraft.in),
      out: Number(clipDraft.out),
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

  const removeClip = (clipId) => {
    if (activeRangeRef.current?.id === clipId) {
      videoRef.current?.pause();
      activeRangeRef.current = null;
    }
    setClips((current) => removeClipFromDraft(current, clipId));
    if (selectedId === clipId) setSelectedId(null);
    setMessage('Corte eliminado del borrador.');
  };

  const commitAnnotations = (next) => {
    if (!selectedClip) return;
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
    if (!selectedClip || !imageRect) {
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
    if (!drawingRef.current || !selectedClip) return;
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
    if (!selectedClip || !selectedDrawing) return;
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

  return <div className="lab-shell">
    <header className="lab-header">
      <div className="brand"><span className="brand-mark">N</span>
        <div><strong>NEXO CLUB</strong><small>Laboratorio · Videoanálisis</small></div></div>
      <div className="header-center"><span className="live-dot" /> PROTOTIPO LOCAL <span className="header-divider">/</span> SIN CONEXIÓN</div>
      <span className="memory-notice">Borrador en memoria · se perderá al recargar</span>
    </header>

    <main className="lab-grid">
      <section className="workspace" aria-label="Mesa de análisis">
        <div className="workspace-heading">
          <div><span className="eyebrow">FUENTE DE VÍDEO</span><h1>{source?.name || 'Nuevo análisis'}</h1></div>
          <button className="button button-secondary" onClick={() => fileRef.current?.click()}>Abrir MP4 local</button>
          <input ref={fileRef} className="visually-hidden" type="file" accept="video/mp4,.mp4"
            onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>

        <div className="stage-wrap" onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); pickFile(event.dataTransfer.files?.[0]); }}>
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
              : <div className="stage-empty" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter') fileRef.current?.click(); }}>
                <span className="stage-empty-icon">▶</span><h2>Tu mesa de análisis empieza aquí</h2>
                <p>Arrastra un MP4 al campo o selecciónalo desde el equipo.</p>
                <span>El archivo no se sube ni se guarda fuera del navegador.</span>
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
              onClick={() => setTool(key)} title={label}>{label}</button>)}
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
          <button className="tool-button" onClick={undo} disabled={!history.past.length}>Deshacer</button>
          <button className="tool-button" onClick={redo} disabled={!history.future.length}>Rehacer</button>
          <button className="tool-button danger" onClick={removeDrawing} disabled={!selectedDrawing}>Eliminar dibujo</button>
        </div>

        <div className="transport">
          <div className="transport-top">
            <div className="transport-actions">
              <button className="play-button" disabled={!duration}
                onClick={() => playing ? videoRef.current?.pause() : play()}>{playing ? 'Ⅱ' : '▶'}</button>
              <button disabled={!duration} onClick={() => seek(time - 5)}>− 5 s</button>
              <button disabled={!duration} onClick={() => seek(time + 5)}>+ 5 s</button>
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
                value={Math.min(time, duration || 1)} step="0.04" disabled={!duration}
                onChange={(event) => seek(event.target.value)} />
            </div>
            <div className="timeline-scale"><span>00:00</span><span>{formatTime(duration / 2)}</span><span>{formatTime(duration)}</span></div>
          </div>
          <div className="mark-controls">
            <button disabled={!duration} onClick={() => setInPoint(time)}>Marcar IN <strong>{formatTime(inPoint)}</strong></button>
            <button disabled={!duration} onClick={() => setOutPoint(time)}>Marcar OUT <strong>{formatTime(outPoint)}</strong></button>
            <input aria-label="Título del nuevo corte" placeholder="Título del nuevo corte (opcional)"
              value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
            <button className="button button-primary" disabled={!duration} onClick={addClip}>+ Crear corte</button>
          </div>
          {message && <p className="status-message" role="status">{message}</p>}
        </div>
      </section>

      <aside className="side-panel" aria-label="Biblioteca de cortes">
        <div className="side-heading"><div><span className="eyebrow">BORRADOR ACTUAL</span>
          <h2>Biblioteca de cortes</h2></div><span className="count-badge">{clips.length}</span></div>
        <div className="clip-list">
          {clips.length ? clips.map((clip, index) => <div key={clip.id}
            className={`clip-card ${clip.id === selectedId ? 'active' : ''}`}>
            <button className="clip-select" onClick={() => chooseClip(clip)}>
              <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
              <span><strong>{clip.title}</strong><small>{formatTime(clip.in)} → {formatTime(clip.out)} · {(clip.out - clip.in).toFixed(1)} s</small></span>
            </button>
            <button className="clip-play" title={`Reproducir ${clip.title}`} onClick={() => {
              chooseClip(clip); play({ id: clip.id, in: clip.in, out: clip.out });
            }}>▶</button>
          </div>) : <div className="side-empty"><span>✂</span><p>Marca IN y OUT en la línea temporal para crear el primer corte.</p></div>}
        </div>

        {selectedClip && clipDraft && <div className="properties">
          <div className="properties-heading"><span className="eyebrow">CORTE SELECCIONADO</span><h3>Propiedades</h3></div>
          <label>Título<input value={clipDraft.title}
            onChange={(event) => setClipDraft({ ...clipDraft, title: event.target.value })} /></label>
          <div className="property-times"><label>IN · segundos<input type="number" min="0" max={duration}
            step="0.1" value={clipDraft.in}
            onChange={(event) => setClipDraft({ ...clipDraft, in: event.target.value })} /></label>
            <label>OUT · segundos<input type="number" min="0" max={duration}
              step="0.1" value={clipDraft.out}
              onChange={(event) => setClipDraft({ ...clipDraft, out: event.target.value })} /></label></div>
          <label>Observaciones del clip<textarea rows="3" value={clipDraft.observations}
            placeholder="Análisis particular de este corte…"
            onChange={(event) => setClipDraft({ ...clipDraft, observations: event.target.value })} /></label>
          <div className="property-actions"><button className="button button-primary" onClick={saveClipProperties}>Aplicar cambios</button>
            <button className="button button-secondary" onClick={() => play({ id: selectedClip.id,
              in: selectedClip.in, out: selectedClip.out })}>Reproducir corte</button></div>
          <button className="text-danger" onClick={() => removeClip(selectedClip.id)}>Eliminar corte del borrador</button>
          <div className="annotation-panel"><span className="eyebrow">DIBUJOS DEL CORTE · {selectedClip.annotations.length}</span>
            {selectedDrawing ? <><strong>{selectedDrawing.type === 'arrow' ? 'Flecha' : 'Elipse'} seleccionada</strong>
              <div className="property-times"><label>Desde · s<input type="number" step="0.1"
                value={selectedDrawing.timing.start}
                onChange={(event) => updateDrawingTiming('start', event.target.value)} /></label>
                <label>Hasta · s<input type="number" step="0.1"
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
