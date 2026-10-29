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
  { code: 'invalid_sector', match: 'setor NACE inválido (letra de secção A–U)', fr: 'Secteur inconnu.', en: 'Unknown sector.' },
  { code: 'organization_admin_only', match: 'só os responsáveis da organização podem editar a página pública', fr: 'Seuls les responsables de l’organisation peuvent modifier sa page publique.', en: 'Only the organisation’s owners and admins can edit its public page.' },
  { code: 'invalid_website', match: 'site web inválido (https://…)', fr: 'Adresse du site invalide : elle doit commencer par https://.', en: 'Invalid website address: it must start with https://.' },
  { code: 'thread_participants_only', match: 'só o candidato e a empresa podem ver esta conversa', fr: 'Seuls le candidat et l’employeur peuvent voir cette conversation.', en: 'Only the candidate and the employer can see this conversation.' },
  { code: 'thread_participants_only', match: 'só o candidato e a empresa podem escrever nesta conversa', fr: 'Seuls le candidat et l’employeur peuvent écrire dans cette conversation.', en: 'Only the candidate and the employer can write in this conversation.' },
  { code: 'thread_closed', match: 'candidatura encerrada: a conversa já não aceita mensagens', fr: 'Candidature clôturée : la conversation n’accepte plus de messages.', en: 'Application closed: the conversation no longer accepts messages.' },
  { code: 'message_length', match: 'mensagem vazia ou demasiado longa (máximo 4000 caracteres)', fr: 'Message vide ou trop long (4 000 caractères maximum).', en: 'Message empty or too long (4,000 characters maximum).' },
  { code: 'candidate_or_staff_only', match: 'só o próprio candidato, ou staff, pode ver este perfil completo', fr: 'Seul le candidat ou l’équipe de la plateforme peut voir ce profil complet.', en: 'Only the candidate or platform staff can see this full profile.' },
  { code: 'cron_not_configured', match: 'CRON_SECRET em falta', fr: 'Tâche planifiée non configurée.', en: 'Scheduled task not configured.' },
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
  { code: 'questions_not_a_list', match: 'questions_not_a_list', fr: 'Les questions doivent être envoyées sous forme de liste.', en: 'Questions must be sent as a list.' },
  { code: 'too_many_questions', match: 'too_many_questions', fr: '5 questions au maximum par offre.', en: 'At most 5 questions per job.' },
  { code: 'question_kind_invalid', match: 'question_kind_invalid', fr: 'Type de question inconnu (oui/non, nombre ou texte court).', en: 'Unknown question type (yes/no, number or short text).' },
  { code: 'question_label_length', match: 'question_label_length', fr: 'Chaque question doit faire entre 3 et 300 caractères.', en: 'Each question must be 3 to 300 characters long.' },
  { code: 'question_forbidden_topic', match: 'question_forbidden_topic', fr: 'Question interdite dans un recrutement : vie privée, santé, origine, religion, âge, opinions ou situation familiale.', en: 'Question not allowed in recruitment: private life, health, origin, religion, age, opinions or family situation.' },
  { code: 'question_duplicate', match: 'question_duplicate', fr: 'La même question apparaît deux fois.', en: 'The same question appears twice.' },
  { code: 'questions_employer_only', match: 'questions_employer_only', fr: 'Seul l’employeur de l’offre peut définir ses questions.', en: 'Only the employer of the job can set its questions.' },
  { code: 'questions_locked', match: 'questions_locked', fr: 'Les questions se modifient tant que l’offre est un brouillon ou en correction.', en: 'Questions can be changed only while the job is a draft or being corrected.' },
  { code: 'answer_unknown_question', match: 'answer_unknown_question', fr: 'Réponse à une question qui n’appartient pas à cette offre.', en: 'Answer to a question that does not belong to this job.' },
  { code: 'answer_required', match: 'answer_required', fr: 'Répondez à toutes les questions obligatoires.', en: 'Answer every required question.' },
  { code: 'answer_yes_no_invalid', match: 'answer_yes_no_invalid', fr: 'Répondez par oui ou par non.', en: 'Answer yes or no.' },
  { code: 'answer_number_invalid', match: 'answer_number_invalid', fr: 'Indiquez un nombre.', en: 'Enter a number.' },
  { code: 'answer_too_long', match: 'answer_too_long', fr: 'Réponse trop longue (1 000 caractères maximum).', en: 'Answer too long (1,000 characters maximum).' },
  { code: 'cover_note_too_long', match: 'cover_note_too_long', fr: 'Message trop long (2 000 caractères maximum).', en: 'Message too long (2,000 characters maximum).' },
  { code: 'bootstrap_disabled', match: 'bootstrap desativado em produção', fr: 'Désactivé en production : les administrateurs de la plateforme sont nommés par l’équipe ZOS.', en: 'Disabled in production: platform administrators are appointed by the ZOS team.' },
  { code: 'organization_not_verified', match: 'a empresa tem de estar verificada para criar uma oferta', fr: 'Votre entreprise doit être vérifiée avant de créer une offre.', en: 'Your company must be verified before you can create a listing.' },
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
