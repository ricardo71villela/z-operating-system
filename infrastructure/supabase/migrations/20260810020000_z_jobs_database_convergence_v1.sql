-- ============================================================
-- Z Jobs Database Convergence v1
-- Shared ZOS database baseline
--
-- Vertical schema: jobs
-- Core schemas remain authoritative and separate.
-- Historical standalone Jobs migrations are NOT replayed here.
-- ============================================================

--
--



--
-- Z Jobs Database Convergence v1
-- Clean domain baseline for the shared ZOS PostgreSQL database.
--

CREATE SCHEMA IF NOT EXISTS jobs;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

--
-- Name: application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.application_status AS ENUM (
    'submitted',
    'received',
    'screening',
    'shortlisted',
    'interview',
    'assessment',
    'offer',
    'hired',
    'rejected',
    'withdrawn',
    'closed'
);


--
-- Name: billing_product_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.billing_product_code AS ENUM (
    'job_post_single',
    'job_post_bundle',
    'subscription_standard',
    'subscription_enterprise',
    'talent_search_access',
    'employer_branding_page',
    'featured_placement',
    'ats_integration',
    'career_day_listing',
    'market_analytics_report'
);


--
-- Name: contract_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.contract_type AS ENUM (
    'permanent',
    'fixed_term',
    'temporary_agency',
    'interim',
    'project_based',
    'seasonal',
    'paid_internship',
    'trainee_program',
    'replacement_contract',
    'other'
);


--
-- Name: invitation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.invitation_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);


--
-- Name: job_offer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.job_offer_status AS ENUM (
    'draft',
    'pending_review',
    'needs_changes',
    'approved',
    'scheduled',
    'published',
    'paused',
    'filled',
    'expired',
    'rejected',
    'suspended',
    'archived'
);


--
-- Name: job_pillar; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.job_pillar AS ENUM (
    'first_jobs',
    'professional_careers',
    'senior_careers'
);


--
-- Name: org_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.org_role AS ENUM (
    'owner',
    'admin',
    'recruiter',
    'hiring_manager',
    'viewer',
    'career_center_staff',
    'platform_moderator',
    'platform_auditor',
    'platform_superadmin'
);


--
-- Name: organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.organization_type AS ENUM (
    'employer',
    'employer_group',
    'recruitment_agency',
    'temp_work_agency',
    'university',
    'polytechnic',
    'vocational_school',
    'training_center',
    'public_entity',
    'platform_admin'
);


--
-- Name: profile_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.profile_visibility AS ENUM (
    'private',
    'applications_only',
    'visible_to_verified_employers',
    'public'
);


--
-- Name: salary_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.salary_period AS ENUM (
    'hourly',
    'daily',
    'monthly',
    'yearly'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'enhanced_verified',
    'restricted',
    'suspended',
    'rejected'
);


--
-- Name: work_regime; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE jobs.work_regime AS ENUM (
    'on_site',
    'hybrid',
    'remote'
);


--
-- Name: bootstrap_person(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.bootstrap_person(
    p_user_id uuid,
    p_full_name text,
    p_terms_version text DEFAULT NULL::text
) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user id is required'
            USING ERRCODE = '22004';
    END IF;

    IF NULLIF(btrim(coalesce(p_full_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'full name is required'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = p_user_id
    ) THEN
        RAISE EXCEPTION 'auth user does not exist'
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO jobs.persons (
        user_id,
        full_name,
        terms_accepted_at,
        terms_version
    )
    VALUES (
        p_user_id,
        btrim(p_full_name),
        CASE
            WHEN NULLIF(btrim(coalesce(p_terms_version, '')), '') IS NOT NULL
                THEN now()
            ELSE NULL
        END,
        NULLIF(btrim(coalesce(p_terms_version, '')), '')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        terms_accepted_at = CASE
            WHEN EXCLUDED.terms_version IS NOT NULL
                THEN COALESCE(
                    jobs.persons.terms_accepted_at,
                    EXCLUDED.terms_accepted_at
                )
            ELSE jobs.persons.terms_accepted_at
        END,
        terms_version = COALESCE(
            EXCLUDED.terms_version,
            jobs.persons.terms_version
        ),
        updated_at = now();

    -- Self-healing identity registration:
    -- o AFTER INSERT trigger cobre novos jobs.persons; esta chamada
    -- explícita cobre também o caminho ON CONFLICT DO UPDATE, permitindo
    -- reparar um binding Jobs -> ZOS ausente sem criar nova identidade.
    PERFORM platform_internal.register_local_person_identity(
        'jobs',
        p_user_id
    );
END;
$$;


--
-- Name: candidate_pool_insight(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.candidate_pool_insight(p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
declare
  v_contract_type text;
  v_work_regime text;
  v_pillar text;
  v_salary_max numeric;
  v_salary_min numeric;
  v_salary_currency text;
  v_total_open_candidates int;
  v_matching_candidates int;
begin
  select contract_type, jobs.work_regime, pillar,
         coalesce(salary_max, salary_min), salary_min, salary_currency
    into v_contract_type, v_work_regime, v_pillar, v_salary_max, v_salary_min, v_salary_currency
  from jobs.job_offers where id = p_offer_id;

  if v_contract_type is null then
    return jsonb_build_object('error', 'oferta não encontrada');
  end if;

  select count(*) into v_total_open_candidates
  from jobs.candidate_profiles
  where is_open_to_offers = true and visibility <> 'private';

  select count(*) into v_matching_candidates
  from jobs.candidate_profiles cp
  where cp.is_open_to_offers = true
    and cp.visibility <> 'private'
    and (
      cardinality(cp.desired_contract_types) = 0
      or v_contract_type = any(cp.desired_contract_types::text[])
    )
    and (
      cp.desired_work_regime is null
      or cp.desired_work_regime = v_work_regime::jobs.work_regime
      or v_work_regime = 'remote'
      or (cp.desired_work_regime = 'remote' and v_work_regime = 'hybrid')
      or (cp.desired_work_regime = 'hybrid' and v_work_regime = 'remote')
    )
    and (
      v_pillar = 'professional_careers'
      or (v_pillar = 'first_jobs' and cp.interested_in_first_job)
      or (v_pillar = 'senior_careers' and cp.interested_in_senior_roles)
      or (not cp.interested_in_first_job and not cp.interested_in_senior_roles and not cp.interested_in_interim)
    )
    and (
      cp.desired_salary_min is null
      or cp.desired_salary_currency is distinct from v_salary_currency
      or cp.desired_salary_min <= v_salary_max
    );

  return jsonb_build_object(
    'totalOpenCandidatesOnPlatform', v_total_open_candidates,
    'matchingCandidatesEstimate', v_matching_candidates,
    'scopeNote', 'Estimativa baseada só em preferências declaradas (contrato, regime, fase de carreira, salário) — não inclui correspondência de competências. Nunca identifica candidatos individuais.'
  );
end;
$$;


--
-- Name: FUNCTION candidate_pool_insight(p_offer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION jobs.candidate_pool_insight(p_offer_id uuid) IS 'SECURITY DEFINER: só assim consegue agregar sobre candidate_profiles
   apesar do RLS restringir a visibilidade normal a cada candidato. Nunca
   devolve linhas individuais, só contagens — ver nota de âmbito acima.';


--
-- Name: capture_job_offer_status_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.capture_job_offer_status_history() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO jobs.job_offer_status_history (
            job_offer_id,
            from_status,
            to_status,
            changed_by
        )
        VALUES (
            NEW.id,
            NULL,
            NEW.status,
            auth.uid()
        );
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO jobs.job_offer_status_history (
            job_offer_id,
            from_status,
            to_status,
            changed_by
        )
        VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            auth.uid()
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: capture_org_verification_assessment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.capture_org_verification_assessment() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR OLD.verification_status IS DISTINCT FROM NEW.verification_status
    THEN
        INSERT INTO jobs.organization_verification_assessments (
            organization_id,
            outcome,
            assessed_by,
            notes
        )
        VALUES (
            NEW.organization_id,
            NEW.verification_status,
            CASE
                WHEN NEW.verification_status IN (
                    'verified',
                    'enhanced_verified',
                    'restricted',
                    'suspended',
                    'rejected'
                )
                    THEN auth.uid()
                ELSE NULL
            END,
            CASE
                WHEN NEW.verification_status = 'rejected'
                    THEN NEW.rejection_reason
                ELSE NULL
            END
        );
    END IF;

    RETURN NEW;
END;
$$;














--
-- Name: application_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.application_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    author_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: application_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.application_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    from_status jobs.application_status,
    to_status jobs.application_status NOT NULL,
    changed_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_offer_id uuid NOT NULL,
    candidate_id uuid,
    status jobs.application_status DEFAULT 'submitted'::jobs.application_status NOT NULL,
    cover_note text,
    resume_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    organization_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.billing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_code jobs.billing_product_code NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    granted_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE billing_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.billing_events IS 'Registo de concessão de funcionalidades, não de pagamentos. A ligação
   entre isto e dinheiro real acontece fora da plataforma nesta fase
   (ex: contrato comercial manual). Nunca usar esta tabela para calcular
   receita — não tem preços.';


--
-- Name: candidate_data_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_data_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    fields text[] NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: candidate_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    doc_type text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: candidate_education; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_education (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    institution_name text NOT NULL,
    institution_org_id uuid,
    degree text,
    field_of_study text,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: candidate_experiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_experiences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_name text NOT NULL,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    is_current boolean DEFAULT false NOT NULL,
    description text,
    location_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: candidate_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_languages (
    user_id uuid NOT NULL,
    locale_code text NOT NULL,
    proficiency text NOT NULL
);


--
-- Name: candidate_private_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_private_data (
    user_id uuid NOT NULL,
    phone text,
    full_address text,
    date_of_birth date,
    national_id_ref text,
    accessibility_notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE candidate_private_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.candidate_private_data IS 'Nunca legível diretamente por organizações. Partilha só via
   candidate_data_consents (abaixo).';


--
-- Name: candidate_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_profiles (
    user_id uuid NOT NULL,
    professional_title text,
    summary text,
    intro_video_url text,
    location_id uuid,
    work_authorization_notes text,
    is_internationally_mobile boolean DEFAULT false NOT NULL,
    availability text,
    desired_salary_min numeric(12,2),
    desired_salary_max numeric(12,2),
    desired_salary_currency character(3),
    desired_work_regime jobs.work_regime,
    desired_contract_types jobs.contract_type[] DEFAULT '{}'::jobs.contract_type[] NOT NULL,
    interested_in_first_job boolean DEFAULT false NOT NULL,
    interested_in_senior_roles boolean DEFAULT false NOT NULL,
    interested_in_interim boolean DEFAULT false NOT NULL,
    visibility jobs.profile_visibility DEFAULT 'private'::jobs.profile_visibility NOT NULL,
    is_open_to_offers boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: candidate_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.candidate_skills (
    user_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    proficiency text
);


--
-- Name: collective_agreement_job_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.collective_agreement_job_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_id uuid NOT NULL,
    level_id uuid NOT NULL,
    category_name text NOT NULL,
    occupation_isco_code text
);


--
-- Name: collective_agreement_salary_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.collective_agreement_salary_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_id uuid NOT NULL,
    level_code text NOT NULL,
    level_rank integer NOT NULL,
    monthly_minimum numeric(12,2) NOT NULL,
    currency character(3) NOT NULL
);


--
-- Name: collective_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.collective_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sector_description text NOT NULL,
    country_code character(2) NOT NULL,
    party_employer text NOT NULL,
    party_union text NOT NULL,
    covers_workers_count integer,
    covers_companies_count integer,
    source_name text DEFAULT 'Boletim do Trabalho e Emprego (BTE)'::text NOT NULL,
    source_document_reference text NOT NULL,
    source_url text NOT NULL,
    salary_table_effective_from date NOT NULL,
    salary_table_effective_to date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE collective_agreements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.collective_agreements IS 'Metadados da convenção coletiva. NUNCA inserir sem source_document_reference
   e source_url verificáveis — ver princípio no topo desta migration.';


--
-- Name: company_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.company_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    location_id uuid NOT NULL,
    is_headquarters boolean DEFAULT false NOT NULL
);


--
-- Name: company_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.company_profiles (
    organization_id uuid NOT NULL,
    sector text,
    size_range text,
    headquarters_location_id uuid,
    description text,
    culture_notes text,
    remote_policy_notes text,
    inclusion_policy_notes text,
    logo_url text,
    cover_video_url text,
    authorized_email_domains text[] DEFAULT '{}'::text[] NOT NULL,
    verification_status jobs.verification_status DEFAULT 'unverified'::jobs.verification_status NOT NULL,
    verification_requested_at timestamp with time zone,
    verified_at timestamp with time zone,
    verified_by uuid,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_count integer,
    employee_count_updated_at timestamp with time zone,
    nace_code text,
    CONSTRAINT chk_employee_count_non_negative CHECK (((employee_count IS NULL) OR (employee_count >= 0)))
);


--
-- Name: TABLE company_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.company_profiles IS 'Extensão de organizations para type = employer | employer_group |
   recruitment_agency | temp_work_agency. Só organizações com
   verification_status IN (verified, enhanced_verified) podem publicar
   ofertas (regra aplicada em RLS + domínio, secção 7).';


--
-- Name: COLUMN company_profiles.employee_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN jobs.company_profiles.employee_count IS 'Número exato de funcionários, auto-declarado pela organização (nunca
   verificado externamente nesta versão — daí employee_count_updated_at
   para se poder avaliar a idade da informação). Substitui a dependência
   exclusiva de size_range (texto livre) como campo filtrável.';


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.countries (
    code character(2) NOT NULL,
    name text NOT NULL,
    default_locale text NOT NULL,
    default_currency character(3) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE countries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.countries IS 'Países suportados pelo Z Jobs. is_active controla expansão faseada.';


--
-- Name: country_income_tax_brackets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.country_income_tax_brackets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    bracket_order integer NOT NULL,
    income_from numeric(14,2) NOT NULL,
    income_to numeric(14,2),
    marginal_rate numeric(5,4) NOT NULL
);


--
-- Name: country_labor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.country_labor_profiles (
    country_code character(2) NOT NULL,
    has_statutory_minimum_wage boolean NOT NULL,
    minimum_wage_monthly numeric(12,2),
    minimum_wage_currency character(3),
    minimum_wage_source text NOT NULL,
    minimum_wage_source_url text NOT NULL,
    minimum_wage_effective_date date NOT NULL,
    max_weekly_hours numeric(5,2) NOT NULL,
    min_annual_leave_days integer NOT NULL,
    working_time_source text DEFAULT 'Diretiva 2003/88/CE do Parlamento Europeu e do Conselho'::text NOT NULL,
    working_time_source_url text DEFAULT 'https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32003L0088'::text NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE country_labor_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.country_labor_profiles IS 'Factos verificáveis, nunca interpretação jurídica. Cada organização
   deve sempre confirmar a aplicação ao seu caso concreto junto de
   aconselhamento jurídico local — esta tabela é ponto de partida
   informativo, não substitui aconselhamento profissional.';


--
-- Name: country_tax_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.country_tax_profiles (
    country_code character(2) NOT NULL,
    employee_social_contribution_rate numeric(5,4) NOT NULL,
    currency character(3) NOT NULL,
    tax_bracket_source text NOT NULL,
    tax_bracket_source_url text NOT NULL,
    social_contribution_source text NOT NULL,
    social_contribution_source_url text NOT NULL,
    applicable_tax_year integer NOT NULL,
    scope_notes text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE country_tax_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.country_tax_profiles IS 'scope_notes é obrigatório e tem de descrever exatamente que
   simplificações o cálculo assume (ex: pessoa solteira, sem
   dependentes, sem quociente familiar) — ver
   packages/domain/src/rules/netSalarySimulator.ts. Este simulador NUNCA
   substitui o simulador oficial do país nem aconselhamento fiscal
   profissional — é só uma estimativa de orientação.';


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.currencies (
    code character(3) NOT NULL,
    name text NOT NULL
);


--
-- Name: employer_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.employer_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    badge_code text NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: employer_responsibility_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.employer_responsibility_metrics (
    organization_id uuid NOT NULL,
    salary_transparency_score numeric(5,2),
    offer_completeness_score numeric(5,2),
    response_rate numeric(5,2),
    avg_response_time_hours numeric(10,2),
    candidates_informed_rate numeric(5,2),
    confirmed_complaints_count integer DEFAULT 0 NOT NULL,
    offer_vs_reality_divergence_count integer DEFAULT 0 NOT NULL,
    first_job_hires_count integer DEFAULT 0 NOT NULL,
    senior_hires_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE employer_responsibility_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.employer_responsibility_metrics IS 'Componentes calculados por jobs de background. Nenhum selo (Verified
   Employer, Salary Transparent Employer, ...) é atribuído manualmente ou
   comprado — ver secção 8.';


--
-- Name: institution_affiliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.institution_affiliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    affiliation_type text NOT NULL,
    course_id uuid,
    consented_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: institution_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.institution_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    field_of_study text,
    degree_level text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: institution_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.institution_profiles (
    organization_id uuid NOT NULL,
    description text,
    career_center_url text,
    has_career_center boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE institution_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.institution_profiles IS 'Extensão de organizations para type IN (university, polytechnic,
   vocational_school, training_center). Só instituições verificadas podem
   ter ofertas reservadas nos seus alunos (ver offer_reservations).';


--
-- Name: job_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.job_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    query_params jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_offer_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.job_offer_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_offer_id uuid NOT NULL,
    reported_by uuid,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution_notes text
);


--
-- Name: job_offer_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.job_offer_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_offer_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    changed_by uuid NOT NULL,
    change_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_offer_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.job_offer_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_offer_id uuid NOT NULL,
    from_status jobs.job_offer_status,
    to_status jobs.job_offer_status NOT NULL,
    changed_by uuid,
    reason text,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.job_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by uuid NOT NULL,
    reviewed_by uuid,
    title text NOT NULL,
    description text NOT NULL,
    responsibilities text,
    required_qualifications text,
    preferred_qualifications text,
    contract_type jobs.contract_type NOT NULL,
    contract_duration_notes text,
    trial_period_notes text,
    salary_min numeric(12,2) NOT NULL,
    salary_max numeric(12,2),
    salary_currency character(3) NOT NULL,
    salary_period jobs.salary_period DEFAULT 'monthly'::jobs.salary_period NOT NULL,
    has_fixed_salary boolean DEFAULT true NOT NULL,
    variable_compensation_notes text,
    work_regime jobs.work_regime NOT NULL,
    location_id uuid,
    weekly_hours numeric(5,2),
    benefits text,
    expected_start_date date,
    application_process_notes text,
    application_deadline timestamp with time zone,
    accessibility_notes text,
    language_requirements text[] DEFAULT '{}'::text[] NOT NULL,
    work_authorization_required text,
    pillar jobs.job_pillar DEFAULT 'professional_careers'::jobs.job_pillar NOT NULL,
    status jobs.job_offer_status DEFAULT 'draft'::jobs.job_offer_status NOT NULL,
    rejection_reason text,
    published_at timestamp with time zone,
    expires_at timestamp with time zone,
    filled_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_company_name text,
    user_company_location_id uuid,
    assignment_end_date date,
    equal_treatment_confirmed boolean DEFAULT false NOT NULL,
    collective_agreement_derogation_reference text,
    informed_of_permanent_vacancies boolean DEFAULT false NOT NULL,
    occupation_isco_code text,
    CONSTRAINT chk_temp_agency_user_company_identified CHECK (((contract_type <> ALL (ARRAY['temporary_agency'::jobs.contract_type, 'interim'::jobs.contract_type])) OR ((user_company_name IS NOT NULL) AND (length(TRIM(BOTH FROM user_company_name)) >= 2))))
);


--
-- Name: TABLE job_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.job_offers IS 'has_fixed_salary deve ser sempre true para publicação — validado em
   packages/domain/src/rules/jobOffer.ts ANTES de qualquer INSERT/UPDATE
   de status para approved/published (secção 3.2 e 3.3).';


--
-- Name: COLUMN job_offers.user_company_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN jobs.job_offers.user_company_name IS 'Empresa onde o trabalho é efetivamente prestado (trabalho temporário/
   interim). NUNCA a mesma entidade que organization_id — validado em
   jobOffer.ts e reforçado pela check constraint abaixo.';


--
-- Name: COLUMN job_offers.equal_treatment_confirmed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN jobs.job_offers.equal_treatment_confirmed IS 'Atestação de que a remuneração corresponde à de um trabalhador
   equivalente contratado diretamente pela empresa utilizadora (Art. 5.º,
   n.º 1). Pode ser falso apenas se collective_agreement_derogation_reference
   estiver preenchido (Art. 5.º, n.º 3).';


--
-- Name: COLUMN job_offers.occupation_isco_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN jobs.job_offers.occupation_isco_code IS 'Categorização oficial da oferta (ISCO-08/ESCO), opcional — permite
   pesquisa por profissão e comparação com tabelas salariais oficiais
   (collective_agreement_salary_levels), nunca bloqueia publicação.';


--
-- Name: locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.locales (
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    admin_area text,
    city text,
    postal_code text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nace_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.nace_codes (
    code text NOT NULL,
    level text NOT NULL,
    section_letter text,
    label_pt text NOT NULL,
    label_en text NOT NULL,
    source text DEFAULT 'NACE Rev. 2 (Eurostat)'::text NOT NULL,
    source_url text
);


--
-- Name: TABLE nace_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.nace_codes IS 'Classificação oficial de atividade económica (NACE Rev. 2, Eurostat,
   Regulamento (CE) n.º 1893/2006). Subconjunto curado e verificado, não a
   lista completa (21 secções, 88 divisões, 272 grupos, 615 classes) — ver
   https://ec.europa.eu/eurostat/web/nace para a lista completa.';


--
-- Name: occupations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.occupations (
    isco08_code text NOT NULL,
    major_group_code text NOT NULL,
    major_group_label_pt text NOT NULL,
    preferred_label_pt text NOT NULL,
    preferred_label_en text NOT NULL,
    source text DEFAULT 'ISCO-08'::text NOT NULL,
    source_url text
);


--
-- Name: TABLE occupations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.occupations IS 'Taxonomia oficial de profissões (ISCO-08/ESCO/CPP-2010), nunca inventada
   pela aplicação. Ver https://esco.ec.europa.eu e
   https://www.ine.pt (Classificação Portuguesa das Profissões 2010).';


--
-- Name: offer_institution_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.offer_institution_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_offer_id uuid NOT NULL,
    institution_org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.organization_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    role jobs.org_role NOT NULL,
    status jobs.invitation_status DEFAULT 'pending'::jobs.invitation_status NOT NULL,
    invited_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL
);


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role jobs.org_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE organization_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.organization_memberships IS 'Um utilizador pode pertencer a várias organizações com papéis diferentes.
   Nunca colocar permissões empresariais no perfil pessoal (secção 5).';


--
-- Name: organization_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.organization_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    reported_by uuid,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution_notes text
);


--
-- Name: TABLE organization_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.organization_reports IS 'Espelha job_offer_reports (0005), mas para denúncias diretas contra uma
   organização em vez de uma oferta específica.';


--
-- Name: organization_verification_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.organization_verification_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    verification_type text DEFAULT 'employer_identity'::text NOT NULL,
    outcome jobs.verification_status NOT NULL,
    assessed_by uuid,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type jobs.organization_type NOT NULL,
    legal_name text NOT NULL,
    display_name text NOT NULL,
    tax_id text,
    country_code character(2),
    website text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.persons (
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    headline text,
    avatar_url text,
    locale text,
    country_code character(2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    terms_accepted_at timestamp with time zone,
    terms_version text
);


--
-- Name: TABLE persons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.persons IS 'Identidade pessoal única. Dados sensíveis (telefone, morada, nascimento)
   NÃO vivem aqui — ver candidate_private_data (0004).';


--
-- Name: COLUMN persons.terms_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN jobs.persons.terms_version IS 'Identificador da versão dos Termos de Serviço aceite (ex: "2026-08-05").
   Nunca inferido — só preenchido quando a pessoa aceita explicitamente
   no registo. NULL significa que a pessoa ainda não aceitou nenhuma
   versão, mesmo que a conta já exista (contas anteriores a esta
   migration).';


--
-- Name: saved_job_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.saved_job_offers (
    user_id uuid NOT NULL,
    job_offer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text
);


--
-- Name: translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jobs.translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    field text NOT NULL,
    locale text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jobs.translations IS 'Conteúdo traduzível genérico. Evita colunas title_en/title_fr rígidas
   (ver secção 14 do briefing de produto).';


--
-- Name: application_notes application_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--


-- ============================================================
-- Deferred SQL functions
--
-- LANGUAGE sql validates relation references at CREATE time.
-- These functions are therefore created only after all jobs.*
-- tables referenced by their bodies already exist.
-- ============================================================

--
-- Name: count_platform_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.count_platform_staff() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
  select count(*)::int from jobs.organization_memberships
  where role in ('platform_moderator', 'platform_auditor', 'platform_superadmin');
$$;

--
-- Name: employer_public_metrics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.employer_public_metrics(p_org_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
  select jsonb_build_object(
    'totalApplications', coalesce((
      select count(*) from jobs.applications a
      join jobs.job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id
    ), 0),
    'respondedApplications', coalesce((
      select count(*) from jobs.applications a
      join jobs.job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status <> 'submitted'
    ), 0),
    'informedApplications', coalesce((
      select count(*) from jobs.applications a
      join jobs.job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status in ('hired','rejected','withdrawn','closed')
    ), 0),
    'firstJobHiresCount', coalesce((
      select count(*) from jobs.applications a
      join jobs.job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status = 'hired' and jo.pillar = 'first_jobs'
    ), 0),
    'seniorHiresCount', coalesce((
      select count(*) from jobs.applications a
      join jobs.job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status = 'hired' and jo.pillar = 'senior_careers'
    ), 0),
    'confirmedComplaintsCount', coalesce((
      select
        (select count(*) from jobs.organization_reports where organization_id = p_org_id and status = 'resolved')
        +
        (select count(*) from jobs.job_offer_reports r join jobs.job_offers jo on jo.id = r.job_offer_id
         where jo.organization_id = p_org_id and r.status = 'resolved')
    ), 0)
  );
$$;

--
-- Name: is_org_member(uuid, jobs.org_role[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.is_org_member(p_org_id uuid, p_roles jobs.org_role[] DEFAULT NULL::jobs.org_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
  select exists (
    select 1 from jobs.organization_memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

--
-- Name: is_platform_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.is_platform_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
  select exists (
    select 1 from jobs.organization_memberships m
    where m.user_id = auth.uid()
      and m.role in ('platform_moderator', 'platform_auditor', 'platform_superadmin')
  );
$$;

--
-- Name: is_verified_employer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.is_verified_employer(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
  select exists (
    select 1 from jobs.company_profiles c
    where c.organization_id = p_org_id
      and c.verification_status in ('verified', 'enhanced_verified')
  );
$$;

--
-- Name: record_audit_log(uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION jobs.record_audit_log(
    p_organization_id uuid,
    p_entity_type text,
    p_entity_id uuid,
    p_action text
) RETURNS TABLE(id uuid, created_at timestamp with time zone)
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
    INSERT INTO jobs.audit_logs (
        actor_user_id,
        organization_id,
        entity_type,
        entity_id,
        action
    )
    VALUES (
        auth.uid(),
        p_organization_id,
        p_entity_type,
        p_entity_id,
        p_action
    )
    RETURNING jobs.audit_logs.id, jobs.audit_logs.created_at;
$$;

ALTER TABLE ONLY jobs.application_notes
    ADD CONSTRAINT application_notes_pkey PRIMARY KEY (id);


--
-- Name: application_status_history application_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.application_status_history
    ADD CONSTRAINT application_status_history_pkey PRIMARY KEY (id);


--
-- Name: applications applications_job_offer_id_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.applications
    ADD CONSTRAINT applications_job_offer_id_candidate_id_key UNIQUE (job_offer_id, candidate_id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);


--
-- Name: candidate_data_consents candidate_data_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_data_consents
    ADD CONSTRAINT candidate_data_consents_pkey PRIMARY KEY (id);


--
-- Name: candidate_documents candidate_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_documents
    ADD CONSTRAINT candidate_documents_pkey PRIMARY KEY (id);


--
-- Name: candidate_education candidate_education_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_education
    ADD CONSTRAINT candidate_education_pkey PRIMARY KEY (id);


--
-- Name: candidate_experiences candidate_experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_experiences
    ADD CONSTRAINT candidate_experiences_pkey PRIMARY KEY (id);


--
-- Name: candidate_languages candidate_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_languages
    ADD CONSTRAINT candidate_languages_pkey PRIMARY KEY (user_id, locale_code);


--
-- Name: candidate_private_data candidate_private_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_private_data
    ADD CONSTRAINT candidate_private_data_pkey PRIMARY KEY (user_id);


--
-- Name: candidate_profiles candidate_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_profiles
    ADD CONSTRAINT candidate_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: candidate_skills candidate_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_skills
    ADD CONSTRAINT candidate_skills_pkey PRIMARY KEY (user_id, skill_id);


--
-- Name: collective_agreement_job_categories collective_agreement_job_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_job_categories
    ADD CONSTRAINT collective_agreement_job_categories_pkey PRIMARY KEY (id);


--
-- Name: collective_agreement_salary_levels collective_agreement_salary_levels_agreement_id_level_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_salary_levels
    ADD CONSTRAINT collective_agreement_salary_levels_agreement_id_level_code_key UNIQUE (agreement_id, level_code);


--
-- Name: collective_agreement_salary_levels collective_agreement_salary_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_salary_levels
    ADD CONSTRAINT collective_agreement_salary_levels_pkey PRIMARY KEY (id);


--
-- Name: collective_agreements collective_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreements
    ADD CONSTRAINT collective_agreements_pkey PRIMARY KEY (id);


--
-- Name: company_locations company_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_locations
    ADD CONSTRAINT company_locations_pkey PRIMARY KEY (id);


--
-- Name: company_profiles company_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_profiles
    ADD CONSTRAINT company_profiles_pkey PRIMARY KEY (organization_id);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (code);


--
-- Name: country_income_tax_brackets country_income_tax_brackets_country_code_bracket_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_income_tax_brackets
    ADD CONSTRAINT country_income_tax_brackets_country_code_bracket_order_key UNIQUE (country_code, bracket_order);


--
-- Name: country_income_tax_brackets country_income_tax_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_income_tax_brackets
    ADD CONSTRAINT country_income_tax_brackets_pkey PRIMARY KEY (id);


--
-- Name: country_labor_profiles country_labor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_labor_profiles
    ADD CONSTRAINT country_labor_profiles_pkey PRIMARY KEY (country_code);


--
-- Name: country_tax_profiles country_tax_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_tax_profiles
    ADD CONSTRAINT country_tax_profiles_pkey PRIMARY KEY (country_code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: employer_badges employer_badges_organization_id_badge_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.employer_badges
    ADD CONSTRAINT employer_badges_organization_id_badge_code_key UNIQUE (organization_id, badge_code);


--
-- Name: employer_badges employer_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.employer_badges
    ADD CONSTRAINT employer_badges_pkey PRIMARY KEY (id);


--
-- Name: employer_responsibility_metrics employer_responsibility_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.employer_responsibility_metrics
    ADD CONSTRAINT employer_responsibility_metrics_pkey PRIMARY KEY (organization_id);


--
-- Name: institution_affiliations institution_affiliations_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_affiliations
    ADD CONSTRAINT institution_affiliations_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: institution_affiliations institution_affiliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_affiliations
    ADD CONSTRAINT institution_affiliations_pkey PRIMARY KEY (id);


--
-- Name: institution_courses institution_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_courses
    ADD CONSTRAINT institution_courses_pkey PRIMARY KEY (id);


--
-- Name: institution_profiles institution_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_profiles
    ADD CONSTRAINT institution_profiles_pkey PRIMARY KEY (organization_id);


--
-- Name: job_alerts job_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_alerts
    ADD CONSTRAINT job_alerts_pkey PRIMARY KEY (id);


--
-- Name: job_offer_reports job_offer_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_reports
    ADD CONSTRAINT job_offer_reports_pkey PRIMARY KEY (id);


--
-- Name: job_offer_revisions job_offer_revisions_job_offer_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_revisions
    ADD CONSTRAINT job_offer_revisions_job_offer_id_version_key UNIQUE (job_offer_id, version);


--
-- Name: job_offer_revisions job_offer_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_revisions
    ADD CONSTRAINT job_offer_revisions_pkey PRIMARY KEY (id);


--
-- Name: job_offer_status_history job_offer_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_status_history
    ADD CONSTRAINT job_offer_status_history_pkey PRIMARY KEY (id);


--
-- Name: job_offers job_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_pkey PRIMARY KEY (id);


--
-- Name: locales locales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.locales
    ADD CONSTRAINT locales_pkey PRIMARY KEY (code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: nace_codes nace_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.nace_codes
    ADD CONSTRAINT nace_codes_pkey PRIMARY KEY (code);


--
-- Name: occupations occupations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.occupations
    ADD CONSTRAINT occupations_pkey PRIMARY KEY (isco08_code);


--
-- Name: offer_institution_reservations offer_institution_reservation_job_offer_id_institution_org__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.offer_institution_reservations
    ADD CONSTRAINT offer_institution_reservation_job_offer_id_institution_org__key UNIQUE (job_offer_id, institution_org_id);


--
-- Name: offer_institution_reservations offer_institution_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.offer_institution_reservations
    ADD CONSTRAINT offer_institution_reservations_pkey PRIMARY KEY (id);


--
-- Name: organization_invitations organization_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_invitations
    ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_organization_id_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_user_id_role_key UNIQUE (organization_id, user_id, role);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organization_reports organization_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_reports
    ADD CONSTRAINT organization_reports_pkey PRIMARY KEY (id);


--
-- Name: organization_verification_assessments organization_verification_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_verification_assessments
    ADD CONSTRAINT organization_verification_assessments_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: persons persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.persons
    ADD CONSTRAINT persons_pkey PRIMARY KEY (user_id);


--
-- Name: saved_job_offers saved_job_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.saved_job_offers
    ADD CONSTRAINT saved_job_offers_pkey PRIMARY KEY (user_id, job_offer_id);


--
-- Name: skills skills_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.skills
    ADD CONSTRAINT skills_name_key UNIQUE (name);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: translations translations_entity_type_entity_id_field_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.translations
    ADD CONSTRAINT translations_entity_type_entity_id_field_locale_key UNIQUE (entity_type, entity_id, field, locale);


--
-- Name: translations translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.translations
    ADD CONSTRAINT translations_pkey PRIMARY KEY (id);


--
-- Name: idx_affiliations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliations_org ON jobs.institution_affiliations USING btree (organization_id);


--
-- Name: idx_affiliations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliations_user ON jobs.institution_affiliations USING btree (user_id);


--
-- Name: idx_applications_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_candidate ON jobs.applications USING btree (candidate_id);


--
-- Name: idx_applications_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_offer ON jobs.applications USING btree (job_offer_id);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON jobs.applications USING btree (status);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON jobs.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_org ON jobs.audit_logs USING btree (organization_id);


--
-- Name: idx_billing_events_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_events_org ON jobs.billing_events USING btree (organization_id);


--
-- Name: idx_billing_events_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_events_product ON jobs.billing_events USING btree (product_code);


--
-- Name: idx_cct_categories_agreement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cct_categories_agreement ON jobs.collective_agreement_job_categories USING btree (agreement_id);


--
-- Name: idx_cct_categories_occupation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cct_categories_occupation ON jobs.collective_agreement_job_categories USING btree (occupation_isco_code);


--
-- Name: idx_company_locations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_locations_org ON jobs.company_locations USING btree (organization_id);


--
-- Name: idx_consents_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consents_org ON jobs.candidate_data_consents USING btree (organization_id);


--
-- Name: idx_consents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consents_user ON jobs.candidate_data_consents USING btree (user_id);


--
-- Name: idx_courses_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_org ON jobs.institution_courses USING btree (organization_id);


--
-- Name: idx_documents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_user ON jobs.candidate_documents USING btree (user_id);


--
-- Name: idx_education_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_education_user ON jobs.candidate_education USING btree (user_id);


--
-- Name: idx_experiences_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experiences_user ON jobs.candidate_experiences USING btree (user_id);


--
-- Name: idx_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_email ON jobs.organization_invitations USING btree (email);


--
-- Name: idx_invitations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_org ON jobs.organization_invitations USING btree (organization_id);


--
-- Name: idx_job_offer_status_history_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_offer_status_history_offer ON jobs.job_offer_status_history USING btree (job_offer_id, created_at);


--
-- Name: idx_job_offers_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_offers_location ON jobs.job_offers USING btree (location_id);


--
-- Name: idx_job_offers_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_offers_org ON jobs.job_offers USING btree (organization_id);


--
-- Name: idx_job_offers_pillar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_offers_pillar ON jobs.job_offers USING btree (pillar);


--
-- Name: idx_job_offers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_offers_status ON jobs.job_offers USING btree (status);


--
-- Name: idx_locations_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_city ON jobs.locations USING btree (city);


--
-- Name: idx_locations_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_country ON jobs.locations USING btree (country_code);


--
-- Name: idx_memberships_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_org ON jobs.organization_memberships USING btree (organization_id);


--
-- Name: idx_memberships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user ON jobs.organization_memberships USING btree (user_id);


--
-- Name: idx_org_reports_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_reports_org ON jobs.organization_reports USING btree (organization_id);


--
-- Name: idx_org_verification_assessments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_verification_assessments_org ON jobs.organization_verification_assessments USING btree (organization_id, created_at DESC);


--
-- Name: idx_organizations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_type ON jobs.organizations USING btree (type);


--
-- Name: idx_reports_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_offer ON jobs.job_offer_reports USING btree (job_offer_id);


--
-- Name: idx_reservations_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_institution ON jobs.offer_institution_reservations USING btree (institution_org_id);


--
-- Name: idx_reservations_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_offer ON jobs.offer_institution_reservations USING btree (job_offer_id);


--
-- Name: idx_status_history_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_app ON jobs.application_status_history USING btree (application_id);


--
-- Name: idx_translations_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_lookup ON jobs.translations USING btree (entity_type, entity_id, locale);


--
-- Name: job_offers trg_job_offer_status_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_offer_status_history AFTER INSERT OR UPDATE OF status ON jobs.job_offers FOR EACH ROW EXECUTE FUNCTION jobs.capture_job_offer_status_history();


--
-- Name: company_profiles trg_org_verification_assessment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_verification_assessment AFTER INSERT OR UPDATE OF verification_status ON jobs.company_profiles FOR EACH ROW EXECUTE FUNCTION jobs.capture_org_verification_assessment();


--
-- Name: application_notes application_notes_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.application_notes
    ADD CONSTRAINT application_notes_application_id_fkey FOREIGN KEY (application_id) REFERENCES jobs.applications(id) ON DELETE CASCADE;


--
-- Name: application_notes application_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.application_notes
    ADD CONSTRAINT application_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id);


--
-- Name: application_status_history application_status_history_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.application_status_history
    ADD CONSTRAINT application_status_history_application_id_fkey FOREIGN KEY (application_id) REFERENCES jobs.applications(id) ON DELETE CASCADE;


--
-- Name: application_status_history application_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.application_status_history
    ADD CONSTRAINT application_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: applications applications_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.applications
    ADD CONSTRAINT applications_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: applications applications_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.applications
    ADD CONSTRAINT applications_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id);


--
-- Name: applications applications_resume_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.applications
    ADD CONSTRAINT applications_resume_document_id_fkey FOREIGN KEY (resume_document_id) REFERENCES jobs.candidate_documents(id);


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id);


--
-- Name: billing_events billing_events_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.billing_events
    ADD CONSTRAINT billing_events_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);


--
-- Name: billing_events billing_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.billing_events
    ADD CONSTRAINT billing_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: candidate_data_consents candidate_data_consents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_data_consents
    ADD CONSTRAINT candidate_data_consents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: candidate_data_consents candidate_data_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_data_consents
    ADD CONSTRAINT candidate_data_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_documents candidate_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_documents
    ADD CONSTRAINT candidate_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_education candidate_education_institution_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_education
    ADD CONSTRAINT candidate_education_institution_org_id_fkey FOREIGN KEY (institution_org_id) REFERENCES jobs.organizations(id);


--
-- Name: candidate_education candidate_education_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_education
    ADD CONSTRAINT candidate_education_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_experiences candidate_experiences_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_experiences
    ADD CONSTRAINT candidate_experiences_location_id_fkey FOREIGN KEY (location_id) REFERENCES jobs.locations(id);


--
-- Name: candidate_experiences candidate_experiences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_experiences
    ADD CONSTRAINT candidate_experiences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_languages candidate_languages_locale_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_languages
    ADD CONSTRAINT candidate_languages_locale_code_fkey FOREIGN KEY (locale_code) REFERENCES jobs.locales(code);


--
-- Name: candidate_languages candidate_languages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_languages
    ADD CONSTRAINT candidate_languages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_private_data candidate_private_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_private_data
    ADD CONSTRAINT candidate_private_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_profiles candidate_profiles_desired_salary_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_profiles
    ADD CONSTRAINT candidate_profiles_desired_salary_currency_fkey FOREIGN KEY (desired_salary_currency) REFERENCES jobs.currencies(code);


--
-- Name: candidate_profiles candidate_profiles_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_profiles
    ADD CONSTRAINT candidate_profiles_location_id_fkey FOREIGN KEY (location_id) REFERENCES jobs.locations(id);


--
-- Name: candidate_profiles candidate_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_profiles
    ADD CONSTRAINT candidate_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: candidate_skills candidate_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_skills
    ADD CONSTRAINT candidate_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES jobs.skills(id);


--
-- Name: candidate_skills candidate_skills_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.candidate_skills
    ADD CONSTRAINT candidate_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: collective_agreement_job_categories collective_agreement_job_categories_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_job_categories
    ADD CONSTRAINT collective_agreement_job_categories_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES jobs.collective_agreements(id) ON DELETE CASCADE;


--
-- Name: collective_agreement_job_categories collective_agreement_job_categories_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_job_categories
    ADD CONSTRAINT collective_agreement_job_categories_level_id_fkey FOREIGN KEY (level_id) REFERENCES jobs.collective_agreement_salary_levels(id) ON DELETE CASCADE;


--
-- Name: collective_agreement_job_categories collective_agreement_job_categories_occupation_isco_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_job_categories
    ADD CONSTRAINT collective_agreement_job_categories_occupation_isco_code_fkey FOREIGN KEY (occupation_isco_code) REFERENCES jobs.occupations(isco08_code);


--
-- Name: collective_agreement_salary_levels collective_agreement_salary_levels_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_salary_levels
    ADD CONSTRAINT collective_agreement_salary_levels_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES jobs.collective_agreements(id) ON DELETE CASCADE;


--
-- Name: collective_agreement_salary_levels collective_agreement_salary_levels_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreement_salary_levels
    ADD CONSTRAINT collective_agreement_salary_levels_currency_fkey FOREIGN KEY (currency) REFERENCES jobs.currencies(code);


--
-- Name: collective_agreements collective_agreements_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.collective_agreements
    ADD CONSTRAINT collective_agreements_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: company_locations company_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_locations
    ADD CONSTRAINT company_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES jobs.locations(id);


--
-- Name: company_locations company_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_locations
    ADD CONSTRAINT company_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: company_profiles company_profiles_headquarters_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_profiles
    ADD CONSTRAINT company_profiles_headquarters_location_id_fkey FOREIGN KEY (headquarters_location_id) REFERENCES jobs.locations(id);


--
-- Name: company_profiles company_profiles_nace_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_profiles
    ADD CONSTRAINT company_profiles_nace_code_fkey FOREIGN KEY (nace_code) REFERENCES jobs.nace_codes(code);


--
-- Name: company_profiles company_profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_profiles
    ADD CONSTRAINT company_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: company_profiles company_profiles_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.company_profiles
    ADD CONSTRAINT company_profiles_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: countries countries_default_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.countries
    ADD CONSTRAINT countries_default_currency_fkey FOREIGN KEY (default_currency) REFERENCES jobs.currencies(code);


--
-- Name: country_income_tax_brackets country_income_tax_brackets_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_income_tax_brackets
    ADD CONSTRAINT country_income_tax_brackets_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: country_labor_profiles country_labor_profiles_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_labor_profiles
    ADD CONSTRAINT country_labor_profiles_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: country_labor_profiles country_labor_profiles_minimum_wage_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_labor_profiles
    ADD CONSTRAINT country_labor_profiles_minimum_wage_currency_fkey FOREIGN KEY (minimum_wage_currency) REFERENCES jobs.currencies(code);


--
-- Name: country_tax_profiles country_tax_profiles_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_tax_profiles
    ADD CONSTRAINT country_tax_profiles_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: country_tax_profiles country_tax_profiles_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.country_tax_profiles
    ADD CONSTRAINT country_tax_profiles_currency_fkey FOREIGN KEY (currency) REFERENCES jobs.currencies(code);


--
-- Name: employer_badges employer_badges_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.employer_badges
    ADD CONSTRAINT employer_badges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: employer_responsibility_metrics employer_responsibility_metrics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.employer_responsibility_metrics
    ADD CONSTRAINT employer_responsibility_metrics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: institution_affiliations institution_affiliations_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_affiliations
    ADD CONSTRAINT institution_affiliations_course_id_fkey FOREIGN KEY (course_id) REFERENCES jobs.institution_courses(id);


--
-- Name: institution_affiliations institution_affiliations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_affiliations
    ADD CONSTRAINT institution_affiliations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: institution_affiliations institution_affiliations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_affiliations
    ADD CONSTRAINT institution_affiliations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: institution_courses institution_courses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_courses
    ADD CONSTRAINT institution_courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: institution_profiles institution_profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.institution_profiles
    ADD CONSTRAINT institution_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: job_alerts job_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_alerts
    ADD CONSTRAINT job_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: job_offer_reports job_offer_reports_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_reports
    ADD CONSTRAINT job_offer_reports_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id) ON DELETE CASCADE;


--
-- Name: job_offer_reports job_offer_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_reports
    ADD CONSTRAINT job_offer_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id);


--
-- Name: job_offer_revisions job_offer_revisions_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_revisions
    ADD CONSTRAINT job_offer_revisions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: job_offer_revisions job_offer_revisions_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_revisions
    ADD CONSTRAINT job_offer_revisions_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id) ON DELETE CASCADE;


--
-- Name: job_offer_status_history job_offer_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_status_history
    ADD CONSTRAINT job_offer_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: job_offer_status_history job_offer_status_history_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offer_status_history
    ADD CONSTRAINT job_offer_status_history_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id) ON DELETE CASCADE;


--
-- Name: job_offers job_offers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: job_offers job_offers_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_location_id_fkey FOREIGN KEY (location_id) REFERENCES jobs.locations(id);


--
-- Name: job_offers job_offers_occupation_isco_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_occupation_isco_code_fkey FOREIGN KEY (occupation_isco_code) REFERENCES jobs.occupations(isco08_code);


--
-- Name: job_offers job_offers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id);


--
-- Name: job_offers job_offers_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: job_offers job_offers_salary_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_salary_currency_fkey FOREIGN KEY (salary_currency) REFERENCES jobs.currencies(code);


--
-- Name: job_offers job_offers_user_company_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.job_offers
    ADD CONSTRAINT job_offers_user_company_location_id_fkey FOREIGN KEY (user_company_location_id) REFERENCES jobs.locations(id);


--
-- Name: locations locations_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.locations
    ADD CONSTRAINT locations_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: offer_institution_reservations offer_institution_reservations_institution_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.offer_institution_reservations
    ADD CONSTRAINT offer_institution_reservations_institution_org_id_fkey FOREIGN KEY (institution_org_id) REFERENCES jobs.organizations(id);


--
-- Name: offer_institution_reservations offer_institution_reservations_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.offer_institution_reservations
    ADD CONSTRAINT offer_institution_reservations_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_invitations
    ADD CONSTRAINT organization_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: organization_invitations organization_invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_invitations
    ADD CONSTRAINT organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_reports organization_reports_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_reports
    ADD CONSTRAINT organization_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_reports organization_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_reports
    ADD CONSTRAINT organization_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id);


--
-- Name: organization_verification_assessments organization_verification_assessments_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_verification_assessments
    ADD CONSTRAINT organization_verification_assessments_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES auth.users(id);


--
-- Name: organization_verification_assessments organization_verification_assessments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organization_verification_assessments
    ADD CONSTRAINT organization_verification_assessments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES jobs.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organizations
    ADD CONSTRAINT organizations_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: organizations organizations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: persons persons_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.persons
    ADD CONSTRAINT persons_country_code_fkey FOREIGN KEY (country_code) REFERENCES jobs.countries(code);


--
-- Name: persons persons_locale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.persons
    ADD CONSTRAINT persons_locale_fkey FOREIGN KEY (locale) REFERENCES jobs.locales(code);


--
-- Name: persons persons_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.persons
    ADD CONSTRAINT persons_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: saved_job_offers saved_job_offers_job_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.saved_job_offers
    ADD CONSTRAINT saved_job_offers_job_offer_id_fkey FOREIGN KEY (job_offer_id) REFERENCES jobs.job_offers(id) ON DELETE CASCADE;


--
-- Name: saved_job_offers saved_job_offers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.saved_job_offers
    ADD CONSTRAINT saved_job_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: translations translations_locale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jobs.translations
    ADD CONSTRAINT translations_locale_fkey FOREIGN KEY (locale) REFERENCES jobs.locales(code);


--
-- Name: institution_affiliations affiliations_institution_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY affiliations_institution_read ON jobs.institution_affiliations FOR SELECT USING (jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'career_center_staff'::jobs.org_role]));


--
-- Name: institution_affiliations affiliations_owner_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY affiliations_owner_manage ON jobs.institution_affiliations USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: application_status_history application_history_candidate_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY application_history_candidate_own ON jobs.application_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.applications a
  WHERE ((a.id = application_status_history.application_id) AND (a.candidate_id = auth.uid())))));


--
-- Name: application_status_history application_history_insert_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY application_history_insert_participant ON jobs.application_status_history FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM jobs.applications a
  WHERE ((a.id = application_status_history.application_id) AND (a.candidate_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (jobs.applications a
     JOIN jobs.job_offers jo ON ((jo.id = a.job_offer_id)))
  WHERE ((a.id = application_status_history.application_id) AND jobs.is_org_member(jo.organization_id))))));


--
-- Name: application_status_history application_history_org_own_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY application_history_org_own_offers ON jobs.application_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (jobs.applications a
     JOIN jobs.job_offers jo ON ((jo.id = a.job_offer_id)))
  WHERE ((a.id = application_status_history.application_id) AND jobs.is_org_member(jo.organization_id)))));


--
-- Name: application_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.application_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: applications applications_candidate_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_candidate_own ON jobs.applications USING ((candidate_id = auth.uid())) WITH CHECK ((candidate_id = auth.uid()));


--
-- Name: applications applications_org_update_own_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_org_update_own_offers ON jobs.applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = applications.job_offer_id) AND jobs.is_org_member(jo.organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role])))));


--
-- Name: applications applications_org_view_own_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_org_view_own_offers ON jobs.applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = applications.job_offer_id) AND jobs.is_org_member(jo.organization_id)))));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_staff_and_org_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_staff_and_org_admins ON jobs.audit_logs FOR SELECT USING ((jobs.is_platform_staff() OR jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role])));


--
-- Name: billing_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.billing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_events billing_events_manage_platform_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_events_manage_platform_staff ON jobs.billing_events USING (jobs.is_platform_staff());


--
-- Name: billing_events billing_events_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_events_select_org ON jobs.billing_events FOR SELECT USING ((jobs.is_org_member(organization_id) OR jobs.is_platform_staff()));


--
-- Name: candidate_data_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_data_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_education; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_education ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_experiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_experiences ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_languages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_languages ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_languages candidate_languages_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_languages_owner ON jobs.candidate_languages USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_private_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_private_data ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_private_data candidate_private_data_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_private_data_owner_only ON jobs.candidate_private_data USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_profiles candidate_profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_profiles_select_own ON jobs.candidate_profiles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: candidate_profiles candidate_profiles_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_profiles_select_public ON jobs.candidate_profiles FOR SELECT USING ((visibility = 'public'::jobs.profile_visibility));


--
-- Name: candidate_profiles candidate_profiles_select_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_profiles_select_verified_employers ON jobs.candidate_profiles FOR SELECT USING (((visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
   FROM jobs.organization_memberships m
  WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))));


--
-- Name: candidate_profiles candidate_profiles_upsert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_profiles_upsert_own ON jobs.candidate_profiles USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.candidate_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_skills candidate_skills_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY candidate_skills_owner ON jobs.candidate_skills USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: collective_agreement_job_categories cct_job_categories_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cct_job_categories_manage_staff ON jobs.collective_agreement_job_categories USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: collective_agreement_job_categories cct_job_categories_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cct_job_categories_select_public ON jobs.collective_agreement_job_categories FOR SELECT USING (true);


--
-- Name: collective_agreement_salary_levels cct_salary_levels_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cct_salary_levels_manage_staff ON jobs.collective_agreement_salary_levels USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: collective_agreement_salary_levels cct_salary_levels_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cct_salary_levels_select_public ON jobs.collective_agreement_salary_levels FOR SELECT USING (true);


--
-- Name: collective_agreement_job_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.collective_agreement_job_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: collective_agreement_salary_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.collective_agreement_salary_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: collective_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.collective_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: collective_agreements collective_agreements_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collective_agreements_manage_staff ON jobs.collective_agreements USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: collective_agreements collective_agreements_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collective_agreements_select_public ON jobs.collective_agreements FOR SELECT USING (true);


--
-- Name: company_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.company_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: company_profiles company_profiles_insert_org_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_insert_org_admins ON jobs.company_profiles FOR INSERT WITH CHECK (jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role]));


--
-- Name: company_profiles company_profiles_moderate_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_moderate_staff ON jobs.company_profiles FOR UPDATE USING (jobs.is_platform_staff());


--
-- Name: company_profiles company_profiles_select_own_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_select_own_org ON jobs.company_profiles FOR SELECT USING ((jobs.is_org_member(organization_id) OR jobs.is_platform_staff()));


--
-- Name: company_profiles company_profiles_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_select_public ON jobs.company_profiles FOR SELECT USING ((verification_status = ANY (ARRAY['verified'::jobs.verification_status, 'enhanced_verified'::jobs.verification_status])));


--
-- Name: company_profiles company_profiles_update_org_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_profiles_update_org_admins ON jobs.company_profiles FOR UPDATE USING (jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role]));


--
-- Name: candidate_data_consents consents_org_read_own_grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consents_org_read_own_grants ON jobs.candidate_data_consents FOR SELECT USING (jobs.is_org_member(organization_id));


--
-- Name: candidate_data_consents consents_owner_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consents_owner_manage ON jobs.candidate_data_consents USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: country_income_tax_brackets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.country_income_tax_brackets ENABLE ROW LEVEL SECURITY;

--
-- Name: country_labor_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.country_labor_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: country_labor_profiles country_labor_profiles_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_labor_profiles_manage_staff ON jobs.country_labor_profiles USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: country_labor_profiles country_labor_profiles_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_labor_profiles_select_public ON jobs.country_labor_profiles FOR SELECT USING (true);


--
-- Name: country_income_tax_brackets country_tax_brackets_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_tax_brackets_manage_staff ON jobs.country_income_tax_brackets USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: country_income_tax_brackets country_tax_brackets_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_tax_brackets_select_public ON jobs.country_income_tax_brackets FOR SELECT USING (true);


--
-- Name: country_tax_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.country_tax_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: country_tax_profiles country_tax_profiles_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_tax_profiles_manage_staff ON jobs.country_tax_profiles USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: country_tax_profiles country_tax_profiles_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_tax_profiles_select_public ON jobs.country_tax_profiles FOR SELECT USING (true);


--
-- Name: institution_courses courses_manage_org_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_manage_org_admins ON jobs.institution_courses USING (jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'career_center_staff'::jobs.org_role]));


--
-- Name: institution_courses courses_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_select_public ON jobs.institution_courses FOR SELECT USING (true);


--
-- Name: candidate_documents documents_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_owner_only ON jobs.candidate_documents USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_documents documents_visible_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_visible_public ON jobs.candidate_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_documents.user_id) AND (p.visibility = 'public'::jobs.profile_visibility)))));


--
-- Name: candidate_documents documents_visible_to_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_visible_to_verified_employers ON jobs.candidate_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_documents.user_id) AND (p.visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
           FROM jobs.organization_memberships m
          WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))))));


--
-- Name: candidate_education education_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY education_owner ON jobs.candidate_education USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_education education_visible_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY education_visible_public ON jobs.candidate_education FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_education.user_id) AND (p.visibility = 'public'::jobs.profile_visibility)))));


--
-- Name: candidate_education education_visible_to_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY education_visible_to_verified_employers ON jobs.candidate_education FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_education.user_id) AND (p.visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
           FROM jobs.organization_memberships m
          WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))))));


--
-- Name: candidate_experiences experiences_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY experiences_owner ON jobs.candidate_experiences USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_experiences experiences_visible_to_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY experiences_visible_to_verified_employers ON jobs.candidate_experiences FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_experiences.user_id) AND (p.visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
           FROM jobs.organization_memberships m
          WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))))));


--
-- Name: candidate_experiences experiences_visible_with_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY experiences_visible_with_profile ON jobs.candidate_experiences FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_experiences.user_id) AND (p.visibility = 'public'::jobs.profile_visibility)))));


--
-- Name: institution_affiliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.institution_affiliations ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.institution_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.institution_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_profiles institution_profiles_manage_org_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_profiles_manage_org_admins ON jobs.institution_profiles USING ((jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role]) OR jobs.is_platform_staff()));


--
-- Name: institution_profiles institution_profiles_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_profiles_select_public ON jobs.institution_profiles FOR SELECT USING (true);


--
-- Name: job_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.job_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: job_alerts job_alerts_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_alerts_owner ON jobs.job_alerts USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: job_offer_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.job_offer_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: job_offer_reports job_offer_reports_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offer_reports_insert_authenticated ON jobs.job_offer_reports FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: job_offer_reports job_offer_reports_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offer_reports_manage_staff ON jobs.job_offer_reports FOR UPDATE USING (jobs.is_platform_staff());


--
-- Name: job_offer_reports job_offer_reports_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offer_reports_select_own ON jobs.job_offer_reports FOR SELECT USING ((reported_by = auth.uid()));


--
-- Name: job_offer_reports job_offer_reports_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offer_reports_select_staff ON jobs.job_offer_reports FOR SELECT USING (jobs.is_platform_staff());


--
-- Name: job_offer_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.job_offer_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: job_offer_status_history job_offer_status_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offer_status_history_read ON jobs.job_offer_status_history FOR SELECT USING ((jobs.is_platform_staff() OR (EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = job_offer_status_history.job_offer_id) AND jobs.is_org_member(jo.organization_id))))));


--
-- Name: job_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.job_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: job_offers job_offers_insert_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offers_insert_verified_employers ON jobs.job_offers FOR INSERT WITH CHECK ((jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role]) AND jobs.is_verified_employer(organization_id)));


--
-- Name: POLICY job_offers_insert_verified_employers ON job_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY job_offers_insert_verified_employers ON jobs.job_offers IS 'Reforça em RLS a regra de negócio: só empregadores verificados publicam
   (secção 7). A validação de salário fixo é feita no domain layer, não RLS,
   porque exige lógica mais rica do que uma policy permite exprimir bem.';


--
-- Name: job_offers job_offers_select_own_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offers_select_own_org ON jobs.job_offers FOR SELECT USING ((jobs.is_org_member(organization_id) OR jobs.is_platform_staff()));


--
-- Name: job_offers job_offers_select_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offers_select_published ON jobs.job_offers FOR SELECT USING ((status = 'published'::jobs.job_offer_status));


--
-- Name: job_offers job_offers_update_own_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_offers_update_own_org ON jobs.job_offers FOR UPDATE USING ((jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role]) OR jobs.is_platform_staff()));


--
-- Name: candidate_languages languages_visible_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY languages_visible_public ON jobs.candidate_languages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_languages.user_id) AND (p.visibility = 'public'::jobs.profile_visibility)))));


--
-- Name: candidate_languages languages_visible_to_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY languages_visible_to_verified_employers ON jobs.candidate_languages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_languages.user_id) AND (p.visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
           FROM jobs.organization_memberships m
          WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))))));


--
-- Name: organization_memberships memberships_insert_self_as_org_creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_insert_self_as_org_creator ON jobs.organization_memberships FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM jobs.organizations o
  WHERE ((o.id = organization_memberships.organization_id) AND (o.created_by = auth.uid()))))));


--
-- Name: organization_memberships memberships_manage_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_manage_admins ON jobs.organization_memberships USING ((jobs.is_org_member(organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role]) OR jobs.is_platform_staff()));


--
-- Name: organization_memberships memberships_select_own_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_select_own_org ON jobs.organization_memberships FOR SELECT USING ((jobs.is_org_member(organization_id) OR (user_id = auth.uid()) OR jobs.is_platform_staff()));


--
-- Name: nace_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.nace_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: nace_codes nace_codes_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nace_codes_manage_staff ON jobs.nace_codes USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: nace_codes nace_codes_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nace_codes_select_public ON jobs.nace_codes FOR SELECT USING (true);


--
-- Name: occupations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.occupations ENABLE ROW LEVEL SECURITY;

--
-- Name: occupations occupations_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occupations_manage_staff ON jobs.occupations USING (jobs.is_platform_staff()) WITH CHECK (jobs.is_platform_staff());


--
-- Name: occupations occupations_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY occupations_select_public ON jobs.occupations FOR SELECT USING (true);


--
-- Name: offer_institution_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.offer_institution_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.organization_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_reports organization_reports_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_reports_insert_authenticated ON jobs.organization_reports FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: organization_reports organization_reports_manage_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_reports_manage_staff ON jobs.organization_reports FOR UPDATE USING (jobs.is_platform_staff());


--
-- Name: organization_reports organization_reports_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_reports_select_own ON jobs.organization_reports FOR SELECT USING ((reported_by = auth.uid()));


--
-- Name: organization_reports organization_reports_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_reports_select_staff ON jobs.organization_reports FOR SELECT USING (jobs.is_platform_staff());


--
-- Name: organization_verification_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.organization_verification_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_verification_assessments organization_verification_assessments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_verification_assessments_read ON jobs.organization_verification_assessments FOR SELECT USING ((jobs.is_platform_staff() OR jobs.is_org_member(organization_id)));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_insert_authenticated ON jobs.organizations FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (created_by = auth.uid())));


--
-- Name: organizations organizations_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_select_public ON jobs.organizations FOR SELECT USING (true);


--
-- Name: organizations organizations_update_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_update_members ON jobs.organizations FOR UPDATE USING ((jobs.is_org_member(id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role]) OR jobs.is_platform_staff()));


--
-- Name: persons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.persons ENABLE ROW LEVEL SECURITY;

--
-- Name: persons persons_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY persons_insert_own ON jobs.persons FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: persons persons_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY persons_select_own ON jobs.persons FOR SELECT USING ((user_id = auth.uid()));


--
--

--
-- Name: persons persons_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY persons_update_own ON jobs.persons FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: offer_institution_reservations reservations_manage_offer_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_manage_offer_owner ON jobs.offer_institution_reservations USING ((EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = offer_institution_reservations.job_offer_id) AND jobs.is_org_member(jo.organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role])))));


--
-- Name: offer_institution_reservations reservations_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reservations_select_public ON jobs.offer_institution_reservations FOR SELECT USING (true);


--
-- Name: saved_job_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.saved_job_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_job_offers saved_offers_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_offers_owner ON jobs.saved_job_offers USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: candidate_skills skills_visible_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_visible_public ON jobs.candidate_skills FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_skills.user_id) AND (p.visibility = 'public'::jobs.profile_visibility)))));


--
-- Name: candidate_skills skills_visible_to_verified_employers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_visible_to_verified_employers ON jobs.candidate_skills FOR SELECT USING ((EXISTS ( SELECT 1
   FROM jobs.candidate_profiles p
  WHERE ((p.user_id = candidate_skills.user_id) AND (p.visibility = 'visible_to_verified_employers'::jobs.profile_visibility) AND (EXISTS ( SELECT 1
           FROM jobs.organization_memberships m
          WHERE ((m.user_id = auth.uid()) AND jobs.is_verified_employer(m.organization_id))))))));


--
-- Name: translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE jobs.translations ENABLE ROW LEVEL SECURITY;

--
-- Name: translations translations_manage_job_offer_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY translations_manage_job_offer_org ON jobs.translations USING (((entity_type = 'job_offer'::text) AND (EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = translations.entity_id) AND (jobs.is_org_member(jo.organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role]) OR jobs.is_platform_staff())))))) WITH CHECK (((entity_type = 'job_offer'::text) AND (EXISTS ( SELECT 1
   FROM jobs.job_offers jo
  WHERE ((jo.id = translations.entity_id) AND (jobs.is_org_member(jo.organization_id, ARRAY['owner'::jobs.org_role, 'admin'::jobs.org_role, 'recruiter'::jobs.org_role, 'hiring_manager'::jobs.org_role]) OR jobs.is_platform_staff()))))));


--
-- Name: translations translations_manage_staff_other_entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY translations_manage_staff_other_entities ON jobs.translations USING (((entity_type <> 'job_offer'::text) AND jobs.is_platform_staff())) WITH CHECK (((entity_type <> 'job_offer'::text) AND jobs.is_platform_staff()));


--
-- Name: translations translations_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY translations_select_public ON jobs.translations FOR SELECT USING (true);


--
complete
--




--
-- Z Jobs Identity Adapter v1
--

CREATE FUNCTION platform_internal.register_jobs_person_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    PERFORM platform_internal.register_local_person_identity(
        'jobs',
        NEW.user_id
    );

    RETURN NEW;
END;
$$;

REVOKE EXECUTE
ON FUNCTION platform_internal.register_jobs_person_identity()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_jobs_person_identity_registration
AFTER INSERT ON jobs.persons
FOR EACH ROW
EXECUTE FUNCTION platform_internal.register_jobs_person_identity();

REVOKE EXECUTE
ON FUNCTION jobs.bootstrap_person(uuid, text, text)
FROM PUBLIC, anon, authenticated, service_role;


REVOKE EXECUTE
ON FUNCTION jobs.record_audit_log(uuid, text, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================
-- Z Jobs Candidate Erasure v1
--
-- Remove apenas dados inequivocamente pertencentes à persona
-- de candidato.
--
-- NÃO toca:
--   * auth.users / auth.sessions
--   * jobs.persons
--   * identidade canónica ZOS
--   * billing
--   * reports
--   * audit logs
--
-- SECURITY DEFINER é intencional: a operação atravessa várias
-- tabelas protegidas por RLS e precisa também de suportar staff
-- autorizado, sem conceder DELETE/UPDATE amplo ao jobs_runtime.
--
-- O resultado contém os storage_path dos documentos removidos.
-- Os bytes físicos são apagados pela aplicação apenas DEPOIS
-- do COMMIT da transação PostgreSQL.
-- ============================================================

CREATE FUNCTION jobs.execute_candidate_erasure(
    p_candidate_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor uuid;
    v_storage_paths text[];
BEGIN
    IF p_candidate_id IS NULL THEN
        RAISE EXCEPTION 'candidate id is required'
            USING ERRCODE = '22004';
    END IF;

    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor <> p_candidate_id
       AND NOT jobs.is_platform_staff() THEN
        RAISE EXCEPTION 'candidate erasure not authorized'
            USING ERRCODE = '42501';
    END IF;

    -- Guardamos primeiro os identificadores opacos dos ficheiros.
    -- As linhas candidate_documents serão apagadas mais abaixo.
    SELECT COALESCE(
        pg_catalog.array_agg(cd.storage_path ORDER BY cd.storage_path),
        ARRAY[]::text[]
    )
    INTO v_storage_paths
    FROM jobs.candidate_documents cd
    WHERE cd.user_id = p_candidate_id;

    -- application_notes contém texto livre potencialmente pessoal.
    DELETE FROM jobs.application_notes n
    USING jobs.applications a
    WHERE n.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Mantemos o histórico dos estados, mas removemos texto livre
    -- e a identidade do candidato caso tenha sido ele o ator.
    UPDATE jobs.application_status_history h
    SET changed_by = CASE
            WHEN h.changed_by = p_candidate_id THEN NULL
            ELSE h.changed_by
        END,
        note = NULL
    FROM jobs.applications a
    WHERE h.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Desligar primeiro as candidaturas é obrigatório antes de
    -- apagar candidate_documents, porque resume_document_id tem FK.
    UPDATE jobs.applications
    SET candidate_id = NULL,
        cover_note = NULL,
        resume_document_id = NULL,
        updated_at = pg_catalog.now()
    WHERE candidate_id = p_candidate_id;

    DELETE FROM jobs.candidate_private_data
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_experiences
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_education
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_skills
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_languages
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_data_consents
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.job_alerts
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.saved_job_offers
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.institution_affiliations
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_profiles
    WHERE user_id = p_candidate_id;

    -- Tem de ser posterior ao UPDATE de applications.
    DELETE FROM jobs.candidate_documents
    WHERE user_id = p_candidate_id;

    RETURN v_storage_paths;
END;
$$;

REVOKE ALL
ON FUNCTION jobs.execute_candidate_erasure(uuid)
FROM PUBLIC;

-- ============================================================

-- ============================================================
-- Backend notification recipient name lookup
--
-- Purposefully exposes only jobs.persons.full_name.
-- Email remains owned/resolved by Supabase Auth Admin API.
-- ============================================================

CREATE FUNCTION jobs.get_person_full_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT p.full_name
    FROM jobs.persons AS p
    WHERE p.user_id = p_user_id
    LIMIT 1;
$function$;

REVOKE EXECUTE
ON FUNCTION jobs.get_person_full_name(uuid)
FROM PUBLIC, anon, authenticated, service_role;


-- Z Jobs shared-database runtime ACL v1
--
-- jobs_runtime:
--   * role de grupo
--   * sem LOGIN/password
--   * sem BYPASSRLS
--   * sem ownership
--
-- O login efetivo da aplicação receberá membership em
-- jobs_runtime fora desta baseline.
--
-- Browser/Data API roles não recebem acesso direto a jobs.
-- ============================================================

DO $jobs_acl$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = 'jobs_runtime'
    ) THEN
        CREATE ROLE jobs_runtime
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;
END
$jobs_acl$;

ALTER ROLE jobs_runtime
    NOLOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    NOBYPASSRLS;


-- ------------------------------------------------------------
-- Defensive privilege reset
--
-- Se jobs_runtime já existir, não confiamos em privilégios antigos.
-- Primeiro removemos tudo; depois aplicamos a whitelist abaixo.
-- ------------------------------------------------------------

REVOKE ALL ON SCHEMA jobs
FROM jobs_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA jobs
FROM jobs_runtime;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA jobs
FROM jobs_runtime;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA jobs
FROM jobs_runtime;

REVOKE ALL ON SCHEMA auth
FROM jobs_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA auth
FROM jobs_runtime;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA auth
FROM jobs_runtime;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth
FROM jobs_runtime;

REVOKE ALL ON SCHEMA platform_internal
FROM jobs_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA platform_internal
FROM jobs_runtime;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA platform_internal
FROM jobs_runtime;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform_internal
FROM jobs_runtime;


-- ------------------------------------------------------------
-- Schema boundaries
-- ------------------------------------------------------------

REVOKE ALL ON SCHEMA jobs
FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA jobs
TO jobs_runtime;

-- jobs_runtime não entra na camada privada Core.
REVOKE ALL ON SCHEMA platform_internal
FROM jobs_runtime;


-- ------------------------------------------------------------
-- Supabase Auth boundary
--
-- O runtime não recebe SELECT/INSERT/UPDATE/DELETE em auth.users.
-- Apenas precisa de resolver auth.uid() para RLS e funções.
-- ------------------------------------------------------------

GRANT USAGE ON SCHEMA auth
TO jobs_runtime;

GRANT EXECUTE ON FUNCTION auth.uid()
TO jobs_runtime;


-- ------------------------------------------------------------
-- Fechar objetos Jobs aos roles públicos/Data API
-- ------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA jobs
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA jobs
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA jobs
FROM PUBLIC, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- SELECT
-- ------------------------------------------------------------

GRANT SELECT ON TABLE
    jobs.application_status_history,
    jobs.applications,
    jobs.audit_logs,
    jobs.billing_events,
    jobs.candidate_documents,
    jobs.candidate_education,
    jobs.candidate_experiences,
    jobs.candidate_languages,
    jobs.candidate_private_data,
    jobs.candidate_profiles,
    jobs.candidate_skills,
    jobs.collective_agreement_job_categories,
    jobs.collective_agreement_salary_levels,
    jobs.collective_agreements,
    jobs.company_profiles,
    jobs.country_income_tax_brackets,
    jobs.country_labor_profiles,
    jobs.country_tax_profiles,
    jobs.job_alerts,
    jobs.job_offer_reports,
    jobs.job_offers,
    jobs.nace_codes,
    jobs.occupations,
    jobs.offer_institution_reservations,
    jobs.organization_memberships,
    jobs.organization_reports,
    jobs.organizations,
    jobs.persons,
    jobs.saved_job_offers,
    jobs.skills,
    jobs.translations
TO jobs_runtime;


-- ------------------------------------------------------------
-- INSERT
-- ------------------------------------------------------------

GRANT INSERT ON TABLE
    jobs.application_status_history,
    jobs.applications,
    jobs.billing_events,
    jobs.candidate_documents,
    jobs.candidate_education,
    jobs.candidate_experiences,
    jobs.candidate_languages,
    jobs.candidate_profiles,
    jobs.candidate_skills,
    jobs.company_profiles,
    jobs.institution_courses,
    jobs.job_alerts,
    jobs.job_offer_reports,
    jobs.job_offers,
    jobs.offer_institution_reservations,
    jobs.organization_memberships,
    jobs.organization_reports,
    jobs.organizations,
    jobs.saved_job_offers,
    jobs.skills,
    jobs.translations
TO jobs_runtime;


-- ------------------------------------------------------------
-- UPDATE
-- ------------------------------------------------------------

GRANT UPDATE ON TABLE
    jobs.applications,
    jobs.candidate_profiles,
    jobs.company_profiles,
    jobs.job_offer_reports,
    jobs.job_offers,
    jobs.organization_reports,
    jobs.persons
TO jobs_runtime;


-- ------------------------------------------------------------
-- DELETE
-- ------------------------------------------------------------

GRANT DELETE ON TABLE
    jobs.candidate_private_data,
    jobs.job_alerts,
    jobs.saved_job_offers
TO jobs_runtime;


-- ------------------------------------------------------------
-- Functions callable directly by the application runtime
-- ------------------------------------------------------------

GRANT EXECUTE ON FUNCTION
    jobs.bootstrap_person(uuid, text, text),
    jobs.candidate_pool_insight(uuid),
    jobs.count_platform_staff(),
    jobs.employer_public_metrics(uuid),
    jobs.get_person_full_name(uuid),
    jobs.is_org_member(uuid, jobs.org_role[]),
    jobs.is_platform_staff(),
    jobs.is_verified_employer(uuid),
    jobs.record_audit_log(uuid, text, uuid, text),
    jobs.execute_candidate_erasure(uuid)
TO jobs_runtime;


-- ------------------------------------------------------------
-- Trigger-only/private functions: never directly callable
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION
    jobs.capture_job_offer_status_history(),
    jobs.capture_org_verification_assessment()
FROM jobs_runtime;

REVOKE ALL ON FUNCTION
    platform_internal.register_jobs_person_identity()
FROM PUBLIC, anon, authenticated, service_role, jobs_runtime;


-- ------------------------------------------------------------
-- Safe defaults for future objects created by this migration owner
-- ------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA jobs
REVOKE ALL ON TABLES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA jobs
REVOKE ALL ON SEQUENCES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA jobs
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
