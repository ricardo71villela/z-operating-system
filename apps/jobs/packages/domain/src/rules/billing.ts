// packages/domain/src/rules/billing.ts
//
// Abstrações de billing (secção 13). Não implementa pagamentos reais —
// só o modelo de produtos e a verificação de acesso a funcionalidades.
// Candidatos NUNCA passam por este módulo (secção 3.1: sempre gratuito).

export type BillingProductCode =
  | 'job_post_single'
  | 'job_post_bundle'
  | 'subscription_standard'
  | 'subscription_enterprise'
  | 'talent_search_access'
  | 'employer_branding_page'
  | 'featured_placement'
  | 'ats_integration'
  | 'career_day_listing'
  | 'market_analytics_report';

export interface BillingProduct {
  code: BillingProductCode;
  name: string;
  grantsFeatures: OrganizationFeature[];
}

export type OrganizationFeature =
  | 'publish_job_offer'
  | 'talent_search'
  | 'employer_branding_page'
  | 'featured_placement'
  | 'ats_integration'
  | 'career_day_listing'
  | 'market_analytics_report';

export const BILLING_PRODUCTS: BillingProduct[] = [
  { code: 'job_post_single', name: 'Publicação de oferta (avulso)', grantsFeatures: ['publish_job_offer'] },
  { code: 'job_post_bundle', name: 'Pacote de ofertas', grantsFeatures: ['publish_job_offer'] },
  { code: 'subscription_standard', name: 'Subscrição Standard', grantsFeatures: ['publish_job_offer', 'talent_search'] },
  {
    code: 'subscription_enterprise',
    name: 'Subscrição Enterprise',
    grantsFeatures: ['publish_job_offer', 'talent_search', 'employer_branding_page', 'ats_integration', 'market_analytics_report'],
  },
  { code: 'talent_search_access', name: 'Acesso a Talent Search', grantsFeatures: ['talent_search'] },
  { code: 'employer_branding_page', name: 'Página de Employer Branding', grantsFeatures: ['employer_branding_page'] },
  { code: 'featured_placement', name: 'Destaque de ofertas', grantsFeatures: ['featured_placement'] },
  { code: 'ats_integration', name: 'Integração ATS', grantsFeatures: ['ats_integration'] },
  { code: 'career_day_listing', name: 'Listagem em Career Day', grantsFeatures: ['career_day_listing'] },
  { code: 'market_analytics_report', name: 'Relatório de mercado', grantsFeatures: ['market_analytics_report'] },
];

export interface BillingEvent {
  organizationId: string;
  productCode: BillingProductCode;
  grantedAt: string;
  expiresAt?: string;
}

/**
 * Publicar uma oferta NUNCA depende de billing por si só — depende de
 * verificação (secção 7). O produto 'job_post_single'/'bundle'/
 * subscrições apenas removem um limite de quantidade, não a permissão
 * base. Este módulo é uma camada adicional e opcional sobre as regras
 * de jobOffer.ts, nunca um substituto delas.
 */
export function hasActiveFeature(
  events: BillingEvent[],
  organizationId: string,
  feature: OrganizationFeature,
  now: Date = new Date(),
): boolean {
  const orgEvents = events.filter((e) => e.organizationId === organizationId);
  return orgEvents.some((e) => {
    const product = BILLING_PRODUCTS.find((p) => p.code === e.productCode);
    if (!product?.grantsFeatures.includes(feature)) return false;
    if (e.expiresAt && new Date(e.expiresAt) < now) return false;
    return true;
  });
}

export function productByCode(code: BillingProductCode): BillingProduct | undefined {
  return BILLING_PRODUCTS.find((p) => p.code === code);
}

/* ---------------- Arranque: primeira oferta sempre gratuita ----------------
 *
 * Decisão de negócio (validada): quem paga é o empregador, nunca o
 * candidato (ver acima). Mas a primeira oferta publicada por cada
 * organização verificada é sempre gratuita, mesmo sem qualquer evento de
 * billing — resolve o problema de arranque (ovo-e-galinha) sem baixar a
 * fasquia de confiança: a verificação continua obrigatória, só o
 * pagamento é que fica adiado para a segunda oferta em diante.
 */
export const FREE_FIRST_JOB_POSTS = 1;

/**
 * Devolve true quando a organização já esgotou a quota de ofertas
 * gratuitas e passa a precisar de uma feature de billing ativa
 * ('publish_job_offer') para publicar mais.
 */
export function requiresBillingToPublish(alreadyPublishedCount: number): boolean {
  return alreadyPublishedCount >= FREE_FIRST_JOB_POSTS;
}

/**
 * Combina a quota gratuita com o estado de billing real. Nunca substitui
 * a verificação de jobOffer.ts — assume que quem chama já confirmou que
 * a organização está verificada antes de sequer chegar aqui.
 */
export function canPublishGivenBilling(
  events: BillingEvent[],
  organizationId: string,
  alreadyPublishedCount: number,
  now: Date = new Date(),
): boolean {
  if (!requiresBillingToPublish(alreadyPublishedCount)) return true;
  return hasActiveFeature(events, organizationId, 'publish_job_offer', now);
}
