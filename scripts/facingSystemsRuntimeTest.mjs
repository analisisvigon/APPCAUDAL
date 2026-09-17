import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const waitForHttp = async (url, description, timeoutMs = 30000, processHandle = null, getProcessLog = () => '') => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (processHandle?.exitCode !== null) {
      throw new Error(`${description} termino antes de estar disponible.\n${getProcessLog()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // El servidor o Chrome todavia estan arrancando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Tiempo agotado esperando ${description}: ${url}`);
};

const browserCandidates = [
  process.env.CHROME_PATH,
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : '',
  process.platform === 'win32' ? join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : '',
  process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
  process.platform === 'linux' ? '/usr/bin/google-chrome' : '',
  process.platform === 'linux' ? '/usr/bin/chromium' : '',
].filter(Boolean);

const browserPath = browserCandidates.find(existsSync);
assert.ok(browserPath, 'No se encontro Chrome/Edge. Define CHROME_PATH.');

const [appPort, cdpPort] = await Promise.all([reservePort(), reservePort()]);
const profileDirectory = await mkdtemp(join(tmpdir(), 'appcaudal-facing-systems-'));
const appUrl = `http://127.0.0.1:${appPort}`;
const cdpUrl = `http://127.0.0.1:${cdpPort}`;
const viteBinary = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const auditScript = join(repoRoot, 'scripts', 'facingSystemsRuntimeAudit.mjs');

const vite = spawn(process.execPath, [viteBinary, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let viteLog = '';
vite.stdout.on('data', (chunk) => { viteLog += chunk; });
vite.stderr.on('data', (chunk) => { viteLog += chunk; });
let browser = null;

const stopProcess = async (processHandle) => {
  if (!processHandle || processHandle.exitCode !== null) return;
  const exited = new Promise((resolve) => processHandle.once('exit', resolve));
  processHandle.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
};

const runAudit = (argumentsList) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [auditScript, ...argumentsList], {
    cwd: repoRoot,
    env: { ...process.env, FACING_SYSTEMS_CDP: cdpUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Fallo runtime (${argumentsList.join(' ')}).\n${stdout}\n${stderr}`));
  });
});

try {
  await waitForHttp(`${appUrl}/qa-facing-systems.html`, 'Vite', 30000, vite, () => viteLog);
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDirectory}`,
    `${appUrl}/qa-facing-systems.html?analysis=full`,
  ], { cwd: repoRoot, stdio: 'ignore' });
  await waitForHttp(`${cdpUrl}/json/list`, 'Chrome DevTools Protocol', 30000, browser);

  const viewports = ['390x844', '768x1024', '1440x900', '1920x1080'];
  for (const viewport of viewports) {
    await runAudit([`--viewport=${viewport}`]);
    process.stdout.write(`Sistemas Enfrentados con datos: ${viewport} OK\n`);
  }
  for (const viewport of viewports) {
    await runAudit(['--empty', `--viewport=${viewport}`]);
    process.stdout.write(`Sistemas Enfrentados sin analisis: ${viewport} OK\n`);
  }
} finally {
  await Promise.all([stopProcess(browser), stopProcess(vite)]);
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
