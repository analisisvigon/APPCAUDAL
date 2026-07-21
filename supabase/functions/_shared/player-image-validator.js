const ascii = (bytes, start, length) => String.fromCharCode(...bytes.slice(start, start + length));

const readUint24LE = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const getPngDimensions = (bytes) => {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== 'PNG') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const getJpegDimensions = (bytes) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
};

const getWebpDimensions = (bytes) => {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return null;
};

export const detectPlayerPhotoMimeType = (bytes) => {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return '';
};

export const getPlayerPhotoDimensions = (bytes, mimeType = detectPlayerPhotoMimeType(bytes)) => {
  if (mimeType === 'image/png') return getPngDimensions(bytes);
  if (mimeType === 'image/jpeg') return getJpegDimensions(bytes);
  if (mimeType === 'image/webp') return getWebpDimensions(bytes);
  return null;
};

export const validatePlayerPhotoBytes = (bytes, options = {}) => {
  const minWidth = options.minWidth || 150;
  const minHeight = options.minHeight || 150;
  const maxBytes = options.maxBytes || 5 * 1024 * 1024;
  if (!(bytes instanceof Uint8Array) || !bytes.length) return { ok: false, reason: 'La imagen está vacía.' };
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'La imagen supera el límite de 5 MB.' };
  const mimeType = detectPlayerPhotoMimeType(bytes);
  if (!mimeType) return { ok: false, reason: 'El archivo no es una imagen JPG, PNG o WEBP válida.' };
  const dimensions = getPlayerPhotoDimensions(bytes, mimeType);
  if (!dimensions) return { ok: false, reason: 'No se han podido verificar las dimensiones de la imagen.' };
  if (dimensions.width < minWidth || dimensions.height < minHeight) {
    return { ok: false, reason: `La imagen no alcanza ${minWidth} × ${minHeight} píxeles.`, mimeType, ...dimensions };
  }
  if (dimensions.width / dimensions.height > 2.6 || dimensions.height / dimensions.width > 2.6) {
    return { ok: false, reason: 'La proporción de la imagen parece corresponder a un banner.', mimeType, ...dimensions };
  }
  return { ok: true, mimeType, ...dimensions, byteLength: bytes.byteLength };
};

export const getPlayerPhotoExtension = (mimeType) => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}[mimeType] || 'bin');
