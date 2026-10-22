export type LeadsLocale = 'fr' | 'en';

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
};

export function getLeadsCopy(locale: string): LeadsCopy {
  return copy[(locale in copy ? locale : 'en') as LeadsLocale];
}
