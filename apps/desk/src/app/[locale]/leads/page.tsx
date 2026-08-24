import { setRequestLocale } from 'next-intl/server';
import { LeadsBoard, type LeadRecord } from '@/components/leads-board';
import { callDeskApi } from '@/lib/desk-api';
import { getLeadsCopy } from '@/lib/leads-copy';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = getLeadsCopy(locale);
  const result = await callDeskApi<LeadRecord[]>('/leads');

  return (
    <main id="desk-main" className="page leads-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </div>
      <LeadsBoard copy={copy} initialLeads={result.data ?? []} unavailable={result.unavailable} />
    </main>
  );
}
