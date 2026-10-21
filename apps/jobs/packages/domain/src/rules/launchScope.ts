// packages/domain/src/rules/launchScope.ts
//
// Launch scope (decision: Ricardo, 2026-10-22): Z Jobs launches in
// France, Belgium and Luxembourg only, in French and English — the same
// scope as Z Find.
//
// The rules and data written earlier for Portugal, Italy, Spain and
// Germany stay in the code base (as Switzerland did in Z Find); they are
// simply not served while outside this scope. Widening the launch is a
// one-line change here.

export const LAUNCH_COUNTRIES = ['FR', 'BE', 'LU'] as const;
export type LaunchCountry = (typeof LAUNCH_COUNTRIES)[number];

export const LAUNCH_LOCALES = ['fr', 'en'] as const;
export type LaunchLocale = (typeof LAUNCH_LOCALES)[number];

/** Language used when none (or one outside the scope) is asked for. */
export const DEFAULT_LOCALE: LaunchLocale = 'fr';

export function isLaunchCountry(code: string | null | undefined): code is LaunchCountry {
  return typeof code === 'string' && (LAUNCH_COUNTRIES as readonly string[]).includes(code.trim().toUpperCase());
}

export function isLaunchLocale(code: string | null | undefined): code is LaunchLocale {
  return typeof code === 'string' && (LAUNCH_LOCALES as readonly string[]).includes(code.trim().toLowerCase());
}

/**
 * The launch language to answer in: the requested one when it is in the
 * scope ('fr', 'en', also 'fr-BE', 'en-GB'…), the default otherwise.
 */
export function launchLocaleOrDefault(code: string | null | undefined): LaunchLocale {
  if (typeof code !== 'string') return DEFAULT_LOCALE;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return isLaunchLocale(base) ? base : DEFAULT_LOCALE;
}
