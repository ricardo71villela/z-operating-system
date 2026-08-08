// tools/ingestEscoToSql.ts
//
// Script de orquestração: percorre toda a árvore de profissões da ESCO
// (~3000), transforma-as em linhas de `occupations`, e gera uma
// migration SQL pronta a aplicar. Não corre neste sandbox (sem rede
// para ec.europa.eu — ver aviso em escoClient.ts), mas está pronto a
// correr num ambiente com rede real:
//
//   npx tsx tools/ingestEscoToSql.ts > migrations/0024_esco_occupations_full.sql
//
// Corre em lotes pequenos com pausa entre pedidos, para não sobrecarregar
// a API pública da Comissão Europeia — ~3000 profissões x 2 idiomas
// (PT+EN) = ~6000 pedidos, a um ritmo respeitoso demora várias horas,
// de propósito.

import { walkAllOccupations, fetchOccupation } from './escoClient';
import { transformEscoOccupations } from './ingestEscoOccupations';
import type { EscoOccupationResource } from './escoClient';

const BATCH_SIZE = 20;
const DELAY_MS_BETWEEN_BATCHES = 2000; // respeito pela API pública, não é nosso servidor

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function main() {
  const resourcesByUri = new Map<string, { pt?: EscoOccupationResource; en?: EscoOccupationResource }>();
  let count = 0;
  let batch: string[] = [];

  console.error('A percorrer a árvore de profissões ESCO (isto demora — ~3000 profissões)...');

  for await (const occEn of walkAllOccupations('en')) {
    batch.push(occEn.uri);
    resourcesByUri.set(occEn.uri, { en: occEn });
    count++;

    if (batch.length >= BATCH_SIZE) {
      for (const uri of batch) {
        try {
          const occPt = await fetchOccupation(uri, 'pt');
          const existing = resourcesByUri.get(uri);
          if (existing) existing.pt = occPt;
        } catch {
          // sem tradução PT disponível para esta profissão — fica só com EN,
          // o transformador já sabe lidar com isso (ver ingestEscoOccupations.ts)
        }
      }
      batch = [];
      console.error(`  ...${count} profissões processadas`);
      await sleep(DELAY_MS_BETWEEN_BATCHES);
    }
  }

  const { rows, warnings } = transformEscoOccupations(resourcesByUri);

  console.error(`\n${rows.length} profissões válidas, ${warnings.length} avisos.`);
  for (const w of warnings.slice(0, 20)) console.error(`  [aviso] ${w.uri}: ${w.reason}`);
  if (warnings.length > 20) console.error(`  ...e mais ${warnings.length - 20} avisos.`);

  console.log('-- Gerado automaticamente por tools/ingestEscoToSql.ts a partir da ESCO API.');
  console.log('-- Fonte: https://esco.ec.europa.eu — NUNCA editar à mão, voltar a correr o script.');
  console.log('begin;');
  for (const row of rows) {
    console.log(
      `insert into occupations (isco08_code, major_group_code, major_group_label_pt, preferred_label_pt, preferred_label_en, source, source_url) values ` +
      `('${escapeSql(row.isco08Code)}', '${escapeSql(row.majorGroupCode)}', '${escapeSql(row.majorGroupLabelPt)}', '${escapeSql(row.preferredLabelPt)}', '${escapeSql(row.preferredLabelEn)}', 'ESCO', '${escapeSql(row.sourceUrl)}') ` +
      `on conflict (isco08_code) do update set preferred_label_pt = excluded.preferred_label_pt, preferred_label_en = excluded.preferred_label_en, source_url = excluded.source_url;`,
    );
  }
  console.log('commit;');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
