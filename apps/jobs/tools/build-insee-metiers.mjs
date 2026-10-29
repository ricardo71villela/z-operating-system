#!/usr/bin/env node
/* ============================================================
   Z JOBS — données INSEE des pages « salaire par métier » (/salaire/…)

   Source : Insee, Base Tous salariés 2023, fichier détail « Postes »
   (FD_POSTAN_2023, échantillon au 1/12) — https://www.insee.fr/fr/statistiques/8730395

   node apps/jobs/tools/build-insee-metiers.mjs <FD_POSTAN_2023.csv> <Varmod_POSTAN_2023.csv>

   Champ retenu : postes non annexes (FILT = 1), emplois ordinaires
   (TYP_EMPLOI = O), à temps complet (CPFD = C) et présents toute l'année
   (DUREE = 360). Pour ces postes, la tranche de salaire brut annuel
   (TRBRUTT) est donc un salaire annuel à temps plein.

   Écrit apps/jobs/apps/api/src/data/inseeMetiers2023.ts : pour chaque
   profession (PCS-ESE, 4 caractères) et chaque profession × département
   (lieu de travail, DEPT) ayant au moins MIN_SAMPLE postes dans
   l'échantillon, le nombre de postes par tranche. Les quantiles sont
   calculés par les pages (interpolation dans la tranche).
   ============================================================ */
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [csvPath, varmodPath] = process.argv.slice(2);
if (!csvPath || !varmodPath) { console.error('usage : build-insee-metiers.mjs <FD_POSTAN_2023.csv> <Varmod_POSTAN_2023.csv>'); process.exit(1); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api', 'src', 'data', 'inseeMetiers2023.ts');
export const MIN_SAMPLE = 50; // postes de l'échantillon (≈ 600 postes réels)
const BRACKETS = 24; // TRBRUTT 00 … 23

// Libellés (PCS, CS, DEPT).
const labels = { PCS: new Map(), CS: new Map(), DEPT: new Map() };
for (const line of readFileSync(varmodPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
  const c = line.split(';');
  if (labels[c[0]] && c[2]) labels[c[0]].set(c[2], c[3]);
}

const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
let header = null, idx = {};
const nat = new Map(), cell = new Map(), all = new Array(BRACKETS).fill(0), dep = new Map();
const add = (map, key, b) => { let h = map.get(key); if (!h) map.set(key, h = new Array(BRACKETS).fill(0)); h[b]++; };
let kept = 0, total = 0;
for await (const line of rl) {
  if (!header) { header = line.replace(/^﻿/, '').split(';'); header.forEach((h, i) => { idx[h] = i; }); continue; }
  total++;
  const c = line.split(';');
  if (c[idx.FILT] !== '1' || c[idx.TYP_EMPLOI] !== 'O' || c[idx.CPFD] !== 'C' || c[idx.DUREE] !== '360') continue;
  const b = Number(c[idx.TRBRUTT]);
  const pcs = c[idx.PCS];
  const d = c[idx.DEPT];
  if (!Number.isInteger(b) || b < 0 || b >= BRACKETS || !pcs || !labels.PCS.has(pcs)) continue;
  kept++;
  all[b]++;
  add(nat, pcs, b);
  if (d && d !== '99' && labels.DEPT.has(d)) { add(cell, `${pcs}|${d}`, b); add(dep, d, b); }
}

const sum = (h) => h.reduce((a, x) => a + x, 0);
const pack = (h) => h.join(',');
const professions = [...nat].filter(([, h]) => sum(h) >= MIN_SAMPLE).sort(([a], [b]) => a.localeCompare(b));
const keep = new Set(professions.map(([p]) => p));
const cells = [...cell].filter(([k, h]) => keep.has(k.split('|')[0]) && sum(h) >= MIN_SAMPLE).sort(([a], [b]) => a.localeCompare(b));
const departments = [...dep].sort(([a], [b]) => a.localeCompare(b));
const csUsed = new Set(professions.map(([p]) => p.slice(0, 2)));

const out = `// apps/api/src/data/inseeMetiers2023.ts — GÉNÉRÉ par apps/jobs/tools/build-insee-metiers.mjs, ne pas modifier à la main.
//
// Source : Insee, Base Tous salariés 2023, fichier détail Postes (échantillon au 1/12).
// https://www.insee.fr/fr/statistiques/8730395
// Champ : postes non annexes, emplois ordinaires, temps complet, présents toute l'année.
// Histogrammes : nombre de postes de l'échantillon par tranche de salaire brut annuel
// (TRBRUTT 00 … 23, voir TRBRUTT_BOUNDS dans metierSalaryPages.ts), séparés par des virgules.
// Département = lieu de travail. Seuil : ${MIN_SAMPLE} postes de l'échantillon par case.

export const METIER_SAMPLE_TOTAL = ${kept};
export const METIER_ALL = '${pack(all)}';

/** [code PCS, libellé, histogramme] */
export const METIER_PROFESSIONS: [string, string, string][] = [
${professions.map(([p, h]) => `  ${JSON.stringify([p, labels.PCS.get(p), pack(h)])},`).join('\n')}
];

/** [code CS, libellé] */
export const METIER_GROUPS: [string, string][] = [
${[...csUsed].sort().map((cs) => `  ${JSON.stringify([cs, labels.CS.get(cs) ?? cs])},`).join('\n')}
];

/** [code département (lieu de travail), libellé, histogramme tous métiers] */
export const METIER_DEPARTMENTS: [string, string, string][] = [
${departments.map(([d, h]) => `  ${JSON.stringify([d, labels.DEPT.get(d), pack(h)])},`).join('\n')}
];

/** [code PCS, code département, histogramme] */
export const METIER_CELLS: [string, string, string][] = [
${cells.map(([k, h]) => `  ${JSON.stringify([...k.split('|'), pack(h)])},`).join('\n')}
];
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`Insee BTS 2023 : ${total} postes lus, ${kept} retenus ; ${professions.length} professions, ${cells.length} cases profession × département → ${OUT}`);
