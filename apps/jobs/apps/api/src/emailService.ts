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

// Modelos reais, em português — os mesmos que um fornecedor real usaria,
// não texto de preenchimento. Cada função devolve {subject, body}.
export const EMAIL_TEMPLATES = {
  signupConfirmation: (fullName: string) => ({
    subject: 'Bem-vindo/a ao Z Jobs',
    body: `Olá ${fullName},\n\nA tua conta no Z Jobs foi criada com sucesso. Candidatos usam a plataforma sempre gratuitamente — nunca há subscrição.\n\nEquipa Z Jobs`,
  }),
  applicationStatusChanged: (candidateName: string, offerTitle: string, newStatus: string) => ({
    subject: `Atualização da tua candidatura — ${offerTitle}`,
    body: `Olá ${candidateName},\n\nA tua candidatura a "${offerTitle}" mudou de estado para: ${newStatus}.\n\nEquipa Z Jobs`,
  }),
  organizationVerified: (orgName: string) => ({
    subject: 'A tua organização foi verificada',
    body: `A organização "${orgName}" foi verificada com sucesso. Já podes publicar a tua primeira oferta, gratuitamente.\n\nEquipa Z Jobs`,
  }),
  reportResolved: (reporterName: string, resolution: 'confirmed' | 'unfounded') => ({
    subject: 'A tua denúncia foi resolvida',
    body: `Olá ${reporterName},\n\nA denúncia que submeteste foi ${resolution === 'confirmed' ? 'confirmada — a oferta foi suspensa' : 'analisada e considerada infundada'}.\n\nEquipa Z Jobs`,
  }),
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
 * Escolhe a implementação real quando RESEND_API_KEY existe no
 * ambiente; cai para o registo por consola caso contrário — mesmo
 * princípio de caminho duplo já usado para o Supabase Auth.
 */
export function loadEmailServiceFromEnv(): EmailService {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'nao-responder@zjobs.pt';
    return new ResendEmailService(apiKey, fromEmail);
  }
  return consoleEmailService;
}

// Resolvido uma vez, no arranque — Resend se RESEND_API_KEY existir,
// consola caso contrário. `/_dev/sent-emails` (server.ts) já trata bem
// o caso de isto não ser a implementação de consola.
export const emailService = loadEmailServiceFromEnv();
