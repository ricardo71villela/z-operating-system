#!/usr/bin/env node
// Gera private/fichas-data/ a partir de private/dashboard.html: para cada
// morada, so os campos que a ficha PDF mostra (api/_fiche-pdf.js), no indice
// fichaIdx do dashboard. Node puro, sem dependencias.
//
// Uso: node scripts/build-fichas-data.js
// (correr depois de qualquer alteracao a private/dashboard.html, tal como
// scripts/split-dashboard.js)

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const OUT = path.join(SITE, 'private', 'fichas-data');
const SHARD = 1000;

const html = fs.readFileSync(path.join(SITE, 'private', 'dashboard.html'), 'utf8');
const blob = (key) => {
  const m = html.match(new RegExp(key + "\\s*=\\s*'([^']*)'"));
  if (!m) throw new Error(key + ' nao encontrado em dashboard.html');
  return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
};
const colsMatch = html.match(/const COLS = \[([\s\S]*?)\];/);
if (!colsMatch) throw new Error('COLS nao encontrado em dashboard.html');
const COLS = colsMatch[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
const I = Object.fromEntries(COLS.map((c, i) => [c, i]));
for (const k of ['adresse', 'tipo', 'superficie', 'superficieDpe', 'ano', 'dpe', 'prixm2', 'valor',
  'comparaveis', 'argPrudent', 'argDpe', 'fichaIdx']) {
  if (!(k in I)) throw new Error('coluna em falta no dashboard: ' + k);
}

const leads = blob('_LEADS_B64');
const rows = [];
for (const r of leads) {
  const n = r[I.fichaIdx];
  if (n == null) continue;
  const surface = r[I.superficie] != null ? r[I.superficie] : r[I.superficieDpe];
  // Ordem dos campos = FIELDS em api/_fiche-pdf.js
  rows[n] = [r[I.adresse], r[I.tipo], surface, r[I.ano], r[I.dpe], r[I.prixm2], r[I.valor],
    r[I.comparaveis], r[I.argPrudent], r[I.argDpe]];
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const names = [];
for (let s = 0; s * SHARD < rows.length; s++) {
  const part = rows.slice(s * SHARD, (s + 1) * SHARD).map(x => x || null);
  const name = `shard-${s}.js`;
  fs.writeFileSync(path.join(OUT, name), 'module.exports = ' + JSON.stringify(part) + ';\n');
  names.push(name);
}
fs.writeFileSync(path.join(OUT, 'index.js'),
  '// Gerado por scripts/build-fichas-data.js — nao editar a mao.\n' +
  '// Indice n = fichaIdx do dashboard; cada morada = campos da ficha PDF.\n' +
  'module.exports = [\n' + names.map(n => `  ...require('./${n}'),\n`).join('') + '];\n');

const bytes = names.reduce((s, n) => s + fs.statSync(path.join(OUT, n)).size, 0);
console.log(`fichas-data: ${rows.length} moradas em ${names.length} pedaços (${(bytes / 1e6).toFixed(1)} MB)`);
