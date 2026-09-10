#!/usr/bin/env node
// Divide private/dashboard.html em pedaços (private/chunks/chunk-N.txt) pequenos
// o suficiente para cada um caber na resposta de uma Vercel Function.
//
// PORQUÊ ISTO EXISTE: a Vercel impõe um limite rígido de 4,5 MB no corpo da
// resposta de qualquer Function. O dashboard (com todos os dados embutidos)
// já passa dos 5 MB e só tende a crescer com o dataset. Uma única Function
// não consegue devolver o ficheiro inteiro de uma vez — por isso ele é
// dividido em pedaços bem abaixo do limite, e o browser, depois de
// autenticado, pede cada pedaço a "/api/chunk?n=I" e reconstrói a página.
//
// Corre isto sempre que private/dashboard.html for substituído (nova
// execução do pipeline):
//
//   node scripts/split-dashboard.js
//
// depois "git add -A && git commit -m '...' && git push" como habitual.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'private', 'dashboard.html');
const OUT_DIR = path.join(ROOT, 'private', 'chunks');
const CHUNK_SIZE = 1_500_000; // bytes por pedaço — bem abaixo do limite de 4,5 MB da Vercel

if (!fs.existsSync(SRC)) {
  console.error(`Não encontrei ${SRC}. Corre isto a partir da pasta radar-leman-web.`);
  process.exit(1);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const data = fs.readFileSync(SRC);
const total = data.length;
const count = Math.ceil(total / CHUNK_SIZE);

for (let i = 0; i < count; i++) {
  const part = data.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  fs.writeFileSync(path.join(OUT_DIR, `chunk-${i}.txt`), part);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify({ count, totalBytes: total, chunkSize: CHUNK_SIZE })
);

console.log(`dashboard.html: ${total} bytes -> ${count} pedaço(s) em private/chunks/`);
for (let i = 0; i < count; i++) {
  const p = path.join(OUT_DIR, `chunk-${i}.txt`);
  console.log(`  chunk-${i}.txt = ${fs.statSync(p).size} bytes`);
}
