import { useEffect, useState } from 'react';
import {
  PLAYER_AVATAR_FRAME_CLASS,
  PLAYER_AVATAR_IMAGE_CLASS,
  getPlayerAvatarInitials,
  getPlayerAvatarObjectPosition,
  getPlayerAvatarRadiusClass,
  getPlayerAvatarSource,
} from '../../utils/playerAvatarPresentation';

export default function PlayerAvatar({
  player = {},
  className = '',
  imgClassName = '',
  fallbackTextClassName = 'text-xs',
  alt = '',
}) {
  const source = getPlayerAvatarSource(player);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]);

  return (
    <span
      className={`${PLAYER_AVATAR_FRAME_CLASS} ${getPlayerAvatarRadiusClass(className)} ${className}`}
      data-player-avatar="true"
    >
      {source && !failed ? (
        <img
          src={source}
          alt={alt || player.name || ''}
          className={`${PLAYER_AVATAR_IMAGE_CLASS} ${imgClassName}`}
          style={{ objectPosition: getPlayerAvatarObjectPosition(player) }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center bg-white font-black uppercase tracking-[0.08em] text-slate-500 ${fallbackTextClassName}`}>
          {getPlayerAvatarInitials(player)}
        </span>
      )}
    </span>
  );
}
