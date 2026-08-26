import { getTranslations, setRequestLocale } from 'next-intl/server';
import { deskApiFetch } from '@/lib/desk-api';

type Contact = { id: string; display_name: string | null; email: string | null; whatsapp_number: string | null; thread_count: number; last_interaction_at: string | null; relationship_tier: string };

async function getContacts(): Promise<Contact[]> {
  const response = await deskApiFetch('contacts');
  return response?.ok ? response.json() : [];
}

export default async function ContactsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Contacts');
  const contacts = await getContacts();

  return (
    <main id="desk-main">
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {contacts.length === 0 ? <div className="panel empty-state">{t('empty')}</div> : (
        <div className="contact-grid">
          {contacts.map((contact) => {
            const name = contact.display_name || contact.email || contact.whatsapp_number || t('unknown');
            return <article className="contact-card" key={contact.id}>
              <div className="contact-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
              <h2>{name}</h2>
              <p>{contact.email || contact.whatsapp_number || '—'}</p>
              <div className="action-row"><span className="badge gold">{contact.relationship_tier}</span><span className="badge">{contact.thread_count} {t('threads')}</span></div>
              {contact.last_interaction_at && <p>{t('lastInteraction')}: {new Date(contact.last_interaction_at).toLocaleString(locale)}</p>}
            </article>;
          })}
        </div>
      )}
    </main>
  );
}
