import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { detectVideoProvider, getVideoThumbnailUrl } from '../../utils/videoProvider';
import { getTaskMediaSignedUrl, selectTrainingTaskPreviewMedia } from '../../utils/trainingTaskMedia';
import TrainingTaskBoardPreview from './TrainingTaskBoardPreview';

function MediaFallback({ task }) {
  const media = useMemo(() => selectTrainingTaskPreviewMedia(task.media || []), [task.media]);
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    let active = true;
    setImageUrl('');
    if (!media) return () => { active = false; };
    if (media.kind === 'video') {
      setImageUrl(getVideoThumbnailUrl(detectVideoProvider(media.originalUrl)));
      return () => { active = false; };
    }
    getTaskMediaSignedUrl(supabase, media).then((url) => { if (active) setImageUrl(url); }).catch(() => {});
    return () => { active = false; };
  }, [media?.id]);
  if (!imageUrl) return <div className="flex h-44 items-center justify-center bg-[#0a1726] text-[10px] font-bold text-slate-500">Sin diseño</div>;
  return <div className="h-44 w-full bg-[#081321]"><img src={imageUrl} alt="" className="h-full w-full object-contain" /></div>;
}

export default function TrainingTaskCardPreview({ task, playerLookup }) {
  return <TrainingTaskBoardPreview payload={task.editorPayload ?? task.editor_payload} playerLookup={playerLookup} fallback={<MediaFallback task={task} />} />;
}
