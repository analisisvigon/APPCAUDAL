import { useMemo } from 'react';
import { detectVideoProvider } from '../../utils/videoProvider';

export default function TrainingTaskMediaVideoPlayer({ url, title = 'Vídeo de la tarea' }) {
  const analysis = useMemo(() => detectVideoProvider(url), [url]);
  if (analysis.kind === 'iframe' && analysis.playable) return <div className="relative aspect-video overflow-hidden rounded-2xl bg-black"><iframe src={analysis.embedUrl} title={title} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" className="absolute inset-0 h-full w-full" /></div>;
  if (analysis.kind === 'video' && analysis.playable) return <div className="relative aspect-video overflow-hidden rounded-2xl bg-black"><video controls preload="metadata" className="absolute inset-0 h-full w-full bg-black"><source src={analysis.directVideoUrl} type={analysis.type} /></video></div>;
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><p className="text-sm text-slate-300">{analysis.message || 'Este enlace se abre externamente.'}</p>{analysis.originalUrl ? <button type="button" onClick={() => window.open(analysis.originalUrl, '_blank', 'noopener,noreferrer')} className="mt-3 rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">Abrir enlace</button> : null}</div>;
}
