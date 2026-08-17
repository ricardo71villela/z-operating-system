#!/usr/bin/env node
// Orquestra a proteção contra regressão visual: serve app/my-studio.html,
// gera goldens candidatos, compara contra goldens/ (referência), reporta.
//
// npm run test:visual — corre isto. Sai com código != 0 se algo mudou
// visualmente sem intenção (útil em CI para bloquear merges).
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const CANDIDATE_DIR = path.join(ROOT, 'goldens-candidate');
const PORT = 8793;

function log(...args) { console.log('[test:visual]', ...args); }

async function main() {
  log('a servir app/ em http://localhost:' + PORT);
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.join(ROOT, 'app')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));

  try {
    log('a gerar goldens candidatos...');
    const electronBin = path.join(ROOT, 'tests', 'node_modules', '.bin', 'electron');
    const gen = spawnSync(electronBin, ['--no-sandbox', '--disable-gpu', '--ozone-platform=headless', path.join(ROOT, 'tests', 'visual', 'generate-goldens.js')], {
      env: { ...process.env, MYSTUDIO_GOLDENS_OUT: CANDIDATE_DIR, MYSTUDIO_URL: `http://localhost:${PORT}/my-studio.html` },
      stdio: 'inherit',
    });
    if (gen.status !== 0) {
      log('❌ falha ao gerar goldens candidatos');
      process.exitCode = 1;
      return;
    }

    log('a comparar contra goldens/ de referência...');
    const cmp = spawnSync('python3', [path.join(ROOT, 'tests', 'visual', 'compare-goldens.py')], { stdio: 'inherit' });
    process.exitCode = cmp.status;
  } finally {
    server.kill();
    fs.rmSync(CANDIDATE_DIR, { recursive: true, force: true });
  }
}

main();
