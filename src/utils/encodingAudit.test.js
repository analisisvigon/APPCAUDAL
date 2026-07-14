import fs from 'node:fs';
import path from 'node:path';

const BROKEN_ENCODING_PATTERN = /\u00c3|\u00c2|\u00e2\u20ac|\ufffd/;
const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['.git', 'dist', 'node_modules']);
const CHECKED_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.sql',
  '.ts',
  '.tsx',
]);

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : walk(fullPath);
    }
    return CHECKED_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};

const failures = walk(ROOT).flatMap((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).flatMap((line, index) => (
    BROKEN_ENCODING_PATTERN.test(line)
      ? [`${path.relative(ROOT, filePath)}:${index + 1}: ${line.trim()}`]
      : []
  ));
});

if (failures.length) {
  console.error('Broken encoding patterns found:');
  failures.slice(0, 80).forEach((failure) => console.error(failure));
  if (failures.length > 80) console.error(`...and ${failures.length - 80} more`);
  process.exit(1);
}

console.log('Encoding audit passed.');
