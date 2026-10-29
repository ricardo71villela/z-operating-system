#!/usr/bin/env node
/* ============================================================
   Z JOBS — données INSEE des pages « salaire moyen » (/salaire-moyen…)

   Source : Insee, Base Tous salariés 2022, « Salaire net horaire moyen
   selon la catégorie socioprofessionnelle, le sexe et l'âge » (fichier
   salariés au lieu de résidence, hors agriculture, géographie au
   1er janvier 2024) — https://www.insee.fr/fr/statistiques/8629963

   node apps/jobs/tools/build-insee-salaires.mjs <dossier du zip décompressé>

   Lit cc_bases-tous-salaries_2022_{COM,DEP,FE}.csv et les fichiers meta_
   (libellés), et écrit apps/jobs/apps/api/src/data/inseeSalaires2022.ts.
   Les communes sans aucune valeur (secret statistique) sont écartées ; une
   case vide reste null. Valeurs arrondies au centime.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('usage : build-insee-salaires.mjs <dossier>'); process.exit(1); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api', 'src', 'data', 'inseeSalaires2022.ts');

// Ordre des valeurs dans chaque ligne (voir SALARY_FIELDS dans le fichier écrit).
const FIELDS = ['SNHM22', 'SNHMC22', 'SNHMP22', 'SNHME22', 'SNHMO22', 'SNHMF22', 'SNHMH22', 'SNHM1822', 'SNHM2622', 'SNHM5022'];

function csv(name) {
  const lines = readFileSync(join(dir, name), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(';');
  return lines.slice(1).map((l) => { const c = l.split(';'); return Object.fromEntries(header.map((h, i) => [h, c[i] ?? ''])); });
}
function labels(name) {
  const m = new Map();
  for (const r of csv(name)) if (r.COD_VAR === 'CODGEO' && r.COD_MOD) m.set(r.COD_MOD, r.LIB_MOD);
  return m;
}
const num = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100) / 100);
const values = (r) => FIELDS.map((f) => num(r[f]));

const comNames = labels('meta_cc_bases-tous-salaries_2022_COM.csv');
const depNames = labels('meta_cc_bases-tous-salaries_2022_DEP.csv');
const france = values(csv('cc_bases-tous-salaries_2022_FE.csv')[0]);
const departments = csv('cc_bases-tous-salaries_2022_DEP.csv')
  .map((r) => [r.CODGEO, depNames.get(r.CODGEO) ?? r.CODGEO, ...values(r)])
  .filter((r) => r[2] != null);
const communes = csv('cc_bases-tous-salaries_2022_COM.csv')
  .map((r) => [r.CODGEO, comNames.get(r.CODGEO) ?? r.CODGEO, ...values(r)])
  .filter((r) => r[2] != null);

const rows = (list) => list.map((r) => `  ${JSON.stringify(r)},`).join('\n');
const out = `// apps/api/src/data/inseeSalaires2022.ts — GÉNÉRÉ par apps/jobs/tools/build-insee-salaires.mjs, ne pas modifier à la main.
//
// Source : Insee, Base Tous salariés 2022 — salaire net horaire moyen (€) selon la
// catégorie socioprofessionnelle, le sexe et l'âge ; salariés au lieu de résidence,
// hors agriculture ; géographie au 1er janvier 2024. https://www.insee.fr/fr/statistiques/8629963
// Chaque ligne : [code, libellé, ...SALARY_FIELDS] ; null = non diffusé (secret statistique).

export const SALARY_FIELDS = Object.freeze(['all', 'cadres', 'intermediaires', 'employes', 'ouvriers', 'femmes', 'hommes', 'age18_25', 'age26_50', 'age50plus'] as const);
export type InseeRow = [string, string, ...(number | null)[]];

export const INSEE_FRANCE_2022: (number | null)[] = ${JSON.stringify(france)};

export const INSEE_DEPARTMENTS_2022: InseeRow[] = [
${rows(departments)}
];

export const INSEE_COMMUNES_2022: InseeRow[] = [
${rows(communes)}
];
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`INSEE 2022 : ${departments.length} départements, ${communes.length} communes → ${OUT}`);
