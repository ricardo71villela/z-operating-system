// apps/api/src/errorMessages.ts
//
// Mensagens de erro da API nas línguas do lançamento (fr, en).
//
// O código das rotas continua a escrever a mensagem interna (português,
// histórico do projeto). Na saída, flushPendingResponse() troca-a pela
// versão na língua pedida (?locale=fr|en, francês por omissão) e junta
// um `code` estável que os clientes podem testar sem depender do texto.
// Mensagem desconhecida -> passa sem tradução, com code 'unknown_error',
// e o teste errorMessages.test.ts garante que todas as mensagens
// literais de server.ts estão neste catálogo.

export type ErrorLocale = 'fr' | 'en';

interface ErrorEntry {
  code: string;
  match: string | RegExp;
  fr: string;
  en: string;
}

// {1}, {2}… = grupos capturados pela RegExp.
export const ERROR_CATALOG: ErrorEntry[] = [
  { code: 'not_authenticated', match: 'não autenticado', fr: 'Vous devez être connecté.', en: 'You must be signed in.' },
  { code: 'staff_only', match: 'ação reservada a staff da plataforma', fr: 'Action réservée à l’équipe de la plateforme.', en: 'Action reserved for platform staff.' },
  { code: 'postgres_required', match: 'disponível só com Postgres', fr: 'Service indisponible pour le moment.', en: 'Service unavailable for now.' },
  { code: 'postgres_required', match: 'só disponível com Postgres real ligado', fr: 'Service indisponible pour le moment.', en: 'Service unavailable for now.' },
  { code: 'auth_unavailable', match: 'autenticação só está disponível com Postgres real ligado (DATABASE_URL)', fr: 'La connexion est indisponible pour le moment.', en: 'Sign-in is unavailable for now.' },
  { code: 'not_found', match: 'não encontrado', fr: 'Introuvable.', en: 'Not found.' },
  { code: 'not_found', match: 'not found', fr: 'Introuvable.', en: 'Not found.' },
  { code: 'not_found', match: /^(organization|job offer|application|report) \S+ not found$/, fr: 'Introuvable.', en: 'Not found.' },
  { code: 'report_not_found', match: 'report not found', fr: 'Signalement introuvable.', en: 'Report not found.' },
  { code: 'invalid_credentials', match: 'email ou password inválidos', fr: 'E-mail ou mot de passe incorrect.', en: 'Incorrect email or password.' },
  { code: 'email_taken', match: 'já existe uma conta com este email', fr: 'Un compte existe déjà avec cette adresse e-mail.', en: 'An account already exists with this email address.' },
  { code: 'terms_required', match: 'é preciso aceitar os Termos de Serviço e a Política de Privacidade para criar conta', fr: 'Vous devez accepter les conditions d’utilisation et la politique de confidentialité pour créer un compte.', en: 'You must accept the Terms of Service and the Privacy Policy to create an account.' },
  { code: 'staff_bootstrap_done', match: 'já existe staff da plataforma — bootstrap só funciona uma vez', fr: 'L’équipe de la plateforme existe déjà : cette initialisation n’est possible qu’une fois.', en: 'Platform staff already exists: this setup can only run once.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode editar este perfil', fr: 'Seul le candidat peut modifier ce profil.', en: 'Only the candidate can edit this profile.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode verificar o seu CV', fr: 'Seul le candidat peut analyser son CV.', en: 'Only the candidate can check their CV.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode verificar a sua carta', fr: 'Seul le candidat peut analyser sa lettre.', en: 'Only the candidate can check their letter.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode ver os seus alertas', fr: 'Seul le candidat peut voir ses alertes.', en: 'Only the candidate can see their alerts.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode criar alertas', fr: 'Seul le candidat peut créer des alertes.', en: 'Only the candidate can create alerts.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode ver as suas ofertas guardadas', fr: 'Seul le candidat peut voir ses offres enregistrées.', en: 'Only the candidate can see their saved offers.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode guardar ofertas', fr: 'Seul le candidat peut enregistrer des offres.', en: 'Only the candidate can save offers.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode remover ofertas guardadas', fr: 'Seul le candidat peut retirer des offres enregistrées.', en: 'Only the candidate can remove saved offers.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode ver as suas ofertas correspondentes', fr: 'Seul le candidat peut voir les offres qui lui correspondent.', en: 'Only the candidate can see their matching offers.' },
  { code: 'candidate_only', match: 'só o próprio candidato pode ver as suas candidaturas', fr: 'Seul le candidat peut voir ses candidatures.', en: 'Only the candidate can see their applications.' },
  { code: 'candidate_or_staff_only', match: 'só o próprio candidato, ou staff, pode descarregar este documento', fr: 'Seul le candidat ou l’équipe de la plateforme peut télécharger ce document.', en: 'Only the candidate or platform staff can download this document.' },
  { code: 'candidate_or_staff_only', match: 'só o próprio candidato, ou staff a seu pedido, pode acionar isto', fr: 'Seul le candidat, ou l’équipe de la plateforme à sa demande, peut faire cette action.', en: 'Only the candidate, or platform staff at their request, can do this.' },
  { code: 'experience_incomplete', match: 'experiência precisa de cargo, empresa e data de início', fr: 'Une expérience doit avoir un poste, une entreprise et une date de début.', en: 'An experience needs a job title, a company and a start date.' },
  { code: 'unknown_location', match: 'localidade desconhecida', fr: 'Localité inconnue : choisissez-la dans la liste.', en: 'Unknown place: pick it from the list.' },
  { code: 'candidate_profile_missing', match: 'perfil de candidato ainda não preenchido', fr: 'Votre profil de candidat n’est pas encore rempli.', en: 'Your candidate profile is not filled in yet.' },
  { code: 'candidate_withdraw_only', match: 'candidato só pode retirar a candidatura (withdrawn)', fr: 'En tant que candidat, vous pouvez seulement retirer votre candidature.', en: 'As a candidate, you can only withdraw your application.' },
  { code: 'organization_only', match: 'só a própria organização pode editar a sua classificação', fr: 'Seule l’organisation peut modifier sa classification.', en: 'Only the organisation can edit its classification.' },
  { code: 'offer_owner_only', match: 'só a organização dona da oferta ou staff pode ver pontuações de candidatos', fr: 'Seuls l’organisation qui publie l’offre et l’équipe de la plateforme peuvent voir les scores des candidats.', en: 'Only the organisation that owns the offer and platform staff can see candidate scores.' },
  { code: 'offer_owner_only', match: 'só a organização dona da oferta ou staff pode ver esta informação', fr: 'Seuls l’organisation qui publie l’offre et l’équipe de la plateforme peuvent voir cette information.', en: 'Only the organisation that owns the offer and platform staff can see this information.' },
  { code: 'staff_only', match: 'só staff pode ver o histórico de billing', fr: 'Seule l’équipe de la plateforme peut voir l’historique de facturation.', en: 'Only platform staff can see the billing history.' },
  { code: 'offer_not_published', match: 'só é possível candidatar-se a ofertas publicadas', fr: 'Vous ne pouvez postuler qu’à des offres publiées.', en: 'You can only apply to published offers.' },
  { code: 'offer_not_eligible_institutional', match: 'oferta não elegível para reserva institucional', fr: 'Cette offre n’est pas éligible à la réservation institutionnelle.', en: 'This offer is not eligible for institutional booking.' },
  { code: 'free_offer_used', match: 'esta organização já usou a primeira oferta gratuita — é preciso um produto de billing ativo para publicar mais', fr: 'Votre organisation a déjà utilisé sa première offre gratuite : un abonnement actif est nécessaire pour en publier d’autres.', en: 'Your organisation has already used its first free offer: an active plan is needed to publish more.' },
  { code: 'unknown_billing_product', match: /^produto de billing desconhecido: (.+)$/, fr: 'Produit de facturation inconnu : {1}.', en: 'Unknown billing product: {1}.' },
  { code: 'transition_not_allowed', match: /^transição (\S+) -> (\S+) não permitida$/, fr: 'Changement de statut non autorisé ({1} → {2}).', en: 'Status change not allowed ({1} → {2}).' },
  { code: 'report_closed', match: /^denúncia em estado terminal: (\S+)$/, fr: 'Ce signalement est déjà clôturé ({1}).', en: 'This report is already closed ({1}).' },
  { code: 'report_closed', match: /^Denúncia já está num estado terminal: (\S+)$/, fr: 'Ce signalement est déjà clôturé ({1}).', en: 'This report is already closed ({1}).' },
  { code: 'no_labor_profile', match: 'sem perfil de legislação laboral para este país', fr: 'Pas encore de fiche de droit du travail pour ce pays.', en: 'No labour-law profile for this country yet.' },
  { code: 'no_termination_terms', match: 'sem dados de aviso prévio/período experimental para este país', fr: 'Pas encore de données de préavis ou de période d’essai pour ce pays.', en: 'No notice-period or probation data for this country yet.' },
  { code: 'simulator_unavailable', match: /^simulador ainda não disponível para (\S+)$/, fr: 'Simulateur pas encore disponible pour {1}.', en: 'Simulator not yet available for {1}.' },
  { code: 'document_not_found', match: 'documento não encontrado', fr: 'Document introuvable.', en: 'Document not found.' },
  { code: 'file_missing_in_storage', match: 'ficheiro não encontrado no armazenamento — só metadados, sem conteúdo real (registo anterior à ligação do armazenamento real)', fr: 'Fichier introuvable : seul l’enregistrement existe, sans contenu.', en: 'File not found: only the record exists, without content.' },
  { code: 'file_too_large', match: /^ficheiro com (\d+) bytes excede o limite de (\d+) bytes$/, fr: 'Fichier trop volumineux ({1} octets, limite {2}).', en: 'File too large ({1} bytes, limit {2}).' },
  { code: 'country_not_in_launch_scope', match: 'country_not_in_launch_scope', fr: 'Ce pays n’est pas encore couvert (France, Belgique et Luxembourg uniquement).', en: 'This country is not covered yet (France, Belgium and Luxembourg only).' },
  { code: 'locale_not_in_launch_scope', match: 'locale_not_in_launch_scope', fr: 'Langue non disponible (français et anglais uniquement).', en: 'Language not available (French and English only).' },
  { code: 'internal_error', match: 'internal error', fr: 'Une erreur interne est survenue. Réessayez plus tard.', en: 'An internal error occurred. Please try again later.' },
];

export function translateError(message: string, locale: ErrorLocale): { code: string; error: string } {
  for (const entry of ERROR_CATALOG) {
    if (typeof entry.match === 'string') {
      if (entry.match === message) return { code: entry.code, error: entry[locale] };
      continue;
    }
    const m = entry.match.exec(message);
    if (m) {
      return { code: entry.code, error: entry[locale].replace(/\{(\d)\}/g, (_, i) => m[Number(i)] ?? '') };
    }
  }
  return { code: 'unknown_error', error: message };
}
