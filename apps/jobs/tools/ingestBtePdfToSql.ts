// tools/ingestBtePdfToSql.ts
//
// Junta os dois estágios (pdfToText.ts + parseBteSalaryTable.ts) numa
// ferramenta de linha de comandos: dado um PDF local do BTE já
// descarregado, gera o SQL de seed para collective_agreements +
// collective_agreement_salary_levels + collective_agreement_job_categories.
//
//   npx tsx tools/ingestBtePdfToSql.ts \
//     --pdf ./downloads/bte2-2025.pdf \
//     --name "CCT Restauração e Bebidas (AHRESP/SITESE)" \
//     --sector "Restauração e bebidas" \
//     --country PT \
//     --employer "AHRESP" \
//     --union "SITESE" \
//     --bte-reference "Boletim do Trabalho e Emprego n.º 2, 15 de janeiro de 2025" \
//     --source-url "https://bte.gep.msess.gov.pt/documentos/2025/2/00510058.pdf" \
//     --effective-from 2025-01-01 --effective-to 2025-12-31 \
//     > migrations/00XX_cct_novo.sql
//
// SEMPRE revê o resultado antes de aplicar — o parser sinaliza avisos
// (ver "warnings" no output), mas não substitui revisão humana,
// especialmente para convenções com formatação irregular (ver
// limitação conhecida documentada em parseBteSalaryTable.ts).

import { extractTextFromPdfPath } from './pdfToText';
import { parseBteCollectiveAgreementText } from './parseBteSalaryTable';

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['pdf', 'name', 'sector', 'country', 'employer', 'union', 'bte-reference', 'source-url', 'effective-from', 'effective-to'];
  const missing = required.filter((r) => !args[r]);
  if (missing.length > 0) {
    console.error(`Faltam argumentos obrigatórios: ${missing.join(', ')}`);
    process.exit(1);
  }

  const text = await extractTextFromPdfPath(args.pdf);
  const result = parseBteCollectiveAgreementText(text);

  console.error(`${result.levels.length} níveis, ${result.categories.length} categorias, ${result.warnings.length} avisos.`);
  for (const w of result.warnings) console.error(`  [aviso] ${w}`);

  if (result.levels.length === 0) {
    console.error('\nNenhum nível extraído — nada a gerar. Revê o PDF de origem e/ou o parser.');
    process.exit(1);
  }

  console.log(`-- Gerado automaticamente por tools/ingestBtePdfToSql.ts a partir de ${args.pdf}`);
  console.log(`-- Fonte oficial: ${args['bte-reference']} — ${args['source-url']}`);
  console.log('-- REVISTO E CONFIRMADO POR: ____________________ (preencher antes de aplicar)');
  console.log('do $$');
  console.log('declare v_agreement_id uuid;');
  for (const l of result.levels) console.log(`declare v_level_${l.levelCode.toLowerCase()} uuid;`);
  console.log('begin');
  console.log(`  insert into collective_agreements (
    name, sector_description, country_code, party_employer, party_union,
    source_document_reference, source_url, salary_table_effective_from, salary_table_effective_to
  ) values (
    '${escapeSql(args.name)}', '${escapeSql(args.sector)}', '${escapeSql(args.country)}',
    '${escapeSql(args.employer)}', '${escapeSql(args.union)}',
    '${escapeSql(args['bte-reference'])}', '${escapeSql(args['source-url'])}',
    '${args['effective-from']}', '${args['effective-to']}'
  ) returning id into v_agreement_id;`);

  for (const l of result.levels) {
    console.log(
      `  insert into collective_agreement_salary_levels (agreement_id, level_code, level_rank, monthly_minimum, currency) ` +
      `values (v_agreement_id, '${escapeSql(l.levelCode)}', ${l.levelRank}, ${l.monthlyMinimum}, '${l.currency}') ` +
      `returning id into v_level_${l.levelCode.toLowerCase()};`,
    );
  }

  for (const c of result.categories) {
    console.log(
      `  insert into collective_agreement_job_categories (agreement_id, level_id, category_name) ` +
      `values (v_agreement_id, v_level_${c.levelCode.toLowerCase()}, '${escapeSql(c.categoryName)}');`,
    );
  }

  console.log('end $$;');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
