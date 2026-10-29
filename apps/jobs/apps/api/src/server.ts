// apps/api/src/server.ts
//
// API do vertical slice do Sprint 0/1 (secção 20 do briefing). Usa apenas
// o módulo http nativo do Node — sem Express/Fastify — porque este
// ambiente não tem acesso à rede para instalar dependências.
//
// Reutiliza integralmente a camada de domínio já testada no Sprint 0
// (packages/domain). O "banco de dados" é o store em memória (store.ts);
// numa integração real com o ZOS, apenas este ficheiro seria substituído
// por chamadas Supabase — a lógica de validação e transição não muda.

import http from 'node:http';
import { store, NotFoundError, usingPostgres } from './db';
import { hashPassword, verifyPassword, createSession, resolveSession, resolveAuthenticatedUserId } from './auth';
import {
  loadSupabaseAuthConfigFromEnv,
  loadSupabaseAdminConfigFromEnv,
  signupWithSupabase,
  loginWithSupabase,
  ensureJobsIdentityBinding,
} from './supabaseAuth';
import type { PgStore } from './pgStore';
import {
  validateJobOfferForPublication,
  canTransition,
} from '../../../packages/domain/src/rules/jobOffer';
import {
  canTransitionApplication,
  isCandidateAllowedTransition,
} from '../../../packages/domain/src/rules/application';
import { computeProfileCompleteness } from '../../../packages/domain/src/rules/candidateProfile';
import {
  computeResponsibilityComponents,
  computeEligibleBadges,
} from '../../../packages/domain/src/rules/employerResponsibility';
import { canTransitionReport } from '../../../packages/domain/src/rules/moderation';
import { canReserveOfferForInstitution } from '../../../packages/domain/src/rules/institution';
import { resolveTranslation } from '../../../packages/domain/src/rules/i18n';
import { compareSalaryToReference } from '../../../packages/domain/src/rules/salaryReference';
import { calculateNetSalary, calculateGermanNetSalary, calculateLuxembourgNetSalary, LU_TAX_PROFILE_2026, calculateBelgianNetSalary, BE_TAX_PROFILE_2026 } from '../../../packages/domain/src/rules/netSalarySimulator';
import { TERMINATION_TERMS_BY_COUNTRY, getTerminationTerms } from '../../../packages/domain/src/rules/terminationTerms';
import { isLaunchCountry, isLaunchLocale, launchLocaleOrDefault } from '../../../packages/domain/src/rules/launchScope';
import { translateError, type ErrorLocale } from './errorMessages';
import { estimateSmeCategoryByEmployeeCount } from '../../../packages/domain/src/rules/companyClassification';
import { applicationResponseDeadline } from '../../../packages/domain/src/rules/responseDeadline';
import { runJobAlerts } from './jobAlerts';
import { canPublishGivenBilling, productByCode } from '../../../packages/domain/src/rules/billing';
import type { BillingProductCode } from '../../../packages/domain/src/rules/billing';
import { computeCVQuality, validateCoverLetterPersonalization } from '../../../packages/domain/src/rules/cvStudio';
import { fileStorageService, FileTooLargeError } from './fileStorageService';
import { emailService, EMAIL_TEMPLATES } from './emailService';
import { computeMatchScore, explainMatchFactors } from '../../../packages/domain/src/rules/matching';
import { computeCandidateScore, explainCandidateScore } from '../../../packages/domain/src/rules/candidateScore';
import type { MessageLocale } from '../../../packages/domain/src/i18n/messages';
import type { JobOfferDraft } from '../../../packages/domain/src/types/jobOffer';
import { validateScreeningQuestions, validateScreeningAnswers } from '../../../packages/domain/src/rules/screeningQuestions';
import { parseSalaryRoute, renderSalaryPage, renderSalarySitemap } from './salaryPages';
import { parseMetierRoute, renderMetierPage, renderMetierSitemap } from './metierSalaryPages';
import { averageMonthlyText, communePath, getCommuneSalary, parseAverageSalaryRoute, renderAverageSalaryPage, renderAverageSalarySitemap } from './averageSalaryPages';
import { offerIdFromSlug, offerPath, pageLocale, renderGonePage, renderOfferPage, renderOffersSitemap, cityPath, officialCodeFromCitySlug, renderCityPage, renderCitySitemap, TIER1_CITIES, MIN_CITY_OFFERS, companyIdFromSlug, companyPath, isVerifiedCompany, isDemoCompanyName, renderCompanyPage, renderCompanySitemap, type PublicCompany } from './publicPages';

// Versão atual dos Termos de Serviço / Política de Privacidade — muda
// sempre que docs/legal/*.md tiver uma alteração material, para que
// persons.terms_version registe exatamente a que versão a pessoa deu
// consentimento (secção 13 dos Termos de Serviço).
const CURRENT_TERMS_VERSION = '2026-08-05-rascunho';

function json(res: http.ServerResponse, status: number, body: unknown) {
  // CORREÇÃO DE CAUSA RAIZ (não o sintoma): antes, isto chamava res.end()
  // imediatamente, dentro de handleRoutes() — mas o COMMIT da transação
  // só acontece DEPOIS de handleRoutes() terminar (ver withRequestContext).
  // Isso significava que o cliente podia receber a resposta HTTP e disparar
  // o pedido seguinte ANTES de a escrita estar de facto visível na base de
  // dados — uma corrida real de "ler o que acabei de escrever". Com
  // max:1 no pool, isto ficava mascarado por acidente (o pedido seguinte
  // não conseguia sequer uma ligação antes do COMMIT libertar a única que
  // existe) — não porque o pool pequeno resolvesse nada, só porque
  // escondia o problema. A correção real: guardar a resposta pretendida
  // e só a enviar depois de a transação (se houver uma) estar confirmada
  // — ver o fim de handleRequest() mais abaixo.
  (res as any).__pendingResponse = { status, body };
}

/** HTML/XML pages (public offer pages, sitemap): same deferred send as json(). */
function sendText(res: http.ServerResponse, status: number, contentType: string, body: string, headers: Record<string, string> = {}) {
  (res as any).__pendingResponse = { status, raw: body, contentType, headers };
}

function flushPendingResponse(res: http.ServerResponse) {
  const pending = (res as any).__pendingResponse;
  if (!pending || res.writableEnded) return;
  if (typeof pending.raw === 'string') {
    res.writeHead(pending.status, { 'Content-Type': pending.contentType, ...pending.headers });
    res.end(pending.raw);
    return;
  }
  // Erros: mensagem na língua do pedido + código estável (errorMessages.ts).
  if (pending.status >= 400 && pending.body && typeof pending.body.error === 'string') {
    const locale: ErrorLocale = (res as any).__locale === 'en' ? 'en' : 'fr';
    pending.body = { ...pending.body, ...translateError(pending.body.error, locale) };
  }
  const payload = JSON.stringify(pending.body, null, 2);
  res.writeHead(pending.status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export function createServer() {
  const usingSharedZosDatabase =
    usingPostgres && process.env.JOBS_DB_SCHEMA?.trim() === 'jobs';

  if (usingSharedZosDatabase) {
    if (!loadSupabaseAuthConfigFromEnv()) {
      throw new Error(
        'JOBS_DB_SCHEMA=jobs requires SUPABASE_URL and ' +
        'SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)',
      );
    }

    if (!loadSupabaseAdminConfigFromEnv()) {
      throw new Error(
        'JOBS_DB_SCHEMA=jobs requires SUPABASE_SECRET_KEY ' +
        '(or legacy SUPABASE_SERVICE_ROLE_KEY) for server-side Auth operations',
      );
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      (res as any).__locale = launchLocaleOrDefault(url.searchParams.get('locale'));
      const path = url.pathname;
      const method = req.method ?? 'GET';

      // Deployment health check: deliberately independent of Auth and
      // PostgreSQL request context so the platform can verify that the
      // HTTP process itself is alive.
      if (method === 'GET' && path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // Shared/local database mode was validated once when the server
      // was created. Do not silently fall back to the historical local Auth
      // path when JOBS_DB_SCHEMA=jobs.

      // Autenticação real (P0.2) — só funcional com Postgres real ligado.
      // Em memória, mantém-se sem autenticação, como sempre esteve.
      const currentUserId = usingPostgres
        ? await resolveAuthenticatedUserId((store as PgStore), req.headers.authorization)
        : null;

      // Ver nota em docs/POSTGRES-INTEGRATION.md: só aplicado quando ligado a
      // Postgres real. Em memória (testes sem login), mantém-se sem esta
      // barreira, como sempre esteve.
      async function requireStaff(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
        if (!usingPostgres) return { ok: true };
        if (!currentUserId) return { ok: false, status: 401, error: 'não autenticado' };
        const staff = await (store as PgStore).isPlatformStaff(currentUserId);
        if (!staff) return { ok: false, status: 403, error: 'ação reservada a staff da plataforma' };
        return { ok: true };
      }

      // Idioma para texto GERADO pelo domínio (matching.ts, candidateScore.ts)
      // — ver packages/domain/src/i18n/messages.ts. Só as línguas do
      // lançamento (launchScope.ts: fr, en); francês por omissão.
      const requestedMessageLocale: MessageLocale = launchLocaleOrDefault(url.searchParams.get('locale'));
      // Países fora do lançamento FR/BE/LU: os dados existem mas não são servidos.
      const outOfScope = () => json(res, 404, { error: 'country_not_in_launch_scope' });

      async function handleRoutes(): Promise<void> {
      // /auth/signup removida — estava morta (nada lhe chamava, tudo usa
      // POST /candidates) e já partida (faltava-lhe o termsVersion que
      // se acrescentou a createUserWithPassword() há sessões atrás).
      // Duplicar a manutenção de dois caminhos de registo não fazia
      // sentido; POST /candidates já trata tudo, incluindo o caminho
      // Supabase.

      if (method === 'POST' && path === '/auth/login') {
        if (!usingPostgres) {
          return json(res, 501, { error: 'autenticação só está disponível com Postgres real ligado (DATABASE_URL)' });
        }
        const { email, password } = await readBody(req);
        const supabaseConfig = loadSupabaseAuthConfigFromEnv();
        if (supabaseConfig) {
          try {
            const result = await loginWithSupabase(supabaseConfig, email, password);

            // Z Jobs Identity Adapter v1:
            // o RPC Core corre como o próprio utilizador autenticado e só
            // depois do COMMIT do request Jobs. Falhas pós-COMMIT são
            // registadas pelo PgStore sem transformar um login válido num
            // falso 500.
            await (store as PgStore).scheduleAfterCommit(
              async () => {
                await ensureJobsIdentityBinding(
                  supabaseConfig,
                  result.accessToken,
                );
              },
            );

            return json(res, 200, { userId: result.userId, token: result.accessToken });
          } catch (err) {
            return json(res, 401, { error: 'email ou password inválidos' });
          }
        }
        const found = await (store as PgStore).findUserByEmail(email);
        if (!found || !found.passwordHash || !(await verifyPassword(password, found.passwordHash))) {
          return json(res, 401, { error: 'email ou password inválidos' });
        }
        const session = await createSession((store as PgStore), found.id);
        return json(res, 200, { userId: found.id, fullName: found.fullName, token: session.token, expiresAt: session.expiresAt });
      }

      // Painel da empresa: organizações da pessoa autenticada.
      // Back-office da plataforma: todas as organizações e as ofertas a moderar (só staff).
      if (method === 'GET' && path === '/admin/organizations') {
        if (!usingPostgres) return json(res, 501, { error: 'disponível só com Postgres' });
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        return json(res, 200, await (store as PgStore).listOrganizationsForStaff());
      }
      if (method === 'GET' && path === '/admin/job-offers') {
        if (!usingPostgres) return json(res, 501, { error: 'disponível só com Postgres' });
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        const allowed = ['draft', 'pending_review', 'needs_changes', 'approved', 'published', 'paused', 'closed', 'archived', 'rejected'];
        const statuses = String(url.searchParams.get('status') || 'pending_review,approved').split(',').map((x) => x.trim()).filter((x) => allowed.includes(x));
        return json(res, 200, await (store as PgStore).listJobOffersForStaff(statuses.length ? statuses : ['pending_review', 'approved']));
      }

      if (method === 'GET' && path === '/me/organizations') {
        if (!usingPostgres) return json(res, 501, { error: 'disponível só com Postgres' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        return json(res, 200, await (store as PgStore).listOrganizationsForUser(currentUserId));
      }

      // Painel da empresa: todas as ofertas da organização (rascunhos incluídos).
      if (method === 'GET' && path.match(/^\/organizations\/[^/]+\/job-offers$/)) {
        if (!usingPostgres) return json(res, 501, { error: 'disponível só com Postgres' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const orgId = path.split('/')[2];
        const pg = store as PgStore;
        if (!(await pg.isOrganizationMember(orgId, currentUserId)) && !(await pg.isPlatformStaff(currentUserId))) {
          return json(res, 403, { error: 'só a organização dona da oferta ou staff pode ver esta informação' });
        }
        return json(res, 200, await pg.listJobOffersForOrganization(orgId));
      }

      // Painel do candidato: as suas candidaturas.
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/applications$/)) {
        if (!usingPostgres) return json(res, 501, { error: 'disponível só com Postgres' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const userId = path.split('/')[2];
        if (currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode ver as suas candidaturas' });
        const mine = await (store as PgStore).listApplicationsForCandidate(userId);
        const unread = await (store as PgStore).countUnreadMessages(mine.map((a) => a.id), 'candidate');
        return json(res, 200, mine.map((app) => ({ ...app, response: applicationResponseDeadline(app), unreadMessages: unread[app.id] ?? 0 })));
      }

      if (method === 'GET' && path === '/auth/me') {
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const isPlatformStaff = usingPostgres ? await (store as PgStore).isPlatformStaff(currentUserId) : false;
        return json(res, 200, { userId: currentUserId, isPlatformStaff });
      }

      // Bootstrap seguro de staff: só concede platform_superadmin se AINDA NÃO existir
      // nenhum staff no sistema (evita qualquer autenticado se autopromover depois do
      // primeiro). Produção real substituiria isto por um convite explícito.
      if (method === 'POST' && path === '/auth/bootstrap-admin') {
        if (!usingPostgres) {
          return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        }
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        // Em produção (Vercel) o primeiro administrador é nomeado na base de dados,
        // nunca por quem chega primeiro: o bootstrap só existe em desenvolvimento,
        // ou se ZJOBS_ALLOW_BOOTSTRAP_ADMIN=1 for definido de propósito.
        if (process.env.VERCEL && process.env.ZJOBS_ALLOW_BOOTSTRAP_ADMIN !== '1') {
          return json(res, 403, { error: 'bootstrap desativado em produção' });
        }
        const staffCount = await (store as PgStore).countPlatformStaff();
        if (staffCount > 0) {
          return json(res, 403, { error: 'já existe staff da plataforma — bootstrap só funciona uma vez' });
        }
        await (store as PgStore).grantPlatformRole(currentUserId, 'platform_superadmin');
        return json(res, 200, { userId: currentUserId, role: 'platform_superadmin' });
      }

      // 1. Candidato cria conta
      // Ferramenta de verificação, não uma funcionalidade de produto —
      // só staff, só para confirmar que os pontos de disparo de email
      // estão mesmo a chamar o serviço, já que não há entrega real
      // nenhuma para inspecionar de outra forma.
      if (method === 'GET' && path === '/_dev/sent-emails') {
        if (usingPostgres) {
          const staffCheck = await requireStaff();
          if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        }
        return json(res, 200, (emailService as any).sentEmails ? (emailService as any).sentEmails() : []);
      }

      if (method === 'POST' && path === '/candidates') {
        const { fullName, email, password, termsAccepted } = await readBody(req);
        if (password && usingPostgres) {
          if (!termsAccepted) {
            return json(res, 400, { error: 'é preciso aceitar os Termos de Serviço e a Política de Privacidade para criar conta' });
          }
          const supabaseConfig = loadSupabaseAuthConfigFromEnv();
          let userId: string;
          let token: string | null;
          if (supabaseConfig) {
            // Caminho real: o Supabase cria e gere a conta em auth.users
            // por completo — nós só criamos o nosso registo persons a
            // seguir, associado ao id que eles emitiram.
            const result = await signupWithSupabase(supabaseConfig, email, password);
            userId = result.userId;
            token = result.accessToken;
          } else {
            // Reserva local, para continuar a testar sem acesso de rede
            // real ao Supabase — ver resolveAuthenticatedUserId em auth.ts.
            const existing = await (store as PgStore).findUserByEmail(email);
            if (existing) return json(res, 409, { error: 'já existe uma conta com este email' });
            const passwordHash = await hashPassword(password);
            const localUser = await (store as PgStore).createUserWithPassword(fullName, email, passwordHash, CURRENT_TERMS_VERSION);
            const session = await createSession((store as PgStore), localUser.id);
            userId = localUser.id;
            token = session.token;
          }
          if (supabaseConfig) {
            await (store as PgStore).bootstrapPersonRecord(
              userId,
              fullName,
              CURRENT_TERMS_VERSION,
            );

            // O bootstrap cria/repara primeiro a identidade local Jobs.
            // O Data API só deve tentar ligar essa identidade ao ZOS
            // canónico quando a transação Jobs já estiver committed.
            //
            // Se o Supabase exigir confirmação de email, token é null;
            // nesse caso o login posterior executará o mesmo adapter.
            if (token) {
              await (store as PgStore).scheduleAfterCommit(
                async () => {
                  await ensureJobsIdentityBinding(
                    supabaseConfig,
                    token,
                  );
                },
              );
            }
          }
          const tpl = EMAIL_TEMPLATES.signupConfirmation(fullName, (res as any).__locale === 'en' ? 'en' : 'fr');
          await emailService.send({ to: email, subject: tpl.subject, body: tpl.body, templateKey: 'signupConfirmation' });
          return json(res, 201, { id: userId, fullName, email, token });
        }
        const user = await store.createUser(fullName, email);
        return json(res, 201, user);
      }

      // 2. Candidato completa perfil profissional mínimo
      if (method === 'PUT' && path.startsWith('/candidates/') && path.endsWith('/profile')) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) {
          return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        }
        const body = await readBody(req);
        const profile = await store.upsertCandidateProfile({
          userId,
          professionalTitle: body.professionalTitle,
          summary: body.summary,
          visibility: body.visibility ?? 'visible_to_verified_employers',
          isOpenToOffers: body.isOpenToOffers,
          availability: body.availability,
          desiredWorkRegime: body.desiredWorkRegime,
          desiredContractTypes: body.desiredContractTypes,
          desiredSalaryMin: body.desiredSalaryMin,
          desiredSalaryMax: body.desiredSalaryMax,
          desiredSalaryCurrency: body.desiredSalaryCurrency,
          interestedInFirstJob: body.interestedInFirstJob,
          interestedInSeniorRoles: body.interestedInSeniorRoles,
          interestedInInterim: body.interestedInInterim,
          locationId: body.locationId,
          isInternationallyMobile: body.isInternationallyMobile,
        });
        return json(res, 200, profile);
      }

      // Candidate Erasure: remove apenas a persona de candidato.
      // A conta Supabase/ZOS e atividade noutros papéis permanecem intactas.
      // No modo ZOS, a autorização é validada aqui e novamente pela função
      // SECURITY DEFINER no PostgreSQL.
      if (method === 'DELETE' && path.match(/^\/candidates\/[^/]+\/personal-data$/)) {
        const userId = path.split('/')[2];

        if (usingPostgres) {
          if (!currentUserId) {
            return json(res, 401, { error: 'não autenticado' });
          }

          const isSelf = currentUserId === userId;
          const isStaff = await store.isPlatformStaff(currentUserId);

          if (!isSelf && !isStaff) {
            return json(res, 403, { error: 'só o próprio candidato, ou staff a seu pedido, pode acionar isto' });
          }
        }
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        const plan = await (store as PgStore).executeCandidateErasure(userId);
        return json(res, 200, plan);
      }

      // Ofertas guardadas — armazenamento simples, sem lógica extra.
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/saved-offers\/[^/]+$/)) {
        const parts = path.split('/');
        const userId = parts[2], offerId = parts[4];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode guardar ofertas' });
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        return json(res, 200, await (store as PgStore).saveOffer(userId, offerId));
      }
      if (method === 'DELETE' && path.match(/^\/candidates\/[^/]+\/saved-offers\/[^/]+$/)) {
        const parts = path.split('/');
        const userId = parts[2], offerId = parts[4];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode remover ofertas guardadas' });
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        return json(res, 200, await (store as PgStore).unsaveOffer(userId, offerId));
      }
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/saved-offers$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode ver as suas ofertas guardadas' });
        if (!usingPostgres) return json(res, 200, []);
        return json(res, 200, await (store as PgStore).listSavedOffers(userId));
      }

      // Alertas de emprego — aviso honesto devolvido em cada resposta:
      // isto guarda a intenção, não dispara nenhuma notificação ainda
      // (sem infraestrutura de email na plataforma).
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/job-alerts$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode criar alertas' });
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        const { queryParams } = await readBody(req);
        const created = await (store as PgStore).createJobAlert(userId, queryParams ?? {});
        return json(res, 201, { ...created, notice: 'Guardado. Ainda não há envio automático de notificação — sem infraestrutura de email na plataforma nesta fase.' });
      }
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/job-alerts$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode ver os seus alertas' });
        if (!usingPostgres) return json(res, 200, []);
        return json(res, 200, await (store as PgStore).listJobAlerts(userId));
      }
      if (method === 'DELETE' && path.match(/^\/job-alerts\/[^/]+$/)) {
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        await (store as PgStore).deleteJobAlert(currentUserId ?? '', path.split('/')[2]);
        return json(res, 200, { deleted: true });
      }

      // Estúdio de CV — chama o domínio real (cvStudio.ts), o mesmo
      // motor testado 20+ vezes, nunca uma cópia. Verificação sem
      // estado: recebe o conteúdo no próprio pedido, não depende do
      // perfil já guardado — a mesma lógica que a montra usa, agora
      // também disponível a quem já tem conta.
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/cv-quality-check$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode verificar o seu CV' });
        const body = await readBody(req);
        const result = computeCVQuality({
          locale: (body.locale ?? requestedMessageLocale) as any,
          experiences: body.experiences ?? [],
          skills: body.skills ?? [],
          certifications: body.certifications ?? [],
          hasPortfolioLink: !!body.hasPortfolioLink,
        });
        return json(res, 200, result);
      }
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/cover-letter-check$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode verificar a sua carta' });
        const body = await readBody(req);
        const result = validateCoverLetterPersonalization({
          bodyText: body.bodyText ?? '',
          employerName: body.employerName ?? '',
          jobOfferTitle: body.jobOfferTitle ?? '',
        });
        return json(res, 200, result);
      }

      // 2b. Candidato adiciona experiência / educação / competências / idiomas / documentos
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/experiences$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        const body = await readBody(req);
        if (!body.title || !body.companyName || !body.startDate) {
          return json(res, 400, { error: 'experiência precisa de cargo, empresa e data de início' });
        }
        return json(res, 201, await store.addExperience({ userId, ...body }));
      }
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/education$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        const body = await readBody(req);
        return json(res, 201, await store.addEducation({ userId, ...body }));
      }
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/skills$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        const { skillName } = await readBody(req);
        return json(res, 200, await store.addSkill(userId, skillName));
      }
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/languages$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        const { languageCode } = await readBody(req);
        return json(res, 200, await store.addLanguage(userId, languageCode));
      }
      // Upload de documento — armazenamento real (fileStorageService),
      // não só um nome de ficheiro guardado como texto. contentBase64 é
      // opcional para manter compatibilidade com chamadas antigas que só
      // registavam metadados; quando presente, os bytes são mesmo
      // gravados e o storage_path devolvido é o identificador real.
      if (method === 'POST' && path.match(/^\/candidates\/[^/]+\/documents$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) return json(res, 403, { error: 'só o próprio candidato pode editar este perfil' });
        const body = await readBody(req);
        let storagePath = body.fileName;
        let sizeBytes: number | undefined;
        if (typeof body.contentBase64 === 'string') {
          try {
            const stored = await fileStorageService.store(userId, body.fileName, body.contentBase64);
            storagePath = stored.storagePath;
            sizeBytes = stored.sizeBytes;
          } catch (err) {
            if (err instanceof FileTooLargeError) return json(res, 413, { error: err.message });
            throw err;
          }
        }
        const doc = await store.addDocument({ userId, docType: body.docType, fileName: storagePath });
        return json(res, 201, { ...doc, sizeBytes });
      }

      // Descarrega o ficheiro real, não um redirecionamento para um URL
      // que nunca existiu. Só o próprio dono, ou staff.
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/documents\/[^/]+\/download$/)) {
        const parts = path.split('/');
        const userId = parts[2];
        const docId = parts[4];
        if (usingPostgres && currentUserId !== userId) {
          const isStaff = await store.isPlatformStaff(currentUserId ?? '');
          if (!isStaff) return json(res, 403, { error: 'só o próprio candidato, ou staff, pode descarregar este documento' });
        }
        const doc = await (store as PgStore).getDocument(docId);
        if (!doc || doc.userId !== userId) return json(res, 404, { error: 'documento não encontrado' });
        const content = await fileStorageService.retrieve(doc.fileName);
        if (!content) return json(res, 404, { error: 'ficheiro não encontrado no armazenamento — só metadados, sem conteúdo real (registo anterior à ligação do armazenamento real)' });
        // res.end() direto, não json()/flushPendingResponse() — exceção
        // deliberada e segura ao padrão estabelecido: é um GET só de
        // leitura (nada para o COMMIT proteger), e é binário (json() não
        // serviria). flushPendingResponse() já verifica res.writableEnded
        // antes de tentar enviar de novo, por isso não há risco de
        // envio duplo.
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': content.length });
        res.end(content);
        return;
      }

      // Perfil completo do candidato (experiência, formação, competências,
      // línguas, documentos). Só o próprio candidato, ou staff da plataforma.
      // Barreira explícita no router, sem depender apenas do RLS: se a API
      // ligar como um papel que ignora RLS, isto continua a proteger.
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/profile-bundle$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres) {
          if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
          if (currentUserId !== userId && !(await store.isPlatformStaff(currentUserId))) {
            return json(res, 403, { error: 'só o próprio candidato, ou staff, pode ver este perfil completo' });
          }
        }
        const bundle = await store.getCandidateProfileBundle(userId);
        const completeness = computeProfileCompleteness({
          hasProfessionalTitle: !!bundle.profile?.professionalTitle,
          hasSummary: !!bundle.profile?.summary,
          experienceCount: bundle.experiences.length,
          educationCount: bundle.education.length,
          skillCount: bundle.skills.length,
          languageCount: bundle.languages.length,
          hasResumeDocument: bundle.documents.some((d) => d.docType === 'cv'),
          hasVisibilitySet: !!bundle.profile?.visibility,
        });
        return json(res, 200, { ...bundle, completeness });
      }

      // Relevância (matching.ts) — resolve a lacuna "esta oferta é boa
      // para ti", não só "esta oferta é verdadeira".
      if (method === 'GET' && path.match(/^\/candidates\/[^/]+\/matched-offers$/)) {
        const userId = path.split('/')[2];
        if (usingPostgres && currentUserId !== userId) {
          return json(res, 403, { error: 'só o próprio candidato pode ver as suas ofertas correspondentes' });
        }
        if (!usingPostgres) return json(res, 200, []);
        const candidateProfile = await (store as PgStore).getCandidateMatchingProfile(userId);
        if (!candidateProfile) return json(res, 404, { error: 'perfil de candidato ainda não preenchido' });
        const offers = await store.listPublishedJobOffers();
        const ranked = offers
          .map((offer) => ({
            offer,
            match: computeMatchScore(candidateProfile, {
              title: offer.title,
              description: offer.description,
              responsibilities: offer.responsibilities ?? null,
              requiredQualifications: offer.requiredQualifications ?? null,
              preferredQualifications: offer.preferredQualifications ?? null,
              contractType: offer.contractType,
              workRegime: offer.workRegime,
              salaryMin: offer.salaryMin,
              salaryMax: offer.salaryMax ?? null,
              salaryCurrency: offer.salaryCurrency,
              pillar: offer.pillar,
              locationId: offer.locationId ?? null,
            }),
          }))
          .sort((a, b) => b.match.score - a.match.score);
        const rankedExplained = ranked.map((r) => ({ ...r, match: { score: r.match.score, factors: explainMatchFactors(r.match.factors, requestedMessageLocale) } }));
        return json(res, 200, rankedExplained);
      }

      // Pontuação de candidato para o empregador (candidateScore.ts) — ver
      // aviso obrigatório nesse ficheiro sobre o AI Act da UE. Cada
      // consulta é registada em audit_logs (Art. 12.º exige retenção).
      if (method === 'GET' && path.match(/^\/job-offers\/[^/]+\/candidate-scores$/)) {
        const offerId = path.split('/')[2];
        if (usingPostgres) {
          const offer = await store.mustGetJobOffer(offerId);
          const org = await store.mustGetOrg(offer.organizationId);
          const isMember = currentUserId === org.createdBy;
          const staff = currentUserId ? await (store as PgStore).isPlatformStaff(currentUserId) : false;
          if (!isMember && !staff) {
            return json(res, 403, { error: 'só a organização dona da oferta ou staff pode ver pontuações de candidatos' });
          }
        }
        if (!usingPostgres) return json(res, 200, []);
        const offer = await store.mustGetJobOffer(offerId);
        const applications = await store.listApplicationsForOffer(offerId);
        const offerScoringInput = {
          title: offer.title,
          description: offer.description,
          languageHints: [] as string[], // ver nota em candidateScore.ts sobre languageRequirements ainda não exposto
        };
        const scored = [];
        for (const app of applications) {
          // Candidaturas historicamente preservadas depois de um pedido de
          // apagamento deixam de ter candidato identificável e não podem
          // voltar a entrar em scoring.
          if (!app.candidateId) continue;

          const candidateProfile = await (store as PgStore).getCandidateScoringProfile(app.candidateId);
          const result = computeCandidateScore(candidateProfile, offerScoringInput);
          scored.push({ applicationId: app.id, candidateId: app.candidateId, status: app.status, score: explainCandidateScore(result, requestedMessageLocale) });
        }
        scored.sort((a, b) => b.score.score - a.score.score);
        await store.addAuditLog(currentUserId ?? 'unknown', 'job_offer', offerId, 'view_candidate_scores');
        return json(res, 200, scored);
      }

      if (method === 'GET' && path.match(/^\/job-offers\/[^/]+\/candidate-pool-insight$/)) {
        const id = path.split('/')[2];
        if (usingPostgres) {
          const offer = await store.mustGetJobOffer(id);
          const org = await store.mustGetOrg(offer.organizationId);
          const isMember = currentUserId === org.createdBy;
          const staff = currentUserId ? await (store as PgStore).isPlatformStaff(currentUserId) : false;
          if (!isMember && !staff) {
            return json(res, 403, { error: 'só a organização dona da oferta ou staff pode ver esta informação' });
          }
        }
        if (!usingPostgres) return json(res, 200, { totalOpenCandidatesOnPlatform: 0, matchingCandidatesEstimate: 0 });
        return json(res, 200, await (store as PgStore).getCandidatePoolInsight(id));
      }

      // Denúncias (secção 10/11) — candidato ou empresa denuncia oferta/organização
      if (method === 'POST' && path === '/reports') {
        const body = await readBody(req);
        if (usingSharedZosDatabase && !currentUserId) {
          return json(res, 401, { error: 'não autenticado' });
        }
        const reportedBy = usingSharedZosDatabase ? currentUserId! : body.reportedBy;
        const report = await store.createReport({ ...body, reportedBy });
        await store.addAuditLog(reportedBy, report.targetType, report.targetId, 'create_report');
        return json(res, 201, report);
      }

      if (method === 'GET' && path === '/reports') {
        if (usingPostgres) {
          const staffCheck = await requireStaff();
          if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        }
        return json(res, 200, await store.listReports());
      }

      if (method === 'POST' && path.match(/^\/reports\/[^/]+\/resolve$/)) {
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        const id = path.split('/')[2];
        const { resolution, actorId } = await readBody(req);
        const effectiveActorId = usingSharedZosDatabase ? currentUserId! : actorId;
        const existing = await store.getReport(id);
        if (!existing) return json(res, 404, { error: 'report not found' });
        if (!canTransitionReport(existing.status, 'resolved') && existing.status !== 'open') {
          return json(res, 409, { error: `denúncia em estado terminal: ${existing.status}` });
        }
        const resolved = await store.resolveReport(id, resolution);
        await store.addAuditLog(effectiveActorId, 'report', id, resolution === 'confirmed' ? 'resolve_report' : 'dismiss_report');
        if (resolved.resolution === 'confirmed' && resolved.targetType === 'job_offer') {
          await store.addAuditLog(effectiveActorId, 'job_offer', resolved.targetId, 'suspend');
        }
        if (usingPostgres && resolved.reportedBy) {
          const contact = await (store as PgStore).getUserContact(resolved.reportedBy);
          if (contact) {
            const tpl = EMAIL_TEMPLATES.reportResolved(contact.fullName, resolution);
            await emailService.send({ to: contact.email, subject: tpl.subject, body: tpl.body, templateKey: 'reportResolved' });
          }
        }
        return json(res, 200, resolved);
      }

      if (method === 'GET' && path === '/audit-logs') {
        if (usingPostgres) {
          const staffCheck = await requireStaff();
          if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        }
        return json(res, 200, await store.listAuditLogs());
      }

      // Employment Responsibility Index de uma organização (secção 8)
      if (method === 'GET' && path.match(/^\/organizations\/[^/]+\/responsibility$/)) {
        const orgId = path.split('/')[2];
        const metrics = await store.computeEmployerMetrics(orgId);
        const components = computeResponsibilityComponents(metrics);
        const badges = computeEligibleBadges(metrics);
        return json(res, 200, { metrics, components, badges });
      }

      // 3. Empresa cria conta organizacional
      if (method === 'POST' && path === '/organizations') {
        const { legalName, displayName, createdBy, type } = await readBody(req);
        if (usingSharedZosDatabase && !currentUserId) {
          return json(res, 401, { error: 'não autenticado' });
        }
        const effectiveCreatedBy = usingSharedZosDatabase ? currentUserId! : createdBy;
        const org = await store.createOrganization(legalName, displayName, effectiveCreatedBy, type);
        return json(res, 201, org);
      }

      // Instituições (secção 9) — cursos e reserva de ofertas
      if (method === 'POST' && path.match(/^\/organizations\/[^/]+\/courses$/)) {
        const organizationId = path.split('/')[2];
        const body = await readBody(req);
        return json(res, 201, await store.addCourse({ organizationId, ...body }));
      }

      if (method === 'POST' && path.match(/^\/job-offers\/[^/]+\/reserve-for-institution$/)) {
        const jobOfferId = path.split('/')[2];
        const { institutionOrgId } = await readBody(req);
        const offer = await store.mustGetJobOffer(jobOfferId);
        const offerOrg = await store.mustGetOrg(offer.organizationId);
        const institutionOrg = await store.mustGetOrg(institutionOrgId);

        const eligibility = canReserveOfferForInstitution({
          offerStatus: offer.status,
          offerOrganizationVerified: ['verified', 'enhanced_verified'].includes(offerOrg.verificationStatus),
          institutionOrgType: institutionOrg.type,
        });
        if (!eligibility.eligible) {
          return json(res, 422, { error: 'oferta não elegível para reserva institucional', reasons: eligibility.reasons });
        }
        const reservation = await store.reserveOfferForInstitution(jobOfferId, institutionOrgId);
        await store.addAuditLog(offer.organizationId, 'job_offer', jobOfferId, 'reserve_for_institution');
        return json(res, 201, reservation);
      }

      if (method === 'GET' && path.match(/^\/organizations\/[^/]+\/reserved-offers$/)) {
        const institutionOrgId = path.split('/')[2];
        return json(res, 200, await store.listReservedOffersForInstitution(institutionOrgId));
      }

      // 4. Empresa solicita verificação
      if (method === 'POST' && path.match(/^\/organizations\/[^/]+\/request-verification$/)) {
        const orgId = path.split('/')[2];
        const org = await store.requestVerification(orgId);
        return json(res, 200, org);
      }

      // 5. Administrador verifica a empresa
      if (method === 'POST' && path.match(/^\/organizations\/[^/]+\/approve-verification$/)) {
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        const orgId = path.split('/')[2];
        const org = await store.approveVerification(orgId);
        await store.addAuditLog('admin', 'organization', orgId, 'verify');
        if (usingPostgres && org.createdBy) {
          const contact = await (store as PgStore).getUserContact(org.createdBy);
          if (contact) {
            const tpl = EMAIL_TEMPLATES.organizationVerified(org.legalName);
            await emailService.send({ to: contact.email, subject: tpl.subject, body: tpl.body, templateKey: 'organizationVerified' });
          }
        }
        return json(res, 200, org);
      }

      // Perfil público de empresa — qualquer visitante, sem
      // autenticação. Calculado inteiramente do lado do servidor
      // (getEmployerMetrics), nunca a partir de dados parciais que o
      // browser de quem visita já tivesse carregado — ver o comentário
      // em PgStore.getEmployerMetrics sobre o porquê de isto ter mudado.
      if (method === 'GET' && path.match(/^\/organizations\/[^/]+\/public-profile$/)) {
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        const orgId = path.split('/')[2];
        const org = await store.mustGetOrg(orgId);
        const metrics = await (store as PgStore).getEmployerMetrics(orgId);
        const components = computeResponsibilityComponents(metrics);
        const badges = computeEligibleBadges(metrics);
        const details = await (store as PgStore).getCompanyPublicDetails(orgId);
        const openOffers = await (store as PgStore).searchPublishedJobOffers({ organizationId: orgId, limit: 50 });
        return json(res, 200, {
          id: orgId,
          legalName: org.legalName,
          displayName: org.displayName,
          verificationStatus: metrics.verificationStatus,
          badges,
          components,
          metrics: {
            publishedOffersCount: metrics.publishedOffersCount,
            firstJobHiresCount: metrics.firstJobHiresCount,
            seniorHiresCount: metrics.seniorHiresCount,
            confirmedComplaintsCount: metrics.confirmedComplaintsCount,
          },
          profile: {
            ...details,
            smeCategory: estimateSmeCategoryByEmployeeCount(details.employeeCount).category,
          },
          offers: openOffers.offers.map((o) => ({ ...o, publicPath: offerPath(o) })),
          offersTotal: openOffers.total,
        });
      }

      // The organisation's owners and admins edit what the public page shows.
      if (method === 'PUT' && path.match(/^\/organizations\/[^/]+\/public-profile$/)) {
        if (!usingPostgres) return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const orgId = path.split('/')[2];
        await store.mustGetOrg(orgId);
        if (!(await (store as PgStore).isOrganizationAdmin(orgId, currentUserId))) {
          return json(res, 403, { error: 'só os responsáveis da organização podem editar a página pública' });
        }
        const body = await readBody(req);
        const text = (value: unknown, max: number) => {
          if (value === undefined || value === null) return null;
          const v = String(value).trim();
          return v ? v.slice(0, max) : null;
        };
        const website = text(body.website, 200);
        if (website && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(website)) return json(res, 400, { error: 'site web inválido (https://…)' });
        const headquartersLocationId = text(body.headquartersLocationId, 36);
        if (headquartersLocationId && !(await (store as PgStore).locationExists(headquartersLocationId))) {
          return json(res, 400, { error: 'localidade desconhecida' });
        }
        await (store as PgStore).updateCompanyPublicDetails(orgId, {
          description: text(body.description, 3000),
          cultureNotes: text(body.cultureNotes, 1500),
          remotePolicyNotes: text(body.remotePolicyNotes, 1500),
          inclusionPolicyNotes: text(body.inclusionPolicyNotes, 1500),
          website,
          headquartersLocationId,
        });
        return json(res, 200, await (store as PgStore).getCompanyPublicDetails(orgId));
      }

      // 6. Empresa cria oferta com salário fixo obrigatório
      if (method === 'POST' && path === '/job-offers') {
        const { questions: rawQuestions, ...draft } = (await readBody(req)) as Omit<JobOfferDraft, 'status'> & { questions?: unknown };
        if (draft.locationId && usingPostgres && !(await (store as PgStore).locationExists(draft.locationId))) {
          return json(res, 400, { error: 'localidade desconhecida' });
        }
        // Só uma empresa verificada cria ofertas (RLS job_offers_insert_verified_employers):
        // responder claramente em vez de um erro interno.
        if (usingPostgres && draft.organizationId) {
          const org = await store.mustGetOrg(draft.organizationId);
          if (!['verified', 'enhanced_verified'].includes(org.verificationStatus)) {
            return json(res, 403, { error: 'a empresa tem de estar verificada para criar uma oferta' });
          }
        }
        // Screening questions are checked before the offer exists, so a
        // refused question never leaves a half-created draft behind.
        const checkedQuestions = rawQuestions === undefined ? null : validateScreeningQuestions(rawQuestions);
        if (checkedQuestions && !checkedQuestions.ok) return json(res, 422, { error: checkedQuestions.error, index: checkedQuestions.index });
        const offer = await store.createJobOffer(draft);
        await store.addAuditLog(draft.organizationId, 'job_offer', offer.id, 'create');
        if (usingPostgres && checkedQuestions?.ok && checkedQuestions.questions.length) {
          const questions = await (store as PgStore).replaceOfferQuestions(offer.id, checkedQuestions.questions);
          return json(res, 201, { ...offer, questions });
        }
        return json(res, 201, offer);
      }

      // 7 + 8. Sistema valida a oferta / admin aprova
      if (method === 'POST' && path.match(/^\/job-offers\/[^/]+\/submit-for-review$/)) {
        const id = path.split('/')[2];
        const offer = await store.mustGetJobOffer(id);
        if (!canTransition(offer.status, 'pending_review')) {
          return json(res, 409, { error: `transição ${offer.status} -> pending_review não permitida` });
        }
        await store.setJobOfferStatus(id, 'pending_review');
        return json(res, 200, await store.mustGetJobOffer(id));
      }

      if (method === 'POST' && path.match(/^\/job-offers\/[^/]+\/review$/)) {
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        const id = path.split('/')[2];
        const offer = await store.mustGetJobOffer(id);
        const org = await store.mustGetOrg(offer.organizationId);

        const validation = validateJobOfferForPublication(offer, {
          organizationId: org.id,
          verificationStatus: org.verificationStatus,
          legalName: org.legalName,
        });

        if (!validation.valid) {
          await store.setJobOfferStatus(id, 'needs_changes');
          await store.addAuditLog('admin', 'job_offer', id, 'reject');
          return json(res, 422, {
            status: 'needs_changes',
            issues: validation.issues,
          });
        }

        await store.setJobOfferStatus(id, 'approved');
        await store.addAuditLog('admin', 'job_offer', id, 'approve');
        return json(res, 200, await store.mustGetJobOffer(id));
      }

      // 9. Oferta fica publicamente visível
      if (method === 'POST' && path.match(/^\/job-offers\/[^/]+\/publish$/)) {
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        const id = path.split('/')[2];
        const offer = await store.mustGetJobOffer(id);
        if (!canTransition(offer.status, 'published')) {
          return json(res, 409, { error: `transição ${offer.status} -> published não permitida` });
        }
        // Regra de billing (secção 13) — primeira oferta sempre grátis,
        // a partir da segunda exige um produto de billing ativo. Não
        // substitui a verificação de organização (já exigida para a
        // oferta chegar até aqui) — é uma camada adicional.
        if (usingPostgres) {
          const alreadyPublished = await (store as PgStore).countPublishedOffersForOrg(offer.organizationId);
          const events = await (store as PgStore).listBillingEvents(offer.organizationId);
          if (!canPublishGivenBilling(events, offer.organizationId, alreadyPublished)) {
            return json(res, 402, {
              error: 'esta organização já usou a primeira oferta gratuita — é preciso um produto de billing ativo para publicar mais',
              alreadyPublished,
            });
          }
        }
        await store.setJobOfferStatus(id, 'published');
        await store.addAuditLog('admin', 'job_offer', id, 'publish');
        return json(res, 200, await store.mustGetJobOffer(id));
      }

      // Billing — concessão manual por staff, na ausência de um
      // gateway real ("operador manual nesta fase", ver migration
      // 0010_billing.sql). O dia em que houver pagamento real, troca-se
      // a ORIGEM desta chamada, não a lógica de acesso (billing.ts).
      if (method === 'POST' && path.match(/^\/organizations\/[^/]+\/billing-events$/)) {
        const staffCheck = await requireStaff();
        if (!staffCheck.ok) return json(res, staffCheck.status, { error: staffCheck.error });
        if (!usingPostgres) return json(res, 404, { error: 'disponível só com Postgres' });
        const orgId = path.split('/')[2];
        const { productCode, notes } = await readBody(req);
        if (!productByCode(productCode)) return json(res, 400, { error: `produto de billing desconhecido: ${productCode}` });
        const result = await (store as PgStore).grantBillingEvent(orgId, productCode as BillingProductCode, currentUserId ?? '', notes ?? null);
        return json(res, 201, result);
      }
      if (method === 'GET' && path.match(/^\/organizations\/[^/]+\/billing-events$/)) {
        if (!usingPostgres) return json(res, 200, []);
        const orgId = path.split('/')[2];
        const isMember = await store.isPlatformStaff(currentUserId ?? '');
        // Nota: uma verificação de posse mais fina (só membros desta
        // organização) fica para depois — hoje só staff vê isto,
        // suficiente para não expor billing de outra organização.
        if (!isMember) return json(res, 403, { error: 'só staff pode ver o histórico de billing' });
        return json(res, 200, await (store as PgStore).listBillingEvents(orgId));
      }

      // 10. Candidato pesquisa a oferta (só ofertas publicadas são visíveis)
      // Profissões (ISCO-08/ESCO) e tabelas salariais oficiais (migration 0021).
      // Só disponível com Postgres real — dados de referência, não fazem
      // sentido no repositório em memória.
      // Classificação de empresas (migration 0022) — filtros oficiais e verificáveis.
      // Legislação laboral por país (migration 0023) — factos verificáveis,
      // nunca aconselhamento jurídico.
      if (method === 'GET' && path === '/labor-legislation') {
        if (!usingPostgres) return json(res, 200, []);
        const profiles = await (store as PgStore).listCountryLaborProfiles();
        return json(res, 200, profiles.filter((profile: any) => profile && isLaunchCountry(profile.countryCode)));
      }
      if (method === 'GET' && path.match(/^\/labor-legislation\/[A-Za-z]{2}$/)) {
        if (!isLaunchCountry(path.split('/')[2])) return outOfScope();
        if (!usingPostgres) return json(res, 404, { error: 'não encontrado' });
        const profile = await (store as PgStore).getCountryLaborProfile(path.split('/')[2]);
        if (!profile) return json(res, 404, { error: 'sem perfil de legislação laboral para este país' });
        return json(res, 200, profile);
      }

      // Aviso prévio / período experimental — dados estruturais, não um
      // número fingido onde a lei remete para convenção coletiva. Ver
      // packages/domain/src/rules/terminationTerms.ts para o porquê.
      if (method === 'GET' && path === '/termination-terms') {
        return json(res, 200, Object.values(TERMINATION_TERMS_BY_COUNTRY).filter((terms) => isLaunchCountry(terms.countryCode)));
      }
      if (method === 'GET' && path.match(/^\/termination-terms\/[A-Za-z]{2}$/)) {
        if (!isLaunchCountry(path.split('/')[2])) return outOfScope();
        const terms = getTerminationTerms(path.split('/')[2]);
        if (!terms) return json(res, 404, { error: 'sem dados de aviso prévio/período experimental para este país' });
        return json(res, 200, terms);
      }

      // Simulador salário bruto -> líquido (migration 0023) — orientação,
      // nunca cálculo fiscal definitivo (ver netSalarySimulator.ts).
      if (method === 'GET' && path.match(/^\/tax-simulator\/[A-Za-z]{2}$/)) {
        if (!isLaunchCountry(path.split('/')[2])) return outOfScope();
        const countryCode = path.split('/')[2].toUpperCase();
        const grossAnnualParam = url.searchParams.get('grossAnnual');

        // Luxemburgo: motor próprio com fontes oficiais 2026 embutidas no
        // domínio (tetos, dependência, fundo para o emprego, CIS/CI-CO2) —
        // não depende de um perfil semeado na base de dados.
        if (countryCode === 'LU') {
          if (!grossAnnualParam) return json(res, 200, { taxProfile: LU_TAX_PROFILE_2026 });
          const result = calculateLuxembourgNetSalary(Number(grossAnnualParam));
          return json(res, 200, { taxProfile: LU_TAX_PROFILE_2026, result, calculationMethod: 'luxembourg_class1_2026' });
        }

        // Bélgica: motor próprio (rendimentos 2026), sem perfil na base de
        // dados. Abaixo do teto do bónus ao emprego devolve result: null.
        if (countryCode === 'BE') {
          if (!grossAnnualParam) return json(res, 200, { taxProfile: BE_TAX_PROFILE_2026 });
          const result = calculateBelgianNetSalary(Number(grossAnnualParam));
          return json(res, 200, { taxProfile: BE_TAX_PROFILE_2026, result, calculationMethod: 'belgium_employee_2026' });
        }

        if (!usingPostgres) return json(res, 404, { error: 'não encontrado' });

        // Alemanha: fórmula contínua (§32a EStG), motor à parte — o
        // modelo genérico de escalões abaixo não a consegue representar
        // corretamente. Ver netSalarySimulator.ts para o porquê.
        if (countryCode === 'DE') {
          const taxProfile = await (store as PgStore).getCountryTaxProfile('DE');
          if (!taxProfile) return json(res, 404, { error: 'simulador ainda não disponível para DE' });
          if (!grossAnnualParam) return json(res, 200, { taxProfile });
          const result = calculateGermanNetSalary(Number(grossAnnualParam));
          return json(res, 200, { taxProfile, result, calculationMethod: 'continuous_formula' });
        }

        const taxProfile = await (store as PgStore).getCountryTaxProfile(countryCode);
        if (!taxProfile) {
          return json(res, 404, { error: `simulador ainda não disponível para ${countryCode}` });
        }
        if (!grossAnnualParam) {
          return json(res, 200, { taxProfile }); // devolve só os parâmetros, sem cálculo
        }
        const result = calculateNetSalary({
          grossAnnual: Number(grossAnnualParam),
          employeeSocialContributionRate: taxProfile.employeeSocialContributionRate,
          brackets: taxProfile.brackets,
        });
        return json(res, 200, { taxProfile, result, calculationMethod: 'progressive_brackets' });
      }

      // Localidades de referência (FR/BE/LU) para o formulário de oferta e a pesquisa.
      if (method === 'GET' && path === '/locations') {
        if (!usingPostgres) return json(res, 200, []);
        const country = url.searchParams.get('country');
        if (country && !isLaunchCountry(country)) return outOfScope();
        const results = await (store as PgStore).searchLocations(url.searchParams.get('q') ?? '', country ?? undefined, Number(url.searchParams.get('limit') ?? 10));
        return json(res, 200, results);
      }

      if (method === 'GET' && path === '/nace-codes') {
        if (!usingPostgres) return json(res, 200, []);
        return json(res, 200, await (store as PgStore).listNaceCodes());
      }

      if (method === 'GET' && path === '/organizations') {
        if (!usingPostgres) return json(res, 200, []);
        const filters = {
          minEmployees: url.searchParams.has('minEmployees') ? Number(url.searchParams.get('minEmployees')) : undefined,
          maxEmployees: url.searchParams.has('maxEmployees') ? Number(url.searchParams.get('maxEmployees')) : undefined,
          naceCode: url.searchParams.get('naceCode') ?? undefined,
          smeCategory: (url.searchParams.get('smeCategory') as any) ?? undefined,
        };
        return json(res, 200, await (store as PgStore).searchOrganizations(filters));
      }

      if (method === 'PUT' && path.match(/^\/organizations\/[^/]+\/classification$/)) {
        const orgId = path.split('/')[2];
        if (usingPostgres) {
          const org = await store.mustGetOrg(orgId);
          const isMember = currentUserId === org.createdBy; // aproximação simples: dono da org
          if (!isMember) return json(res, 403, { error: 'só a própria organização pode editar a sua classificação' });
        }
        const { employeeCount, naceCode } = await readBody(req);
        if (!usingPostgres) return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        await (store as PgStore).setCompanyClassification(orgId, employeeCount ?? null, naceCode ?? null);
        return json(res, 200, { ok: true });
      }

      if (method === 'GET' && path === '/occupations') {
        if (!usingPostgres) return json(res, 200, []);
        return json(res, 200, await (store as PgStore).listOccupations());
      }

      if (method === 'GET' && path.match(/^\/occupations\/[^/]+\/salary-reference$/)) {
        if (!usingPostgres) return json(res, 200, []);
        const iscoCode = decodeURIComponent(path.split('/')[2]);
        const references = await (store as PgStore).getSalaryReferenceForOccupation(iscoCode);
        const salaryMinParam = url.searchParams.get('salaryMin');
        const currencyParam = url.searchParams.get('currency') ?? 'EUR';
        if (salaryMinParam) {
          const withComparison = references.map((ref) => ({
            ...ref,
            comparison: compareSalaryToReference(Number(salaryMinParam), currencyParam, ref.levels),
          }));
          return json(res, 200, withComparison);
        }
        return json(res, 200, references);
      }

      // Public offer pages, server-rendered for search engines (Google for
      // Jobs reads the JobPosting data). zjobs.online/offres/<slug> and
      // /sitemap-offres.xml are rewritten here by the public site.
      if (method === 'GET' && path.startsWith('/public/offres/')) {
        const locale = pageLocale(url.searchParams.get('lang'));
        const slug = decodeURIComponent(path.slice('/public/offres/'.length)).replace(/\/+$/, '');
        const id = offerIdFromSlug(slug);
        const offer = id && usingPostgres ? await (store as PgStore).getPublicOffer(id) : null;
        if (!offer) {
          return sendText(res, 410, 'text/html; charset=utf-8', renderGonePage(locale, slug), {
            'Cache-Control': 'public, max-age=0, s-maxage=300',
            'X-Robots-Tag': 'noindex, follow',
          });
        }
        const canonicalPath = offerPath(offer);
        if ('/offres/' + slug !== canonicalPath) {
          // Old title or city in the URL: one canonical address per offer.
          return sendText(res, 301, 'text/html; charset=utf-8', '', {
            Location: canonicalPath + (locale === 'en' ? '?lang=en' : ''),
            'Cache-Control': 'public, max-age=0, s-maxage=300',
          });
        }
        const pool = await (store as PgStore).searchPublishedJobOffers({
          country: offer.location?.countryCode || undefined,
          naceSection: offer.employer.naceSection || undefined,
          limit: 7,
        });
        const similar = pool.offers.filter((o) => o.id !== offer.id).slice(0, 6);
        return sendText(res, 200, 'text/html; charset=utf-8', renderOfferPage(offer, similar, locale, await (store as PgStore).getOfferQuestions(offer.id)), {
          'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
        });
      }

      // Gross-to-net salary pages: zjobs.online/salaire-brut-net… (rewrites from the public site).
      if (method === 'GET' && path.startsWith('/public/salaire/')) {
        const locale = pageLocale(url.searchParams.get('lang'));
        const route = parseSalaryRoute(decodeURIComponent(path.slice('/public/salaire/'.length)));
        if (!route || (route.amount != null && locale === 'en')) {
          return sendText(res, 404, 'text/html; charset=utf-8', renderGonePage(locale, path), { 'X-Robots-Tag': 'noindex, follow' });
        }
        return sendText(res, 200, 'text/html; charset=utf-8', renderSalaryPage(route, locale), { 'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' });
      }
      // Average salary pages (Insee): zjobs.online/salaire-moyen… (rewrites from the public site).
      if (method === 'GET' && (path === '/public/salaire-moyen' || path.startsWith('/public/salaire-moyen/'))) {
        const locale = pageLocale(url.searchParams.get('lang'));
        const slug = decodeURIComponent(path.slice('/public/salaire-moyen'.length));
        const found = parseAverageSalaryRoute(slug);
        if (!found) {
          return sendText(res, 404, 'text/html; charset=utf-8', renderGonePage(locale, slug), { 'X-Robots-Tag': 'noindex, follow' });
        }
        if ('/salaire-moyen' + slug.replace(/\/+$/, '') !== found.canonical) {
          return sendText(res, 301, 'text/html; charset=utf-8', '', { Location: found.canonical + (locale === 'en' ? '?lang=en' : ''), 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
        }
        return sendText(res, 200, 'text/html; charset=utf-8', renderAverageSalaryPage(found.route, locale), { 'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' });
      }
      // Salary by occupation pages (Insee BTS): zjobs.online/salaire… (rewrites from the public site; French only).
      if (method === 'GET' && (path === '/public/salaire-metier' || path.startsWith('/public/salaire-metier/'))) {
        const slug = decodeURIComponent(path.slice('/public/salaire-metier'.length));
        const found = parseMetierRoute(slug);
        if (!found) {
          return sendText(res, 404, 'text/html; charset=utf-8', renderGonePage('fr', slug), { 'X-Robots-Tag': 'noindex, follow' });
        }
        if ('/salaire' + slug.replace(/\/+$/, '') !== found.canonical) {
          return sendText(res, 301, 'text/html; charset=utf-8', '', { Location: found.canonical, 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
        }
        return sendText(res, 200, 'text/html; charset=utf-8', renderMetierPage(found.route), { 'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' });
      }
      if (method === 'GET' && path === '/public/sitemap-salaires-metiers.xml') {
        return sendText(res, 200, 'application/xml; charset=utf-8', renderMetierSitemap(), { 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
      }
      if (method === 'GET' && path === '/public/sitemap-salaires-villes.xml') {
        return sendText(res, 200, 'application/xml; charset=utf-8', renderAverageSalarySitemap(), { 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
      }
      if (method === 'GET' && path === '/public/sitemap-salaires.xml') {
        return sendText(res, 200, 'application/xml; charset=utf-8', renderSalarySitemap(), { 'Cache-Control': 'public, max-age=0, s-maxage=86400' });
      }

      // Company pages: zjobs.online/entreprise/<nom>-<id> (rewrite from the public site).
      // Only verified employers have a public page; anything else is a 404.
      if (method === 'GET' && path.startsWith('/public/entreprise/')) {
        const locale = pageLocale(url.searchParams.get('lang'));
        const slug = decodeURIComponent(path.slice('/public/entreprise/'.length)).replace(/\/+$/, '');
        const orgId = companyIdFromSlug(slug);
        const pg = store as PgStore;
        let company: PublicCompany | null = null;
        if (orgId && usingPostgres) {
          try {
            const org = await store.mustGetOrg(orgId);
            const metrics = await pg.getEmployerMetrics(orgId);
            if (isVerifiedCompany(metrics.verificationStatus)) {
              const details = await pg.getCompanyPublicDetails(orgId);
              const open = await pg.searchPublishedJobOffers({ organizationId: orgId, limit: 50 });
              company = {
                id: orgId, displayName: org.displayName || org.legalName, verificationStatus: metrics.verificationStatus,
                badges: computeEligibleBadges(metrics) as unknown as string[],
                metrics: { publishedOffersCount: metrics.publishedOffersCount, confirmedComplaintsCount: metrics.confirmedComplaintsCount },
                profile: details as PublicCompany['profile'], offers: open.offers, offersTotal: open.total,
              };
            }
          } catch (e) {
            if (!(e instanceof NotFoundError)) throw e;
          }
        }
        if (!company) {
          return sendText(res, 404, 'text/html; charset=utf-8', renderGonePage(locale, slug), { 'X-Robots-Tag': 'noindex, follow' });
        }
        if ('/entreprise/' + slug !== companyPath(company)) {
          return sendText(res, 301, 'text/html; charset=utf-8', '', { Location: companyPath(company) + (locale === 'en' ? '?lang=en' : ''), 'Cache-Control': 'public, max-age=0, s-maxage=300' });
        }
        const page = renderCompanyPage(company, locale);
        return sendText(res, 200, 'text/html; charset=utf-8', page.html, {
          'Cache-Control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400',
          ...(page.indexable ? {} : { 'X-Robots-Tag': 'noindex, follow' }),
        });
      }

      if (method === 'GET' && path === '/public/sitemap-entreprises.xml') {
        const companies = (usingPostgres ? await (store as PgStore).listPublicCompanies() : []).filter((c) => !isDemoCompanyName(c.displayName));
        return sendText(res, 200, 'application/xml; charset=utf-8', renderCompanySitemap(companies), { 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
      }

      // City pages: zjobs.online/emploi/<ville>-<code> (rewrite from the public site).
      if (method === 'GET' && path.startsWith('/public/emploi/')) {
        const locale = pageLocale(url.searchParams.get('lang'));
        const slug = decodeURIComponent(path.slice('/public/emploi/'.length)).replace(/\/+$/, '');
        const code = officialCodeFromCitySlug(slug);
        const pg = store as PgStore;
        const city = code && usingPostgres ? await pg.getPublicCity(code) : null;
        if (!city) {
          return sendText(res, 404, 'text/html; charset=utf-8', renderGonePage(locale, slug), { 'X-Robots-Tag': 'noindex, follow' });
        }
        if ('/emploi/' + slug !== cityPath(city)) {
          return sendText(res, 301, 'text/html; charset=utf-8', '', { Location: cityPath(city) + (locale === 'en' ? '?lang=en' : ''), 'Cache-Control': 'public, max-age=0, s-maxage=300' });
        }
        const result = await pg.searchPublishedJobOffers({ officialCode: city.officialCode, limit: 50 });
        const others = [];
        for (const c of TIER1_CITIES) {
          if (c === city.officialCode) continue;
          const o = await pg.getPublicCity(c);
          if (o) others.push(o);
        }
        const insee = city.countryCode === 'FR' ? getCommuneSalary(city.officialCode.replace(/^FR-/, '')) : null;
        const page = renderCityPage(city, result.offers, others, locale, insee ? { path: communePath(insee), monthlyNet: averageMonthlyText(insee.all, locale) } : null);
        return sendText(res, 200, 'text/html; charset=utf-8', page.html, { 'Cache-Control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400' });
      }

      if (method === 'GET' && path === '/public/sitemap-emploi.xml') {
        const pg = store as PgStore;
        const cities: { officialCode: string; city: string }[] = [];
        if (usingPostgres) {
          for (const c of TIER1_CITIES) { const o = await pg.getPublicCity(c); if (o) cities.push(o); }
          for (const c of await pg.listCitiesWithOffers(MIN_CITY_OFFERS)) if (!cities.some((x) => x.officialCode === c.officialCode)) cities.push(c);
        }
        return sendText(res, 200, 'application/xml; charset=utf-8', renderCitySitemap(cities), { 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
      }

      if (method === 'GET' && path === '/public/sitemap-offres.xml') {
        const offers = usingPostgres ? await (store as PgStore).listPublicOfferSitemap() : [];
        return sendText(res, 200, 'application/xml; charset=utf-8', renderOffersSitemap(offers), {
          'Cache-Control': 'public, max-age=0, s-maxage=3600',
        });
      }

      // Public offer search (montra, portal): no sign-in needed, published
      // offers only. ?q= keyword, ?country=FR|BE|LU, ?sector= NACE section
      // letter, ?limit= (max 50), ?offset=.
      if (method === 'GET' && path === '/job-offers/search') {
        if (!usingPostgres) return json(res, 200, { total: 0, offers: [] });
        const country = url.searchParams.get('country')?.toUpperCase() || undefined;
        if (country && !isLaunchCountry(country)) return outOfScope();
        const sector = url.searchParams.get('sector')?.toUpperCase() || undefined;
        if (sector && !/^[A-U]$/.test(sector)) return json(res, 400, { error: 'setor NACE inválido (letra de secção A–U)' });
        const q = (url.searchParams.get('q') ?? '').slice(0, 120);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const result = await (store as PgStore).searchPublishedJobOffers({
          q, country, naceSection: sector,
          limit: Number.isFinite(limit) ? limit : 20,
          offset: Number.isFinite(offset) ? offset : 0,
        });
        return json(res, 200, { ...result, offers: result.offers.map((o) => ({ ...o, publicPath: offerPath(o) })) });
      }

      if (method === 'GET' && path === '/job-offers') {
        const requestedLocaleParam = url.searchParams.get('locale');
        const offers = await store.listPublishedJobOffers();
        if (!requestedLocaleParam) return json(res, 200, offers);
        const requestedLocale = launchLocaleOrDefault(requestedLocaleParam);

        // Sequencial, não Promise.all — todas as chamadas passam pelo mesmo
        // client da transação do pedido (ver PgStore.withRequestContext);
        // disparar em paralelo na mesma ligação não é seguro.
        const translated = [];
        for (const offer of offers) {
          const entries = await store.getTranslationsFor('job_offer', offer.id);
          const titleEntries = entries.filter((e) => e.field === 'title').map((e) => ({ locale: e.locale, value: e.value }));
          const descEntries = entries.filter((e) => e.field === 'description').map((e) => ({ locale: e.locale, value: e.value }));
          const title = resolveTranslation(titleEntries, requestedLocale, offer.title);
          const description = resolveTranslation(descEntries, requestedLocale, offer.description);
          translated.push({ ...offer, title: title.value, description: description.value, translation: { locale: title.locale, isFallback: title.isFallback } });
        }
        return json(res, 200, translated);
      }

      // Traduções (secção 14) — nunca colunas rígidas title_en/title_fr
      if (method === 'POST' && path.match(/^\/job-offers\/[^/]+\/translations$/)) {
        const jobOfferId = path.split('/')[2];
        const { field, locale, value } = await readBody(req);
        if (!isLaunchLocale(locale)) return json(res, 422, { error: 'locale_not_in_launch_scope', allowed: ['fr', 'en'] });
        return json(res, 201, await store.setTranslation('job_offer', jobOfferId, field, String(locale).trim().toLowerCase(), value));
      }

      // 11. Candidato candidata-se
      // Screening questions of an offer (up to 5). Read: public once the offer
      // is published (RLS). Write: members of the employer, while the offer
      // is a draft or being corrected, so they go through moderation.
      if (method === 'GET' && path.match(/^\/job-offers\/[^/]+\/questions$/)) {
        if (!usingPostgres) return json(res, 200, []);
        return json(res, 200, await (store as PgStore).getOfferQuestions(path.split('/')[2]));
      }

      if (method === 'PUT' && path.match(/^\/job-offers\/[^/]+\/questions$/)) {
        if (!usingPostgres) return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const offerId = path.split('/')[2];
        const offer = await store.mustGetJobOffer(offerId);
        if (!(await (store as PgStore).isOrganizationMember(offer.organizationId, currentUserId))) {
          return json(res, 403, { error: 'questions_employer_only' });
        }
        if (offer.status !== 'draft' && offer.status !== 'needs_changes') {
          return json(res, 409, { error: 'questions_locked' });
        }
        const body = await readBody(req);
        const checked = validateScreeningQuestions(body?.questions);
        if (!checked.ok) return json(res, 422, { error: checked.error, index: checked.index });
        return json(res, 200, await (store as PgStore).replaceOfferQuestions(offerId, checked.questions));
      }

      if (method === 'POST' && path === '/applications') {
        const { jobOfferId, candidateId, answers, coverNote } = await readBody(req);
        if (usingSharedZosDatabase && !currentUserId) {
          return json(res, 401, { error: 'não autenticado' });
        }
        const effectiveCandidateId = usingSharedZosDatabase ? currentUserId! : candidateId;
        const offer = await store.mustGetJobOffer(jobOfferId);
        if (offer.status !== 'published') {
          return json(res, 409, { error: 'só é possível candidatar-se a ofertas publicadas' });
        }
        const note = typeof coverNote === 'string' ? coverNote.trim() : '';
        if (note.length > 2000) return json(res, 422, { error: 'cover_note_too_long' });
        let checkedAnswers: { questionId: string; answer: string }[] = [];
        if (usingPostgres) {
          const questions = await (store as PgStore).getOfferQuestions(jobOfferId);
          const checked = validateScreeningAnswers(questions, answers);
          if (!checked.ok) return json(res, 422, { error: checked.error, questionId: checked.questionId });
          checkedAnswers = checked.answers;
        }
        const app = await store.createApplication(jobOfferId, effectiveCandidateId);
        if (usingPostgres && (note || checkedAnswers.length)) {
          await (store as PgStore).saveApplicationExtras(app.id, { coverNote: note || null, answers: checkedAnswers });
        }
        return json(res, 201, { ...app, coverNote: note || null, answers: checkedAnswers });
      }

      // 12. Empresa visualiza a candidatura
      if (method === 'GET' && path.match(/^\/job-offers\/[^/]+\/applications$/)) {
        const jobOfferId = path.split('/')[2];
        const apps = await store.listApplicationsForOffer(jobOfferId);
        const unread = usingPostgres ? await (store as PgStore).countUnreadMessages(apps.map((a) => a.id), 'employer') : {};
        const extras = usingPostgres ? await (store as PgStore).getApplicationExtras(apps.map((a) => a.id)) : {};
        return json(res, 200, apps.map((app) => ({
          ...app,
          response: applicationResponseDeadline(app),
          unreadMessages: unread[app.id] ?? 0,
          coverNote: extras[app.id]?.coverNote ?? null,
          answers: extras[app.id]?.answers ?? [],
        })));
      }

      // 13. Ambas as partes veem o estado da candidatura + empresa avança pipeline
      if (method === 'GET' && path.match(/^\/applications\/[^/]+$/)) {
        const id = path.split('/')[2];
        const base = await store.mustGetApplication(id);
        const extra = usingPostgres ? (await (store as PgStore).getApplicationExtras([id]))[id] : undefined;
        const app = { ...base, coverNote: extra?.coverNote ?? null, answers: extra?.answers ?? [] };
        // Transparência (ver candidateScore.ts, ponto 5 do aviso): o
        // candidato vê a mesma pontuação orientadora que o empregador,
        // nunca uma versão diferente ou escondida.
        if (usingPostgres && app.candidateId && currentUserId === app.candidateId) {
          const offer = await store.mustGetJobOffer(app.jobOfferId);
          const candidateProfile = await (store as PgStore).getCandidateScoringProfile(app.candidateId);
          const score = computeCandidateScore(candidateProfile, { title: offer.title, description: offer.description, languageHints: [] });
          return json(res, 200, { ...app, myScoreForThisOffer: explainCandidateScore(score, requestedMessageLocale) });
        }
        return json(res, 200, app);
      }

      // Daily job alert emails, called by the Vercel cron (vercel.json) with
      // Authorization: Bearer $CRON_SECRET. Refused when the secret is not set.
      if (path === '/cron/job-alerts' && (method === 'GET' || method === 'POST')) {
        const secret = process.env.CRON_SECRET;
        if (!secret) return json(res, 503, { error: 'CRON_SECRET em falta' });
        if (req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'não autenticado' });
        if (!usingPostgres) return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        const result = await runJobAlerts(store as PgStore, emailService, {
          portalUrl: process.env.JOBS_PORTAL_URL || 'https://z-jobs-app-zoperatingsystem.vercel.app',
        });
        return json(res, 200, result);
      }

      // Messages between the candidate and the employer, one thread per application.
      if (path.match(/^\/applications\/[^/]+\/messages$/) && (method === 'GET' || method === 'POST')) {
        if (!usingPostgres) return json(res, 501, { error: 'só disponível com Postgres real ligado' });
        if (!currentUserId) return json(res, 401, { error: 'não autenticado' });
        const pg = store as PgStore;
        const parties = await pg.getApplicationParties(path.split('/')[2]);
        const side: 'candidate' | 'employer' | null = parties.candidateId === currentUserId
          ? 'candidate'
          : (await pg.isOrganizationMember(parties.organizationId, currentUserId)) ? 'employer' : null;
        if (method === 'GET') {
          if (!side && !(await pg.isPlatformStaff(currentUserId))) return json(res, 403, { error: 'só o candidato e a empresa podem ver esta conversa' });
          const messages = await pg.listApplicationMessages(parties.id);
          if (side) await pg.markApplicationMessagesRead(parties.id, side);
          return json(res, 200, { applicationId: parties.id, status: parties.status, offerTitle: parties.offerTitle, mySide: side, canWrite: !!side && parties.status !== 'closed', messages });
        }
        if (!side) return json(res, 403, { error: 'só o candidato e a empresa podem escrever nesta conversa' });
        if (parties.status === 'closed') return json(res, 409, { error: 'candidatura encerrada: a conversa já não aceita mensagens' });
        const { body } = await readBody(req);
        const text = typeof body === 'string' ? body.trim() : '';
        if (text.length < 1 || text.length > 4000) return json(res, 400, { error: 'mensagem vazia ou demasiado longa (máximo 4000 caracteres)' });
        const created = await pg.addApplicationMessage(parties.id, side, currentUserId, text);
        return json(res, 201, created);
      }

      if (method === 'POST' && path.match(/^\/applications\/[^/]+\/transition$/)) {
        const id = path.split('/')[2];
        const { to, actor } = await readBody(req);
        const app = await store.mustGetApplication(id);

        if (actor === 'candidate' && !isCandidateAllowedTransition(to)) {
          return json(res, 403, { error: 'candidato só pode retirar a candidatura (withdrawn)' });
        }
        if (!canTransitionApplication(app.status, to)) {
          return json(res, 409, { error: `transição ${app.status} -> ${to} não permitida` });
        }
        const updated = await store.transitionApplication(id, to);
        if (usingPostgres && app.candidateId) {
          const contact = await (store as PgStore).getUserContact(app.candidateId);
          if (contact) {
            const offer = await store.mustGetJobOffer(app.jobOfferId);
            const tpl = EMAIL_TEMPLATES.applicationStatusChanged(contact.fullName, offer.title, to);
            await emailService.send({ to: contact.email, subject: tpl.subject, body: tpl.body, templateKey: 'applicationStatusChanged' });
          }
        }
        return json(res, 200, updated);
      }

      return json(res, 404, { error: 'not found', path, method });
      }

      if (usingPostgres) {
        await (store as PgStore).withRequestContext(currentUserId, handleRoutes);
      } else {
        await handleRoutes();
      }
      flushPendingResponse(res);
    } catch (err) {
      if (err instanceof NotFoundError) {
        json(res, 404, { error: err.message });
        flushPendingResponse(res);
        return;
      }
      console.error(err);
      json(res, 500, { error: 'internal error' });
      flushPendingResponse(res);
    }
  });
}

if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env.PORT ?? 4000);
  createServer().listen(port, () => {
    console.log(`Z Jobs API (vertical slice) a correr em http://localhost:${port}`);
  });
}
