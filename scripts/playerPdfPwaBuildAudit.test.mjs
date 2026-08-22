import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const exporter = read('src/utils/playerProfilePdfExport.js');
const appSource = read('src/App.jsx');
const mainSource = read('src/main.jsx');
const pwaRegistration = read('src/pwa/registerPwa.js');
const viteConfig = read('vite.config.js');

assert.match(exporter, /import html2canvas from 'html2canvas'/, 'html2canvas se carga con el exportador y no al pulsar el botón');
assert.match(exporter, /import \{ jsPDF \} from 'jspdf'/, 'jsPDF se carga estáticamente con el exportador');
assert.doesNotMatch(exporter, /import\(['"](?:jspdf|html2canvas)['"]\)/, 'el clic de exportación no depende de imports dinámicos');
assert.doesNotMatch(exporter, /jspdf\.es\.min-[A-Za-z0-9_-]+\.js/, 'no se referencia manualmente ningún hash de jsPDF');
assert.match(appSource, /recoverFromStaleChunkOnce\(error\)/, 'la exportación distingue un chunk obsoleto de otros errores');
assert.match(appSource, /PDF_GENERATOR_LOAD_ERROR_MESSAGE/, 'la interfaz utiliza el mensaje no técnico compartido');
assert.match(appSource, />Reintentar</, 'la interfaz permite reintentar sin mostrar alertas técnicos');
assert.doesNotMatch(appSource.slice(appSource.indexOf('const exportPlayerPdf ='), appSource.indexOf('const renderProfileEmptyState')), /window\.alert/, 'el flujo PDF no muestra alertas técnicos');
assert.match(mainSource, /unhandledrejection/, 'los fallos de chunks fuera del exportador también activan la recuperación');
assert.match(pwaRegistration, /updateViaCache:\s*'none'/, 'la comprobación del service worker no reutiliza su script desde caché HTTP');
assert.match(pwaRegistration, /registration\.update\(\)/, 'se comprueba la versión del service worker al arrancar');
assert.match(viteConfig, /injectRegister:\s*null/, 'no se duplica el registro automático del service worker');
assert.match(viteConfig, /cleanupOutdatedCaches:\s*true/);
assert.match(viteConfig, /clientsClaim:\s*true/);
assert.match(viteConfig, /skipWaiting:\s*true/);

const distPath = path.join(projectRoot, 'dist');
assert.equal(fs.existsSync(distPath), true, 'debe existir un build de producción antes de ejecutar esta auditoría');
const assets = fs.readdirSync(path.join(distPath, 'assets'));
assert.equal(assets.some((name) => /^jspdf\.es\.min-[\w-]+\.js$/.test(name)), false, 'jsPDF no queda como chunk dinámico solicitado al exportar');
assert.equal(fs.existsSync(path.join(distPath, 'registerSW.js')), false, 'el build no contiene un segundo registro automático');

const builtIndex = read('dist/index.html');
const entryName = builtIndex.match(/assets\/(index-[\w-]+\.js)/)?.[1];
const pdfGeneratorName = assets.find((name) => /^pdf-generator-[\w-]+\.js$/.test(name));
assert.ok(entryName && assets.includes(entryName), 'index.html referencia un bundle principal existente');
assert.ok(pdfGeneratorName, 'las dependencias PDF quedan aisladas en un chunk localizado');
assert.match(builtIndex, new RegExp(`rel="modulepreload"[^>]+${pdfGeneratorName}`), 'el navegador carga el generador al arrancar, antes de pulsar Exportar PDF');
const entrySource = read(`dist/assets/${entryName}`);
assert.doesNotMatch(entrySource, /jspdf\.es\.min-[\w-]+\.js/, 'el bundle principal no intenta descargar un hash diferido de jsPDF');
assert.match(entrySource, new RegExp(`from"\\./${pdfGeneratorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), 'el generador es una dependencia estática del bundle principal');
assert.doesNotMatch(entrySource, new RegExp(`import\\("\\./${pdfGeneratorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\)`), 'el clic no dispara una descarga dinámica del generador');
assert.doesNotMatch(entrySource, /Dyi3BRiJ/, 'el hash obsoleto observado en Vercel no está presente');

const serviceWorker = read('dist/sw.js');
assert.match(serviceWorker, new RegExp(entryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'el bundle actual está incluido en la precaché');
assert.match(serviceWorker, new RegExp(pdfGeneratorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'el generador está incluido en la misma precaché que el bundle principal');
assert.match(serviceWorker, /skipWaiting\(\)/);
assert.match(serviceWorker, /clientsClaim\(\)/);
assert.match(serviceWorker, /cleanupOutdatedCaches\(\)/);

console.log('player PDF/PWA production build audit passed');
