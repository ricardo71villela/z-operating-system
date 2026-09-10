#!/usr/bin/env node
// Divide private/dashboard.html em módulos JS (private/chunks/chunk-N.js) pequenos
// o suficiente para cada um caber na resposta de uma Vercel Function.
//
// PORQUÊ MÓDULOS JS E NÃO FICHEIROS "SOLTOS" (.txt/.html): a Vercel impõe um
// limite rígido de 4,5 MB no corpo da resposta de qualquer Function, e o
// dashboard (com todos os dados embutidos) já passa dos 5 MB. A primeira
// tentativa desta correção guardava os pedaços como ficheiros de texto lidos
// em runtime com fs.readFileSync + "includeFiles" no vercel.json — mas o
// empacotador da Vercel não os incluiu no deployment (provavelmente por
// causa da estrutura de monorepo), e a função rebentava à procura deles.
// Em vez disso, cada pedaço vira um módulo JS (module.exports = "...") que é
// importado com require() diretamente no código — assim faz parte do próprio
// bundle da função e a Vercel inclui-o sempre, garantidamente.
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
const CHUNK_SIZE = 1_500_000; // bytes por pedaço (antes de escapar para JS) — bem abaixo do limite de 4,5 MB da Vercel

if (!fs.existsSync(SRC)) {
  console.error(`Não encontrei ${SRC}. Corre isto a partir da pasta radar-leman-web.`);
  process.exit(1);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const html = fs.readFileSync(SRC, 'utf8');
const total = html.length;
const count = Math.ceil(total / CHUNK_SIZE);

for (let i = 0; i < count; i++) {
  const part = html.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const js = 'module.exports = ' + JSON.stringify(part) + ';\n';
  fs.writeFileSync(path.join(OUT_DIR, `chunk-${i}.js`), js);
}

const requires = Array.from({ length: count }, (_, i) => `  require('./chunk-${i}.js'),`).join('\n');
const indexJs = `// Gerado por scripts/split-dashboard.js — não editar à mão.\nmodule.exports = [\n${requires}\n];\n`;
fs.writeFileSync(path.join(OUT_DIR, 'index.js'), indexJs);

console.log(`dashboard.html: ${total} caracteres -> ${count} pedaço(s) em private/chunks/`);
for (let i = 0; i < count; i++) {
  const p = path.join(OUT_DIR, `chunk-${i}.js`);
  console.log(`  chunk-${i}.js = ${fs.statSync(p).size} bytes`);
}
