import { inspectPlayerDossier } from './playerDossierPrint.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const REPORT_SELECTOR = '[data-player-pdf-report="true"]';
const PAGE_SELECTOR = '[data-player-pdf-page]';
const VIDEO_LINK_SELECTOR = 'a[data-player-video-link]';
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const cleanUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

const bytesToBinary = (bytes) => {
  let result = '';
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return result;
};

const extractPdfUriStrings = (binary) => {
  const values = [];
  const marker = /\/URI\s*\(/g;
  let match;
  while ((match = marker.exec(binary))) {
    let cursor = marker.lastIndex;
    let depth = 1;
    let value = '';
    while (cursor < binary.length && depth > 0) {
      const character = binary[cursor];
      if (character === '\\') {
        const escaped = binary[cursor + 1];
        if (/[0-7]/.test(escaped || '')) {
          const octal = binary.slice(cursor + 1).match(/^[0-7]{1,3}/)?.[0] || '';
          value += String.fromCharCode(Number.parseInt(octal, 8));
          cursor += octal.length + 1;
          continue;
        }
        const escapedCharacters = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
        if (escaped === '\r' && binary[cursor + 2] === '\n') cursor += 1;
        else if (escaped !== '\r' && escaped !== '\n') value += escapedCharacters[escaped] ?? escaped ?? '';
        cursor += 2;
        continue;
      }
      if (character === '(') {
        depth += 1;
        value += character;
      } else if (character === ')') {
        depth -= 1;
        if (depth > 0) value += character;
      } else {
        value += character;
      }
      cursor += 1;
    }
    if (depth === 0) values.push(value);
    marker.lastIndex = cursor;
  }
  return values;
};

export const auditPlayerPdfLinkAnnotations = (arrayBuffer, expectedUrls = []) => {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);
  const binary = bytesToBinary(bytes);
  const urls = extractPdfUriStrings(binary);
  const linkAnnotations = (binary.match(/\/Subtype\s*\/Link\b/g) || []).length;
  const expected = expectedUrls.map(cleanUrl).filter(Boolean);
  const missingUrls = [...new Set(expected)].filter((url) => !urls.includes(url));
  return {
    bytes: bytes.length,
    linkAnnotations,
    uriAnnotations: urls.length,
    urls,
    expectedUrls: expected,
    missingUrls,
    valid: (!expected.length || linkAnnotations > 0) && missingUrls.length === 0,
  };
};

const collectPageLinks = (page) => {
  const pageRect = page.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return [];
  return Array.from(page.querySelectorAll('a[href]')).map((anchor) => {
    const url = cleanUrl(anchor.getAttribute('href'));
    const rect = anchor.getBoundingClientRect();
    if (!url || !rect.width || !rect.height) return null;
    return {
      url,
      video: anchor.matches(VIDEO_LINK_SELECTOR),
      x: ((rect.left - pageRect.left) / pageRect.width) * A4_WIDTH_MM,
      y: ((rect.top - pageRect.top) / pageRect.height) * A4_HEIGHT_MM,
      width: (rect.width / pageRect.width) * A4_WIDTH_MM,
      height: (rect.height / pageRect.height) * A4_HEIGHT_MM,
    };
  }).filter(Boolean);
};

const prepareClonedPortal = (clonedDocument) => {
  const portal = clonedDocument.querySelector('.player-profile-print-portal');
  if (!portal) return;
  portal.style.setProperty('display', 'block', 'important');
  portal.style.setProperty('visibility', 'visible', 'important');
  portal.style.setProperty('position', 'absolute', 'important');
  portal.style.setProperty('left', '0', 'important');
  portal.style.setProperty('top', '0', 'important');
  portal.style.setProperty('width', '210mm', 'important');
  portal.style.setProperty('height', 'auto', 'important');
  portal.style.setProperty('overflow', 'visible', 'important');
  portal.style.setProperty('background', '#fff', 'important');
};

export const createPlayerProfilePdf = async ({
  documentRef = document,
  html2canvasImpl,
  JsPdfConstructor,
  scale = 2,
} = {}) => {
  const inspection = inspectPlayerDossier(documentRef);
  if (!inspection.valid) throw new Error('No se puede generar el PDF: el informe individual está vacío o no tiene dimensiones válidas.');

  const report = documentRef.querySelector(REPORT_SELECTOR);
  const pages = Array.from(report.querySelectorAll(PAGE_SELECTOR));
  if (!pages.length) throw new Error('No se encontraron páginas A4 en el informe individual.');

  const defaultHtml2Canvas = html2canvasImpl || html2canvas;
  const DefaultJsPdf = JsPdfConstructor || jsPDF;

  const pdf = new DefaultJsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const expectedVideoUrls = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (index > 0) pdf.addPage('a4', 'portrait');
    const canvas = await defaultHtml2Canvas(page, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      removeContainer: true,
      onclone: prepareClonedPortal,
    });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');

    collectPageLinks(page).forEach((link) => {
      pdf.link(link.x, link.y, link.width, link.height, { url: link.url });
      if (link.video) expectedVideoUrls.push(link.url);
    });
  }

  const arrayBuffer = pdf.output('arraybuffer');
  const audit = auditPlayerPdfLinkAnnotations(arrayBuffer, expectedVideoUrls);
  if (!audit.valid) {
    throw new Error(`El PDF generado no conserva todos los enlaces de vídeo (${audit.linkAnnotations} anotaciones; ${audit.missingUrls.length} URL ausentes).`);
  }
  return { arrayBuffer, audit, pages: pages.length };
};

export const downloadPlayerProfilePdf = ({ arrayBuffer, filename = 'informe-individual.pdf', documentRef = document, urlApi = URL } = {}) => {
  const blobUrl = urlApi.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' }));
  const link = documentRef.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => urlApi.revokeObjectURL(blobUrl), 1000);
};

export const exportPlayerProfilePdf = async (options = {}) => {
  const result = await createPlayerProfilePdf(options);
  downloadPlayerProfilePdf({ ...options, arrayBuffer: result.arrayBuffer });
  return result;
};
