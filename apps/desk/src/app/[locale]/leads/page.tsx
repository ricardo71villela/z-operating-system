import { setRequestLocale } from 'next-intl/server';
import { LeadsBoard, type LeadRecord } from '@/components/leads-board';
import { deskApiFetch } from '@/lib/desk-api';
import { getLeadsCopy } from '@/lib/leads-copy';

export const dynamic = 'force-dynamic';

async function getLeads(): Promise<{ leads: LeadRecord[]; unavailable: boolean }> {
  const response = await deskApiFetch('leads');
  if (!response?.ok) return { leads: [], unavailable: true };
  return { leads: await response.json() as LeadRecord[], unavailable: false };
}

export default async function LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = getLeadsCopy(locale);
  const result = await getLeads();

  return (
    <main id="desk-main" className="page leads-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </div>
      <LeadsBoard copy={copy} initialLeads={result.leads} unavailable={result.unavailable} />
    </main>
  );
}
