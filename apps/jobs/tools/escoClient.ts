// tools/escoClient.ts
//
// Cliente para a ESCO REST API (Comissão Europeia), segundo a
// documentação oficial: https://ec.europa.eu/esco/api/doc/esco-api-doc.pdf
//
// AVISO HONESTO: este ficheiro NÃO foi testado contra uma resposta real
// da API neste ambiente — a rede do sandbox só permite alcançar URLs já
// vistas antes numa pesquisa, e nenhum pedido com estes parâmetros de
// query apareceu literalmente num resultado de pesquisa (mesma
// limitação documentada em pdfToText.ts para o BTE). O que está aqui
// segue exatamente a estrutura documentada oficialmente (classes de
// recurso, formato JSON HAL, parâmetros `uri`/`language`) — mas a prova
// de correção real fica limitada à camada de transformação
// (ingestEscoOccupations.ts), testada contra um fixture fiel à
// documentação, não uma chamada ao vivo.

const ESCO_API_BASE = 'https://ec.europa.eu/esco/api';
export const ESCO_OCCUPATIONS_SCHEME_URI = 'http://data.europa.eu/esco/concept-scheme/occupations';
export const ESCO_ISCO_CODELIST_URI = 'http://data.europa.eu/esco/Notation/ISCO08';

export interface EscoLink {
  uri: string;
  href: string;
  title: string;
  code?: string;
}

export interface EscoOccupationResource {
  title: string;
  uri: string;
  description?: { en?: { literal: string } };
  code?: string; // notação ISCO-08, quando presente
  _links: {
    self: EscoLink;
    broaderIscoGroup?: EscoLink[];
    narrowerOccupation?: EscoLink[];
    [key: string]: EscoLink | EscoLink[] | undefined;
  };
}

export interface EscoTaxonomyResource {
  title: string;
  uri: string;
  _links: {
    self: EscoLink;
    hasTopConcept?: EscoLink[];
    narrower?: EscoLink[];
    [key: string]: EscoLink | EscoLink[] | undefined;
  };
}

/** GET /resource/occupation?uri=...&language=... */
export async function fetchOccupation(uri: string, language: string): Promise<EscoOccupationResource> {
  const url = `${ESCO_API_BASE}/resource/occupation?uri=${encodeURIComponent(uri)}&language=${language}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESCO API ${res.status} para ${uri}`);
  return res.json();
}

/** GET /resource/taxonomy?uri=...&language=... — para navegar a hierarquia (ISCO groups -> profissões). */
export async function fetchTaxonomy(uri: string, language: string): Promise<EscoTaxonomyResource> {
  const url = `${ESCO_API_BASE}/resource/taxonomy?uri=${encodeURIComponent(uri)}&language=${language}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESCO API ${res.status} para ${uri}`);
  return res.json();
}

/**
 * Percorre toda a árvore de profissões (~3000) a partir do esquema
 * "ESCO Occupations", seguindo os links `hasTopConcept`/`narrower` até
 * chegar às folhas (recursos do tipo occupation, sem mais `narrower`).
 * Gerador assíncrono — processa uma profissão de cada vez, sem carregar
 * as ~3000 em memória de uma vez, e permite parar/retomar por lote.
 */
export async function* walkAllOccupations(language: string): AsyncGenerator<EscoOccupationResource> {
  const root = await fetchTaxonomy(ESCO_OCCUPATIONS_SCHEME_URI, language);
  const topConcepts = root._links.hasTopConcept ?? [];

  async function* walk(uri: string): AsyncGenerator<EscoOccupationResource> {
    // Tenta como occupation (folha); se não for, é um grupo ISCO (taxonomy) com narrower.
    try {
      const occ = await fetchOccupation(uri, language);
      yield occ;
      return;
    } catch {
      // não é uma occupation folha — continua como grupo
    }
    const group = await fetchTaxonomy(uri, language);
    const children = group._links.narrower ?? [];
    for (const child of children) {
      yield* walk(child.uri);
    }
  }

  for (const top of topConcepts) {
    yield* walk(top.uri);
  }
}
