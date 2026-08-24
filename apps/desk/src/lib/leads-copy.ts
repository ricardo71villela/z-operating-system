export type LeadsLocale = 'pt' | 'en' | 'fr' | 'es' | 'it' | 'de';

export type LeadsCopy = {
  nav: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  pipeline: string;
  newLead: string;
  captureHelp: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  interest: string;
  destination: string;
  priority: string;
  followUp: string;
  notes: string;
  create: string;
  creating: string;
  unavailable: string;
  unavailableHelp: string;
  empty: string;
  score: string;
  noFollowUp: string;
  saveFailed: string;
  status: Record<'new' | 'contacted' | 'qualified' | 'nurturing' | 'converted' | 'disqualified', string>;
  sourceOptions: Record<'email' | 'whatsapp' | 'form' | 'referral' | 'manual' | 'other', string>;
  destinationOptions: Record<'z_find' | 'z_mobility' | 'z_jobs' | 'z_fashion' | 'z_studio' | 'z_desk', string>;
  priorityOptions: Record<'low' | 'normal' | 'high' | 'urgent', string>;
};

const copy: Record<LeadsLocale, LeadsCopy> = {
  pt: {
    nav: 'Leads', eyebrow: 'Pipeline transversal', title: 'Leads',
    subtitle: 'Capture, qualificação, atribuição e conversão sem duplicar a identidade canónica ZOS.',
    pipeline: 'Pipeline', newLead: 'Novo lead', captureHelp: 'Registe apenas o necessário. A pessoa ou organização canónica só é ligada no momento da conversão.',
    name: 'Nome', email: 'Email', phone: 'Telefone', company: 'Empresa', source: 'Origem', interest: 'Interesse', destination: 'Destino ZOS', priority: 'Prioridade', followUp: 'Próximo follow-up', notes: 'Notas',
    create: 'Criar lead', creating: 'A criar…', unavailable: 'Backend do Z Desk ainda não disponível neste Preview.', unavailableHelp: 'A estrutura do pipeline está pronta; dados reais serão ativados apenas quando o schema desk for autorizado na base ZOS.', empty: 'Sem leads neste estado.', score: 'Score', noFollowUp: 'Sem follow-up', saveFailed: 'Não foi possível guardar a alteração.',
    status: { new: 'Novo', contacted: 'Contactado', qualified: 'Qualificado', nurturing: 'Em acompanhamento', converted: 'Convertido', disqualified: 'Desqualificado' },
    sourceOptions: { email: 'Email', whatsapp: 'WhatsApp', form: 'Formulário', referral: 'Referência', manual: 'Manual', other: 'Outro' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' },
  },
  en: {
    nav: 'Leads', eyebrow: 'Cross-product pipeline', title: 'Leads',
    subtitle: 'Capture, qualify, assign and convert opportunities without duplicating canonical ZOS identity.',
    pipeline: 'Pipeline', newLead: 'New lead', captureHelp: 'Capture only what is needed. Canonical person or organisation identity is linked only at conversion.',
    name: 'Name', email: 'Email', phone: 'Phone', company: 'Company', source: 'Source', interest: 'Interest', destination: 'ZOS destination', priority: 'Priority', followUp: 'Next follow-up', notes: 'Notes',
    create: 'Create lead', creating: 'Creating…', unavailable: 'Z Desk backend is not available in this Preview yet.', unavailableHelp: 'The pipeline structure is ready; real data will only be activated when the desk schema is authorised in the ZOS database.', empty: 'No leads in this stage.', score: 'Score', noFollowUp: 'No follow-up', saveFailed: 'The change could not be saved.',
    status: { new: 'New', contacted: 'Contacted', qualified: 'Qualified', nurturing: 'Nurturing', converted: 'Converted', disqualified: 'Disqualified' },
    sourceOptions: { email: 'Email', whatsapp: 'WhatsApp', form: 'Form', referral: 'Referral', manual: 'Manual', other: 'Other' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' },
  },
  fr: {
    nav: 'Leads', eyebrow: 'Pipeline transversal', title: 'Leads',
    subtitle: 'Capturer, qualifier, attribuer et convertir les opportunités sans dupliquer l’identité canonique ZOS.',
    pipeline: 'Pipeline', newLead: 'Nouveau lead', captureHelp: 'Saisissez uniquement le nécessaire. La personne ou l’organisation canonique n’est liée qu’à la conversion.',
    name: 'Nom', email: 'E-mail', phone: 'Téléphone', company: 'Entreprise', source: 'Origine', interest: 'Intérêt', destination: 'Destination ZOS', priority: 'Priorité', followUp: 'Prochain suivi', notes: 'Notes',
    create: 'Créer le lead', creating: 'Création…', unavailable: 'Le backend Z Desk n’est pas encore disponible dans ce Preview.', unavailableHelp: 'La structure du pipeline est prête ; les données réelles ne seront activées qu’après autorisation du schéma desk dans la base ZOS.', empty: 'Aucun lead à cette étape.', score: 'Score', noFollowUp: 'Aucun suivi', saveFailed: 'La modification n’a pas pu être enregistrée.',
    status: { new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié', nurturing: 'En suivi', converted: 'Converti', disqualified: 'Disqualifié' },
    sourceOptions: { email: 'E-mail', whatsapp: 'WhatsApp', form: 'Formulaire', referral: 'Recommandation', manual: 'Manuel', other: 'Autre' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' },
  },
  es: {
    nav: 'Leads', eyebrow: 'Pipeline transversal', title: 'Leads',
    subtitle: 'Captura, cualifica, asigna y convierte oportunidades sin duplicar la identidad canónica de ZOS.',
    pipeline: 'Pipeline', newLead: 'Nuevo lead', captureHelp: 'Registra solo lo necesario. La persona u organización canónica se vincula únicamente al convertir.',
    name: 'Nombre', email: 'Email', phone: 'Teléfono', company: 'Empresa', source: 'Origen', interest: 'Interés', destination: 'Destino ZOS', priority: 'Prioridad', followUp: 'Próximo seguimiento', notes: 'Notas',
    create: 'Crear lead', creating: 'Creando…', unavailable: 'El backend de Z Desk aún no está disponible en este Preview.', unavailableHelp: 'La estructura del pipeline está lista; los datos reales se activarán solo cuando se autorice el esquema desk en la base ZOS.', empty: 'No hay leads en esta etapa.', score: 'Score', noFollowUp: 'Sin seguimiento', saveFailed: 'No se pudo guardar el cambio.',
    status: { new: 'Nuevo', contacted: 'Contactado', qualified: 'Cualificado', nurturing: 'En seguimiento', converted: 'Convertido', disqualified: 'Descartado' },
    sourceOptions: { email: 'Email', whatsapp: 'WhatsApp', form: 'Formulario', referral: 'Referencia', manual: 'Manual', other: 'Otro' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' },
  },
  it: {
    nav: 'Lead', eyebrow: 'Pipeline trasversale', title: 'Lead',
    subtitle: 'Acquisisci, qualifica, assegna e converti opportunità senza duplicare l’identità canonica ZOS.',
    pipeline: 'Pipeline', newLead: 'Nuovo lead', captureHelp: 'Registra solo il necessario. La persona o organizzazione canonica viene collegata solo alla conversione.',
    name: 'Nome', email: 'Email', phone: 'Telefono', company: 'Azienda', source: 'Origine', interest: 'Interesse', destination: 'Destinazione ZOS', priority: 'Priorità', followUp: 'Prossimo follow-up', notes: 'Note',
    create: 'Crea lead', creating: 'Creazione…', unavailable: 'Il backend Z Desk non è ancora disponibile in questo Preview.', unavailableHelp: 'La struttura della pipeline è pronta; i dati reali saranno attivati solo quando lo schema desk sarà autorizzato nel database ZOS.', empty: 'Nessun lead in questa fase.', score: 'Score', noFollowUp: 'Nessun follow-up', saveFailed: 'Impossibile salvare la modifica.',
    status: { new: 'Nuovo', contacted: 'Contattato', qualified: 'Qualificato', nurturing: 'In follow-up', converted: 'Convertito', disqualified: 'Scartato' },
    sourceOptions: { email: 'Email', whatsapp: 'WhatsApp', form: 'Modulo', referral: 'Segnalazione', manual: 'Manuale', other: 'Altro' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Bassa', normal: 'Normale', high: 'Alta', urgent: 'Urgente' },
  },
  de: {
    nav: 'Leads', eyebrow: 'Produktübergreifende Pipeline', title: 'Leads',
    subtitle: 'Chancen erfassen, qualifizieren, zuweisen und konvertieren, ohne die kanonische ZOS-Identität zu duplizieren.',
    pipeline: 'Pipeline', newLead: 'Neuer Lead', captureHelp: 'Nur das Nötige erfassen. Die kanonische Person oder Organisation wird erst bei der Konvertierung verknüpft.',
    name: 'Name', email: 'E-Mail', phone: 'Telefon', company: 'Unternehmen', source: 'Quelle', interest: 'Interesse', destination: 'ZOS-Ziel', priority: 'Priorität', followUp: 'Nächstes Follow-up', notes: 'Notizen',
    create: 'Lead erstellen', creating: 'Wird erstellt…', unavailable: 'Das Z-Desk-Backend ist in diesem Preview noch nicht verfügbar.', unavailableHelp: 'Die Pipeline-Struktur ist bereit; echte Daten werden erst nach Freigabe des desk-Schemas in der ZOS-Datenbank aktiviert.', empty: 'Keine Leads in dieser Phase.', score: 'Score', noFollowUp: 'Kein Follow-up', saveFailed: 'Die Änderung konnte nicht gespeichert werden.',
    status: { new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert', nurturing: 'In Betreuung', converted: 'Konvertiert', disqualified: 'Disqualifiziert' },
    sourceOptions: { email: 'E-Mail', whatsapp: 'WhatsApp', form: 'Formular', referral: 'Empfehlung', manual: 'Manuell', other: 'Andere' },
    destinationOptions: { z_find: 'Z Find', z_mobility: 'Z Mobility', z_jobs: 'Z Jobs', z_fashion: 'Z Fashion', z_studio: 'Z Studio', z_desk: 'Z Desk' },
    priorityOptions: { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' },
  },
};

export function getLeadsCopy(locale: string): LeadsCopy {
  return copy[(locale in copy ? locale : 'en') as LeadsLocale];
}
