// packages/domain/src/rules/i18n.ts
//
// Resolução de conteúdo traduzido com fallback (secção 14). Nunca guardar
// texto traduzível em colunas rígidas (title_en, title_fr...) — a
// translations table (migration 0001) é genérica; esta camada de domínio
// decide QUAL tradução mostrar e com que grau de confiança.

export const SUPPORTED_LOCALES = ['pt', 'en', 'fr', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(code: string): code is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

export interface TranslationEntry {
  locale: string;
  value: string;
}

export interface ResolvedTranslation {
  value: string;
  locale: Locale | null; // locale efetivamente usado; null se não houver nenhuma tradução
  isFallback: boolean;
}

/**
 * Resolve o valor de um campo traduzível para um locale pedido.
 * Ordem de fallback: locale pedido -> locale original da oferta (se
 * fornecido) -> inglês -> primeira tradução disponível -> originalValue.
 *
 * Nunca lança erro por falta de tradução — a plataforma tem de continuar
 * a funcionar mesmo com cobertura de tradução incompleta (secção 14 não
 * torna a tradução bloqueante).
 */
export function resolveTranslation(
  entries: TranslationEntry[],
  requestedLocale: string,
  originalValue: string,
  originalLocale?: string,
): ResolvedTranslation {
  const exact = entries.find((e) => e.locale === requestedLocale);
  if (exact) return { value: exact.value, locale: requestedLocale as Locale, isFallback: false };

  if (originalLocale && requestedLocale !== originalLocale) {
    const original = entries.find((e) => e.locale === originalLocale);
    if (original) return { value: original.value, locale: originalLocale as Locale, isFallback: true };
  }

  const english = entries.find((e) => e.locale === 'en');
  if (english && requestedLocale !== 'en') {
    return { value: english.value, locale: 'en', isFallback: true };
  }

  if (entries.length > 0) {
    return { value: entries[0].value, locale: entries[0].locale as Locale, isFallback: true };
  }

  return { value: originalValue, locale: (originalLocale as Locale) ?? null, isFallback: true };
}

export interface TranslationCoverageInput {
  requiredFields: string[]; // ex: ['title', 'description']
  translatedFieldsByLocale: Record<string, string[]>; // locale -> campos traduzidos
}

export interface TranslationCoverageResult {
  coverageByLocale: Record<string, number>; // 0-100 por locale
}

export function computeTranslationCoverage(input: TranslationCoverageInput): TranslationCoverageResult {
  const coverageByLocale: Record<string, number> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const translated = input.translatedFieldsByLocale[locale] ?? [];
    const covered = input.requiredFields.filter((f) => translated.includes(f)).length;
    coverageByLocale[locale] = input.requiredFields.length === 0
      ? 100
      : Math.round((covered / input.requiredFields.length) * 100);
  }
  return { coverageByLocale };
}
