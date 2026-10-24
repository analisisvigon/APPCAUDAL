import fs from 'node:fs';

const path = process.argv[2];
if (!path || !fs.existsSync(path)) {
  console.error('Uso: node scripts/checkLibyaSchemaOnly.mjs ruta/al/esquema.sql');
  process.exit(2);
}
const source = fs.readFileSync(path, 'utf8');
const findings = [];
const rules = [
  ['datos o credenciales', /^\s*(?:COPY\s+|INSERT\s+INTO\s+|CREATE\s+ROLE\s+|ALTER\s+ROLE\s+|\\connect\b)/i],
  ['identidad Caudal', /caudal|mieres/i],
  ['UUID literal que requiere revisión', /['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]?/i],
  ['credencial incrustada', /(?:password|secret|service_role)\s*[:=]\s*['"][^'"]+/i],
];
source.split(/\r?\n/).forEach((line, index) => {
  for (const [category, pattern] of rules) {
    if (pattern.test(line)) findings.push(`${index + 1}: ${category}`);
  }
});
if (findings.length) {
  console.error('Esquema detenido para revisión manual. Líneas y motivos (sin imprimir su contenido):');
  console.error(findings.slice(0, 120).join('\n'));
  if (findings.length > 120) console.error(`... y ${findings.length - 120} hallazgos adicionales.`);
  process.exit(1);
}
console.log('Sin indicadores automáticos de datos o identidad Caudal. Revisar el DDL completo antes de instalar.');
