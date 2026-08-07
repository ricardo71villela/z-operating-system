// tools/ingestEscoOccupations.ts
//
// Transforma recursos ESCO (formato JSON HAL, ver escoClient.ts) em
// linhas prontas para a tabela `occupations` (migration 0021). Esta é a
// parte que está testada a sério (ver ingestEscoOccupations.test.ts) —
// ao contrário de escoClient.ts, que faz as chamadas de rede em si.

import type { EscoOccupationResource } from './escoClient';

export interface OccupationRow {
  isco08Code: string;
  majorGroupCode: string;
  majorGroupLabelPt: string;
  preferredLabelPt: string;
  preferredLabelEn: string;
  source: 'ESCO';
  sourceUrl: string;
}

/**
 * Rótulos oficiais dos 10 grandes grupos da ISCO-08/CPP-2010 — usados
 * porque o major_group_label_pt não vem diretamente do recurso da
 * profissão na API ESCO (vem do grupo ISCO pai), e re-consultar a API
 * por cada profissão só para obter o rótulo do grande grupo seria
 * caro. É uma tabela pequena e estável (a OIT não revê a ISCO-08 há
 * mais de 15 anos), por isso está aqui como constante.
 */
export const ISCO08_MAJOR_GROUP_LABELS_PT: Record<string, string> = {
  '0': 'Profissões das Forças Armadas',
  '1': 'Representantes do poder legislativo e de órgãos executivos, dirigentes, diretores e gestores executivos',
  '2': 'Especialistas das atividades intelectuais e científicas',
  '3': 'Técnicos e profissões de nível intermédio',
  '4': 'Pessoal administrativo',
  '5': 'Trabalhadores dos serviços pessoais, de proteção e segurança e vendedores',
  '6': 'Agricultores e trabalhadores qualificados da agricultura, pesca e floresta',
  '7': 'Trabalhadores qualificados da indústria, construção e artífices',
  '8': 'Operadores de instalações e máquinas e trabalhadores da montagem',
  '9': 'Trabalhadores não qualificados',
};

/**
 * A notação ISCO-08 (código de 4 dígitos) vem no campo `code` do
 * recurso ESCO quando presente. Nem todo recurso "occupation" da ESCO
 * tem um código ISCO-08 direto e válido (alguns são conceitos
 * intermédios) — devolve null nesses casos em vez de inventar um código,
 * e quem chama deve ignorar essa entrada.
 */
function extractIsco08Code(resource: EscoOccupationResource): string | null {
  if (!resource.code) return null;
  const trimmed = resource.code.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

export interface IngestWarning {
  uri: string;
  reason: string;
}

export interface IngestResult {
  rows: OccupationRow[];
  warnings: IngestWarning[];
}

/**
 * Transforma uma lista de recursos ESCO (já obtidos via escoClient, um
 * por idioma pedido) em linhas para `occupations`. Recebe os recursos
 * em PT e EN emparelhados pelo mesmo URI — a API ESCO devolve um
 * recurso por pedido/idioma, não os dois de uma vez.
 */
export function transformEscoOccupations(
  resourcesByUri: Map<string, { pt?: EscoOccupationResource; en?: EscoOccupationResource }>,
): IngestResult {
  const rows: OccupationRow[] = [];
  const warnings: IngestWarning[] = [];

  for (const [uri, { pt, en }] of resourcesByUri) {
    const primary = pt ?? en;
    if (!primary) {
      warnings.push({ uri, reason: 'Sem recurso em nenhum idioma pedido — ignorado.' });
      continue;
    }

    const isco08Code = extractIsco08Code(primary);
    if (!isco08Code) {
      warnings.push({ uri, reason: 'Sem código ISCO-08 de 4 dígitos válido — ignorado (provavelmente um conceito intermédio, não uma profissão folha).' });
      continue;
    }

    const majorGroupCode = isco08Code[0];
    const majorGroupLabelPt = ISCO08_MAJOR_GROUP_LABELS_PT[majorGroupCode];
    if (!majorGroupLabelPt) {
      warnings.push({ uri, reason: `Grande grupo ISCO-08 "${majorGroupCode}" desconhecido — ignorado.` });
      continue;
    }

    if (!pt) warnings.push({ uri, reason: 'Sem tradução em português — a usar o rótulo em inglês para ambos os campos.' });
    if (!en) warnings.push({ uri, reason: 'Sem versão em inglês — a usar o rótulo em português para ambos os campos.' });

    rows.push({
      isco08Code,
      majorGroupCode,
      majorGroupLabelPt,
      preferredLabelPt: (pt ?? en)!.title,
      preferredLabelEn: (en ?? pt)!.title,
      source: 'ESCO',
      sourceUrl: uri,
    });
  }

  return { rows, warnings };
}
