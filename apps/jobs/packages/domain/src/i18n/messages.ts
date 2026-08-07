// packages/domain/src/i18n/messages.ts
//
// Catálogo de mensagens para texto GERADO pelo domínio (explicações de
// matching.ts, candidateScore.ts, etc.) — nunca conteúdo introduzido por
// utilizadores (esse continua a viver em `translations`, resolvido por
// i18n.ts, como sempre esteve).
//
// Cobertura: as 6 línguas do bloco de lançamento (PT/IT/ES/FR/DE/EN),
// todas com tradução real, não com fallback disfarçado. Nota de
// verificação: salaryReference.ts e netSalarySimulator.ts foram
// revistos e NÃO têm texto fixo nenhum (só sinais e números) — não
// precisavam desta correção, ao contrário do que se pensou inicialmente.

export type MessageLocale = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it';

export type MessageParams = Record<string, string | number>;

type CatalogEntry = Record<MessageLocale, string>;

const CATALOG: Record<string, CatalogEntry> = {
  // --- matching.ts ---
  'matching.skills.unknown': {
    pt: 'Candidato ainda não indicou competências no perfil.',
    en: 'Candidate has not indicated any skills in their profile yet.',
    es: 'El candidato aún no ha indicado competencias en su perfil.',
    fr: "Le candidat n'a pas encore indiqué de compétences dans son profil.",
    de: 'Der Kandidat hat noch keine Fähigkeiten im Profil angegeben.',
    it: 'Il candidato non ha ancora indicato competenze nel profilo.',
  },
  'matching.skills.match': {
    pt: '{count} competência(s) do perfil aparecem na descrição da oferta.',
    en: '{count} profile skill(s) appear in the offer description.',
    es: '{count} competencia(s) del perfil aparecen en la descripción de la oferta.',
    fr: "{count} compétence(s) du profil apparaissent dans la description de l'offre.",
    de: '{count} Profilkompetenz(en) erscheinen in der Stellenbeschreibung.',
    it: "{count} competenza/e del profilo compaiono nella descrizione dell'offerta.",
  },
  'matching.skills.partial': {
    pt: 'Só {count} competência(s) em comum com a oferta.',
    en: 'Only {count} skill(s) in common with the offer.',
    es: 'Solo {count} competencia(s) en común con la oferta.',
    fr: "Seulement {count} compétence(s) en commun avec l'offre.",
    de: 'Nur {count} Kompetenz(en) mit dem Angebot gemeinsam.',
    it: 'Solo {count} competenza/e in comune con l\'offerta.',
  },
  'matching.skills.mismatch': {
    pt: 'Nenhuma competência do perfil aparece na descrição da oferta.',
    en: 'No profile skill appears in the offer description.',
    es: 'Ninguna competencia del perfil aparece en la descripción de la oferta.',
    fr: "Aucune compétence du profil n'apparaît dans la description de l'offre.",
    de: 'Keine Profilkompetenz erscheint in der Stellenbeschreibung.',
    it: "Nessuna competenza del profilo compare nella descrizione dell'offerta.",
  },
  'matching.contract_type.unknown': {
    pt: 'Candidato não indicou preferência de tipo de contrato.',
    en: 'Candidate has not indicated a contract type preference.',
    es: 'El candidato no ha indicado preferencia de tipo de contrato.',
    fr: 'Le candidat n\'a pas indiqué de préférence de type de contrat.',
    de: 'Der Kandidat hat keine Vertragsart-Präferenz angegeben.',
    it: 'Il candidato non ha indicato una preferenza per il tipo di contratto.',
  },
  'matching.contract_type.match': {
    pt: 'O tipo de contrato da oferta está nas preferências do candidato.',
    en: "The offer's contract type is among the candidate's preferences.",
    es: 'El tipo de contrato de la oferta está entre las preferencias del candidato.',
    fr: 'Le type de contrat de l\'offre fait partie des préférences du candidat.',
    de: 'Die Vertragsart des Angebots gehört zu den Präferenzen des Kandidaten.',
    it: 'Il tipo di contratto dell\'offerta rientra tra le preferenze del candidato.',
  },
  'matching.contract_type.mismatch': {
    pt: 'O tipo de contrato da oferta não está nas preferências indicadas.',
    en: "The offer's contract type is not among the candidate's indicated preferences.",
    es: 'El tipo de contrato de la oferta no está entre las preferencias indicadas.',
    fr: 'Le type de contrat de l\'offre ne fait pas partie des préférences indiquées.',
    de: 'Die Vertragsart des Angebots gehört nicht zu den angegebenen Präferenzen.',
    it: 'Il tipo di contratto dell\'offerta non rientra tra le preferenze indicate.',
  },
  'matching.work_regime.unknown': {
    pt: 'Candidato não indicou preferência de regime de trabalho.',
    en: 'Candidate has not indicated a work arrangement preference.',
    es: 'El candidato no ha indicado preferencia de régimen de trabajo.',
    fr: 'Le candidat n\'a pas indiqué de préférence de régime de travail.',
    de: 'Der Kandidat hat keine Präferenz für die Arbeitsweise angegeben.',
    it: 'Il candidato non ha indicato una preferenza per il regime di lavoro.',
  },
  'matching.work_regime.match': {
    pt: 'Regime de trabalho corresponde exatamente à preferência.',
    en: 'Work arrangement matches the preference exactly.',
    es: 'El régimen de trabajo corresponde exactamente a la preferencia.',
    fr: 'Le régime de travail correspond exactement à la préférence.',
    de: 'Die Arbeitsweise entspricht genau der Präferenz.',
    it: 'Il regime di lavoro corrisponde esattamente alla preferenza.',
  },
  'matching.work_regime.partial': {
    pt: 'Regime próximo da preferência (remoto/híbrido), não é uma correspondência exata.',
    en: 'Arrangement close to the preference (remote/hybrid), not an exact match.',
    es: 'Régimen cercano a la preferencia (remoto/híbrido), no es una correspondencia exacta.',
    fr: 'Régime proche de la préférence (télétravail/hybride), pas une correspondance exacte.',
    de: 'Arbeitsweise nahe der Präferenz (remote/hybrid), keine exakte Übereinstimmung.',
    it: 'Regime vicino alla preferenza (remoto/ibrido), non è una corrispondenza esatta.',
  },
  'matching.work_regime.mismatch': {
    pt: 'Regime de trabalho diferente da preferência indicada.',
    en: 'Work arrangement different from the indicated preference.',
    es: 'Régimen de trabajo diferente de la preferencia indicada.',
    fr: 'Régime de travail différent de la préférence indiquée.',
    de: 'Arbeitsweise unterscheidet sich von der angegebenen Präferenz.',
    it: 'Regime di lavoro diverso dalla preferenza indicata.',
  },
  'matching.salary_fit.unknown': {
    pt: 'Sem preferência salarial comparável (não indicada, ou em moeda diferente).',
    en: 'No comparable salary preference (not indicated, or in a different currency).',
    es: 'Sin preferencia salarial comparable (no indicada, o en moneda diferente).',
    fr: 'Aucune préférence salariale comparable (non indiquée, ou dans une devise différente).',
    de: 'Keine vergleichbare Gehaltspräferenz (nicht angegeben oder andere Währung).',
    it: 'Nessuna preferenza salariale comparabile (non indicata, o in valuta diversa).',
  },
  'matching.salary_fit.match': {
    pt: 'A oferta atinge o salário mínimo desejado pelo candidato.',
    en: "The offer meets the candidate's desired minimum salary.",
    es: 'La oferta alcanza el salario mínimo deseado por el candidato.',
    fr: 'L\'offre atteint le salaire minimum souhaité par le candidat.',
    de: 'Das Angebot erreicht das vom Kandidaten gewünschte Mindestgehalt.',
    it: 'L\'offerta raggiunge lo stipendio minimo desiderato dal candidato.',
  },
  'matching.salary_fit.below': {
    pt: 'A oferta fica {gap} {currency} abaixo do mínimo desejado.',
    en: 'The offer is {gap} {currency} below the desired minimum.',
    es: 'La oferta queda {gap} {currency} por debajo del mínimo deseado.',
    fr: 'L\'offre est inférieure de {gap} {currency} au minimum souhaité.',
    de: 'Das Angebot liegt {gap} {currency} unter dem gewünschten Minimum.',
    it: 'L\'offerta è inferiore di {gap} {currency} rispetto al minimo desiderato.',
  },
  'matching.life_stage.unknown': {
    pt: 'Candidato não indicou nenhuma preferência de fase de carreira.',
    en: 'Candidate has not indicated any career-stage preference.',
    es: 'El candidato no ha indicado ninguna preferencia de fase de carrera.',
    fr: 'Le candidat n\'a indiqué aucune préférence de phase de carrière.',
    de: 'Der Kandidat hat keine Karrierephasen-Präferenz angegeben.',
    it: 'Il candidato non ha indicato alcuna preferenza di fase di carriera.',
  },
  'matching.life_stage.match': {
    pt: 'Alinhado com a fase de carreira indicada pelo candidato.',
    en: "Aligned with the candidate's indicated career stage.",
    es: 'Alineado con la fase de carrera indicada por el candidato.',
    fr: 'Aligné avec la phase de carrière indiquée par le candidat.',
    de: 'Übereinstimmung mit der vom Kandidaten angegebenen Karrierephase.',
    it: 'Allineato con la fase di carriera indicata dal candidato.',
  },
  'matching.life_stage.partial': {
    pt: 'Fora das fases de carreira indicadas como preferidas — não é necessariamente irrelevante.',
    en: 'Outside the indicated preferred career stages — not necessarily irrelevant.',
    es: 'Fuera de las fases de carrera indicadas como preferidas — no es necesariamente irrelevante.',
    fr: 'En dehors des phases de carrière indiquées comme préférées — pas nécessairement hors sujet.',
    de: 'Außerhalb der als bevorzugt angegebenen Karrierephasen — nicht zwangsläufig irrelevant.',
    it: 'Al di fuori delle fasi di carriera indicate come preferite — non necessariamente irrilevante.',
  },
  'matching.location.match_remote': {
    pt: 'Oferta remota — localização não é uma restrição.',
    en: 'Remote offer — location is not a constraint.',
    es: 'Oferta remota — la ubicación no es una restricción.',
    fr: 'Offre à distance — la localisation n\'est pas une contrainte.',
    de: 'Remote-Angebot — Standort ist keine Einschränkung.',
    it: 'Offerta da remoto — la posizione non è un vincolo.',
  },
  'matching.location.unknown': {
    pt: 'Localização não comparável (não indicada de um dos lados).',
    en: 'Location not comparable (not indicated on one side).',
    es: 'Ubicación no comparable (no indicada de un lado).',
    fr: 'Localisation non comparable (non indiquée d\'un côté).',
    de: 'Standort nicht vergleichbar (auf einer Seite nicht angegeben).',
    it: 'Posizione non comparabile (non indicata da un lato).',
  },
  'matching.location.match_same': {
    pt: 'Mesma localização.',
    en: 'Same location.',
    es: 'Misma ubicación.',
    fr: 'Même localisation.',
    de: 'Gleicher Standort.',
    it: 'Stessa posizione.',
  },
  'matching.location.partial_mobile': {
    pt: 'Localização diferente, mas candidato indicou disponibilidade para mobilidade.',
    en: 'Different location, but candidate indicated availability for relocation.',
    es: 'Ubicación diferente, pero el candidato indicó disponibilidad para movilidad.',
    fr: 'Localisation différente, mais le candidat a indiqué une disponibilité pour la mobilité.',
    de: 'Anderer Standort, aber Kandidat gab Mobilitätsbereitschaft an.',
    it: 'Posizione diversa, ma il candidato ha indicato disponibilità alla mobilità.',
  },
  'matching.location.mismatch': {
    pt: 'Localização diferente e candidato não indicou mobilidade.',
    en: 'Different location and candidate did not indicate relocation availability.',
    es: 'Ubicación diferente y el candidato no indicó movilidad.',
    fr: 'Localisation différente et le candidat n\'a pas indiqué de mobilité.',
    de: 'Anderer Standort und Kandidat gab keine Mobilität an.',
    it: 'Posizione diversa e il candidato non ha indicato mobilità.',
  },

  // --- candidateScore.ts ---
  'score.skills.unknown': {
    pt: 'Candidato não indicou competências no perfil.',
    en: 'Candidate has not indicated skills in their profile.',
    es: 'El candidato no ha indicado competencias en su perfil.',
    fr: 'Le candidat n\'a pas indiqué de compétences dans son profil.',
    de: 'Der Kandidat hat keine Fähigkeiten im Profil angegeben.',
    it: 'Il candidato non ha indicato competenze nel profilo.',
  },
  'score.skills.strong': {
    pt: '{count} competência(s) declaradas aparecem na descrição da oferta.',
    en: '{count} declared skill(s) appear in the offer description.',
    es: '{count} competencia(s) declaradas aparecen en la descripción de la oferta.',
    fr: '{count} compétence(s) déclarées apparaissent dans la description de l\'offre.',
    de: '{count} angegebene Kompetenz(en) erscheinen in der Stellenbeschreibung.',
    it: '{count} competenza/e dichiarate compaiono nella descrizione dell\'offerta.',
  },
  'score.skills.moderate': {
    pt: '{count} competência(s) em comum, cobertura parcial.',
    en: '{count} skill(s) in common, partial coverage.',
    es: '{count} competencia(s) en común, cobertura parcial.',
    fr: '{count} compétence(s) en commun, couverture partielle.',
    de: '{count} gemeinsame Kompetenz(en), teilweise Abdeckung.',
    it: '{count} competenza/e in comune, copertura parziale.',
  },
  'score.skills.weak': {
    pt: 'Nenhuma competência declarada corresponde à descrição da oferta.',
    en: 'No declared skill matches the offer description.',
    es: 'Ninguna competencia declarada corresponde a la descripción de la oferta.',
    fr: 'Aucune compétence déclarée ne correspond à la description de l\'offre.',
    de: 'Keine angegebene Kompetenz entspricht der Stellenbeschreibung.',
    it: 'Nessuna competenza dichiarata corrisponde alla descrizione dell\'offerta.',
  },
  'score.experience.unknown': {
    pt: 'Sem experiência profissional registada no perfil.',
    en: 'No professional experience recorded in the profile.',
    es: 'Sin experiencia profesional registrada en el perfil.',
    fr: 'Aucune expérience professionnelle enregistrée dans le profil.',
    de: 'Keine Berufserfahrung im Profil erfasst.',
    it: 'Nessuna esperienza professionale registrata nel profilo.',
  },
  'score.experience.strong': {
    pt: 'Experiência registada com impacto quantificado (não só listagem de funções).',
    en: 'Recorded experience with quantified impact (not just a list of duties).',
    es: 'Experiencia registrada con impacto cuantificado (no solo listado de funciones).',
    fr: 'Expérience enregistrée avec impact quantifié (pas seulement une liste de tâches).',
    de: 'Erfasste Erfahrung mit quantifizierter Wirkung (nicht nur Aufgabenliste).',
    it: 'Esperienza registrata con impatto quantificato (non solo elenco di mansioni).',
  },
  'score.experience.moderate': {
    pt: '{count} experiência(s) registadas, sem impacto quantificado.',
    en: '{count} recorded experience(s), without quantified impact.',
    es: '{count} experiencia(s) registradas, sin impacto cuantificado.',
    fr: '{count} expérience(s) enregistrée(s), sans impact quantifié.',
    de: '{count} erfasste Erfahrung(en), ohne quantifizierte Wirkung.',
    it: '{count} esperienza/e registrate, senza impatto quantificato.',
  },
  'score.experience.weak': {
    pt: 'Só uma experiência registada, com detalhe limitado.',
    en: 'Only one recorded experience, with limited detail.',
    es: 'Solo una experiencia registrada, con detalle limitado.',
    fr: 'Une seule expérience enregistrée, avec un détail limité.',
    de: 'Nur eine erfasste Erfahrung, mit begrenztem Detail.',
    it: 'Solo un\'esperienza registrata, con dettagli limitati.',
  },
  'score.language.unknown': {
    pt: 'Oferta não especifica requisitos de idioma.',
    en: 'Offer does not specify language requirements.',
    es: 'La oferta no especifica requisitos de idioma.',
    fr: 'L\'offre ne précise pas d\'exigences linguistiques.',
    de: 'Das Angebot spezifiziert keine Sprachanforderungen.',
    it: 'L\'offerta non specifica requisiti linguistici.',
  },
  'score.language.strong': {
    pt: 'Candidato indica todos os idiomas pedidos pela oferta.',
    en: 'Candidate lists all languages requested by the offer.',
    es: 'El candidato indica todos los idiomas pedidos por la oferta.',
    fr: 'Le candidat indique toutes les langues demandées par l\'offre.',
    de: 'Der Kandidat gibt alle vom Angebot geforderten Sprachen an.',
    it: 'Il candidato indica tutte le lingue richieste dall\'offerta.',
  },
  'score.language.moderate': {
    pt: 'Candidato indica só parte dos idiomas pedidos.',
    en: 'Candidate lists only some of the requested languages.',
    es: 'El candidato indica solo parte de los idiomas pedidos.',
    fr: 'Le candidat n\'indique qu\'une partie des langues demandées.',
    de: 'Der Kandidat gibt nur einen Teil der geforderten Sprachen an.',
    it: 'Il candidato indica solo parte delle lingue richieste.',
  },
  'score.language.weak': {
    pt: 'Nenhum dos idiomas pedidos consta do perfil do candidato.',
    en: "None of the requested languages appear in the candidate's profile.",
    es: 'Ninguno de los idiomas pedidos consta en el perfil del candidato.',
    fr: 'Aucune des langues demandées ne figure dans le profil du candidat.',
    de: 'Keine der geforderten Sprachen ist im Profil des Kandidaten vermerkt.',
    it: 'Nessuna delle lingue richieste risulta nel profilo del candidato.',
  },
  'score.completeness.strong': {
    pt: 'Perfil completo — sinal de candidatura cuidada, não de qualificação superior.',
    en: 'Complete profile — a sign of a careful application, not of higher qualification.',
    es: 'Perfil completo — señal de candidatura cuidada, no de mayor cualificación.',
    fr: 'Profil complet — signe d\'une candidature soignée, pas d\'une qualification supérieure.',
    de: 'Vollständiges Profil — Zeichen einer sorgfältigen Bewerbung, nicht höherer Qualifikation.',
    it: 'Profilo completo — segno di una candidatura curata, non di qualifica superiore.',
  },
  'score.completeness.moderate': {
    pt: 'Perfil parcialmente preenchido.',
    en: 'Partially completed profile.',
    es: 'Perfil parcialmente completado.',
    fr: 'Profil partiellement rempli.',
    de: 'Teilweise ausgefülltes Profil.',
    it: 'Profilo parzialmente compilato.',
  },
  'score.completeness.weak': {
    pt: 'Perfil pouco preenchido — pode faltar informação relevante, não necessariamente falta de qualificação.',
    en: 'Sparsely completed profile — relevant information may be missing, not necessarily a lack of qualification.',
    es: 'Perfil poco completado — puede faltar información relevante, no necesariamente falta de cualificación.',
    fr: 'Profil peu rempli — des informations pertinentes peuvent manquer, pas nécessairement un manque de qualification.',
    de: 'Spärlich ausgefülltes Profil — relevante Informationen könnten fehlen, nicht zwangsläufig mangelnde Qualifikation.',
    it: 'Profilo scarsamente compilato — potrebbero mancare informazioni rilevanti, non necessariamente mancanza di qualifica.',
  },
  'score.availability.unknown': {
    pt: 'Disponibilidade não indicada ou candidato assinalado como não disponível.',
    en: 'Availability not indicated, or candidate marked as not available.',
    es: 'Disponibilidad no indicada o candidato marcado como no disponible.',
    fr: 'Disponibilité non indiquée ou candidat marqué comme non disponible.',
    de: 'Verfügbarkeit nicht angegeben oder Kandidat als nicht verfügbar markiert.',
    it: 'Disponibilità non indicata o candidato contrassegnato come non disponibile.',
  },
  'score.availability.strong': {
    pt: 'Disponibilidade imediata declarada.',
    en: 'Immediate availability declared.',
    es: 'Disponibilidad inmediata declarada.',
    fr: 'Disponibilité immédiate déclarée.',
    de: 'Sofortige Verfügbarkeit angegeben.',
    it: 'Disponibilità immediata dichiarata.',
  },
  'score.availability.moderate': {
    pt: 'Disponibilidade declarada: {availability}.',
    en: 'Declared availability: {availability}.',
    es: 'Disponibilidad declarada: {availability}.',
    fr: 'Disponibilité déclarée : {availability}.',
    de: 'Angegebene Verfügbarkeit: {availability}.',
    it: 'Disponibilità dichiarata: {availability}.',
  },
  'score.disclaimer': {
    pt: 'Pontuação orientadora, calculada só a partir de dados profissionais declarados pelo candidato (competências, experiência, idiomas, disponibilidade). Nunca decide nem filtra candidaturas automaticamente — a decisão é sempre humana. Não usa idade, género, nacionalidade ou qualquer outra característica protegida.',
    en: 'Guidance-only score, calculated solely from professional data the candidate declared (skills, experience, languages, availability). Never decides or filters applications automatically — the decision is always human. Does not use age, gender, nationality, or any other protected characteristic.',
    es: 'Puntuación orientativa, calculada solo a partir de datos profesionales declarados por el candidato (competencias, experiencia, idiomas, disponibilidad). Nunca decide ni filtra candidaturas automáticamente — la decisión es siempre humana. No usa edad, género, nacionalidad ni ninguna otra característica protegida.',
    fr: 'Score indicatif, calculé uniquement à partir de données professionnelles déclarées par le candidat (compétences, expérience, langues, disponibilité). Ne décide ni ne filtre jamais automatiquement les candidatures — la décision est toujours humaine. N\'utilise ni l\'âge, ni le genre, ni la nationalité, ni aucune autre caractéristique protégée.',
    de: 'Orientierungswert, ausschließlich berechnet aus vom Kandidaten angegebenen beruflichen Daten (Fähigkeiten, Erfahrung, Sprachen, Verfügbarkeit). Entscheidet oder filtert Bewerbungen niemals automatisch — die Entscheidung liegt immer beim Menschen. Verwendet weder Alter, Geschlecht, Nationalität noch andere geschützte Merkmale.',
    it: 'Punteggio orientativo, calcolato solo a partire da dati professionali dichiarati dal candidato (competenze, esperienza, lingue, disponibilità). Non decide né filtra mai automaticamente le candidature — la decisione è sempre umana. Non utilizza età, genere, nazionalità o altre caratteristiche protette.',
  },
};

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in params ? String(params[key]) : `{${key}}`));
}

/**
 * Nunca lança erro por mensagem ou idioma em falta — mesmo princípio de
 * resolveTranslation (i18n.ts). Uma chave desconhecida devolve a própria
 * chave (visível, não invisível a apagar-se em silêncio) em vez de
 * rebentar; um locale desconhecido cai para inglês.
 */
export function renderMessage(key: string, locale: MessageLocale, params?: MessageParams): string {
  const entry = CATALOG[key];
  if (!entry) return key;
  const template = entry[locale] ?? entry.en;
  return interpolate(template, params);
}
