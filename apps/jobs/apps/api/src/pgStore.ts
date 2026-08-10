// apps/api/src/pgStore.ts
//
// Repositório Postgres real — implementação alternativa da mesma
// interface que InMemoryStore (store.ts) expõe, para que server.ts troque
// de um para o outro sem reescrever lógica de aplicação.
//
// Simplificações conscientes, documentadas aqui por não haver ainda
// autenticação real (ver AUDITORIA-TECNICA-2026-08.md, ponto P0.2):
//
// 1. Não existe login real, por isso `createdBy`/`actorId` chegam à API
//    muitas vezes como rótulos simbólicos (ex: "admin"), não UUIDs de
//    auth.users. `ensureActor()` resolve isto de forma determinística:
//    gera um UUID estável a partir do rótulo e garante uma linha mínima
//    em auth.users antes de o usar como FK — nunca falsifica um
//    utilizador "verdadeiro", só evita que a integridade referencial
//    quebre por não haver ainda um sistema de identidade a montante.
// 2. job_offers.created_by é NOT NULL no schema, mas a API atual não
//    recebe esse campo do cliente (ver JobOfferDraft). Nesta
//    implementação, usa-se o created_by da própria organização como
//    valor — é o utilizador mais próximo de "quem publicou" que existe
//    sem autenticação real.
// 3. candidate_documents.storage_path é NOT NULL (pensado para um caminho
//    num bucket privado). Como não existe upload de ficheiros ainda,
//    guarda-se aqui o fileName tal como chega da API.
// 4. company_profiles (extensão pensada só para organizações tipo
//    employer) é criada para QUALQUER tipo de organização, para que
//    verification_status esteja sempre disponível por um único join —
//    ver nota na migration 0003.

import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { JobOfferDraft, JobOfferStatus, VerificationStatus } from '../../../packages/domain/src/types/jobOffer';
import type { ApplicationStatus } from '../../../packages/domain/src/rules/application';
import { computeProfileCompleteness } from '../../../packages/domain/src/rules/candidateProfile';
import { planCandidateErasure } from '../../../packages/domain/src/rules/dataErasure';
import type { ErasurePlan } from '../../../packages/domain/src/rules/dataErasure';
import type { EmployerMetrics } from '../../../packages/domain/src/rules/employerResponsibility';
import type { BillingProductCode } from '../../../packages/domain/src/rules/billing';
import { NotFoundError } from './store';
import {
  getSupabaseUserEmail,
  loadSupabaseAdminConfigFromEnv,
} from './supabaseAuth';
import { fileStorageService } from './fileStorageService';
import type {
  UserRecord,
  OrganizationRecord,
  JobOfferRecord,
  ApplicationRecord,
  CandidateProfileRecord,
  ExperienceRecord,
  EducationRecord,
  DocumentRecord,
  ReportRecordFull,
  AuditLogRecord,
  CourseRecord,
  ReservationRecord,
  TranslationRecord,
} from './store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fio condutor do cliente Postgres por pedido HTTP (P0.3 fechado a sério:
 * RLS só se aplica quando cada pedido corre dentro da SUA PRÓPRIA
 * transação com `SET LOCAL request.jwt.claim.sub`). AsyncLocalStorage
 * evita ter de passar um `client` explícito por cada um dos ~30 métodos e
 * dezenas de pontos de chamada em server.ts — qualquer código que corra
 * dentro de `withRequestContext(...)` vê automaticamente o client certo.
 */
type AfterCommitTask = () => Promise<void>;

interface RequestDbContext {
  client: pg.PoolClient;
  afterCommit: AfterCommitTask[];
}

const requestContextStorage = new AsyncLocalStorage<RequestDbContext>();

function labelToUuid(label: string): string {
  const hex = createHash('sha1').update(`zjobs-actor:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export class PgStore {
  pool: pg.Pool;
  private readonly usingSharedZosDatabase: boolean;

  constructor(connectionString: string) {
    // HISTÓRICO HONESTO, porque a causa raiz real só foi encontrada
    // depois de o max:1 já estar em produção há uma sessão inteira:
    //
    // Descobriu-se, ao testar RLS a sério, que um pool maior (10, o
    // valor por omissão) causava falhas intermitentes e não-
    // determinísticas — mas a causa nunca tinha sido isolada com
    // confiança, e max:1 (que serializa todos os pedidos, matando
    // concorrência real) foi aplicado como mitigação, não correção.
    //
    // A causa raiz real, encontrada e corrigida depois: json() em
    // server.ts chamava res.end() imediatamente, DENTRO de
    // handleRoutes() — mas withRequestContext só faz COMMIT DEPOIS de
    // handleRoutes() terminar. Isso permitia ao cliente receber a
    // resposta HTTP e disparar o pedido seguinte ANTES de a escrita
    // estar de facto visível na base de dados — uma corrida real de
    // "ler o que acabei de escrever". Com max:1, o pedido seguinte
    // não conseguia sequer uma ligação livre antes do COMMIT libertar
    // a única que existe — por isso os testes pareciam estáveis, mas
    // só por acidente de serialização, não porque o pool pequeno
    // resolvesse nada de facto.
    //
    // Corrigido adiando o envio real da resposta HTTP até depois do
    // COMMIT (ver json()/flushPendingResponse() em server.ts) —
    // verificado com 8 corridas limpas seguidas, 43/43, com pool de
    // 10 ligações, exatamente o cenário que antes falhava de forma
    // intermitente. O pool volta ao tamanho por omissão do driver
    // `pg` (10) — já não há motivo para o restringir.
    const maxConnections = process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : 10;

    // ZOS database convergence:
    // - standalone/local Jobs keeps the historical default search_path (public)
    // - shared ZOS runtime sets JOBS_DB_SCHEMA=jobs
    // PostgreSQL startup `options` applies the search_path to every physical
    // connection in the pool, including queries executed outside
    // withRequestContext().
    const dbSchema = process.env.JOBS_DB_SCHEMA?.trim();

    if (dbSchema && !/^[a-z_][a-z0-9_]*$/.test(dbSchema)) {
      throw new Error(`invalid JOBS_DB_SCHEMA: ${dbSchema}`);
    }

    this.usingSharedZosDatabase = dbSchema === 'jobs';

    this.pool = new pg.Pool({
      connectionString,
      max: maxConnections,
      ...(dbSchema
        ? { options: `-c search_path=${dbSchema}` }
        : {}),
    });
  }

  async close() {
    await this.pool.end();
  }

  /**
   * Usa o client da transação do pedido atual quando existe (ver
   * withRequestContext), senão cai para o pool diretamente — mantém os
   * scripts que não passam por um pedido HTTP (ex: seeds, testes
   * isolados) a funcionar sem mudanças. Público porque apps/api/src/auth.ts
   * também precisa de o usar — ver nota abaixo sobre porquê isso importa.
   */
  query(text: string, params?: any[]) {
    const context = requestContextStorage.getStore();
    return (context?.client ?? this.pool).query(text, params);
  }

  /**
   * Agenda trabalho que só pode ocorrer depois de um COMMIT bem sucedido.
   *
   * Fora de um request transaction, a query anterior já terminou a sua
   * transação implícita, por isso o trabalho pode correr imediatamente.
   *
   * Falhas pós-COMMIT são registadas mas não fazem a aplicação fingir que
   * a transação PostgreSQL, já confirmada, falhou.
   */
  async scheduleAfterCommit(task: AfterCommitTask): Promise<void> {
    const context = requestContextStorage.getStore();

    const safeTask: AfterCommitTask = async () => {
      try {
        await task();
      } catch (err) {
        console.error('Z Jobs post-commit task failed', err);
      }
    };

    if (context) {
      context.afterCommit.push(safeTask);
      return;
    }

    await safeTask();
  }

  /**
   * Corre `fn` dentro de UMA transação Postgres com
   * `request.jwt.claim.sub` definida via set_config(..., true) — o
   * "true" no 3º argumento torna-a local à transação (equivalente a SET
   * LOCAL, mas com bind seguro em vez de interpolar o userId na string
   * SQL). Isto é o que faz auth.uid() (e portanto todas as políticas RLS)
   * refletirem finalmente o utilizador autenticado de cada pedido HTTP.
   */
  async withRequestContext<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const afterCommit: AfterCommitTask[] = [];

    try {
      await client.query('BEGIN');
      await client.query(
        `select set_config('request.jwt.claim.sub', $1, true)`,
        [userId ?? ''],
      );

      const result = await requestContextStorage.run(
        { client, afterCommit },
        fn,
      );

      await client.query('COMMIT');

      // Só chegamos aqui se o COMMIT foi confirmado.
      // A resposta HTTP ainda não foi enviada; server.ts só faz
      // flushPendingResponse() depois de withRequestContext terminar.
      for (const task of afterCommit) {
        await task();
      }

      return result;
    } catch (err) {
      // Se BEGIN/queries/fn/COMMIT falharem, nenhuma tarefa pós-COMMIT correu.
      // ROLLBACK depois de um COMMIT falhado pode também falhar; preservamos
      // sempre o erro original.
      try {
        await client.query('ROLLBACK');
      } catch {
        // Nada adicional a fazer aqui.
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Standalone/local compatibility may still materialize deterministic
   * synthetic auth users for the historical test harness.
   *
   * In the shared ZOS database, Supabase Auth is the sole authority over
   * auth.users. A caller must therefore already carry a real Auth UUID;
   * referential integrity on the target Jobs table verifies that it exists.
   */
  private async ensureActor(idOrLabel: string): Promise<string> {
    if (this.usingSharedZosDatabase) {
      if (!UUID_RE.test(idOrLabel)) {
        throw new Error('shared ZOS runtime requires a real Supabase Auth user UUID');
      }

      return idOrLabel;
    }

    const id = UUID_RE.test(idOrLabel) ? idOrLabel : labelToUuid(idOrLabel);

    await this.query(
      `insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`,
      [id, `${idOrLabel}@synthetic.zjobs.local`],
    );

    return id;
  }

  async createUser(fullName: string, email: string): Promise<UserRecord> {
    if (this.usingSharedZosDatabase) {
      throw new Error('shared ZOS runtime must create users through Supabase Auth');
    }

    const id = randomUUID();
    await this.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    await this.query(`select bootstrap_person($1, $2)`, [id, fullName]);
    return { id, fullName, email };
  }

  /** Ver apps/api/src/auth.ts — cria o utilizador já com password (hash) definida. */
  async createUserWithPassword(fullName: string, email: string, passwordHash: string, termsVersion: string): Promise<UserRecord> {
    if (this.usingSharedZosDatabase) {
      throw new Error('shared ZOS runtime must create users through Supabase Auth');
    }

    const id = randomUUID();
    await this.query(
      `insert into auth.users (id, email, password_hash) values ($1, $2, $3)`,
      [id, email, passwordHash],
    );
    await this.query(`select bootstrap_person($1, $2)`, [id, fullName]);
    // Regista a aceitação dos termos separadamente — bootstrap_person()
    // é uma função SECURITY DEFINER já existente, não vale a pena
    // reescrevê-la só para isto quando um UPDATE simples resolve.
    await this.query(`update persons set terms_accepted_at = now(), terms_version = $2 where user_id = $1`, [id, termsVersion]);
    return { id, fullName, email };
  }

  /**
   * Caminho Supabase: o id do utilizador já existe (emitido pelo
   * Supabase Auth, não por nós) — só criamos o registo `persons`, que
   * continua a ser nosso, e registamos a aceitação de termos. Nunca
   * escreve em auth.users — essa tabela já não é nossa para escrever.
   */
  async bootstrapPersonRecord(userId: string, fullName: string, termsVersion: string): Promise<UserRecord> {
    if (this.usingSharedZosDatabase) {
      await this.query(
        `select bootstrap_person($1, $2, $3)`,
        [userId, fullName, termsVersion],
      );
    } else {
      await this.query(`select bootstrap_person($1, $2)`, [userId, fullName]);
      await this.query(
        `update persons set terms_accepted_at = now(), terms_version = $2 where user_id = $1`,
        [userId, termsVersion],
      );
    }

    return { id: userId, fullName, email: '' }; // email vive em auth.users, gerido pelo Supabase — não o duplicamos aqui
  }

  async findUserByEmail(email: string): Promise<{ id: string; passwordHash: string | null; fullName: string } | null> {
    if (this.usingSharedZosDatabase) {
      throw new Error(
        'shared ZOS runtime must resolve login identities through Supabase Auth',
      );
    }

    // Historical standalone compatibility only.
    const { rows } = await this.query(
      `select u.id, u.password_hash, p.full_name from auth.users u
       left join persons p on p.user_id = u.id
       where u.email = $1`,
      [email],
    );

    if (rows.length === 0) return null;

    return {
      id: rows[0].id,
      passwordHash: rows[0].password_hash,
      fullName: rows[0].full_name,
    };
  }

  async getUserContact(userId: string): Promise<{ email: string; fullName: string } | null> {
    if (this.usingSharedZosDatabase) {
      const adminConfig = loadSupabaseAdminConfigFromEnv();

      if (!adminConfig) {
        throw new Error(
          'shared ZOS runtime requires Supabase Admin configuration for user contact lookup',
        );
      }

      const email = await getSupabaseUserEmail(adminConfig, userId);

      if (!email) return null;

      const { rows } = await this.query(
        `select jobs.get_person_full_name($1::uuid) as full_name`,
        [userId],
      );

      return {
        email,
        fullName: rows[0]?.full_name ?? '',
      };
    }

    // Historical standalone compatibility:
    // auth.users belongs to the local Supabase stub in this mode.
    const { rows } = await this.query(
      `select u.email, p.full_name from auth.users u
       left join persons p on p.user_id = u.id
       where u.id = $1`,
      [userId],
    );

    if (rows.length === 0) return null;

    return {
      email: rows[0].email,
      fullName: rows[0].full_name ?? '',
    };
  }

  async createOrganization(
    legalName: string,
    displayName: string,
    createdBy: string,
    type: OrganizationRecord['type'] = 'employer',
  ): Promise<OrganizationRecord> {
    const creatorId = await this.ensureActor(createdBy);
    const { rows } = await this.query(
      `insert into organizations (type, legal_name, display_name, created_by)
       values ($1, $2, $3, $4) returning id`,
      [type, legalName, displayName, creatorId],
    );
    const id = rows[0].id as string;
    await this.query(
      `insert into organization_memberships (organization_id, user_id, role) values ($1, $2, 'owner')
       on conflict do nothing`,
      [id, creatorId],
    );
    await this.query(
      `insert into company_profiles (organization_id) values ($1)`,
      [id],
    );
    return { id, type, legalName, displayName, createdBy: creatorId, verificationStatus: 'unverified' };
  }

  async requestVerification(orgId: string): Promise<OrganizationRecord> {
    await this.query(
      `update company_profiles set verification_status = 'pending', verification_requested_at = now()
       where organization_id = $1`,
      [orgId],
    );
    return this.mustGetOrg(orgId);
  }

  async approveVerification(orgId: string): Promise<OrganizationRecord> {
    await this.query(
      `update company_profiles set verification_status = 'verified', verified_at = now() where organization_id = $1`,
      [orgId],
    );
    return this.mustGetOrg(orgId);
  }

  async upsertCandidateProfile(rec: CandidateProfileRecord): Promise<CandidateProfileRecord> {
    await this.ensureActor(rec.userId);
    // coalesce(excluded.x, candidate_profiles.x) em cada campo de
    // preferência: se o pedido não incluir esse campo (undefined -> null
    // no parâmetro), mantém o valor já guardado em vez de o apagar — um
    // PUT parcial (ex: só a atualizar o resumo) nunca deve limpar
    // preferências definidas antes noutro pedido.
    await this.query(
      `insert into candidate_profiles (
         user_id, professional_title, summary, visibility,
         is_open_to_offers, desired_work_regime, desired_contract_types,
         desired_salary_min, desired_salary_max, desired_salary_currency,
         interested_in_first_job, interested_in_senior_roles, interested_in_interim,
         location_id, is_internationally_mobile, availability
       )
       values (
         $1, $2, $3, $4,
         coalesce($5, false), $6::work_regime, coalesce($7::contract_type[], '{}'),
         $8, $9, $10,
         coalesce($11, false), coalesce($12, false), coalesce($13, false),
         $14, coalesce($15, false), $16
       )
       on conflict (user_id) do update set
         professional_title = excluded.professional_title,
         summary = excluded.summary,
         visibility = excluded.visibility,
         is_open_to_offers = coalesce($5, candidate_profiles.is_open_to_offers),
         desired_work_regime = coalesce($6::work_regime, candidate_profiles.desired_work_regime),
         desired_contract_types = coalesce($7::contract_type[], candidate_profiles.desired_contract_types),
         desired_salary_min = coalesce($8, candidate_profiles.desired_salary_min),
         desired_salary_max = coalesce($9, candidate_profiles.desired_salary_max),
         desired_salary_currency = coalesce($10, candidate_profiles.desired_salary_currency),
         interested_in_first_job = coalesce($11, candidate_profiles.interested_in_first_job),
         interested_in_senior_roles = coalesce($12, candidate_profiles.interested_in_senior_roles),
         interested_in_interim = coalesce($13, candidate_profiles.interested_in_interim),
         location_id = coalesce($14, candidate_profiles.location_id),
         is_internationally_mobile = coalesce($15, candidate_profiles.is_internationally_mobile),
         availability = coalesce($16, candidate_profiles.availability),
         updated_at = now()`,
      [
        rec.userId, rec.professionalTitle, rec.summary, rec.visibility,
        rec.isOpenToOffers ?? null, rec.desiredWorkRegime ?? null, rec.desiredContractTypes ?? null,
        rec.desiredSalaryMin ?? null, rec.desiredSalaryMax ?? null, rec.desiredSalaryCurrency ?? null,
        rec.interestedInFirstJob ?? null, rec.interestedInSeniorRoles ?? null, rec.interestedInInterim ?? null,
        rec.locationId ?? null, rec.isInternationallyMobile ?? null, rec.availability ?? null,
      ],
    );
    return rec;
  }

  async addExperience(rec: Omit<ExperienceRecord, 'id'>): Promise<ExperienceRecord> {
    await this.ensureActor(rec.userId);
    const { rows } = await this.query(
      `insert into candidate_experiences (user_id, company_name, title, start_date, end_date, is_current, description)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [rec.userId, rec.companyName, rec.title, rec.startDate || null, rec.endDate ?? null, rec.isCurrent, (rec as any).description ?? null],
    );
    return { ...rec, id: rows[0].id };
  }

  async addEducation(rec: Omit<EducationRecord, 'id'>): Promise<EducationRecord> {
    await this.ensureActor(rec.userId);
    const { rows } = await this.query(
      `insert into candidate_education (user_id, institution_name, degree, field_of_study)
       values ($1, $2, $3, $4) returning id`,
      [rec.userId, rec.institutionName, rec.degree ?? null, rec.fieldOfStudy ?? null],
    );
    return { ...rec, id: rows[0].id };
  }

  async addSkill(userId: string, skillName: string): Promise<string[]> {
    await this.ensureActor(userId);
    await this.query(
      `insert into skills (name) values ($1) on conflict (name) do nothing`,
      [skillName],
    );
    const { rows: skillRows } = await this.query(`select id from skills where name = $1`, [skillName]);
    await this.query(
      `insert into candidate_skills (user_id, skill_id) values ($1, $2) on conflict do nothing`,
      [userId, skillRows[0].id],
    );
    const { rows } = await this.query(
      `select s.name from candidate_skills cs join skills s on s.id = cs.skill_id where cs.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.name);
  }

  async addLanguage(userId: string, languageCode: string): Promise<string[]> {
    await this.ensureActor(userId);
    await this.query(
      `insert into candidate_languages (user_id, locale_code, proficiency)
       values ($1, $2, 'not_specified') on conflict (user_id, locale_code) do nothing`,
      [userId, languageCode],
    );
    const { rows } = await this.query(
      `select locale_code from candidate_languages where user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.locale_code);
  }

  async addDocument(rec: Omit<DocumentRecord, 'id'>): Promise<DocumentRecord> {
    await this.ensureActor(rec.userId);
    const { rows } = await this.query(
      `insert into candidate_documents (user_id, doc_type, storage_path) values ($1, $2, $3) returning id`,
      [rec.userId, rec.docType, rec.fileName],
    );
    return { ...rec, id: rows[0].id };
  }

  async getDocument(documentId: string): Promise<DocumentRecord | null> {
    const { rows } = await this.query(`select id, user_id, doc_type, storage_path from candidate_documents where id = $1`, [documentId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, userId: r.user_id, docType: r.doc_type, fileName: r.storage_path };
  }

  async createReport(rec: Omit<ReportRecordFull, 'id' | 'status' | 'createdAt'>): Promise<ReportRecordFull> {
    const reporterId = await this.ensureActor(rec.reportedBy);
    if (rec.targetType === 'job_offer') {
      const { rows } = await this.query(
        `insert into job_offer_reports (job_offer_id, reported_by, reason) values ($1, $2, $3)
         returning id, created_at`,
        [rec.targetId, reporterId, rec.reason],
      );
      return { ...rec, id: rows[0].id, status: 'open', createdAt: rows[0].created_at.toISOString() };
    }
    const { rows } = await this.query(
      `insert into organization_reports (organization_id, reported_by, reason) values ($1, $2, $3)
       returning id, created_at`,
      [rec.targetId, reporterId, rec.reason],
    );
    return { ...rec, id: rows[0].id, status: 'open', createdAt: rows[0].created_at.toISOString() };
  }

  private async getReportRaw(reportId: string): Promise<{ table: 'job_offer_reports' | 'organization_reports'; row: any } | null> {
    const jo = await this.query(`select * from job_offer_reports where id = $1`, [reportId]);
    if (jo.rows.length > 0) return { table: 'job_offer_reports', row: jo.rows[0] };
    const org = await this.query(`select * from organization_reports where id = $1`, [reportId]);
    if (org.rows.length > 0) return { table: 'organization_reports', row: org.rows[0] };
    return null;
  }

  private rowToReport(table: 'job_offer_reports' | 'organization_reports', row: any): ReportRecordFull {
    return {
      id: row.id,
      targetType: table === 'job_offer_reports' ? 'job_offer' : 'organization',
      targetId: table === 'job_offer_reports' ? row.job_offer_id : row.organization_id,
      reason: row.reason,
      reportedBy: row.reported_by,
      status: row.status,
      resolution: row.status === 'resolved' ? (row.resolution_notes as 'confirmed' | 'unfounded') : undefined,
      createdAt: row.created_at.toISOString(),
    };
  }

  async getReport(reportId: string): Promise<ReportRecordFull | undefined> {
    const found = await this.getReportRaw(reportId);
    if (!found) return undefined;
    return this.rowToReport(found.table, found.row);
  }

  async listReports(): Promise<ReportRecordFull[]> {
    const jo = await this.query(`select * from job_offer_reports`);
    const org = await this.query(`select * from organization_reports`);
    return [
      ...jo.rows.map((r) => this.rowToReport('job_offer_reports', r)),
      ...org.rows.map((r) => this.rowToReport('organization_reports', r)),
    ];
  }

  async resolveReport(reportId: string, resolution: 'confirmed' | 'unfounded'): Promise<ReportRecordFull> {
    const found = await this.getReportRaw(reportId);
    if (!found) throw new NotFoundError(`report ${reportId} not found`);
    if (found.row.status === 'resolved' || found.row.status === 'dismissed') {
      throw new Error(`Denúncia já está num estado terminal: ${found.row.status}`);
    }
    const newStatus = resolution === 'confirmed' ? 'resolved' : 'dismissed';
    await this.query(
      `update ${found.table} set status = $1, resolved_at = now(), resolution_notes = $2 where id = $3`,
      [newStatus, resolution, reportId],
    );
    if (resolution === 'confirmed' && found.table === 'job_offer_reports') {
      await this.query(`update job_offers set status = 'suspended' where id = $1`, [found.row.job_offer_id]);
    }
    const updated = await this.getReportRaw(reportId);
    return this.rowToReport(found.table, updated!.row);
  }

  async addAuditLog(actorId: string, entityType: string, entityId: string, action: string): Promise<AuditLogRecord> {
    if (this.usingSharedZosDatabase) {
      const { rows } = await this.query(
        `select * from record_audit_log(null, $1, $2, $3)`,
        [entityType, entityId, action],
      );

      const { rows: actorRows } = await this.query(
        `select auth.uid() as actor_user_id`,
      );

      const authenticatedActor = actorRows[0]?.actor_user_id ?? null;

      return {
        id: rows[0].id,
        actorId: authenticatedActor,
        entityType,
        entityId,
        action,
        createdAt: rows[0].created_at.toISOString(),
      };
    }

    const resolvedActor = await this.ensureActor(actorId);
    const { rows } = await this.query(
      `select * from record_audit_log($1, null, $2, $3, $4)`,
      [resolvedActor, entityType, entityId, action],
    );

    return {
      id: rows[0].id,
      actorId: resolvedActor,
      entityType,
      entityId,
      action,
      createdAt: rows[0].created_at.toISOString(),
    };
  }

  async listAuditLogs(): Promise<AuditLogRecord[]> {
    const { rows } = await this.query(`select * from audit_logs order by created_at asc`);
    return rows.map((r) => ({
      id: r.id, actorId: r.actor_user_id, entityType: r.entity_type, entityId: r.entity_id,
      action: r.action, createdAt: r.created_at.toISOString(),
    }));
  }

  async setTranslation(entityType: string, entityId: string, field: string, locale: string, value: string): Promise<TranslationRecord> {
    await this.query(
      `insert into translations (entity_type, entity_id, field, locale, value)
       values ($1, $2, $3, $4, $5)
       on conflict (entity_type, entity_id, field, locale) do update set value = excluded.value, updated_at = now()`,
      [entityType, entityId, field, locale, value],
    );
    return { entityType, entityId, field, locale, value };
  }

  async getTranslationsFor(entityType: string, entityId: string): Promise<TranslationRecord[]> {
    const { rows } = await this.query(
      `select field, locale, value from translations where entity_type = $1 and entity_id = $2`,
      [entityType, entityId],
    );
    return rows.map((r) => ({ entityType, entityId, field: r.field, locale: r.locale, value: r.value }));
  }

  async addCourse(rec: Omit<CourseRecord, 'id'>): Promise<CourseRecord> {
    const { rows } = await this.query(
      `insert into institution_courses (organization_id, name, field_of_study) values ($1, $2, $3) returning id`,
      [rec.organizationId, rec.name, rec.fieldOfStudy ?? null],
    );
    return { ...rec, id: rows[0].id };
  }

  async reserveOfferForInstitution(jobOfferId: string, institutionOrgId: string): Promise<ReservationRecord> {
    const { rows } = await this.query(
      `insert into offer_institution_reservations (job_offer_id, institution_org_id) values ($1, $2) returning id`,
      [jobOfferId, institutionOrgId],
    );
    return { id: rows[0].id, jobOfferId, institutionOrgId };
  }

  async listReservedOffersForInstitution(institutionOrgId: string): Promise<JobOfferRecord[]> {
    const { rows } = await this.query(
      `select jo.* from offer_institution_reservations r
       join job_offers jo on jo.id = r.job_offer_id
       where r.institution_org_id = $1`,
      [institutionOrgId],
    );
    return rows.map((r) => this.rowToJobOffer(r));
  }

  async confirmedComplaintsForOrg(orgId: string): Promise<number> {
    const { rows } = await this.query(`select employer_public_metrics($1) as m`, [orgId]);
    return Number(rows[0].m.confirmedComplaintsCount);
  }

  async getCandidateProfileBundle(userId: string) {
    // Sequencial, não Promise.all: todas passam pelo MESMO client da
    // transação do pedido (ver withRequestContext) — disparar várias
    // queries em paralelo na mesma ligação é um padrão não suportado de
    // forma segura pelo driver `pg` (gera o aviso de depreciação "client
    // already executing a query" e, pior, pode intercalar de forma
    // imprevisível com o `set_config` do contexto RLS do pedido).
    const profile = await this.query(`select * from candidate_profiles where user_id = $1`, [userId]);
    const experiences = await this.query(`select * from candidate_experiences where user_id = $1`, [userId]);
    const education = await this.query(`select * from candidate_education where user_id = $1`, [userId]);
    const skills = await this.query(`select s.name from candidate_skills cs join skills s on s.id = cs.skill_id where cs.user_id = $1`, [userId]);
    const languages = await this.query(`select locale_code from candidate_languages where user_id = $1`, [userId]);
    const documents = await this.query(`select * from candidate_documents where user_id = $1`, [userId]);
    return {
      profile: profile.rows[0]
        ? {
            userId,
            professionalTitle: profile.rows[0].professional_title,
            summary: profile.rows[0].summary,
            visibility: profile.rows[0].visibility,
          }
        : null,
      experiences: experiences.rows.map((r) => ({
        id: r.id, userId, companyName: r.company_name, title: r.title,
        startDate: r.start_date, endDate: r.end_date, isCurrent: r.is_current, description: r.description,
      })),
      education: education.rows.map((r) => ({
        id: r.id, userId, institutionName: r.institution_name, degree: r.degree, fieldOfStudy: r.field_of_study,
      })),
      skills: skills.rows.map((r) => r.name),
      languages: languages.rows.map((r) => r.locale_code),
      documents: documents.rows.map((r) => ({ id: r.id, userId, docType: r.doc_type, fileName: r.storage_path })),
    };
  }

  private rowToJobOffer(r: any): JobOfferRecord {
    return {
      id: r.id,
      organizationId: r.organization_id,
      title: r.title,
      description: r.description,
      contractType: r.contract_type,
      salaryMin: Number(r.salary_min),
      salaryMax: r.salary_max === null ? null : Number(r.salary_max),
      salaryCurrency: r.salary_currency,
      salaryPeriod: r.salary_period,
      hasFixedSalary: r.has_fixed_salary,
      variableCompensationNotes: r.variable_compensation_notes,
      workRegime: r.work_regime,
      locationId: r.location_id,
      employerIdentified: true,
      applicationDeadline: r.application_deadline,
      pillar: r.pillar,
      status: r.status,
      userCompanyName: r.user_company_name,
      userCompanyLocationId: r.user_company_location_id,
      assignmentEndDate: r.assignment_end_date,
      equalTreatmentConfirmed: r.equal_treatment_confirmed,
      collectiveAgreementDerogationReference: r.collective_agreement_derogation_reference,
      informedOfPermanentVacancies: r.informed_of_permanent_vacancies,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async createJobOffer(draft: Omit<JobOfferDraft, 'status'>): Promise<JobOfferRecord> {
    const org = await this.query(`select created_by from organizations where id = $1`, [draft.organizationId]);
    if (org.rows.length === 0) throw new NotFoundError(`organization ${draft.organizationId} not found`);
    const createdBy = org.rows[0].created_by; // ver nota 2 no topo do ficheiro

    const { rows } = await this.query(
      `insert into job_offers (
         organization_id, created_by, title, description, contract_type,
         salary_min, salary_max, salary_currency, salary_period, has_fixed_salary,
         work_regime, location_id, pillar, status,
         user_company_name, user_company_location_id, assignment_end_date,
         equal_treatment_confirmed, collective_agreement_derogation_reference,
         informed_of_permanent_vacancies
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16,$17,$18,$19)
       returning *`,
      [
        draft.organizationId, createdBy, draft.title, draft.description, draft.contractType,
        draft.salaryMin, draft.salaryMax ?? null, draft.salaryCurrency, draft.salaryPeriod, draft.hasFixedSalary,
        draft.workRegime, draft.locationId ?? null, draft.pillar,
        draft.userCompanyName ?? null, draft.userCompanyLocationId ?? null, draft.assignmentEndDate ?? null,
        draft.equalTreatmentConfirmed ?? false, draft.collectiveAgreementDerogationReference ?? null,
        draft.informedOfPermanentVacancies ?? false,
      ],
    );
    return this.rowToJobOffer(rows[0]);
  }

  async setJobOfferStatus(id: string, status: JobOfferStatus): Promise<JobOfferRecord> {
    const { rows } = await this.query(
      `update job_offers set status = $1, updated_at = now() where id = $2 returning *`,
      [status, id],
    );
    if (rows.length === 0) throw new NotFoundError(`job offer ${id} not found`);
    return this.rowToJobOffer(rows[0]);
  }

  async listPublishedJobOffers(): Promise<JobOfferRecord[]> {
    const { rows } = await this.query(`select * from job_offers where status = 'published'`);
    return rows.map((r) => this.rowToJobOffer(r));
  }

  private rowToApplication(r: any, history: any[]): ApplicationRecord {
    return {
      id: r.id, jobOfferId: r.job_offer_id, candidateId: r.candidate_id, status: r.status,
      createdAt: r.created_at.toISOString(),
      history: history.map((h) => ({ from: h.from_status, to: h.to_status, at: h.created_at.toISOString() })),
    };
  }

  async createApplication(jobOfferId: string, candidateId: string): Promise<ApplicationRecord> {
    await this.ensureActor(candidateId);
    const { rows } = await this.query(
      `insert into applications (job_offer_id, candidate_id, status) values ($1, $2, 'submitted') returning *`,
      [jobOfferId, candidateId],
    );
    await this.query(
      `insert into application_status_history (application_id, from_status, to_status) values ($1, null, 'submitted')`,
      [rows[0].id],
    );
    return this.rowToApplication(rows[0], [{ from_status: null, to_status: 'submitted', created_at: rows[0].created_at }]);
  }

  async listApplicationsForOffer(jobOfferId: string): Promise<ApplicationRecord[]> {
    const { rows } = await this.query(`select * from applications where job_offer_id = $1`, [jobOfferId]);
    // Sequencial, não Promise.all — ver nota em getCandidateProfileBundle.
    const withHistory: ApplicationRecord[] = [];
    for (const r of rows) {
      const h = await this.query(
        `select * from application_status_history where application_id = $1 order by created_at asc`,
        [r.id],
      );
      withHistory.push(this.rowToApplication(r, h.rows));
    }
    return withHistory;
  }

  async mustGetApplication(id: string): Promise<ApplicationRecord> {
    const { rows } = await this.query(`select * from applications where id = $1`, [id]);
    if (rows.length === 0) throw new NotFoundError(`application ${id} not found`);
    const h = await this.query(
      `select * from application_status_history where application_id = $1 order by created_at asc`,
      [id],
    );
    return this.rowToApplication(rows[0], h.rows);
  }

  async transitionApplication(id: string, to: ApplicationStatus): Promise<ApplicationRecord> {
    const current = await this.mustGetApplication(id);
    await this.query(`update applications set status = $1, updated_at = now() where id = $2`, [to, id]);
    await this.query(
      `insert into application_status_history (application_id, from_status, to_status) values ($1, $2, $3)`,
      [id, current.status, to],
    );
    return this.mustGetApplication(id);
  }

  async computeEmployerMetrics(orgId: string) {
    const org = await this.mustGetOrg(orgId);
    const offersRes = await this.query(
      `select * from job_offers where organization_id = $1 and status in ('published','filled','expired')`,
      [orgId],
    );
    const published = offersRes.rows.map((r) => this.rowToJobOffer(r));

    const offersWithFixedSalaryCount = published.filter((o) => o.hasFixedSalary).length;
    const offersWithCompleteFieldsCount = published.filter((o) => o.title && o.description && o.salaryMin && o.salaryCurrency).length;

    // Ver 0015_reports_rls_and_public_metrics.sql: applications e denúncias
    // são corretamente restritas por RLS a quem é dono/membro/staff, mas o
    // ERI é pensado para ser transparência pública — por isso os agregados
    // vêm de uma função security definer dedicada, nunca de leitura direta
    // das tabelas de detalhe.
    const { rows } = await this.query(`select employer_public_metrics($1) as m`, [orgId]);
    const m = rows[0].m;
    const totalApplications = Number(m.totalApplications);

    return {
      verificationStatus: org.verificationStatus,
      publishedOffersCount: published.length,
      offersWithFixedSalaryCount,
      offersWithCompleteFieldsCount,
      responseRate: totalApplications === 0 ? 0 : Number(m.respondedApplications) / totalApplications,
      candidatesInformedRate: totalApplications === 0 ? 0 : Number(m.informedApplications) / totalApplications,
      confirmedComplaintsCount: Number(m.confirmedComplaintsCount),
      offerVsRealityDivergenceCount: 0,
      firstJobHiresCount: Number(m.firstJobHiresCount),
      seniorHiresCount: Number(m.seniorHiresCount),
    };
  }

  /* ---------------- Classificação de empresas (migration 0022) ---------------- */

  async listNaceCodes() {
    const { rows } = await this.query(
      `select code, level, section_letter, label_pt, label_en, source, source_url from nace_codes order by code`,
    );
    return rows.map((r) => ({
      code: r.code, level: r.level, sectionLetter: r.section_letter,
      labelPt: r.label_pt, labelEn: r.label_en, source: r.source, sourceUrl: r.source_url,
    }));
  }

  /**
   * Pesquisa pública de empregadores verificados, com filtros oficiais e
   * verificáveis — número de funcionários e setor NACE, nunca texto livre
   * sem estrutura. Só devolve organizações verified/enhanced_verified
   * (mesma regra de sempre: só empregador verificado é visível
   * publicamente com este nível de detalhe).
   */
  async searchOrganizations(filters: {
    minEmployees?: number;
    maxEmployees?: number;
    naceCode?: string;
    smeCategory?: 'micro' | 'small' | 'medium' | 'large';
  }) {
    const conditions: string[] = [`cp.verification_status in ('verified', 'enhanced_verified')`];
    const params: any[] = [];

    if (filters.minEmployees !== undefined) {
      params.push(filters.minEmployees);
      conditions.push(`cp.employee_count >= $${params.length}`);
    }
    if (filters.maxEmployees !== undefined) {
      params.push(filters.maxEmployees);
      conditions.push(`cp.employee_count <= $${params.length}`);
    }
    if (filters.naceCode) {
      params.push(filters.naceCode);
      conditions.push(`cp.nace_code = $${params.length}`);
    }
    if (filters.smeCategory) {
      // Espelha exatamente os limiares de companyClassification.ts —
      // ver esse ficheiro para a justificação (Recomendação 2003/361/CE).
      const ranges: Record<string, [number, number | null]> = {
        micro: [0, 9], small: [10, 49], medium: [50, 249], large: [250, null],
      };
      const [min, max] = ranges[filters.smeCategory];
      params.push(min);
      conditions.push(`cp.employee_count >= $${params.length}`);
      if (max !== null) {
        params.push(max);
        conditions.push(`cp.employee_count <= $${params.length}`);
      }
    }

    const { rows } = await this.query(
      `select o.id, o.legal_name, o.display_name, o.type,
              cp.employee_count, cp.employee_count_updated_at, cp.nace_code, cp.verification_status,
              nc.label_pt as nace_label_pt
       from organizations o
       join company_profiles cp on cp.organization_id = o.id
       left join nace_codes nc on nc.code = cp.nace_code
       where ${conditions.join(' and ')}
       order by o.legal_name`,
      params,
    );
    return rows.map((r) => ({
      id: r.id, legalName: r.legal_name, displayName: r.display_name, type: r.type,
      employeeCount: r.employee_count,
      employeeCountUpdatedAt: r.employee_count_updated_at ? r.employee_count_updated_at.toISOString() : null,
      naceCode: r.nace_code, naceLabelPt: r.nace_label_pt,
      verificationStatus: r.verification_status,
    }));
  }

  async setCompanyClassification(orgId: string, employeeCount: number | null, naceCode: string | null) {
    await this.query(
      `update company_profiles set employee_count = $1, employee_count_updated_at = now(), nace_code = $2
       where organization_id = $3`,
      [employeeCount, naceCode, orgId],
    );
  }

  /* ---------------- Legislação laboral e simulador bruto->líquido (migration 0023) ---------------- */

  async getCountryLaborProfile(countryCode: string) {
    const { rows } = await this.query(
      `select * from country_labor_profiles where country_code = $1`,
      [countryCode.toUpperCase()],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      countryCode: r.country_code,
      hasStatutoryMinimumWage: r.has_statutory_minimum_wage,
      minimumWageMonthly: r.minimum_wage_monthly === null ? null : Number(r.minimum_wage_monthly),
      minimumWageCurrency: r.minimum_wage_currency,
      minimumWageSource: r.minimum_wage_source,
      minimumWageSourceUrl: r.minimum_wage_source_url,
      minimumWageEffectiveDate: r.minimum_wage_effective_date,
      maxWeeklyHours: Number(r.max_weekly_hours),
      minAnnualLeaveDays: r.min_annual_leave_days,
      workingTimeSource: r.working_time_source,
      workingTimeSourceUrl: r.working_time_source_url,
      notes: r.notes,
    };
  }

  async listCountryLaborProfiles() {
    const { rows } = await this.query(`select country_code from country_labor_profiles order by country_code`);
    const profiles = [];
    for (const r of rows) profiles.push(await this.getCountryLaborProfile(r.country_code));
    return profiles;
  }

  async getCountryTaxProfile(countryCode: string) {
    const { rows: profileRows } = await this.query(
      `select * from country_tax_profiles where country_code = $1`,
      [countryCode.toUpperCase()],
    );
    if (profileRows.length === 0) return null;
    const p = profileRows[0];
    const { rows: bracketRows } = await this.query(
      `select bracket_order, income_from, income_to, marginal_rate
       from country_income_tax_brackets where country_code = $1 order by bracket_order asc`,
      [countryCode.toUpperCase()],
    );
    return {
      countryCode: p.country_code,
      employeeSocialContributionRate: Number(p.employee_social_contribution_rate),
      currency: p.currency,
      taxBracketSource: p.tax_bracket_source,
      taxBracketSourceUrl: p.tax_bracket_source_url,
      socialContributionSource: p.social_contribution_source,
      socialContributionSourceUrl: p.social_contribution_source_url,
      applicableTaxYear: p.applicable_tax_year,
      scopeNotes: p.scope_notes,
      brackets: bracketRows.map((b) => ({
        bracketOrder: b.bracket_order,
        incomeFrom: Number(b.income_from),
        incomeTo: b.income_to === null ? null : Number(b.income_to),
        marginalRate: Number(b.marginal_rate),
      })),
    };
  }

  /* ---------------- Relevância candidato <-> oferta (matching.ts) ---------------- */

  async getCandidateMatchingProfile(userId: string) {
    const profileRes = await this.query(
      `select desired_work_regime, desired_salary_min, desired_salary_max, desired_salary_currency,
              desired_contract_types, interested_in_first_job, interested_in_senior_roles,
              interested_in_interim, location_id, is_internationally_mobile
       from candidate_profiles where user_id = $1`,
      [userId],
    );
    if (profileRes.rows.length === 0) return null;
    const p = profileRes.rows[0];
    const skillsRes = await this.query(
      `select s.name from candidate_skills cs join skills s on s.id = cs.skill_id where cs.user_id = $1`,
      [userId],
    );
    return {
      skills: skillsRes.rows.map((r) => r.name),
      desiredContractTypes: p.desired_contract_types ?? [],
      desiredWorkRegime: p.desired_work_regime,
      desiredSalaryMin: p.desired_salary_min === null ? null : Number(p.desired_salary_min),
      desiredSalaryMax: p.desired_salary_max === null ? null : Number(p.desired_salary_max),
      desiredSalaryCurrency: p.desired_salary_currency,
      interestedInFirstJob: p.interested_in_first_job,
      interestedInSeniorRoles: p.interested_in_senior_roles,
      interestedInInterim: p.interested_in_interim,
      locationId: p.location_id,
      isInternationallyMobile: p.is_internationally_mobile,
    };
  }

  /**
   * Contagem agregada e privada de candidatos cujas preferências
   * DECLARADAS (não competências — ver nota) correspondem a esta oferta.
   * Nunca expõe candidatos individuais, só o número — mesmo padrão de
   * privacidade de employer_public_metrics (migration 0015). Só conta
   * candidatos com is_open_to_offers=true e visibilidade não-privada.
   */
  async getCandidatePoolInsight(offerId: string) {
    const { rows } = await this.query(`select candidate_pool_insight($1) as result`, [offerId]);
    return rows[0].result;
  }

  /* ---------------- Pontuação de candidato para o empregador (candidateScore.ts) ---------------- */

  async getCandidateScoringProfile(userId: string) {
    const skillsRes = await this.query(
      `select s.name from candidate_skills cs join skills s on s.id = cs.skill_id where cs.user_id = $1`,
      [userId],
    );
    const languagesRes = await this.query(`select locale_code from candidate_languages where user_id = $1`, [userId]);
    const experiencesRes = await this.query(`select description from candidate_experiences where user_id = $1`, [userId]);
    const profileRes = await this.query(`select availability from candidate_profiles where user_id = $1`, [userId]);

    const quantificationPattern = /\d+([.,]\d+)?\s*%?/;
    const quantifiedCount = experiencesRes.rows.filter((r) => r.description && quantificationPattern.test(r.description)).length;

    const bundle = await this.getCandidateProfileBundle(userId);
    const completenessResult = computeProfileCompleteness({
      hasProfessionalTitle: !!bundle.profile?.professionalTitle,
      hasSummary: !!bundle.profile?.summary,
      experienceCount: bundle.experiences.length,
      educationCount: bundle.education.length,
      skillCount: bundle.skills.length,
      languageCount: bundle.languages.length,
      hasResumeDocument: bundle.documents.some((d) => d.docType === 'cv'),
      hasVisibilitySet: !!bundle.profile?.visibility,
    });

    return {
      skills: skillsRes.rows.map((r) => r.name),
      languages: languagesRes.rows.map((r) => r.locale_code),
      experienceCount: experiencesRes.rows.length,
      experienceDescriptionsWithQuantifiedAchievements: quantifiedCount,
      profileCompletenessScore: completenessResult.score,
      availability: profileRes.rows[0]?.availability ?? null,
    };
  }

  async mustGetOrg(id: string): Promise<OrganizationRecord> {
    const { rows } = await this.query(
      `select o.*, cp.verification_status, cp.verification_requested_at
       from organizations o
       left join company_profiles cp on cp.organization_id = o.id
       where o.id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundError(`organization ${id} not found`);
    const r = rows[0];
    return {
      id: r.id, type: r.type, legalName: r.legal_name, displayName: r.display_name, createdBy: r.created_by,
      verificationStatus: (r.verification_status ?? 'unverified') as VerificationStatus,
      verificationRequestedAt: r.verification_requested_at ? r.verification_requested_at.toISOString() : undefined,
    };
  }

  async mustGetJobOffer(id: string): Promise<JobOfferRecord> {
    const { rows } = await this.query(`select * from job_offers where id = $1`, [id]);
    if (rows.length === 0) throw new NotFoundError(`job offer ${id} not found`);
    return this.rowToJobOffer(rows[0]);
  }

  /* ---------------- Profissões e tabelas salariais oficiais (migration 0021) ---------------- */

  async listOccupations() {
    const { rows } = await this.query(
      `select isco08_code, major_group_code, major_group_label_pt, preferred_label_pt, preferred_label_en, source, source_url
       from occupations order by isco08_code`,
    );
    return rows.map((r) => ({
      iscoCode: r.isco08_code,
      majorGroupCode: r.major_group_code,
      majorGroupLabel: r.major_group_label_pt,
      preferredLabelPt: r.preferred_label_pt,
      preferredLabelEn: r.preferred_label_en,
      source: r.source,
      sourceUrl: r.source_url,
    }));
  }

  /**
   * Devolve todas as convenções coletivas (com os respetivos níveis
   * salariais) que têm pelo menos uma categoria ligada a esta profissão.
   * Nunca inventa uma referência — se não houver nenhuma convenção
   * mapeada, devolve lista vazia (ver salaryReference.ts: 'no_reference_available').
   */
  async getSalaryReferenceForOccupation(iscoCode: string) {
    const { rows: agreementRows } = await this.query(
      `select distinct ca.id, ca.name, ca.sector_description, ca.source_document_reference, ca.source_url,
              ca.salary_table_effective_from, ca.salary_table_effective_to
       from collective_agreements ca
       join collective_agreement_job_categories cjc on cjc.agreement_id = ca.id
       where cjc.occupation_isco_code = $1`,
      [iscoCode],
    );

    const results = [];
    for (const a of agreementRows) {
      const { rows: levelRows } = await this.query(
        `select level_code, level_rank, monthly_minimum, currency
         from collective_agreement_salary_levels where agreement_id = $1 order by level_rank asc`,
        [a.id],
      );
      const { rows: categoryRows } = await this.query(
        `select cjc.category_name, l.level_code
         from collective_agreement_job_categories cjc
         join collective_agreement_salary_levels l on l.id = cjc.level_id
         where cjc.agreement_id = $1 and cjc.occupation_isco_code = $2`,
        [a.id, iscoCode],
      );
      results.push({
        agreementName: a.name,
        sectorDescription: a.sector_description,
        sourceDocumentReference: a.source_document_reference,
        sourceUrl: a.source_url,
        effectiveFrom: a.salary_table_effective_from,
        effectiveTo: a.salary_table_effective_to,
        matchingCategories: categoryRows.map((c) => ({ categoryName: c.category_name, levelCode: c.level_code })),
        levels: levelRows.map((l) => ({
          levelCode: l.level_code,
          levelRank: l.level_rank,
          monthlyMinimum: Number(l.monthly_minimum),
          currency: l.currency,
        })),
      });
    }
    return results;
  }

  /* ---------------- Papéis de plataforma (P0.3: fechar a lacuna de autorização) ----------------
   *
   * organization_type já tem 'platform_admin' e org_role já tem
   * 'platform_moderator' | 'platform_auditor' | 'platform_superadmin'
   * (migration 0002) — esta camada só liga isso a métodos utilizáveis.
   * Não existia ainda nenhum caminho para conceder estes papéis.
   */

  private async getPlatformAdminOrgId(bootstrappingUserId: string): Promise<string> {
    const existing = await this.query(
      `select id from organizations where type = 'platform_admin' limit 1`,
    );
    if (existing.rows.length > 0) return existing.rows[0].id;
    const { rows } = await this.query(
      `insert into organizations (type, legal_name, display_name, created_by)
       values ('platform_admin', 'Z Jobs Platform', 'Z Jobs Platform', $1) returning id`,
      [bootstrappingUserId],
    );
    return rows[0].id;
  }

  async countPlatformStaff(): Promise<number> {
    const { rows } = await this.query(`select count_platform_staff() as n`);
    return rows[0].n;
  }

  async grantPlatformRole(
    userId: string,
    role: 'platform_moderator' | 'platform_auditor' | 'platform_superadmin' = 'platform_superadmin',
  ): Promise<void> {
    const orgId = await this.getPlatformAdminOrgId(userId);
    await this.query(
      `insert into organization_memberships (organization_id, user_id, role) values ($1, $2, $3)
       on conflict do nothing`,
      [orgId, userId, role],
    );
  }

  async isPlatformStaff(userId: string): Promise<boolean> {
    const { rows } = await this.query(
      `select 1 from organization_memberships
       where user_id = $1 and role in ('platform_moderator','platform_auditor','platform_superadmin')`,
      [userId],
    );
    return rows.length > 0;
  }

  /**
   * Direito ao esquecimento — investiga o estado real da pessoa (não
   * assume nada), pede ao domínio o plano correto, e só depois executa.
   * Nunca apaga primeiro e pergunta depois.
   */
  async executeCandidateErasure(candidateId: string): Promise<ErasurePlan> {
    // O modo shared ZOS será executado atomicamente por uma função
    // SECURITY DEFINER no schema jobs. Até essa função entrar no baseline,
    // não executamos aqui mutações parciais que possam tocar identidade
    // transversal ou contornar RLS.
    if (this.usingSharedZosDatabase) {
      const { rows } = await this.query(
        `select jobs.execute_candidate_erasure($1::uuid) as storage_paths`,
        [candidateId],
      );

      const rawStoragePaths = rows[0]?.storage_paths;
      const storagePaths: string[] = Array.isArray(rawStoragePaths)
        ? rawStoragePaths.filter(
            (value: unknown): value is string =>
              typeof value === 'string' && value.length > 0,
          )
        : [];

      for (const storagePath of storagePaths) {
        await this.scheduleAfterCommit(
          () => fileStorageService.delete(storagePath),
        );
      }

      return planCandidateErasure({ candidateId });
    }

    // Compatibilidade temporária do runtime standalone histórico.
    // Este caminho será revisto separadamente; não define o contrato ZOS.
    const plan = planCandidateErasure({ candidateId });

    for (const action of plan.actions) {
      if (action.action === 'delete') {
        if (action.table === 'application_notes') {
          await this.query(
            `delete from application_notes
             where application_id in (
               select id from applications where candidate_id = $1
             )`,
            [candidateId],
          );
          continue;
        }

        await this.query(
          `delete from ${action.table} where user_id = $1`,
          [candidateId],
        );
        continue;
      }

      if (action.table === 'application_status_history') {
        await this.query(
          `update application_status_history
           set changed_by = case when changed_by = $1 then null else changed_by end,
               note = null
           where application_id in (
             select id from applications where candidate_id = $1
           )`,
          [candidateId],
        );
        continue;
      }

      if (action.table === 'applications') {
        // O schema standalone histórico ainda mantém candidate_id NOT NULL;
        // a anonimização estrutural pertence ao novo baseline convergido.
        continue;
      }
    }

    return plan;
  }

  // ---------------- Ofertas guardadas ----------------

  async saveOffer(userId: string, jobOfferId: string): Promise<{ saved: true }> {
    await this.query(
      `insert into saved_job_offers (user_id, job_offer_id) values ($1, $2) on conflict do nothing`,
      [userId, jobOfferId],
    );
    return { saved: true };
  }

  async unsaveOffer(userId: string, jobOfferId: string): Promise<{ saved: false }> {
    await this.query(`delete from saved_job_offers where user_id = $1 and job_offer_id = $2`, [userId, jobOfferId]);
    return { saved: false };
  }

  async listSavedOffers(userId: string): Promise<JobOfferRecord[]> {
    const { rows } = await this.query(
      `select jo.* from saved_job_offers s
       join job_offers jo on jo.id = s.job_offer_id
       where s.user_id = $1
       order by s.created_at desc`,
      [userId],
    );
    return rows.map((r) => this.rowToJobOffer(r));
  }

  // ---------------- Alertas de emprego ----------------
  //
  // Aviso honesto: um alerta hoje é só armazenamento — não há nenhum
  // motor a correr periodicamente a comparar novas ofertas contra
  // query_params, nem envio de email quando há correspondência (não
  // existe infraestrutura de email nenhuma nesta plataforma ainda).
  // Criar um alerta hoje regista a intenção; não dispara notificação
  // nenhuma até essa peça existir.

  async createJobAlert(userId: string, queryParams: Record<string, unknown>): Promise<{ id: string }> {
    const { rows } = await this.query(
      `insert into job_alerts (user_id, query_params) values ($1, $2) returning id`,
      [userId, JSON.stringify(queryParams)],
    );
    return { id: rows[0].id };
  }

  async listJobAlerts(userId: string): Promise<Array<{ id: string; queryParams: Record<string, unknown>; isActive: boolean; createdAt: string }>> {
    const { rows } = await this.query(
      `select id, query_params, is_active, created_at from job_alerts where user_id = $1 order by created_at desc`,
      [userId],
    );
    return rows.map((r) => ({ id: r.id, queryParams: r.query_params, isActive: r.is_active, createdAt: r.created_at }));
  }

  async deleteJobAlert(userId: string, alertId: string): Promise<void> {
    await this.query(`delete from job_alerts where id = $1 and user_id = $2`, [alertId, userId]);
  }

  // ---------------- Billing ----------------
  //
  // "operador manual nesta fase; nunca um gateway" — comentário já
  // existente na própria migration 0010_billing.sql, coluna granted_by.
  // Não há processador de pagamentos real ligado a esta plataforma;
  // conceder um produto de billing é uma ação de staff, hoje, tal como
  // aprovar uma verificação. O dia em que houver um gateway real, troca-se
  // só a origem da chamada a grantBillingEvent, não a lógica de domínio.

  async countPublishedOffersForOrg(organizationId: string): Promise<number> {
    // Conta ofertas com status='published' neste momento — subconta o
    // raro caso de uma oferta publicada e depois arquivada, por não
    // termos ainda o histórico de auditoria a guardar organization_id
    // (ver addAuditLog). Suficiente para a regra da quota gratuita, não
    // finge mais precisão do que isto tem.
    const { rows } = await this.query(
      `select count(*)::int as c from job_offers where organization_id = $1 and status = 'published'`,
      [organizationId],
    );
    return rows[0].c;
  }

  async grantBillingEvent(organizationId: string, productCode: BillingProductCode, grantedBy: string, notes: string | null): Promise<{ id: string }> {
    const { rows } = await this.query(
      `insert into billing_events (organization_id, product_code, granted_by, notes) values ($1, $2, $3, $4) returning id`,
      [organizationId, productCode, grantedBy, notes],
    );
    return { id: rows[0].id };
  }

  async listBillingEvents(organizationId: string): Promise<Array<{ organizationId: string; productCode: BillingProductCode; grantedAt: string; expiresAt?: string }>> {
    const { rows } = await this.query(
      `select id, product_code, granted_at, expires_at, notes from billing_events where organization_id = $1 order by granted_at desc`,
      [organizationId],
    );
    return rows.map((r) => ({ organizationId, productCode: r.product_code as BillingProductCode, grantedAt: r.granted_at, expiresAt: r.expires_at ?? undefined }));
  }

  // ---------------- Perfil público de empresa ----------------
  //
  // Antes desta função, o "perfil público" no ZJobsDemo.jsx calculava a
  // partir de `applications`/`reports` já carregados localmente — dados
  // que um candidato normal nunca tem completos, só as suas próprias
  // candidaturas. O painel mostrava números errados ou vazios para
  // quem não fosse o dono da empresa. Isto substitui isso por uma
  // agregação real, do lado do servidor, com acesso a todos os dados.
  //
  // CORREÇÃO a uma nota anterior demasiado cautelosa: cheguei a
  // documentar aqui que 'resolved' era só uma aproximação de "denúncia
  // confirmada". Não é — é exato. resolveReport() (ver mais abaixo
  // neste ficheiro) só transiciona para status='resolved' quando
  // resolution==='confirmed'; o caminho 'unfounded' vai sempre para
  // status='dismissed'. confirmedComplaintsCount conta exatamente o
  // que o nome diz, pela própria convenção já estabelecida no código.
  async getEmployerMetrics(organizationId: string): Promise<EmployerMetrics> {
    // Sequencial, de propósito — Promise.all() com várias queries na
    // mesma ligação partilhada do pedido já causou corrida real nesta
    // sessão (ver comentário histórico em withRequestContext). Cada
    // await aqui espera a query anterior terminar antes da seguinte.
    const orgRes = await this.query(
      `select cp.verification_status from organizations o
       left join company_profiles cp on cp.organization_id = o.id
       where o.id = $1`,
      [organizationId],
    );
    const offersRes = await this.query(
      `select
         count(*) filter (where status in ('published','filled','expired')) as published_count,
         count(*) filter (where status in ('published','filled','expired') and has_fixed_salary) as fixed_salary_count,
         count(*) filter (where status in ('published','filled','expired') and title is not null and description is not null and salary_min is not null) as complete_count
       from job_offers where organization_id = $1`,
      [organizationId],
    );
    const appsRes = await this.query(
      `select
         count(*) as total,
         count(*) filter (where a.status <> 'submitted') as responded,
         count(*) filter (where a.status in ('hired','rejected','withdrawn','closed')) as informed
       from applications a join job_offers jo on jo.id = a.job_offer_id
       where jo.organization_id = $1`,
      [organizationId],
    );
    const reportsRes = await this.query(
      `select count(*) as confirmed from job_offer_reports r
       join job_offers jo on jo.id = r.job_offer_id
       where jo.organization_id = $1 and r.status = 'resolved'`,
      [organizationId],
    );
    const hiresRes = await this.query(
      `select
         count(*) filter (where jo.pillar = 'first_jobs') as first_job_hires,
         count(*) filter (where jo.pillar = 'senior_careers') as senior_hires
       from applications a join job_offers jo on jo.id = a.job_offer_id
       where jo.organization_id = $1 and a.status = 'hired'`,
      [organizationId],
    );

    const o = offersRes.rows[0];
    const a = appsRes.rows[0];
    const h = hiresRes.rows[0];
    const totalApps = Number(a.total);

    return {
      verificationStatus: orgRes.rows[0]?.verification_status ?? 'unverified',
      publishedOffersCount: Number(o.published_count),
      offersWithFixedSalaryCount: Number(o.fixed_salary_count),
      offersWithCompleteFieldsCount: Number(o.complete_count),
      responseRate: totalApps > 0 ? Number(a.responded) / totalApps : 0,
      candidatesInformedRate: totalApps > 0 ? Number(a.informed) / totalApps : 0,
      confirmedComplaintsCount: Number(reportsRes.rows[0].confirmed),
      offerVsRealityDivergenceCount: 0, // não medido ainda — sem mecanismo de deteção implementado
      firstJobHiresCount: Number(h.first_job_hires),
      seniorHiresCount: Number(h.senior_hires),
    };
  }
}
