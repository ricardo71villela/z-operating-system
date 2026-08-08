import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  User,
  Landmark,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  GraduationCap,
  Languages,
  FileText,
  Plus,
  Award,
} from "lucide-react";

/* ============================================================
   Z JOBS — vertical slice de demonstração
   ------------------------------------------------------------
   Fase de transição: os fluxos centrais (registo de candidato,
   criação/verificação de organização, ciclo de vida de ofertas,
   candidaturas) já chamam a API real por fetch() — ver o objeto
   `api` logo abaixo, testado a sério contra Postgres real fora
   deste ficheiro (apps/web/apiClient.js, mesma lógica). Inlined
   aqui, não importado de um ficheiro separado, porque este
   ficheiro é um artefacto de página única — sem sistema de
   módulos no browser onde é renderizado, uma importação relativa
   simplesmente não resolveria. O resto (Estúdio de CV, ERI,
   moderação) continua em estado local, por converter.

   AVISO: isto só fala com a API real se API_BASE_URL abaixo
   apontar para um servidor acessível a partir do browser onde
   este ficheiro está a correr — o Postgres/API desta sessão vivem
   num contentor isolado, inatingível pelo teu browser. Sem um
   servidor publicado, as chamadas fetch() abaixo falham, e é isso
   que deves esperar ver ao experimentar isto tal como está.
   ============================================================ */

const API_BASE_URL = (typeof window !== "undefined" && window.ZJOBS_API_BASE_URL) || "http://localhost:4000";
let apiAuthToken = null;

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (apiAuthToken) headers.Authorization = `Bearer ${apiAuthToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && body.error) || `Pedido falhou: ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

const api = {
  setAuthToken(token) { apiAuthToken = token; },
  async signupCandidate({ fullName, email, password, termsAccepted }) {
    const result = await apiFetch("/candidates", { method: "POST", body: JSON.stringify({ fullName, email, password, termsAccepted }) });
    if (result.token) apiAuthToken = result.token;
    return result;
  },
  async deleteMyPersonalData(userId) {
    return apiFetch(`/candidates/${userId}/personal-data`, { method: "DELETE" });
  },
  async saveOffer(userId, offerId) { return apiFetch(`/candidates/${userId}/saved-offers/${offerId}`, { method: "POST" }); },
  async unsaveOffer(userId, offerId) { return apiFetch(`/candidates/${userId}/saved-offers/${offerId}`, { method: "DELETE" }); },
  async listSavedOffers(userId) { return apiFetch(`/candidates/${userId}/saved-offers`, { method: "GET" }); },
  async createJobAlert(userId, queryParams) { return apiFetch(`/candidates/${userId}/job-alerts`, { method: "POST", body: JSON.stringify({ queryParams }) }); },
  async listJobAlerts(userId) { return apiFetch(`/candidates/${userId}/job-alerts`, { method: "GET" }); },
  async deleteJobAlert(alertId) { return apiFetch(`/job-alerts/${alertId}`, { method: "DELETE" }); },
  async getApplication(applicationId) { return apiFetch(`/applications/${applicationId}`, { method: "GET" }); },
  async getCandidateScores(offerId) { return apiFetch(`/job-offers/${offerId}/candidate-scores`, { method: "GET" }); },
  async getCandidatePoolInsight(offerId) { return apiFetch(`/job-offers/${offerId}/candidate-pool-insight`, { method: "GET" }); },
  async getPublicCompanyProfile(orgId) { return apiFetch(`/organizations/${orgId}/public-profile`, { method: "GET" }); },
  async createReport(payload) { return apiFetch("/reports", { method: "POST", body: JSON.stringify(payload) }); },
  async resolveReport(reportId, resolution, actorId) {
    return apiFetch(`/reports/${reportId}/resolve`, { method: "POST", body: JSON.stringify({ resolution, actorId }) });
  },
  async checkCVQuality(userId, payload) { return apiFetch(`/candidates/${userId}/cv-quality-check`, { method: "POST", body: JSON.stringify(payload) }); },
  async checkCoverLetter(userId, payload) { return apiFetch(`/candidates/${userId}/cover-letter-check`, { method: "POST", body: JSON.stringify(payload) }); },
  async login({ email, password }) {
    const result = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (result.token) apiAuthToken = result.token;
    return result;
  },
  async bootstrapAdmin() { return apiFetch("/auth/bootstrap-admin", { method: "POST" }); },
  async createOrganization({ legalName, displayName, createdBy }) {
    return apiFetch("/organizations", { method: "POST", body: JSON.stringify({ legalName, displayName, createdBy }) });
  },
  async requestOrganizationVerification(orgId) { return apiFetch(`/organizations/${orgId}/request-verification`, { method: "POST" }); },
  async approveOrganizationVerification(orgId) { return apiFetch(`/organizations/${orgId}/approve-verification`, { method: "POST" }); },
  async createJobOffer(draft) { return apiFetch("/job-offers", { method: "POST", body: JSON.stringify(draft) }); },
  async submitOfferForReview(offerId) { return apiFetch(`/job-offers/${offerId}/submit-for-review`, { method: "POST" }); },
  async reviewOffer(offerId) { return apiFetch(`/job-offers/${offerId}/review`, { method: "POST" }); },
  async publishOffer(offerId) { return apiFetch(`/job-offers/${offerId}/publish`, { method: "POST" }); },
  async listPublishedOffers() { return apiFetch("/job-offers?status=published", { method: "GET" }); },
  async applyToOffer({ jobOfferId, candidateId }) {
    return apiFetch("/applications", { method: "POST", body: JSON.stringify({ jobOfferId, candidateId }) });
  },
};

const ZJOBS_LOGO_DATA_URI = "data:image/png;base64,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";

const PILLARS = [
  { key: "first_jobs", label: "First Jobs" },
  { key: "professional_careers", label: "Professional Careers" },
  { key: "senior_careers", label: "Senior Careers" },
];

// COMMISSION_ONLY_KEYWORDS e MLM_KEYWORDS foram removidas daqui — eram
// só usadas por validateOffer(), que deixou de existir depois de o
// fluxo de revisão passar a chamar api.reviewOffer() (o servidor real,
// mesmo domain layer testado 150+ vezes) em vez de replicar a validação
// à mão neste ficheiro. Se um dia quiseres pré-visualização instantânea
// no formulário antes de submeter, é aqui que a lógica voltaria a viver.

// Mesma relação tripartida que packages/domain/src/rules/jobOffer.ts —
// ver TEMP_AGENCY_CONTRACT_TYPES lá para a justificação legal completa
// (Diretiva 2008/104/CE, Artigos 5.º e 6.º).
const TEMP_AGENCY_CONTRACT_TYPES = ["temporary_agency", "interim"];
const CONTRACT_TYPE_LABELS = {
  permanent: "Efetivo (sem termo)",
  fixed_term: "A termo certo",
  temporary_agency: "Empresa de Trabalho Temporário (ETT)",
  interim: "Interim",
  project_based: "A projeto",
  seasonal: "Sazonal",
  paid_internship: "Estágio remunerado",
  trainee_program: "Programa trainee",
  replacement_contract: "Contrato de substituição",
  other: "Outro",
};

const APPLICATION_TRANSITIONS = {
  submitted: ["received", "withdrawn"],
  received: ["screening", "rejected", "withdrawn"],
  screening: ["shortlisted", "rejected", "withdrawn"],
  shortlisted: ["interview", "rejected", "withdrawn"],
  interview: ["assessment", "offer", "rejected", "withdrawn"],
  assessment: ["offer", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: ["closed"],
  rejected: ["closed"],
  withdrawn: ["closed"],
  closed: [],
};

const STATUS_LABEL = {
  submitted: "Submetida",
  received: "Recebida",
  screening: "Em triagem",
  shortlisted: "Pré-selecionada",
  interview: "Entrevista",
  assessment: "Avaliação",
  offer: "Proposta",
  hired: "Contratada",
  rejected: "Rejeitada",
  withdrawn: "Retirada",
  closed: "Encerrada",
};

/* ---- Completude de perfil (secção 6) — espelha candidateProfile.ts ---- */
const COMPLETENESS_WEIGHTS = { title: 10, summary: 15, experience: 25, education: 15, skills: 15, languages: 10, resume: 10 };

function computeProfileCompleteness(input) {
  let score = 0;
  const missing = [];
  if (input.hasTitle) score += COMPLETENESS_WEIGHTS.title; else missing.push("título profissional");
  if (input.hasSummary) score += COMPLETENESS_WEIGHTS.summary; else missing.push("apresentação");
  if (input.experienceCount > 0) score += COMPLETENESS_WEIGHTS.experience; else missing.push("experiência");
  if (input.educationCount > 0) score += COMPLETENESS_WEIGHTS.education; else missing.push("educação");
  if (input.skillCount > 0) score += COMPLETENESS_WEIGHTS.skills; else missing.push("competências");
  if (input.languageCount > 0) score += COMPLETENESS_WEIGHTS.languages; else missing.push("idiomas");
  if (input.hasResume) score += COMPLETENESS_WEIGHTS.resume; else missing.push("CV");
  return { score, missing };
}

/* ---- Employment Responsibility Index (secção 8) — espelha employerResponsibility.ts ---- */
const BADGE_LABELS = {
  verified_employer: "Verified Employer",
  salary_transparent_employer: "Salary Transparent Employer",
  first_job_employer: "First Job Employer",
  age_inclusive_employer: "Age Inclusive Employer",
  responsible_recruiter: "Responsible Recruiter",
};

/* ---- Traduções com fallback (secção 14) — espelha i18n.ts ---- */
const SUPPORTED_LOCALES = [
  { code: "pt", label: "PT" },
  { code: "en", label: "EN" },
  { code: "it", label: "IT" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
];

/* ---- Correspondência de palavras-chave — continua local, é feedback
   instantâneo de baixo risco, ao contrário da pontuação de qualidade e
   da verificação da carta, que agora chamam a API real (cvStudio.ts no
   servidor) em vez de replicar a lógica aqui. ---- */
function matchCVAgainstOffer(cvText, offerKeywords) {
  const haystack = cvText.toLowerCase();
  const matched = [];
  const missing = [];
  for (const kw of offerKeywords) {
    if (haystack.includes(kw.toLowerCase())) matched.push(kw); else missing.push(kw);
  }
  const matchRate = offerKeywords.length === 0 ? 1 : matched.length / offerKeywords.length;
  return { matchedKeywords: matched, missingKeywords: missing, matchRate };
}


function resolveTranslation(entries, requestedLocale, originalValue, originalLocale) {
  const exact = entries.find((e) => e.locale === requestedLocale);
  if (exact) return { value: exact.value, locale: requestedLocale, isFallback: false };
  if (originalLocale && requestedLocale !== originalLocale) {
    const original = entries.find((e) => e.locale === originalLocale);
    if (original) return { value: original.value, locale: originalLocale, isFallback: true };
  }
  const english = entries.find((e) => e.locale === "en");
  if (english && requestedLocale !== "en") return { value: english.value, locale: "en", isFallback: true };
  if (entries.length > 0) return { value: entries[0].value, locale: entries[0].locale, isFallback: true };
  return { value: originalValue, locale: originalLocale ?? null, isFallback: true };
}

let idCounter = 1;
const nextId = (prefix) => `${prefix}_${idCounter++}`;

function currency(n) {
  return new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 0 }).format(n);
}

/* ---------------- Reusable bits ---------------- */

function SalaryLedger({ min, max, currencyCode = "EUR", period = "monthly", fixed }) {
  const periodLabel = { hourly: "/h", daily: "/dia", monthly: "/mês", yearly: "/ano" }[period] || "";
  return (
    <div className="zj-ledger">
      <span className="zj-ledger-amount">
        {currencyCode === "EUR" ? "€" : currencyCode}&nbsp;{currency(min)}
        {max ? `\u2013${currency(max)}` : ""}
        <span className="zj-ledger-period">{periodLabel}</span>
      </span>
      <span className={`zj-ledger-tag ${fixed ? "is-fixed" : "is-risk"}`}>
        {fixed ? <><CheckCircle2 size={12} /> fixo garantido</> : <><AlertTriangle size={12} /> sem fixo</>}
      </span>
    </div>
  );
}

function VerificationBadge({ status }) {
  const map = {
    verified: { label: "Verificada", cls: "is-trust", icon: <ShieldCheck size={13} /> },
    enhanced_verified: { label: "Verificação reforçada", cls: "is-trust", icon: <BadgeCheck size={13} /> },
    pending: { label: "Verificação pendente", cls: "is-pending", icon: <Clock size={13} /> },
    unverified: { label: "Não verificada", cls: "is-muted", icon: <XCircle size={13} /> },
  };
  const m = map[status] || map.unverified;
  return <span className={`zj-badge ${m.cls}`}>{m.icon}{m.label}</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="zj-field">
      <span className="zj-field-label">{label}</span>
      {children}
      {hint && <span className="zj-field-hint">{hint}</span>}
    </label>
  );
}

/* ---------------- Main app ---------------- */

export default function ZJobsDemo() {
  const [role, setRole] = useState("public");
  const [pillar, setPillar] = useState("first_jobs");
  const [locale, setLocale] = useState("pt");
  const [translations, setTranslations] = useState([]); // {entityId, field, locale, value}

  const [candidates, setCandidates] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [offers, setOffers] = useState([]);
  const [applications, setApplications] = useState([]);

  const [currentCandidateId, setCurrentCandidateId] = useState(null);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [viewingCompanyOrgId, setViewingCompanyOrgId] = useState(null);
  const [toast, setToast] = useState(null);
  const [reports, setReports] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  // Sessão real — o mesmo token serve para os fluxos de candidato e de
  // empresa, porque nesta plataforma são a mesma pessoa a agir com
  // chapéus diferentes. staffToken é obtido à parte, via bootstrap na
  // vista de Admin — ver secção 10 do domínio para o porquê de staff
  // ser um privilégio concedido, não um papel escolhido livremente.
  const [sessionToken, setSessionToken] = useState(null);
  const [savedOfferIds, setSavedOfferIds] = useState([]);
  const [staffToken, setStaffToken] = useState(null);
  const [apiBusy, setApiBusy] = useState(false);

  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [skillsByCandidate, setSkillsByCandidate] = useState({});
  const [languagesByCandidate, setLanguagesByCandidate] = useState({});
  const [documentsByCandidate, setDocumentsByCandidate] = useState({});

  const currentCandidate = candidates.find((c) => c.id === currentCandidateId) || null;
  const currentOrg = orgs.find((o) => o.id === currentOrgId) || null;

  function notify(msg, tone = "info") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }

  const publishedOffers = useMemo(() => {
    return offers
      .filter((o) => o.status === "published" && o.pillar === pillar)
      .map((o) => {
        const titleEntries = translations.filter((t) => t.entityId === o.id && t.field === "title").map((t) => ({ locale: t.locale, value: t.value }));
        const descEntries = translations.filter((t) => t.entityId === o.id && t.field === "description").map((t) => ({ locale: t.locale, value: t.value }));
        const title = resolveTranslation(titleEntries, locale, o.title);
        const description = resolveTranslation(descEntries, locale, o.description);
        return { ...o, title: title.value, description: description.value, isTranslationFallback: title.isFallback };
      });
  }, [offers, pillar, locale, translations]);

  function addTranslation(entityId, field, targetLocale, value) {
    if (!value?.trim()) return;
    setTranslations((prev) => {
      const idx = prev.findIndex((t) => t.entityId === entityId && t.field === field && t.locale === targetLocale);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], value };
        return copy;
      }
      return [...prev, { entityId, field, locale: targetLocale, value }];
    });
    notify("Tradução guardada.", "success");
  }

  /* ---- Candidato ---- */
  async function createCandidate(name, title, email, password, termsAccepted) {
    setApiBusy(true);
    try {
      const result = await api.signupCandidate({ fullName: name, email, password, termsAccepted });
      setSessionToken(result.token);
      const c = { id: result.id, name, title, visibility: "visible_to_verified_employers" };
      setCandidates((prev) => [...prev, c]);
      setCurrentCandidateId(c.id);
      notify(`Conta de candidato criada para ${name}.`, "success");
    } catch (err) {
      notify(`Não foi possível criar a conta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  function addExperience(candidateId, exp) {
    setExperiences((prev) => [...prev, { id: nextId("exp"), candidateId, ...exp }]);
    notify("Experiência adicionada.", "success");
  }
  function addEducation(candidateId, edu) {
    setEducation((prev) => [...prev, { id: nextId("edu"), candidateId, ...edu }]);
    notify("Formação adicionada.", "success");
  }
  function addSkill(candidateId, skillName) {
    if (!skillName?.trim()) return;
    setSkillsByCandidate((prev) => ({
      ...prev,
      [candidateId]: [...new Set([...(prev[candidateId] || []), skillName.trim()])],
    }));
  }
  function addLanguage(candidateId, code) {
    setLanguagesByCandidate((prev) => ({
      ...prev,
      [candidateId]: [...new Set([...(prev[candidateId] || []), code])],
    }));
  }
  function addDocument(candidateId, doc) {
    setDocumentsByCandidate((prev) => ({
      ...prev,
      [candidateId]: [...(prev[candidateId] || []), { id: nextId("doc"), ...doc }],
    }));
    notify(`Documento "${doc.fileName}" carregado.`, "success");
  }

  function setCandidateSummary(candidateId, summary) {
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, summary } : c)));
  }

  function candidateCompleteness(candidateId) {
    const cand = candidates.find((c) => c.id === candidateId);
    return computeProfileCompleteness({
      hasTitle: !!cand?.title,
      hasSummary: !!cand?.summary,
      experienceCount: experiences.filter((e) => e.candidateId === candidateId).length,
      educationCount: education.filter((e) => e.candidateId === candidateId).length,
      skillCount: (skillsByCandidate[candidateId] || []).length,
      languageCount: (languagesByCandidate[candidateId] || []).length,
      hasResume: (documentsByCandidate[candidateId] || []).some((d) => d.docType === "cv"),
    });
  }

  async function applyToOffer(offerId) {
    if (!currentCandidate) return notify("Cria primeiro uma conta de candidato.", "warn");
    const offer = offers.find((o) => o.id === offerId);
    if (!offer || offer.status !== "published") return notify("Só é possível candidatar-se a ofertas publicadas.", "warn");
    if (applications.some((a) => a.offerId === offerId && a.candidateId === currentCandidate.id)) {
      return notify("Já te candidataste a esta oferta.", "warn");
    }
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      const result = await api.applyToOffer({ jobOfferId: offerId, candidateId: currentCandidate.id });
      const app = {
        id: result.id, offerId, candidateId: currentCandidate.id, status: result.status,
        history: [{ to: result.status, at: new Date().toLocaleTimeString() }],
      };
      setApplications((prev) => [...prev, app]);
      notify("Candidatura submetida.", "success");
    } catch (err) {
      notify(`Não foi possível candidatar-te: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function deleteMyAccount() {
    if (!currentCandidate) return;
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      const plan = await api.deleteMyPersonalData(currentCandidate.id);
      setSessionToken(null);
      setCurrentCandidateId(null);
      setCandidates((prev) => prev.filter((c) => c.id !== currentCandidate.id));
      const retained = plan.actions.filter((a) => a.action === "retain");
      notify(
        retained.length === 0
          ? "Conta e dados pessoais apagados por completo."
          : `Dados de perfil apagados. ${retained.length} registo(s) retido(s) por obrigação legal — ver detalhe no plano devolvido.`,
        "info",
      );
      return plan;
    } catch (err) {
      notify(`Não foi possível apagar a conta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function toggleSavedOffer(offerId, isSaved) {
    if (!currentCandidate) return notify("Cria primeiro uma conta de candidato.", "warn");
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      if (isSaved) {
        await api.unsaveOffer(currentCandidate.id, offerId);
        setSavedOfferIds((prev) => prev.filter((id) => id !== offerId));
      } else {
        await api.saveOffer(currentCandidate.id, offerId);
        setSavedOfferIds((prev) => [...prev, offerId]);
      }
    } catch (err) {
      notify(`Não foi possível guardar/remover: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function fetchMyScoreForApplication(applicationId) {
    api.setAuthToken(sessionToken);
    return api.getApplication(applicationId);
  }

  async function fetchCandidateScoresForOffer(offerId) {
    api.setAuthToken(staffToken || sessionToken);
    return api.getCandidateScores(offerId);
  }

  async function fetchCandidatePoolInsight(offerId) {
    api.setAuthToken(sessionToken);
    return api.getCandidatePoolInsight(offerId);
  }

  async function fetchPublicCompanyProfile(orgId) {
    // Sem autenticação de propósito — é público, qualquer visitante vê
    // o mesmo. Não define token nenhum antes desta chamada.
    return api.getPublicCompanyProfile(orgId);
  }

  async function checkCVQuality(candidateId, payload) {
    api.setAuthToken(sessionToken);
    return api.checkCVQuality(candidateId, payload);
  }

  async function checkCoverLetter(candidateId, payload) {
    api.setAuthToken(sessionToken);
    return api.checkCoverLetter(candidateId, payload);
  }

  function transitionApplication(appId, to, actor) {
    setApplications((prev) =>
      prev.map((a) => {
        if (a.id !== appId) return a;
        if (actor === "candidate" && to !== "withdrawn") {
          notify("O candidato só pode retirar a candidatura.", "warn");
          return a;
        }
        if (!APPLICATION_TRANSITIONS[a.status]?.includes(to)) {
          notify(`Transição ${a.status} → ${to} não permitida.`, "warn");
          return a;
        }
        return { ...a, status: to, history: [...a.history, { to, at: new Date().toLocaleTimeString() }] };
      }),
    );
  }

  /* ---- Empresa ---- */
  async function createOrg(legalName) {
    if (!currentCandidateId) return notify("Cria primeiro uma conta pessoal — uma organização precisa de um dono.", "warn");
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      const result = await api.createOrganization({ legalName, displayName: legalName, createdBy: currentCandidateId });
      const o = { id: result.id, legalName, verificationStatus: result.verificationStatus || "unverified" };
      setOrgs((prev) => [...prev, o]);
      setCurrentOrgId(o.id);
      notify(`Organização "${legalName}" criada — por verificar.`, "info");
    } catch (err) {
      notify(`Não foi possível criar a organização: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function requestVerification(orgId) {
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      await api.requestOrganizationVerification(orgId);
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, verificationStatus: "pending" } : o)));
      notify("Verificação solicitada. Aguarda aprovação do administrador.", "info");
    } catch (err) {
      notify(`Não foi possível pedir verificação: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function createOffer(orgId, draft) {
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      const result = await api.createJobOffer({ organizationId: orgId, ...draft });
      const o = { ...draft, id: result.id, organizationId: orgId, status: result.status || "draft" };
      setOffers((prev) => [...prev, o]);
      notify("Oferta guardada como rascunho.", "info");
    } catch (err) {
      notify(`Não foi possível guardar a oferta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function submitOfferForReview(offerId) {
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      await api.submitOfferForReview(offerId);
      setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status: "pending_review" } : o)));
      notify("Oferta submetida para revisão.", "info");
    } catch (err) {
      notify(`Não foi possível submeter a oferta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  /* ---- Admin ---- */
  async function bootstrapStaff() {
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      await api.bootstrapAdmin();
      setStaffToken(sessionToken);
      notify("Tornaste-te staff da plataforma — só funciona uma vez, para a primeira pessoa.", "success");
    } catch (err) {
      notify(`Não foi possível tornar-te staff: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function approveVerification(orgId) {
    setApiBusy(true);
    try {
      api.setAuthToken(staffToken);
      await api.approveOrganizationVerification(orgId);
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, verificationStatus: "verified" } : o)));
      notify("Empresa verificada.", "success");
      addAudit("admin", "organization", orgId, "verify");
    } catch (err) {
      notify(`Não foi possível verificar a empresa: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function reviewOffer(offerId) {
    setApiBusy(true);
    try {
      api.setAuthToken(staffToken);
      const result = await api.reviewOffer(offerId);
      // A validação real corre no servidor (mesmo domain layer testado
      // 150+ vezes) — deixámos de replicar validateOffer() aqui à mão.
      if (result.status === "needs_changes") {
        setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status: "needs_changes", issues: result.issues || [] } : o)));
        notify("Oferta enviada de volta — precisa de correções.", "warn");
        addAudit("admin", "job_offer", offerId, "reject");
      } else {
        setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status: "approved", issues: [] } : o)));
        notify("Oferta aprovada.", "success");
        addAudit("admin", "job_offer", offerId, "approve");
      }
    } catch (err) {
      notify(`Não foi possível rever a oferta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function publishOffer(offerId) {
    setApiBusy(true);
    try {
      api.setAuthToken(staffToken);
      await api.publishOffer(offerId);
      setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status: "published" } : o)));
      notify("Oferta publicada — já visível no portal público.", "success");
      addAudit("admin", "job_offer", offerId, "publish");
    } catch (err) {
      notify(`Não foi possível publicar a oferta: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  function addAudit(actorId, entityType, entityId, action) {
    setAuditLog((prev) => [
      ...prev,
      { id: nextId("audit"), actorId, entityType, entityId, action, createdAt: new Date().toLocaleTimeString() },
    ]);
  }

  /* ---- Denúncias / moderação (secções 10, 11, 15, 23) ---- */
  async function reportTarget(targetType, targetId, reason) {
    if (!reason?.trim()) return;
    if (!currentCandidateId) {
      return notify("É preciso ter sessão iniciada para denunciar — entra como candidato primeiro.", "warn");
    }
    setApiBusy(true);
    try {
      api.setAuthToken(sessionToken);
      const result = await api.createReport({ targetType, targetId, reason, reportedBy: currentCandidateId });
      setReports((prev) => [...prev, { id: result.id, targetType, targetId, reason, reportedBy: currentCandidateId, status: "open", resolution: undefined }]);
      notify("Denúncia registada — será revista por um administrador.", "info");
    } catch (err) {
      notify(`Não foi possível registar a denúncia: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  async function resolveReportAction(reportId, resolution) {
    const report = reports.find((r) => r.id === reportId);
    if (!report || report.status === "resolved" || report.status === "dismissed") {
      return notify("Esta denúncia já foi resolvida.", "warn");
    }
    setApiBusy(true);
    try {
      api.setAuthToken(staffToken);
      const result = await api.resolveReport(reportId, resolution, currentCandidateId || "admin");
      // O servidor decide o status real (resolved para confirmado,
      // dismissed para infundado) — usamos o que ele devolve, não
      // fingimos localmente qual devia ser.
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: result.status, resolution: result.resolution } : r)));
      if (resolution === "confirmed" && report.targetType === "job_offer") {
        setOffers((prev) => prev.map((o) => (o.id === report.targetId ? { ...o, status: "suspended" } : o)));
        notify("Denúncia confirmada — oferta suspensa.", "warn");
      } else {
        notify("Denúncia marcada como infundada.", "success");
      }
    } catch (err) {
      notify(`Não foi possível resolver a denúncia: ${err.message}`, "warn");
    } finally {
      setApiBusy(false);
    }
  }

  const selectedOffer = offers.find((o) => o.id === selectedOfferId) || null;

  return (
    <div className="zj-root">
      <FontsAndStyles />

      <header className="zj-header">
        <div className="zj-brand">
          <img className="zj-brand-mark" src={ZJOBS_LOGO_DATA_URI} alt="Z Jobs" />
          <span className="zj-brand-name">Z Jobs</span>
        </div>
        <div className="zj-header-right">
          <div className="zj-locale-switch">
            {SUPPORTED_LOCALES.map((l) => (
              <button key={l.code} className={`zj-locale-btn ${locale === l.code ? "is-active" : ""}`} onClick={() => setLocale(l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          <nav className="zj-role-switch">
            {[
              { key: "public", label: "Portal Público", icon: <Search size={14} /> },
              { key: "candidate", label: "Candidato", icon: <User size={14} /> },
              { key: "company", label: "Empresa", icon: <Building2 size={14} /> },
              { key: "admin", label: "Admin", icon: <Landmark size={14} /> },
            ].map((r) => (
              <button key={r.key} className={`zj-tab ${role === r.key ? "is-active" : ""}`} onClick={() => setRole(r.key)}>
                {r.icon}
                {r.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {toast && <div className={`zj-toast tone-${toast.tone}`}>{toast.msg}</div>}

      <main className="zj-main">
        {role === "public" && (
          <PublicView
            pillar={pillar}
            setPillar={setPillar}
            offers={publishedOffers}
            onSelect={setSelectedOfferId}
            locale={locale}
            orgs={orgs}
          />
        )}

        {role === "candidate" && (
          <CandidateView
            candidate={currentCandidate}
            onCreate={createCandidate}
            offers={offers}
            applications={applications.filter((a) => a.candidateId === currentCandidateId)}
            onApply={applyToOffer}
            onTransition={(appId, to) => transitionApplication(appId, to, "candidate")}
            experiences={experiences.filter((e) => e.candidateId === currentCandidateId)}
            education={education.filter((e) => e.candidateId === currentCandidateId)}
            skills={skillsByCandidate[currentCandidateId] || []}
            languages={languagesByCandidate[currentCandidateId] || []}
            documents={documentsByCandidate[currentCandidateId] || []}
            onAddExperience={(exp) => addExperience(currentCandidateId, exp)}
            onAddEducation={(edu) => addEducation(currentCandidateId, edu)}
            onAddSkill={(s) => addSkill(currentCandidateId, s)}
            onAddLanguage={(l) => addLanguage(currentCandidateId, l)}
            onAddDocument={(d) => addDocument(currentCandidateId, d)}
            onSetSummary={(s) => setCandidateSummary(currentCandidateId, s)}
            completeness={currentCandidateId ? candidateCompleteness(currentCandidateId) : null}
            locale={locale}
            orgs={orgs}
            onDeleteAccount={deleteMyAccount}
            savedOfferIds={savedOfferIds}
            onToggleSaved={toggleSavedOffer}
            onFetchMyScore={fetchMyScoreForApplication}
            onCheckCVQuality={checkCVQuality}
            onCheckCoverLetter={checkCoverLetter}
          />
        )}

        {role === "company" && (
          <CompanyView
            org={currentOrg}
            orgs={orgs}
            onCreateOrg={createOrg}
            onSelectOrg={setCurrentOrgId}
            onRequestVerification={requestVerification}
            onCreateOffer={createOffer}
            onSubmitForReview={submitOfferForReview}
            offers={offers.filter((o) => o.organizationId === currentOrgId)}
            applications={applications}
            candidates={candidates}
            onTransitionApplication={(appId, to) => transitionApplication(appId, to, "company")}
            onViewResponsibility={() => setViewingCompanyOrgId(currentOrgId)}
            translations={translations}
            onAddTranslation={addTranslation}
            onFetchPoolInsight={fetchCandidatePoolInsight}
          />
        )}

        {role === "admin" && (
          <AdminView
            orgs={orgs}
            offers={offers}
            onApproveVerification={approveVerification}
            onReviewOffer={reviewOffer}
            onPublishOffer={publishOffer}
            onViewResponsibility={setViewingCompanyOrgId}
            reports={reports}
            onResolveReport={resolveReportAction}
            auditLog={auditLog}
            staffToken={staffToken}
            onBootstrapStaff={bootstrapStaff}
            sessionToken={sessionToken}
          />
        )}
      </main>

      {selectedOffer && (
        <OfferDetail
          offer={selectedOffer}
          org={orgs.find((o) => o.id === selectedOffer.organizationId)}
          onClose={() => setSelectedOfferId(null)}
          onApply={() => applyToOffer(selectedOffer.id)}
          canApply={role !== "company" && role !== "admin"}
          onViewCompanyProfile={() => setViewingCompanyOrgId(selectedOffer.organizationId)}
          onReport={(reason) => reportTarget("job_offer", selectedOffer.id, reason)}
        />
      )}

      {viewingCompanyOrgId && (
        <CompanyProfileDrawer
          org={orgs.find((o) => o.id === viewingCompanyOrgId)}
          onClose={() => setViewingCompanyOrgId(null)}
          onFetchProfile={fetchPublicCompanyProfile}
        />
      )}
    </div>
  );
}

/* ---------------- Views ---------------- */

function PublicView({ pillar, setPillar, offers, onSelect, locale, orgs }) {
  return (
    <section className="zj-public">
      <div className="zj-hero">
        <p className="zj-eyebrow">Manifesto · {locale.toUpperCase()}</p>
        <h1 className="zj-hero-line">
          Quem trabalha merece,
          <br />
          pelo menos, um salário garantido.
        </h1>
        <p className="zj-hero-sub">
          Cada oferta no Z Jobs declara remuneração fixa, vínculo real e empregador identificável —
          antes de chegar até ti.
        </p>
      </div>

      <div className="zj-pillars">
        {PILLARS.map((p) => (
          <button key={p.key} className={`zj-pillar ${pillar === p.key ? "is-active" : ""}`} onClick={() => setPillar(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="zj-grid">
        {offers.length === 0 && (
          <p className="zj-empty">Ainda não há ofertas publicadas neste pilar. Cria uma como empresa e aprova-a como admin para a veres aqui.</p>
        )}
        {offers.map((o) => (
          <button key={o.id} className="zj-card" onClick={() => onSelect(o.id)}>
            <div className="zj-card-top">
              <h3>{o.title}</h3>
              <VerificationBadge status={orgs?.find((org) => org.id === o.organizationId)?.verificationStatus} />
            </div>
            {o.isTranslationFallback && locale !== "pt" && (
              <span className="zj-fallback-note">Sem tradução em {locale.toUpperCase()} — a mostrar melhor alternativa disponível</span>
            )}
            <p className="zj-card-desc">{o.description.slice(0, 110)}{o.description.length > 110 ? "…" : ""}</p>
            <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CandidateView({
  candidate, onCreate, offers, applications, onApply, onTransition,
  experiences, education, skills, languages, documents,
  onAddExperience, onAddEducation, onAddSkill, onAddLanguage, onAddDocument,
  onSetSummary, completeness, locale, orgs,
  onDeleteAccount, savedOfferIds, onToggleSaved, onFetchMyScore,
  onCheckCVQuality, onCheckCoverLetter,
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [scoreByApplicationId, setScoreByApplicationId] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleShowScore(applicationId) {
    try {
      const app = await onFetchMyScore(applicationId);
      setScoreByApplicationId((prev) => ({ ...prev, [applicationId]: app.myScoreForThisOffer || { error: "Ainda sem pontuação para esta candidatura." } }));
    } catch (err) {
      setScoreByApplicationId((prev) => ({ ...prev, [applicationId]: { error: err.message } }));
    }
  }

  if (!candidate) {
    return (
      <section className="zj-panel">
        <h2>Criar conta de candidato</h2>
        <p className="zj-panel-hint">Gratuito, sempre — nunca há subscrição para candidatos (secção 3.1).</p>
        <div className="zj-form">
          <Field label="Nome completo">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Ferreira" />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@exemplo.pt" />
          </Field>
          <Field label="Palavra-passe">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 12 carateres" />
          </Field>
          <Field label="Título profissional">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Engenheira de Software" />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            Li e aceito os Termos de Serviço e a Política de Privacidade.
          </label>
          <button className="zj-btn is-primary" disabled={!name || !email || password.length < 12 || !termsAccepted} onClick={() => onCreate(name, title, email, password, termsAccepted)}>
            Criar conta <ArrowRight size={14} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="zj-panel">
      <h2>Olá, {candidate.name}</h2>
      <p className="zj-panel-hint">{candidate.title || "Sem título profissional definido."}</p>

      {completeness && (
        <div className="zj-completeness">
          <div className="zj-completeness-track">
            <div className="zj-completeness-fill" style={{ width: `${completeness.score}%` }} />
          </div>
          <span className="zj-completeness-label">{completeness.score}% do perfil completo</span>
          {completeness.missing.length > 0 && (
            <span className="zj-completeness-hint">Falta: {completeness.missing.join(", ")}</span>
          )}
        </div>
      )}

      <h3 className="zj-subhead"><User size={14} /> Apresentação</h3>
      <textarea
        className="zj-summary"
        rows={2}
        defaultValue={candidate.summary || ""}
        placeholder="Recém-licenciada em Engenharia Informática, à procura do primeiro emprego..."
        onBlur={(e) => onSetSummary(e.target.value)}
      />

      <h3 className="zj-subhead"><Briefcase size={14} /> Experiência</h3>
      <ExperienceForm onAdd={onAddExperience} />
      <div className="zj-list nested">
        {experiences.map((e) => (
          <div key={e.id} className="zj-list-row">
            <div>
              <strong>{e.title}</strong> — {e.companyName}
              {e.description && <p className="zj-hint-inline zj-exp-desc">{e.description}</p>}
            </div>
            <span className="zj-hint-inline">{e.startDate}{e.isCurrent ? " → atual" : ""}</span>
          </div>
        ))}
        {experiences.length === 0 && <p className="zj-empty">Ainda sem experiência registada.</p>}
      </div>

      <h3 className="zj-subhead"><GraduationCap size={14} /> Educação</h3>
      <EducationForm onAdd={onAddEducation} />
      <div className="zj-list nested">
        {education.map((e) => (
          <div key={e.id} className="zj-list-row">
            <div><strong>{e.degree}</strong> em {e.fieldOfStudy}</div>
            <span className="zj-hint-inline">{e.institutionName}</span>
          </div>
        ))}
        {education.length === 0 && <p className="zj-empty">Ainda sem formação registada.</p>}
      </div>

      <h3 className="zj-subhead"><Award size={14} /> Competências</h3>
      <TagInput items={skills} onAdd={onAddSkill} placeholder="ex: TypeScript" />

      <h3 className="zj-subhead"><Languages size={14} /> Idiomas</h3>
      <TagInput items={languages} onAdd={onAddLanguage} placeholder="ex: pt, en, fr" />

      <h3 className="zj-subhead"><FileText size={14} /> Documentos</h3>
      <DocumentForm onAdd={onAddDocument} />
      <div className="zj-list nested">
        {documents.map((d) => (
          <div key={d.id} className="zj-list-row">
            <div><strong>{d.fileName}</strong></div>
            <span className="zj-hint-inline">{d.docType}</span>
          </div>
        ))}
        {documents.length === 0 && <p className="zj-empty">Ainda sem documentos carregados.</p>}
      </div>

      <CVStudioPanel
        experiences={experiences}
        skills={skills}
        documents={documents}
        locale={locale}
        publishedOffers={offers.filter((o) => o.status === "published")}
        orgs={orgs}
        candidateId={candidate.id}
        onCheckCVQuality={onCheckCVQuality}
        onCheckCoverLetter={onCheckCoverLetter}
      />

      <h3 className="zj-subhead">Ofertas para ti — ordenadas por relevância</h3>
      <p className="zj-panel-hint">
        Ordenação com base nas competências e experiência do teu perfil — nunca esconde ofertas, só as ordena. Adiciona mais competências para melhorar a precisão.
      </p>
      <div className="zj-list">
        {offers.filter((o) => o.status === "published")
          .map((o) => ({ offer: o, relevance: computeOfferRelevance(o, { skills, experiences }) }))
          .sort((a, b) => b.relevance.score - a.relevance.score)
          .map(({ offer: o, relevance }) => (
            <div key={o.id} className="zj-list-row">
              <div>
                <div className="zj-relevance-row">
                  <span className={`zj-relevance-badge is-${relevance.level}`}>{relevance.score}%</span>
                  <strong>{o.title}</strong>
                </div>
                <p className="zj-hint-inline zj-exp-desc">{relevance.label}</p>
                <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="zj-btn is-ghost" onClick={() => onToggleSaved(o.id, (savedOfferIds || []).includes(o.id))}>
                  {(savedOfferIds || []).includes(o.id) ? "Guardada ✓" : "Guardar"}
                </button>
                <button className="zj-btn is-ghost" onClick={() => onApply(o.id)}>Candidatar-me</button>
              </div>
            </div>
          ))}
        {offers.filter((o) => o.status === "published").length === 0 && (
          <p className="zj-empty">Sem ofertas publicadas de momento.</p>
        )}
      </div>

      <h3 className="zj-subhead">As minhas candidaturas</h3>
      <div className="zj-list">
        {applications.map((a) => {
          const offer = offers.find((o) => o.id === a.offerId);
          const score = scoreByApplicationId[a.id];
          return (
            <div key={a.id} className="zj-list-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <div>
                  <strong>{offer?.title}</strong>
                  <span className={`zj-status status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="zj-btn is-ghost" onClick={() => handleShowScore(a.id)}>Ver a minha pontuação</button>
                  {APPLICATION_TRANSITIONS[a.status]?.includes("withdrawn") && (
                    <button className="zj-btn is-ghost" onClick={() => onTransition(a.id, "withdrawn")}>Retirar</button>
                  )}
                </div>
              </div>
              {score && !score.error && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--zj-muted, #666)" }}>
                  <strong>Pontuação: {score.score}/100</strong> — nunca decide sozinha, só orienta (secção 9 dos Termos de Serviço).
                  <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                    {(score.factors || []).map((f, i) => <li key={i}>{f.explanation || f.messageKey}</li>)}
                  </ul>
                </div>
              )}
              {score && score.error && <p className="zj-empty" style={{ marginTop: "6px" }}>{score.error}</p>}
            </div>
          );
        })}
        {applications.length === 0 && <p className="zj-empty">Ainda sem candidaturas.</p>}
      </div>

      <h3 className="zj-subhead">Definições da conta</h3>
      <div className="zj-panel-hint">
        {!showDeleteConfirm ? (
          <button className="zj-btn is-ghost" onClick={() => setShowDeleteConfirm(true)}>Apagar a minha conta e dados pessoais</button>
        ) : (
          <div>
            <p>
              Isto apaga imediatamente o teu perfil, experiência, formação e documentos. Alguns registos podem ser
              retidos por obrigação legal (faturação, processos de denúncia em aberto, auditoria de pontuação
              recente) — ver a Política de Privacidade, secção 8, para o detalhe exato.
            </p>
            <button className="zj-btn is-primary" onClick={onDeleteAccount}>Confirmar apagamento definitivo</button>
            <button className="zj-btn is-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
          </div>
        )}
      </div>
    </section>
  );
}

const STOPWORDS = new Set([
  "para", "com", "uma", "que", "dos", "das", "the", "and", "for", "with", "our", "you",
  "your", "will", "have", "this", "from", "are", "not", "una", "per", "che", "les", "des",
]);

function extractKeywords(text) {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

/**
 * Motor de relevância candidato <-> oferta, para o portal — versão do
 * demo de packages/domain/src/rules/matching.ts (mesmo princípio:
 * sempre explicável, nunca caixa-preta; ver auditoria de produto desta
 * sessão sobre a lacuna "toda a energia foi para 'esta oferta é
 * verdadeira', zero para 'esta oferta é boa para ti'"). Reutiliza o
 * mesmo extractKeywords/matchCVAgainstOffer já usado no Estúdio de CV,
 * em vez de duplicar a lógica de correspondência.
 */
function computeOfferRelevance(offer, { skills, experiences }) {
  const cvText = [...(experiences || []).map((e) => e.description || ""), ...(skills || [])].join(" ");
  const offerKeywords = extractKeywords(`${offer.title} ${offer.description}`);
  if (skills.length === 0 && experiences.length === 0) {
    return { score: 50, level: "unknown", label: "Sem dados suficientes no perfil" };
  }
  if (offerKeywords.length === 0) {
    return { score: 50, level: "unknown", label: "Oferta sem descrição suficiente para comparar" };
  }
  const match = matchCVAgainstOffer(cvText, offerKeywords);
  if (match.matchRate >= 0.3) return { score: Math.round(match.matchRate * 100), level: "match", label: `${match.matchedKeywords.length} termo(s) do teu perfil aparecem nesta oferta` };
  if (match.matchedKeywords.length > 0) return { score: Math.round(match.matchRate * 100), level: "partial", label: `${match.matchedKeywords.length} termo(s) em comum, correspondência parcial` };
  return { score: 10, level: "mismatch", label: "Sem correspondência aparente com o teu perfil" };
}

function CVStudioPanel({ experiences, skills, documents, locale, publishedOffers, orgs, candidateId, onCheckCVQuality, onCheckCoverLetter }) {
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [quality, setQuality] = useState(null);
  const [qualityBusy, setQualityBusy] = useState(false);
  const [letterCheck, setLetterCheck] = useState(null);
  const [letterBusy, setLetterBusy] = useState(false);

  const certifications = documents.filter((d) => d.docType === "certificate");
  const hasPortfolioLink = documents.some((d) => d.docType === "portfolio");

  // Verificação real contra a API (cvStudio.ts no servidor, não uma
  // cópia local) — disparada por botão, não a cada tecla, para não
  // sobrecarregar o servidor com um pedido por letra escrita.
  async function handleCheckQuality() {
    setQualityBusy(true);
    try {
      const result = await onCheckCVQuality(candidateId, {
        locale: locale || "pt",
        experiences,
        skills,
        certifications: certifications.map((c) => c.fileName || "certificação"),
        hasPortfolioLink,
      });
      setQuality(result);
    } catch (err) {
      setQuality({ score: null, signals: [{ code: "ERROR", message: `Não foi possível verificar: ${err.message}` }] });
    } finally {
      setQualityBusy(false);
    }
  }

  const selectedOffer = publishedOffers.find((o) => o.id === selectedOfferId) || null;
  const employerName = selectedOffer
    ? orgs?.find((o) => o.id === selectedOffer.organizationId)?.legalName
    : undefined;

  const keywordMatch = useMemo(() => {
    if (!selectedOffer) return null;
    const cvText = [...experiences.map((e) => e.description || ""), ...(skills || [])].join(" ");
    return matchCVAgainstOffer(cvText, extractKeywords(selectedOffer.description));
  }, [selectedOffer, experiences, skills]);

  async function handleCheckLetter() {
    if (!selectedOffer) return;
    setLetterBusy(true);
    try {
      const result = await onCheckCoverLetter(candidateId, {
        bodyText: coverLetterText, employerName, jobOfferTitle: selectedOffer.title,
      });
      setLetterCheck(result);
    } catch (err) {
      setLetterCheck({ personalized: false, checks: [{ code: "ERROR", message: `Não foi possível verificar: ${err.message}` }] });
    } finally {
      setLetterBusy(false);
    }
  }

  return (
    <>
      <h3 className="zj-subhead"><FileText size={14} /> Estúdio de CV & Carta de Motivação</h3>
      <p className="zj-panel-hint">
        Orientação, nunca bloqueio — estes sinais ajudam-te a fortalecer o CV, mas nunca impedem uma candidatura.
        Verificação real, contra o servidor — clica para analisar.
      </p>

      <button className="zj-btn is-ghost" onClick={handleCheckQuality} disabled={qualityBusy}>
        {qualityBusy ? "A verificar…" : "Analisar o meu CV"}
      </button>

      {quality && (
        <div className="zj-cv-quality">
          <div className="zj-completeness-track">
            <div
              className="zj-completeness-fill"
              style={{ width: `${quality.score ?? 0}%`, background: (quality.score ?? 0) >= 70 ? "var(--trust)" : "var(--danger)" }}
            />
          </div>
          <span className="zj-completeness-label">{quality.score ?? "—"}/100 — força do CV</span>
        </div>
      )}
      {quality && quality.signals.length > 0 ? (
        <ul className="zj-cv-signals">
          {quality.signals.map((s) => (
            <li key={s.code} className="zj-cv-signal">{s.message}</li>
          ))}
        </ul>
      ) : quality ? (
        <p className="zj-empty">Sem sinais de melhoria pendentes — bom trabalho.</p>
      ) : null}

      <div className="zj-cv-target">
        <Field label="Testar contra uma oferta específica">
          <select value={selectedOfferId} onChange={(e) => setSelectedOfferId(e.target.value)}>
            <option value="">Escolher oferta…</option>
            {publishedOffers.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </Field>

        {selectedOffer && keywordMatch && (
          <div className="zj-cv-match">
            <span className="zj-completeness-label">
              {Math.round(keywordMatch.matchRate * 100)}% de correspondência com a oferta
            </span>
            {keywordMatch.missingKeywords.length > 0 && (
              <div className="zj-tags">
                {keywordMatch.missingKeywords.map((kw) => (
                  <span key={kw} className="zj-tag zj-tag-missing">{kw}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedOffer && (
          <>
            <Field label={`Carta de motivação para "${selectedOffer.title}"`}>
              <textarea
                className="zj-summary"
                rows={4}
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                placeholder="Escreve a tua carta de motivação para esta oferta específica..."
              />
            </Field>
            <button className="zj-btn is-ghost" onClick={handleCheckLetter} disabled={letterBusy || !coverLetterText.trim()}>
              {letterBusy ? "A verificar…" : "Verificar carta"}
            </button>
            {letterCheck && (
              letterCheck.personalized ? (
                <p className="zj-empty">Carta personalizada — sem sinais de texto genérico.</p>
              ) : (
                <ul className="zj-cv-signals">
                  {letterCheck.checks.map((c) => (
                    <li key={c.code} className="zj-cv-signal">{c.message}</li>
                  ))}
                </ul>
              )
            )}
          </>
        )}
      </div>
    </>
  );
}

function ExperienceForm({ onAdd }) {
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [description, setDescription] = useState("");
  function submit() {
    if (!companyName || !title) return;
    onAdd({ companyName, title, startDate, isCurrent, description });
    setCompanyName(""); setTitle(""); setStartDate(""); setIsCurrent(false); setDescription("");
  }
  return (
    <div className="zj-inline-form zj-inline-form-wrap">
      <input placeholder="Função" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="Empresa" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      <input type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <input placeholder="O que fizeste? (ex: liderei uma equipa de 6 pessoas e reduzi custos em 12%)" value={description} onChange={(e) => setDescription(e.target.value)} className="zj-inline-form-full" />
      <button className="zj-btn is-ghost is-icon" onClick={submit}><Plus size={14} /></button>
    </div>
  );
}

function EducationForm({ onAdd }) {
  const [institutionName, setInstitutionName] = useState("");
  const [degree, setDegree] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  function submit() {
    if (!institutionName || !degree) return;
    onAdd({ institutionName, degree, fieldOfStudy });
    setInstitutionName(""); setDegree(""); setFieldOfStudy("");
  }
  return (
    <div className="zj-inline-form">
      <input placeholder="Grau (ex: Licenciatura)" value={degree} onChange={(e) => setDegree(e.target.value)} />
      <input placeholder="Área de estudo" value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} />
      <input placeholder="Instituição" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
      <button className="zj-btn is-ghost is-icon" onClick={submit}><Plus size={14} /></button>
    </div>
  );
}

function DocumentForm({ onAdd }) {
  const [docType, setDocType] = useState("cv");
  const [fileName, setFileName] = useState("");
  function submit() {
    if (!fileName) return;
    onAdd({ docType, fileName });
    setFileName("");
  }
  return (
    <div className="zj-inline-form">
      <select value={docType} onChange={(e) => setDocType(e.target.value)}>
        <option value="cv">CV</option>
        <option value="certificate">Certificado</option>
        <option value="portfolio">Portefólio</option>
        <option value="cover_letter">Carta de apresentação</option>
      </select>
      <input placeholder="nome-do-ficheiro.pdf" value={fileName} onChange={(e) => setFileName(e.target.value)} />
      <button className="zj-btn is-ghost is-icon" onClick={submit}><Plus size={14} /></button>
    </div>
  );
}

function TagInput({ items, onAdd, placeholder }) {
  const [value, setValue] = useState("");
  function submit() {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  }
  return (
    <div>
      <div className="zj-inline-form">
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button className="zj-btn is-ghost is-icon" onClick={submit}><Plus size={14} /></button>
      </div>
      <div className="zj-tags">
        {items.map((it) => <span key={it} className="zj-tag">{it}</span>)}
        {items.length === 0 && <p className="zj-empty">Nenhuma ainda.</p>}
      </div>
    </div>
  );
}

function CompanyView({
  org, orgs, onCreateOrg, onSelectOrg, onRequestVerification, onCreateOffer,
  onSubmitForReview, offers, applications, candidates, onTransitionApplication,
  onViewResponsibility, translations, onAddTranslation, onFetchPoolInsight,
}) {
  const [legalName, setLegalName] = useState("");
  const [poolInsightByOffer, setPoolInsightByOffer] = useState({});

  async function handleShowPoolInsight(offerId) {
    try {
      const insight = await onFetchPoolInsight(offerId);
      setPoolInsightByOffer((prev) => ({ ...prev, [offerId]: insight }));
    } catch (err) {
      setPoolInsightByOffer((prev) => ({ ...prev, [offerId]: { error: err.message } }));
    }
  }

  if (!org) {
    return (
      <section className="zj-panel">
        <h2>Criar organização</h2>
        <div className="zj-form">
          <Field label="Nome legal da empresa">
            <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Zeta Tech Lda" />
          </Field>
          <button className="zj-btn is-primary" disabled={!legalName} onClick={() => onCreateOrg(legalName)}>
            Criar organização <ArrowRight size={14} />
          </button>
        </div>
        {orgs.length > 0 && (
          <>
            <h3 className="zj-subhead">Ou muda para uma organização existente</h3>
            <div className="zj-list">
              {orgs.map((o) => (
                <div key={o.id} className="zj-list-row">
                  <strong>{o.legalName}</strong>
                  <button className="zj-btn is-ghost" onClick={() => onSelectOrg(o.id)}>Selecionar</button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="zj-panel">
      <div className="zj-panel-head">
        <h2>{org.legalName}</h2>
        <VerificationBadge status={org.verificationStatus} />
      </div>

      {org.verificationStatus === "unverified" && (
        <button className="zj-btn is-primary" onClick={() => onRequestVerification(org.id)}>Solicitar verificação</button>
      )}
      {org.verificationStatus === "pending" && <p className="zj-panel-hint">Verificação pendente — aguarda um administrador.</p>}
      {(org.verificationStatus === "verified" || org.verificationStatus === "enhanced_verified") && (
        <button className="zj-btn is-ghost" onClick={onViewResponsibility}>
          <Award size={14} /> Ver o meu Employment Responsibility Index
        </button>
      )}

      <h3 className="zj-subhead">Criar oferta</h3>
      <OfferForm onCreate={(draft) => onCreateOffer(org.id, draft)} />

      <h3 className="zj-subhead">As minhas ofertas</h3>
      <div className="zj-list">
        {offers.map((o) => (
          <div key={o.id} className="zj-list-row is-column">
            <div className="zj-list-row-top">
              <strong>{o.title}</strong>
              <span className={`zj-status status-${o.status}`}>{o.status}</span>
            </div>
            <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
            {o.issues?.length > 0 && (
              <ul className="zj-issues">
                {o.issues.map((i) => <li key={i.code}><AlertTriangle size={12} /> {i.message}</li>)}
              </ul>
            )}
            {o.status === "draft" && (
              <button className="zj-btn is-ghost" onClick={() => onSubmitForReview(o.id)}>Submeter para revisão</button>
            )}
            {o.status === "published" && (
              <>
                <TranslationEditor offerId={o.id} translations={translations} onAdd={onAddTranslation} />
                <button className="zj-btn is-ghost" onClick={() => handleShowPoolInsight(o.id)}>Ver panorama do banco de candidatos</button>
                {poolInsightByOffer[o.id] && !poolInsightByOffer[o.id].error && (
                  <p className="zj-hint-inline">
                    Candidatos compatíveis no banco: <strong>{poolInsightByOffer[o.id].matchingCandidatesEstimate}</strong> de {poolInsightByOffer[o.id].totalOpenCandidatesOnPlatform} em aberto —
                    {" "}{poolInsightByOffer[o.id].scopeNote}
                  </p>
                )}
                {poolInsightByOffer[o.id]?.error && <p className="zj-empty">{poolInsightByOffer[o.id].error}</p>}
                <ApplicationsForOffer
                  offerId={o.id}
                  applications={applications.filter((a) => a.offerId === o.id)}
                  candidates={candidates}
                  onTransition={onTransitionApplication}
                />
              </>
            )}
          </div>
        ))}
        {offers.length === 0 && <p className="zj-empty">Ainda sem ofertas criadas.</p>}
      </div>
    </section>
  );
}

function TranslationEditor({ offerId, translations, onAdd }) {
  const [targetLocale, setTargetLocale] = useState("en");
  const [value, setValue] = useState("");
  const existing = translations.filter((t) => t.entityId === offerId && t.field === "title");

  return (
    <div className="zj-translation-editor">
      <span className="zj-hint-inline">Traduções do título:</span>
      <div className="zj-tags">
        {existing.map((t) => (
          <span key={t.locale} className="zj-tag">{t.locale.toUpperCase()}: {t.value}</span>
        ))}
        {existing.length === 0 && <span className="zj-empty">Nenhuma ainda — só o título original em PT.</span>}
      </div>
      <div className="zj-inline-form">
        <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)}>
          {SUPPORTED_LOCALES.filter((l) => l.code !== "pt").map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <input placeholder="Título traduzido" value={value} onChange={(e) => setValue(e.target.value)} />
        <button
          className="zj-btn is-ghost is-icon"
          onClick={() => { onAdd(offerId, "title", targetLocale, value); setValue(""); }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function ApplicationsForOffer({ offerId, applications, candidates, onTransition }) {
  if (applications.length === 0) return <p className="zj-empty">Sem candidaturas ainda.</p>;
  return (
    <div className="zj-list nested">
      {applications.map((a) => {
        const cand = candidates.find((c) => c.id === a.candidateId);
        const nextOptions = APPLICATION_TRANSITIONS[a.status]?.filter((s) => s !== "withdrawn") ?? [];
        return (
          <div key={a.id} className="zj-list-row">
            <div>
              <strong>{cand?.name}</strong>
              <span className={`zj-status status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
            </div>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onTransition(a.id, e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>Avançar para…</option>
              {nextOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function OfferForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [hasFixedSalary, setHasFixedSalary] = useState(true);
  const [pillar, setPillarLocal] = useState("first_jobs");
  const [regime, setRegime] = useState("hybrid");
  const [contractType, setContractType] = useState("permanent");
  const [userCompanyName, setUserCompanyName] = useState("");
  const [equalTreatmentConfirmed, setEqualTreatmentConfirmed] = useState(false);
  const [derogationReference, setDerogationReference] = useState("");
  const [informedOfPermanentVacancies, setInformedOfPermanentVacancies] = useState(false);
  const isTempAgency = TEMP_AGENCY_CONTRACT_TYPES.includes(contractType);

  function submit() {
    onCreate({
      title,
      description,
      salaryMin: Number(salaryMin) || 0,
      salaryMax: salaryMax ? Number(salaryMax) : null,
      salaryCurrency: "EUR",
      salaryPeriod: "monthly",
      hasFixedSalary,
      workRegime: regime,
      pillar,
      contractType,
      ...(isTempAgency
        ? {
            userCompanyName,
            equalTreatmentConfirmed,
            collectiveAgreementDerogationReference: derogationReference || null,
            informedOfPermanentVacancies,
          }
        : {}),
    });
    setTitle(""); setDescription(""); setSalaryMin(""); setSalaryMax("");
    setUserCompanyName(""); setEqualTreatmentConfirmed(false); setDerogationReference(""); setInformedOfPermanentVacancies(false);
  }

  return (
    <div className="zj-form">
      <Field label="Título da oferta">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Engenheiro/a de Software Júnior" />
      </Field>
      <Field label="Descrição" hint="Mínimo 40 caracteres — usado na validação de qualidade.">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      <div className="zj-form-row">
        <Field label="Salário mínimo (€/mês)">
          <input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
        </Field>
        <Field label="Salário máximo (opcional)">
          <input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
        </Field>
      </div>
      <div className="zj-form-row">
        <Field label="Pilar">
          <select value={pillar} onChange={(e) => setPillarLocal(e.target.value)}>
            {PILLARS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Regime">
          <select value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="on_site">Presencial</option>
            <option value="hybrid">Híbrido</option>
            <option value="remote">Remoto</option>
          </select>
        </Field>
      </div>
      <Field label="Tipo de contrato">
        <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
          {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>
      {isTempAgency && (
        <div className="zj-temp-agency-block">
          <p className="zj-panel-hint">
            Trabalho temporário/interim — Diretiva 2008/104/CE. A organização que publica esta oferta é sempre a ETT/agência (o empregador legal); a empresa utilizadora é onde o trabalho é efetivamente prestado.
          </p>
          <Field label="Empresa utilizadora" hint="Onde o trabalho é efetivamente prestado — nunca a própria ETT.">
            <input value={userCompanyName} onChange={(e) => setUserCompanyName(e.target.value)} placeholder="Fábrica Alfa, S.A." />
          </Field>
          <label className="zj-checkbox">
            <input type="checkbox" checked={equalTreatmentConfirmed} onChange={(e) => setEqualTreatmentConfirmed(e.target.checked)} />
            Confirmo que a remuneração corresponde à de um trabalhador equivalente contratado diretamente pela empresa utilizadora (Art. 5.º)
          </label>
          <Field label="Convenção coletiva com derrogação (opcional)" hint="Só necessário se não confirmares a igualdade de tratamento acima.">
            <input value={derogationReference} onChange={(e) => setDerogationReference(e.target.value)} placeholder="ex: CCT Setor Têxtil 2025, cláusula 14.ª" />
          </Field>
          <label className="zj-checkbox">
            <input type="checkbox" checked={informedOfPermanentVacancies} onChange={(e) => setInformedOfPermanentVacancies(e.target.checked)} />
            O trabalhador será mantido informado de vagas permanentes na empresa utilizadora (Art. 6.º)
          </label>
        </div>
      )}
      <label className="zj-checkbox">
        <input type="checkbox" checked={hasFixedSalary} onChange={(e) => setHasFixedSalary(e.target.checked)} />
        Garante remuneração base fixa (obrigatório para publicação)
      </label>
      <button className="zj-btn is-primary" disabled={!title || !description} onClick={submit}>
        Guardar rascunho <ArrowRight size={14} />
      </button>
    </div>
  );
}

function AdminView({ orgs, offers, onApproveVerification, onReviewOffer, onPublishOffer, onViewResponsibility, reports, onResolveReport, auditLog, staffToken, onBootstrapStaff, sessionToken }) {
  const pendingOrgs = orgs.filter((o) => o.verificationStatus === "pending");
  const pendingOffers = offers.filter((o) => o.status === "pending_review");
  const approvedOffers = offers.filter((o) => o.status === "approved");
  const verifiedOrgs = orgs.filter((o) => o.verificationStatus === "verified" || o.verificationStatus === "enhanced_verified");
  const openReports = reports.filter((r) => r.status === "open" || r.status === "reviewing");
  const resolvedReports = reports.filter((r) => r.status === "resolved");

  if (!staffToken) {
    return (
      <section className="zj-panel">
        <h2>Privilégio de staff necessário</h2>
        <p className="zj-panel-hint">
          As ações de administrador (verificar empresas, rever e publicar ofertas) exigem staff real da
          plataforma — não é um separador que qualquer pessoa possa simplesmente abrir. Só funciona uma vez,
          para a primeira pessoa autenticada; depois disso, fica bloqueado (secção 10 do domínio).
        </p>
        <button className="zj-btn is-primary" disabled={!sessionToken} onClick={onBootstrapStaff}>
          {sessionToken ? "Tornar-me staff (só a primeira vez)" : "Cria primeiro uma conta de candidato"}
        </button>
      </section>
    );
  }

  return (
    <section className="zj-panel">
      <h2>Fila de verificação de empresas</h2>
      <div className="zj-list">
        {pendingOrgs.map((o) => (
          <div key={o.id} className="zj-list-row">
            <strong>{o.legalName}</strong>
            <button className="zj-btn is-primary" onClick={() => onApproveVerification(o.id)}>Verificar</button>
          </div>
        ))}
        {pendingOrgs.length === 0 && <p className="zj-empty">Sem pedidos de verificação pendentes.</p>}
      </div>

      <h2 className="zj-subhead">Empresas verificadas — Employment Responsibility Index</h2>
      <div className="zj-list">
        {verifiedOrgs.map((o) => (
          <div key={o.id} className="zj-list-row">
            <div><strong>{o.legalName}</strong> <VerificationBadge status={o.verificationStatus} /></div>
            <button className="zj-btn is-ghost" onClick={() => onViewResponsibility(o.id)}><Award size={14} /> Ver ERI</button>
          </div>
        ))}
        {verifiedOrgs.length === 0 && <p className="zj-empty">Ainda sem empresas verificadas.</p>}
      </div>

      <h2 className="zj-subhead">Fila de moderação de ofertas</h2>
      <div className="zj-list">
        {pendingOffers.map((o) => (
          <div key={o.id} className="zj-list-row is-column">
            <div className="zj-list-row-top">
              <strong>{o.title}</strong>
              <span className="zj-status status-pending_review">pending_review</span>
            </div>
            <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
            <button className="zj-btn is-primary" onClick={() => onReviewOffer(o.id)}>Validar</button>
          </div>
        ))}
        {pendingOffers.length === 0 && <p className="zj-empty">Sem ofertas por rever.</p>}
      </div>

      <h2 className="zj-subhead">Aprovadas — prontas a publicar</h2>
      <div className="zj-list">
        {approvedOffers.map((o) => (
          <div key={o.id} className="zj-list-row">
            <strong>{o.title}</strong>
            <button className="zj-btn is-primary" onClick={() => onPublishOffer(o.id)}>Publicar</button>
          </div>
        ))}
        {approvedOffers.length === 0 && <p className="zj-empty">Nada à espera de publicação.</p>}
      </div>

      <h2 className="zj-subhead"><AlertTriangle size={15} /> Denúncias por resolver</h2>
      <div className="zj-list">
        {openReports.map((r) => (
          <div key={r.id} className="zj-list-row is-column">
            <div className="zj-list-row-top">
              <strong>{r.targetType === "job_offer" ? "Oferta" : "Empresa"} #{r.targetId}</strong>
              <span className="zj-status status-pending_review">{r.status}</span>
            </div>
            <p className="zj-report-reason">{r.reason}</p>
            <div className="zj-drawer-actions is-row">
              <button className="zj-btn is-primary" onClick={() => onResolveReport(r.id, "confirmed")}>Confirmar (penaliza empresa)</button>
              <button className="zj-btn is-ghost" onClick={() => onResolveReport(r.id, "unfounded")}>Marcar infundada</button>
            </div>
          </div>
        ))}
        {openReports.length === 0 && <p className="zj-empty">Sem denúncias pendentes.</p>}
      </div>

      {resolvedReports.length > 0 && (
        <>
          <h3 className="zj-subhead">Denúncias resolvidas</h3>
          <div className="zj-list">
            {resolvedReports.map((r) => (
              <div key={r.id} className="zj-list-row">
                <span>{r.reason}</span>
                <span className={`zj-status ${r.resolution === "confirmed" ? "status-rejected" : "status-approved"}`}>
                  {r.resolution === "confirmed" ? "confirmada" : "infundada"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="zj-subhead">Registo de auditoria</h2>
      <div className="zj-audit-list">
        {[...auditLog].reverse().slice(0, 15).map((a) => (
          <div key={a.id} className="zj-audit-row">
            <span className="zj-audit-time">{a.createdAt}</span>
            <span className="zj-audit-action">{a.action}</span>
            <span className="zj-audit-entity">{a.entityType}:{a.entityId}</span>
            <span className="zj-audit-actor">por {a.actorId}</span>
          </div>
        ))}
        {auditLog.length === 0 && <p className="zj-empty">Ainda sem eventos registados.</p>}
      </div>
    </section>
  );
}

function OfferDetail({ offer, org, onClose, onApply, canApply, onViewCompanyProfile, onReport }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="zj-drawer-backdrop" onClick={onClose}>
      <div className="zj-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="zj-drawer-close" onClick={onClose}>Fechar</button>
        <p className="zj-eyebrow">{org?.legalName}</p>
        <h2>{offer.title}</h2>
        <SalaryLedger min={offer.salaryMin} max={offer.salaryMax} currencyCode={offer.salaryCurrency} period={offer.salaryPeriod} fixed={offer.hasFixedSalary} />
        <p className="zj-drawer-desc">{offer.description}</p>
        <div className="zj-drawer-actions">
          {canApply && <button className="zj-btn is-primary" onClick={() => { onApply(); onClose(); }}>Candidatar-me <ArrowRight size={14} /></button>}
          <button className="zj-btn is-ghost" onClick={onViewCompanyProfile}><Building2 size={14} /> Ver perfil da empresa</button>
          {!reporting && (
            <button className="zj-btn is-ghost is-danger" onClick={() => setReporting(true)}><AlertTriangle size={14} /> Denunciar esta oferta</button>
          )}
        </div>
        {reporting && (
          <div className="zj-report-box">
            <Field label="Descreve o problema">
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: as condições reais divergem do anunciado" />
            </Field>
            <button
              className="zj-btn is-primary"
              disabled={!reason.trim()}
              onClick={() => { onReport(reason); setReporting(false); setReason(""); }}
            >
              Submeter denúncia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyProfileDrawer({ org, onClose, onFetchProfile }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    setProfile(null);
    setError(null);
    onFetchProfile(org.id)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [org?.id]);

  if (!org) return null;

  return (
    <div className="zj-drawer-backdrop" onClick={onClose}>
      <div className="zj-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="zj-drawer-close" onClick={onClose}>Fechar</button>
        <p className="zj-eyebrow">Employment Responsibility Index</p>
        {error && <p className="zj-empty">Não foi possível carregar o perfil: {error}</p>}
        {!profile && !error && <p className="zj-empty">A carregar…</p>}
        {profile && (
          <>
            <h2>{profile.legalName}</h2>
            <VerificationBadge status={profile.verificationStatus} />

            <div className="zj-badges-row">
              {profile.badges.length === 0 && <p className="zj-empty">Ainda sem selos atribuídos.</p>}
              {profile.badges.map((b) => (
                <span key={b} className="zj-eri-badge"><Award size={13} /> {BADGE_LABELS[b]}</span>
              ))}
            </div>

            <h3 className="zj-subhead">Componentes (secção 8 — auditáveis, não compráveis)</h3>
            <div className="zj-eri-grid">
              <EriMeter label="Transparência salarial" value={profile.components.salaryTransparencyScore} />
              <EriMeter label="Completude das ofertas" value={profile.components.offerCompletenessScore} />
              <EriMeter label="Resposta a candidatos" value={profile.components.responseScore} />
              <EriMeter label="Integridade (sem reclamações)" value={profile.components.integrityScore} />
            </div>

            <h3 className="zj-subhead">Dados brutos</h3>
            <ul className="zj-raw-metrics">
              <li>Ofertas publicadas: <strong>{profile.metrics.publishedOffersCount}</strong></li>
              <li>Contratações em First Jobs: <strong>{profile.metrics.firstJobHiresCount}</strong></li>
              <li>Contratações em Senior Careers: <strong>{profile.metrics.seniorHiresCount}</strong></li>
              <li>Reclamações resolvidas: <strong>{profile.metrics.confirmedComplaintsCount}</strong></li>
            </ul>
            <p className="zj-panel-hint">
              Calculado no servidor a partir de dados reais desta organização — não do que este browser já tinha carregado.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function EriMeter({ label, value }) {
  return (
    <div className="zj-eri-meter">
      <div className="zj-eri-meter-top">
        <span>{label}</span>
        <span className="zj-eri-meter-value">{value}</span>
      </div>
      <div className="zj-completeness-track">
        <div className="zj-completeness-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ---------------- Design tokens & styles ---------------- */

function FontsAndStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap');

      .zj-root {
        --ink: #16211F;
        --paper: #EEEBE2;
        --paper-raised: #F7F5EE;
        --trust: #2E6F5E;
        --trust-soft: #E3ECE7;
        --amber: #DDA846;
        --amber-soft: #F6EBD3;
        --danger: #A23B3B;
        --danger-soft: #F3DEDA;
        --line: #C9C3B4;
        font-family: 'Inter', system-ui, sans-serif;
        color: var(--ink);
        background: var(--paper);
        min-height: 100vh;
        line-height: 1.4;
      }
      .zj-root * { box-sizing: border-box; }
      .zj-root button, .zj-root input, .zj-root select, .zj-root textarea { font-family: inherit; font-size: 14px; }

      .zj-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 28px; border-bottom: 2px solid var(--amber);
        background: var(--paper-raised);
        flex-wrap: wrap; gap: 12px;
      }
      .zj-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .zj-locale-switch { display: flex; gap: 2px; border: 1px solid var(--line); padding: 2px; }
      .zj-locale-btn { border: none; background: transparent; padding: 5px 8px; font-size: 11px; font-weight: 600; cursor: pointer; opacity: 0.6; font-family: 'IBM Plex Mono', monospace; }
      .zj-locale-btn.is-active { background: var(--ink); color: var(--paper); opacity: 1; }
      .zj-fallback-note { font-size: 11px; color: var(--amber); background: var(--amber-soft); padding: 3px 8px; width: fit-content; }
      .zj-translation-editor { border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 6px; }
      .zj-brand { display: flex; align-items: center; gap: 10px; }
      .zj-brand-mark { width: 28px; height: 28px; border-radius: 7px; display: block; box-shadow: 0 0 0 1px rgba(22,33,31,0.08); }
      .zj-brand-name { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; letter-spacing: 0.01em; }

      .zj-role-switch { display: flex; gap: 4px; background: var(--paper); border: 1px solid var(--line); padding: 3px; }
      .zj-tab {
        display: flex; align-items: center; gap: 6px; border: none; background: transparent;
        padding: 7px 12px; cursor: pointer; color: var(--ink); opacity: 0.6;
      }
      .zj-tab.is-active { background: var(--ink); color: var(--paper); opacity: 1; }
      .zj-tab:focus-visible { outline: 2px solid var(--trust); outline-offset: 2px; }

      .zj-main { max-width: 880px; margin: 0 auto; padding: 32px 20px 80px; }

      .zj-hero { padding: 20px 0 32px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
      .zj-eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: var(--trust); font-weight: 600; margin: 0 0 10px; }
      .zj-hero-line { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(28px, 4vw, 42px); line-height: 1.15; margin: 0 0 14px; }
      .zj-hero-sub { max-width: 52ch; color: #465650; margin: 0; }

      .zj-pillars { display: flex; gap: 6px; margin-bottom: 22px; flex-wrap: wrap; }
      .zj-pillar { border: 1px solid var(--line); background: var(--paper-raised); padding: 8px 14px; cursor: pointer; color: var(--ink); }
      .zj-pillar.is-active { background: var(--trust); border-color: var(--trust); color: white; }

      .zj-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
      .zj-card {
        text-align: left; border: 1px solid var(--line); background: var(--paper-raised);
        padding: 16px; cursor: pointer; display: flex; flex-direction: column; gap: 8px;
      }
      .zj-card:hover { border-color: var(--trust); }
      .zj-card-top { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
      .zj-card-top h3 { font-family: 'Fraunces', serif; font-size: 16px; margin: 0; font-weight: 600; }
      .zj-card-desc { font-size: 13px; color: #465650; margin: 0; }

      .zj-ledger { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--line); font-family: 'IBM Plex Mono', monospace; }
      .zj-ledger-amount { font-size: 15px; font-weight: 600; }
      .zj-ledger-period { font-size: 11px; opacity: 0.7; margin-left: 2px; }
      .zj-ledger-tag { display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 3px 6px; text-transform: uppercase; letter-spacing: 0.04em; }
      .zj-ledger-tag.is-fixed { background: var(--trust-soft); color: var(--trust); }
      .zj-ledger-tag.is-risk { background: var(--danger-soft); color: var(--danger); }

      .zj-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 8px; font-weight: 600; }
      .zj-badge.is-trust { background: var(--trust-soft); color: var(--trust); }
      .zj-badge.is-pending { background: var(--amber-soft); color: var(--amber); }
      .zj-badge.is-muted { background: #e6e3d8; color: #6b6555; }

      .zj-panel { border: 1px solid var(--line); background: var(--paper-raised); padding: 24px; }
      .zj-panel h2 { font-family: 'Fraunces', serif; font-weight: 600; margin: 0 0 6px; }
      .zj-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      .zj-panel-hint { color: #465650; font-size: 13px; margin: 0 0 16px; }
      .zj-subhead { font-family: 'Fraunces', serif; font-weight: 600; font-size: 15px; margin: 28px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); }

      .zj-form { display: flex; flex-direction: column; gap: 12px; max-width: 460px; }
      .zj-form-row { display: flex; gap: 12px; }
      .zj-form-row .zj-field { flex: 1; }
      .zj-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
      .zj-field-label { font-weight: 600; }
      .zj-field-hint { font-size: 11px; color: #6b6555; }
      .zj-field input, .zj-field textarea, .zj-field select {
        border: 1px solid var(--line); background: var(--paper); padding: 8px 10px; color: var(--ink);
      }
      .zj-field input:focus, .zj-field textarea:focus, .zj-field select:focus { outline: 2px solid var(--trust); outline-offset: 1px; }
      .zj-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; }

      .zj-btn {
        display: inline-flex; align-items: center; gap: 6px; justify-content: center;
        border: 1px solid var(--ink); background: transparent; color: var(--ink);
        padding: 9px 16px; cursor: pointer; font-weight: 600; width: fit-content;
      }
      .zj-btn.is-primary { background: var(--trust); border-color: var(--trust); color: white; }
      .zj-btn.is-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .zj-btn.is-ghost { border-color: var(--line); }
      .zj-btn.is-danger { border-color: var(--danger); color: var(--danger); }
      .zj-btn:focus-visible { outline: 2px solid var(--trust); outline-offset: 2px; }

      .zj-report-box { margin-top: 12px; padding: 12px; border: 1px dashed var(--danger); background: var(--danger-soft); display: flex; flex-direction: column; gap: 8px; }
      .zj-report-box textarea { width: 100%; border: 1px solid var(--line); background: var(--paper); padding: 8px; }
      .zj-report-reason { font-size: 13px; color: #465650; margin: 0; }
      .zj-drawer-actions.is-row { flex-direction: row; flex-wrap: wrap; }

      .zj-audit-list { display: flex; flex-direction: column; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
      .zj-audit-row { display: flex; gap: 10px; padding: 6px 8px; background: var(--paper); border: 1px solid var(--line); flex-wrap: wrap; }
      .zj-audit-time { opacity: 0.6; }
      .zj-audit-action { color: var(--trust); font-weight: 600; }
      .zj-audit-actor { opacity: 0.6; margin-left: auto; }

      .zj-list { display: flex; flex-direction: column; gap: 8px; }
      .zj-list.nested { margin-top: 8px; padding-left: 12px; border-left: 2px solid var(--line); }
      .zj-list-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--line); background: var(--paper); padding: 10px 14px; }
      .zj-list-row.is-column { flex-direction: column; align-items: stretch; }
      .zj-list-row-top { display: flex; justify-content: space-between; align-items: center; }
      .zj-empty { color: #6b6555; font-size: 13px; font-style: italic; }

      .zj-status { font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 2px 6px; margin-left: 8px; background: #e6e3d8; }
      .zj-status.status-published, .zj-status.status-hired, .zj-status.status-approved { background: var(--trust-soft); color: var(--trust); }
      .zj-status.status-needs_changes, .zj-status.status-pending_review { background: var(--amber-soft); color: var(--amber); }
      .zj-status.status-rejected, .zj-status.status-withdrawn { background: var(--danger-soft); color: var(--danger); }

      .zj-issues { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
      .zj-issues li { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--danger); }

      .zj-completeness { margin: 4px 0 20px; display: flex; flex-direction: column; gap: 4px; }
      .zj-completeness-track { height: 6px; background: #e6e3d8; width: 100%; max-width: 320px; }
      .zj-completeness-fill { height: 100%; background: var(--trust); transition: width 0.3s; }
      .zj-completeness-label { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600; }
      .zj-completeness-hint { font-size: 11px; color: #6b6555; }

      .zj-summary {
        width: 100%; max-width: 460px; border: 1px solid var(--line); background: var(--paper);
        padding: 8px 10px; color: var(--ink); margin-bottom: 8px; font-family: inherit;
      }
      .zj-summary:focus { outline: 2px solid var(--trust); outline-offset: 1px; }

      .zj-inline-form { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
      .zj-inline-form input, .zj-inline-form select { border: 1px solid var(--line); background: var(--paper); padding: 6px 8px; flex: 1; min-width: 100px; }
      .zj-btn.is-icon { padding: 6px 8px; }

      .zj-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .zj-tag { background: var(--trust-soft); color: var(--trust); font-size: 12px; padding: 3px 9px; font-weight: 600; }
      .zj-tag-missing { background: #f3e6e0; color: var(--danger); }
      .zj-hint-inline { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #6b6555; }
      .zj-exp-desc { font-family: inherit; font-size: 12px; color: var(--ink); margin: 2px 0 0; }

      .zj-inline-form-wrap { align-items: flex-start; }
      .zj-inline-form-full { flex-basis: 100%; }

      .zj-cv-quality { margin: 4px 0 10px; display: flex; flex-direction: column; gap: 4px; }
      .zj-cv-signals { margin: 0 0 16px; padding-left: 18px; font-size: 12px; color: #6b6555; }
      .zj-cv-signal { margin-bottom: 4px; }
      .zj-cv-target { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
      .zj-temp-agency-block { margin: 10px 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: rgba(46,111,94,0.04); display: flex; flex-direction: column; gap: 8px; }
      .zj-relevance-row { display: flex; align-items: center; gap: 8px; }
      .zj-relevance-badge { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
      .zj-relevance-badge.is-match { background: var(--trust-soft); color: var(--trust); }
      .zj-relevance-badge.is-partial { background: #f3ecd8; color: #8a6d1d; }
      .zj-relevance-badge.is-mismatch { background: #f3e6e0; color: var(--danger); }
      .zj-relevance-badge.is-unknown { background: #eee; color: #6b6555; }
      .zj-cv-match { margin: 8px 0 12px; display: flex; flex-direction: column; gap: 6px; }

      .zj-drawer-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }

      .zj-badges-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 6px; }
      .zj-eri-badge { display: flex; align-items: center; gap: 5px; background: var(--amber-soft); color: var(--amber); font-size: 12px; font-weight: 600; padding: 5px 10px; }

      .zj-eri-grid { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
      .zj-eri-meter-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
      .zj-eri-meter-value { font-family: 'IBM Plex Mono', monospace; font-weight: 600; }

      .zj-raw-metrics { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }

      .zj-toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 18px; background: var(--ink); color: var(--paper); font-size: 13px; z-index: 50;
      }
      .zj-toast.tone-success { background: var(--trust); }
      .zj-toast.tone-warn { background: var(--amber); }

      .zj-drawer-backdrop { position: fixed; inset: 0; background: rgba(22,33,31,0.4); display: flex; justify-content: flex-end; z-index: 40; }
      .zj-drawer { width: min(420px, 90vw); background: var(--paper-raised); height: 100%; padding: 28px; overflow-y: auto; }
      .zj-drawer-close { border: none; background: transparent; color: var(--ink); opacity: 0.6; cursor: pointer; margin-bottom: 16px; padding: 0; font-weight: 600; }
      .zj-drawer h2 { font-family: 'Fraunces', serif; font-weight: 600; margin: 4px 0 12px; }
      .zj-drawer-desc { margin: 16px 0 20px; color: #333; }

      @media (max-width: 640px) {
        .zj-header { flex-direction: column; align-items: stretch; }
        .zj-role-switch { justify-content: space-between; }
      }
    `}</style>
  );
}
