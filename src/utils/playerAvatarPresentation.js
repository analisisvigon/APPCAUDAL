const clean = (value) => String(value ?? '').trim();

export const PLAYER_AVATAR_FRAME_CLASS = 'relative flex items-center justify-center overflow-hidden bg-white';
export const PLAYER_AVATAR_IMAGE_CLASS = 'h-full w-full object-cover object-center';

export const getPlayerAvatarRadiusClass = (className = '') => /(?:^|\s)rounded(?:-|\s|$)/.test(String(className)) ? '' : 'rounded-[inherit]';

export const getPlayerAvatarSource = (player = {}) => clean(
  player.originalImage
  || player.original_image
  || player.image
  || player.imageUrl
  || player.image_url
  || player.photoUrl
  || player.photo_url
  || player.avatarUrl
  || player.avatar_url
);

export const getPlayerAvatarObjectPosition = (player = {}) => clean(
  player.imageObjectPosition
  || player.image_object_position
  || player.photoObjectPosition
  || player.photo_object_position
) || 'center';

export const getPlayerAvatarInitials = (player = {}) => clean(
  player.displayName || player.shirtName || player.shirt_name || player.name
).split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'JG';
