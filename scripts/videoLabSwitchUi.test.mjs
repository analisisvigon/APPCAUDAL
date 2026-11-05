import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/videoLab/VideoAnalysisLab.jsx', 'utf8');
const styles = readFileSync('src/videoLab/videoLab.css', 'utf8');

assert.match(editor, /<\/div>\s*<div className="source-actions" aria-label="Gestión de vídeos locales">/,
  'las acciones de vídeo tienen una fila propia fuera del título largo');
assert.match(editor, /<button className="button button-primary"[^>]*onClick=\{\(\) => openFilePicker\('switch'\)\}>Otro vídeo<\/button>/,
  'el cambio explícito de vídeo permanece visible junto al reproductor');
assert.match(editor, /fileMismatch && <button[\s\S]*?onClick=\{\(\) => openFilePicker\('switch'\)\}>Otro vídeo<\/button>/,
  'el aviso de MP4 incorrecto ofrece la misma acción');
assert.match(styles, /\.workspace-heading>div:first-child\{min-width:0/,
  'el nombre largo del archivo no desplaza los controles fuera de la pantalla');
assert.match(editor, /await queueSave\(snapshotLocalAnalysis\(draft\.analysis, draft\.clips\)\);[\s\S]*?setDraft\(\{ analysis: nextAnalysis/,
  'el borrador anterior se guarda antes de cambiar el análisis activo');
console.log('Video lab switch UI: OK');
