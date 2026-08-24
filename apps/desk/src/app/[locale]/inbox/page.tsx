import { getTranslations, setRequestLocale } from 'next-intl/server';
import { deskApiFetch } from '@/lib/desk-api';

type ThreadSummary = {
  id: string;
  subject: string | null;
  contact: { id: string; displayName: string | null; email: string | null; whatsappNumber: string | null; relationshipTier: string } | null;
  channel: 'email' | 'whatsapp';
  preview: string;
  state: string | null;
  lastMessageAt: string | null;
};

type ThreadDetail = {
  thread: { id: string; subject: string | null };
  contact: { id: string; display_name: string | null; email: string | null; whatsapp_number: string | null; relationship_tier: string } | null;
  messages: Array<{ id: string; channel: 'email' | 'whatsapp'; direction: 'inbound' | 'outbound'; body: string | null; ai_summary: string | null; ai_priority: string | null; state: string; received_at: string }>;
};

async function getThreads(): Promise<ThreadSummary[]> {
  const response = await deskApiFetch('messages/threads');
  return response?.ok ? response.json() : [];
}

async function getThread(id?: string): Promise<ThreadDetail | null> {
  if (!id) return null;
  const response = await deskApiFetch(`messages/threads/${encodeURIComponent(id)}`);
  return response?.ok ? response.json() : null;
}

export default async function InboxPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ thread?: string }> }) {
  const { locale } = await params;
  const { thread: requestedThread } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Inbox');
  const threads = await getThreads();
  const selectedId = requestedThread || threads[0]?.id;
  const detail = await getThread(selectedId);

  return (
    <main id="desk-main">
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <div className="split-view">
        <section className="thread-list" aria-label={t('conversations')}>
          {threads.length === 0 ? <div className="empty-state">{t('empty')}</div> : threads.map((thread) => (
            <a key={thread.id} className={`thread-item ${thread.id === selectedId ? 'selected' : ''}`} href={`/${locale}/inbox?thread=${thread.id}`}>
              <div className="thread-heading"><strong>{thread.contact?.displayName || thread.contact?.email || thread.subject || t('unknown')}</strong><span className={`badge ${thread.channel === 'whatsapp' ? 'green' : ''}`}>{thread.channel}</span></div>
              <span>{thread.subject || t('noSubject')}</span>
              <span>{thread.preview || '—'}</span>
              {thread.lastMessageAt && <time dateTime={thread.lastMessageAt}>{new Date(thread.lastMessageAt).toLocaleString(locale)}</time>}
            </a>
          ))}
        </section>

        <section className="thread-detail" aria-label={t('thread')}>
          {!detail ? <div className="empty-state">{t('selectConversation')}</div> : (
            <>
              <div className="panel-header"><div><h2>{detail.contact?.display_name || detail.thread.subject || t('conversation')}</h2><div className="list-meta">{detail.contact?.email || detail.contact?.whatsapp_number || ''}</div></div><span className="count-badge">{detail.messages.length}</span></div>
              <div className="message-stream">
                {detail.messages.map((message) => (
                  <article key={message.id} className={`message-bubble ${message.direction === 'outbound' ? 'outbound' : ''}`}>
                    <div className="message-meta">{message.channel} · {new Date(message.received_at).toLocaleString(locale)} · {message.state.replaceAll('_', ' ')}</div>
                    {message.ai_summary && <div className="ai-summary"><span className="badge gold">AI</span> {message.ai_summary}</div>}
                    <p>{message.body || '—'}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
