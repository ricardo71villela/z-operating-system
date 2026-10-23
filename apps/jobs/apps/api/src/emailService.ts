// apps/api/src/emailService.ts
//
// Abstração de envio de email — genuína, não uma simulação vazia. A
// implementação por consola REGISTA de facto cada email que seria
// enviado, com destinatário, assunto e corpo completos, consultável
// (ver sentEmails() abaixo) — só não entrega nada a sério, porque não
// há nenhum fornecedor real (SMTP, SendGrid, Resend...) ligado a esta
// plataforma. O dia em que houver um, troca-se só a implementação
// desta interface — nenhum ponto de chamada muda.

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  templateKey: string;
}

export interface EmailSendResult {
  sent: boolean;
  provider: string;
  reason?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// Launch languages: French (default) and English, "vous" in French.
// Each function returns {subject, body} (plain text).
export type EmailLocale = 'fr' | 'en';

const STATUS_LABELS: Record<EmailLocale, Record<string, string>> = {
  fr: {
    submitted: 'envoyée', received: 'reçue', screening: 'en cours d’examen', shortlisted: 'présélectionnée',
    interview: 'entretien', assessment: 'évaluation', offer: 'proposition d’embauche', hired: 'embauche',
    rejected: 'non retenue', withdrawn: 'retirée', closed: 'clôturée',
  },
  en: {
    submitted: 'sent', received: 'received', screening: 'under review', shortlisted: 'shortlisted',
    interview: 'interview', assessment: 'assessment', offer: 'job offer', hired: 'hired',
    rejected: 'not selected', withdrawn: 'withdrawn', closed: 'closed',
  },
};

export interface AlertEmailOffer {
  title: string;
  employer: string;
  salary: string;
  place: string;
  url: string;
}

export const EMAIL_TEMPLATES = {
  signupConfirmation: (fullName: string, locale: EmailLocale = 'fr') => locale === 'en'
    ? {
        subject: 'Welcome to Z Jobs',
        body: `Hello ${fullName},\n\nYour Z Jobs account has been created. Z Jobs is always free for candidates — no subscription, ever.\n\nThe Z Jobs team`,
      }
    : {
        subject: 'Bienvenue sur Z Jobs',
        body: `Bonjour ${fullName},\n\nVotre compte Z Jobs a bien été créé. Z Jobs est toujours gratuit pour les candidats, sans abonnement.\n\nL’équipe Z Jobs`,
      },
  applicationStatusChanged: (candidateName: string, offerTitle: string, newStatus: string, locale: EmailLocale = 'fr') => {
    const label = STATUS_LABELS[locale][newStatus] ?? newStatus;
    return locale === 'en'
      ? {
          subject: `Update on your application — ${offerTitle}`,
          body: `Hello ${candidateName},\n\nYour application for "${offerTitle}" is now: ${label}.\n\nThe Z Jobs team`,
        }
      : {
          subject: `Votre candidature — ${offerTitle}`,
          body: `Bonjour ${candidateName},\n\nVotre candidature pour « ${offerTitle} » est maintenant : ${label}.\n\nL’équipe Z Jobs`,
        };
  },
  organizationVerified: (orgName: string, locale: EmailLocale = 'fr') => locale === 'en'
    ? {
        subject: 'Your organisation has been verified',
        body: `"${orgName}" has been verified. You can now publish your first listing, free of charge.\n\nThe Z Jobs team`,
      }
    : {
        subject: 'Votre organisation est vérifiée',
        body: `L’organisation « ${orgName} » a été vérifiée. Vous pouvez maintenant publier votre première offre, gratuitement.\n\nL’équipe Z Jobs`,
      },
  reportResolved: (reporterName: string, resolution: 'confirmed' | 'unfounded', locale: EmailLocale = 'fr') => locale === 'en'
    ? {
        subject: 'Your report has been handled',
        body: `Hello ${reporterName},\n\nThe report you sent has been ${resolution === 'confirmed' ? 'confirmed: the listing has been suspended' : 'reviewed and found unfounded'}.\n\nThe Z Jobs team`,
      }
    : {
        subject: 'Votre signalement a été traité',
        body: `Bonjour ${reporterName},\n\nLe signalement que vous avez envoyé a été ${resolution === 'confirmed' ? 'confirmé : l’offre a été suspendue' : 'examiné et jugé non fondé'}.\n\nL’équipe Z Jobs`,
      },
  /** Daily job alert: the new offers matching one saved search. */
  jobAlert: (fullName: string, searchLabel: string, offers: AlertEmailOffer[], total: number, manageUrl: string, locale: EmailLocale = 'fr') => {
    const lines = offers.map((o) => `• ${o.title} — ${o.employer}\n  ${[o.salary, o.place].filter(Boolean).join(' · ')}\n  ${o.url}`).join('\n\n');
    const more = total > offers.length;
    return locale === 'en'
      ? {
          subject: total === 1 ? `1 new listing for "${searchLabel}"` : `${total} new listings for "${searchLabel}"`,
          body: `Hello ${fullName},\n\nNew listings match your alert "${searchLabel}":\n\n${lines}${more ? `\n\n…and ${total - offers.length} more on Z Jobs.` : ''}\n\nEvery listing shows the salary and the verified employer.\n\nYou receive this email because you created this alert. Change or delete your alerts: ${manageUrl}\n\nThe Z Jobs team`,
        }
      : {
          subject: total === 1 ? `1 nouvelle offre pour « ${searchLabel} »` : `${total} nouvelles offres pour « ${searchLabel} »`,
          body: `Bonjour ${fullName},\n\nDe nouvelles offres correspondent à votre alerte « ${searchLabel} » :\n\n${lines}${more ? `\n\n… et ${total - offers.length} autres sur Z Jobs.` : ''}\n\nChaque offre affiche le salaire et l’employeur vérifié.\n\nVous recevez cet e-mail parce que vous avez créé cette alerte. Modifier ou supprimer vos alertes : ${manageUrl}\n\nL’équipe Z Jobs`,
        };
  },
};

/**
 * Implementação real de desenvolvimento — nunca entrega nada, mas
 * regista genuinamente cada mensagem, consultável via sentEmails().
 * Usada em testes para confirmar que os pontos de disparo (signup,
 * mudança de estado, verificação, denúncia resolvida) estão mesmo a
 * chamar isto, não silenciosamente a não fazer nada.
 */
export class ConsoleEmailService implements EmailService {
  private log: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.log.push(message);
    console.log(`[email simulado] para=${message.to} assunto="${message.subject}" modelo=${message.templateKey}`);
    return { sent: false, provider: 'console', reason: 'sem fornecedor de email real ligado a esta plataforma — só registado, nunca entregue' };
  }

  sentEmails(): readonly EmailMessage[] {
    return this.log;
  }

  clear(): void {
    this.log = [];
  }
}

export const consoleEmailService = new ConsoleEmailService();

/**
 * Implementação real do Resend — nunca testada contra a API real deles
 * (este ambiente não tem acesso de rede a api.resend.com), mas a forma
 * do pedido está correta segundo a documentação pública deles. Ativa-se
 * automaticamente quando RESEND_API_KEY está definida — ver
 * loadEmailServiceFromEnv() abaixo.
 */
export class ResendEmailService implements EmailService {
  constructor(private readonly apiKey: string, private readonly fromEmail: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.fromEmail,
        to: message.to,
        subject: message.subject,
        text: message.body,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { sent: false, provider: 'resend', reason: (body && body.message) || `Resend devolveu ${res.status}` };
    }
    return { sent: true, provider: 'resend' };
  }
}

/**
 * Resend when both RESEND_API_KEY and RESEND_FROM_EMAIL are set (the sender
 * must be on a domain verified in Resend, e.g. "Z Jobs <ne-pas-repondre@…>");
 * the console log otherwise — an unverified sender would be refused anyway.
 */
export function loadEmailServiceFromEnv(env: NodeJS.ProcessEnv = process.env): EmailService {
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.RESEND_FROM_EMAIL;
  if (apiKey && fromEmail) return new ResendEmailService(apiKey, fromEmail);
  if (apiKey) console.warn('[email] RESEND_API_KEY set without RESEND_FROM_EMAIL: emails are only logged');
  return consoleEmailService;
}

// Resolvido uma vez, no arranque — Resend se RESEND_API_KEY existir,
// consola caso contrário. `/_dev/sent-emails` (server.ts) já trata bem
// o caso de isto não ser a implementação de consola.
export const emailService = loadEmailServiceFromEnv();
