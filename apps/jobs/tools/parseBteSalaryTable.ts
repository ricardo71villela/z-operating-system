// tools/parseBteSalaryTable.ts
//
// Estágio 2 do parser de BTE: texto -> tabela salarial estruturada.
//
// Reconhece o formato estrutural que os anexos salariais do BTE seguem
// consistentemente (confirmado contra o documento real AHRESP/SITESE,
// BTE n.º 2 de 15 de janeiro de 2025 — ver tools/fixtures/):
//
//   ANEXO I
//   Tabela de remunerações mínimas pecuniárias de base mensais ...
//   Níveis Retribuição mínima
//   XI 1 381,00 €
//   X 1 314,00 €
//   ...
//
//   ANEXO II
//   Enquadramento em níveis de remuneração referente à tabela anexo
//   Nível XI
//   Diretor de restauração e bebidas.
//   Nível X
//   Assistente de direção;
//   Chefe de cozinha;
//   ...
//
// Este padrão (ANEXO I = tabela de níveis, ANEXO II = categoria -> nível)
// é comum a muitas convenções publicadas no BTE, mas NÃO universal —
// diferentes CCTs podem usar "Grupo" em vez de "Nível", ou não seguir
// exatamente esta estrutura de anexos. Este parser deteta quando a
// estrutura esperada não é encontrada e devolve um resultado vazio com
// avisos, em vez de adivinhar — nunca inventa uma tabela salarial.
//
// LIMITAÇÃO CONHECIDA (confirmada contra o documento real): quando o
// PDF de origem omite um ";" entre duas categorias consecutivas (existe
// pelo menos um caso confirmado no documento AHRESP/SITESE — "Assistente
// de sala de 1.ª" seguido de "Assistente de vendas de 1.ª" sem separador
// entre as duas linhas), o parser funde as duas num só nome de categoria
// em vez de as separar. É uma irregularidade da pontuação do documento
// de origem, não um bug de lógica — documentado aqui para que quem usar
// isto em produção saiba que precisa de revisão humana antes de publicar
// os dados extraídos, nunca confiar cegamente na extração automática.

export interface ParsedSalaryLevel {
  levelCode: string;
  levelRank: number;
  monthlyMinimum: number;
  currency: 'EUR';
}

export interface ParsedJobCategory {
  categoryName: string;
  levelCode: string;
}

export interface BteParseResult {
  levels: ParsedSalaryLevel[];
  categories: ParsedJobCategory[];
  warnings: string[];
}

// Números romanos até L (50) chegam para qualquer tabela salarial real
// de uma convenção coletiva — nenhuma tem dezenas de níveis.
const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

function romanToInt(roman: string): number {
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = ROMAN_VALUES[roman[i]];
    const next = ROMAN_VALUES[roman[i + 1]];
    if (next && current < next) total -= current;
    else total += current;
  }
  return total;
}

/** Converte "1 381,00" ou "978,00" (formato português) para 1381.00 / 978.00 */
function parsePortugueseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s\u00A0]/g, '').replace(',', '.');
  return Number(cleaned);
}

const ROMAN_NUMERAL_RE = '[IVXLCDM]+';

function extractSection(text: string, startMarker: string, endMarkers: string[]): string | null {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return null;
  const afterStart = text.slice(startIdx + startMarker.length);
  let endIdx = afterStart.length;
  for (const marker of endMarkers) {
    const idx = afterStart.indexOf(marker);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return afterStart.slice(0, endIdx);
}

function parseLevelsSection(sectionText: string, warnings: string[]): ParsedSalaryLevel[] {
  const levelLineRe = new RegExp(`^(${ROMAN_NUMERAL_RE})\\s+([\\d\\s\\u00A0]+,\\d{2})\\s*€?\\s*$`);
  const levels: ParsedSalaryLevel[] = [];

  for (const rawLine of sectionText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(levelLineRe);
    if (!match) continue;
    const [, levelCode, amountRaw] = match;
    const monthlyMinimum = parsePortugueseAmount(amountRaw);
    if (Number.isNaN(monthlyMinimum)) {
      warnings.push(`Não foi possível interpretar o valor "${amountRaw}" para o nível ${levelCode}.`);
      continue;
    }
    levels.push({ levelCode, levelRank: romanToInt(levelCode), monthlyMinimum, currency: 'EUR' });
  }

  return levels.sort((a, b) => a.levelRank - b.levelRank);
}

function parseCategoriesSection(sectionText: string, validLevelCodes: Set<string>, warnings: string[]): ParsedJobCategory[] {
  const levelHeaderRe = new RegExp(`^N[íi]vel\\s+(${ROMAN_NUMERAL_RE})\\s*$`, 'i');
  const categories: ParsedJobCategory[] = [];

  let currentLevel: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (!currentLevel) return;
    const joined = buffer.join(' ').trim();
    // Categorias são sempre separadas por ';', exceto a última da lista,
    // que termina a frase com '.' em vez de ';'. Dividir só por ';' evita
    // cortar dentro de ordinais portugueses como "1.ª"/"2.ª", que contêm
    // um ponto que NÃO é um separador de categoria.
    const parts = joined.split(';').map((s) => s.trim());
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      // A última categoria da lista termina com '.' (fim de frase) — remove
      // só esse ponto final, nunca pontos internos (ex: "1.ª").
      parts[parts.length - 1] = last.endsWith('.') ? last.slice(0, -1).trim() : last;
    }
    const names = parts.filter((s) => s.length > 1);
    for (const name of names) {
      categories.push({ categoryName: name, levelCode: currentLevel as string });
    }
    buffer = [];
  }

  for (const rawLine of sectionText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const headerMatch = line.match(levelHeaderRe);
    if (headerMatch) {
      flush();
      currentLevel = headerMatch[1];
      if (!validLevelCodes.has(currentLevel)) {
        warnings.push(`Nível "${currentLevel}" mencionado no Anexo II mas ausente da tabela do Anexo I.`);
      }
      continue;
    }
    if (currentLevel) buffer.push(line);
  }
  flush();

  return categories;
}

export function parseBteCollectiveAgreementText(fullText: string): BteParseResult {
  const warnings: string[] = [];

  const levelsSectionText = extractSection(fullText, 'ANEXO I', ['ANEXO II']);
  if (levelsSectionText === null) {
    return { levels: [], categories: [], warnings: ['Secção "ANEXO I" (tabela de níveis) não encontrada — estrutura do documento não reconhecida, nada foi extraído.'] };
  }
  const levels = parseLevelsSection(levelsSectionText, warnings);
  if (levels.length === 0) {
    warnings.push('Secção "ANEXO I" encontrada, mas nenhuma linha de nível/valor reconhecida dentro dela.');
  }
  const validLevelCodes = new Set(levels.map((l) => l.levelCode));

  const categoriesSectionText = extractSection(fullText, 'ANEXO II', ['ANEXO III', 'ANEXO IV']);
  let categories: ParsedJobCategory[] = [];
  if (categoriesSectionText === null) {
    warnings.push('Secção "ANEXO II" (categorias por nível) não encontrada — só a tabela de níveis foi extraída.');
  } else {
    categories = parseCategoriesSection(categoriesSectionText, validLevelCodes, warnings);
  }

  return { levels, categories, warnings };
}
