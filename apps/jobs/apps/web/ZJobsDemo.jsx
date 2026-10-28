import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LOCALES, t, setMessagesLocale, messagesLocale, initialLocale, rememberLocale } from "./messages.js";
import { Search, AlertTriangle, Building2, User, Landmark, ArrowRight, Award } from "lucide-react";
import {
  PILLAR_KEYS, pillarLabel, offerStatusLabel, SalaryLedger, VerificationBadge, Field, OfferPlace, normalizeText,
  companyPageUrl, naceSectionLabel, locationLabel,
} from "./shared.jsx";
import { AuthPanel, CandidateDashboard } from "./CandidateDashboard.jsx";
import { OrganizationSetup, PartnerDashboard } from "./PartnerDashboard.jsx";
import { AnswerFields } from "./ScreeningQuestions.jsx";

/* ============================================================
   Z JOBS — portal (public listings, candidate and partner dashboards,
   platform administration).

   Every view reads from and writes to the API (`api` below), so a
   page reload keeps the session (sessionStorage) and reloads the
   person's data. The browser only keeps what it needs for the
   current screen.
   ============================================================ */

const API_BASE_URL = (typeof window !== "undefined" && window.ZJOBS_API_BASE_URL) || "http://localhost:4000";
let apiAuthToken = null;

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (apiAuthToken) headers.Authorization = `Bearer ${apiAuthToken}`;
  // The API answers its texts (errors, scores, matching) in the portal language.
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_BASE_URL}${path}${separator}locale=${messagesLocale()}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && body.error) || `HTTP ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

const post = (path, body) => apiFetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const api = {
  setAuthToken(token) { apiAuthToken = token; },
  async signupCandidate({ fullName, email, password, termsAccepted }) {
    const result = await post("/candidates", { fullName, email, password, termsAccepted });
    if (result.token) apiAuthToken = result.token;
    return result;
  },
  async login({ email, password }) {
    const result = await post("/auth/login", { email, password });
    if (result.token) apiAuthToken = result.token;
    return result;
  },
  deleteMyPersonalData: (userId) => apiFetch(`/candidates/${userId}/personal-data`, { method: "DELETE" }),
  // candidate profile
  getProfileBundle: (userId) => apiFetch(`/candidates/${userId}/profile-bundle`),
  putProfile: (userId, profile) => apiFetch(`/candidates/${userId}/profile`, { method: "PUT", body: JSON.stringify(profile) }),
  addExperience: (userId, exp) => post(`/candidates/${userId}/experiences`, exp),
  addEducation: (userId, edu) => post(`/candidates/${userId}/education`, edu),
  addSkill: (userId, skillName) => post(`/candidates/${userId}/skills`, { skillName }),
  addLanguage: (userId, languageCode) => post(`/candidates/${userId}/languages`, { languageCode }),
  addDocument: (userId, doc) => post(`/candidates/${userId}/documents`, doc),
  // candidate activity
  listMyApplications: (userId) => apiFetch(`/candidates/${userId}/applications`),
  saveOffer: (userId, offerId) => post(`/candidates/${userId}/saved-offers/${offerId}`),
  unsaveOffer: (userId, offerId) => apiFetch(`/candidates/${userId}/saved-offers/${offerId}`, { method: "DELETE" }),
  listSavedOffers: (userId) => apiFetch(`/candidates/${userId}/saved-offers`),
  createJobAlert: (userId, queryParams) => post(`/candidates/${userId}/job-alerts`, { queryParams }),
  listJobAlerts: (userId) => apiFetch(`/candidates/${userId}/job-alerts`),
  deleteJobAlert: (alertId) => apiFetch(`/job-alerts/${alertId}`, { method: "DELETE" }),
  getApplication: (applicationId) => apiFetch(`/applications/${applicationId}`),
  transitionApplication: (applicationId, to, actor) => post(`/applications/${applicationId}/transition`, { to, actor }),
  checkCVQuality: (userId, payload) => post(`/candidates/${userId}/cv-quality-check`, payload),
  checkCoverLetter: (userId, payload) => post(`/candidates/${userId}/cover-letter-check`, payload),
  applyToOffer: ({ jobOfferId, candidateId, answers, coverNote }) => post("/applications", { jobOfferId, candidateId, answers, coverNote }),
  getOfferQuestions: (offerId) => apiFetch(`/job-offers/${offerId}/questions`),
  putOfferQuestions: (offerId, questions) => apiFetch(`/job-offers/${offerId}/questions`, { method: "PUT", body: JSON.stringify({ questions }) }),
  // organisations
  listMyOrganizations: () => apiFetch("/me/organizations"),
  createOrganization: ({ legalName, displayName, createdBy }) => post("/organizations", { legalName, displayName, createdBy }),
  requestOrganizationVerification: (orgId) => post(`/organizations/${orgId}/request-verification`),
  approveOrganizationVerification: (orgId) => post(`/organizations/${orgId}/approve-verification`),
  listOrganizationOffers: (orgId) => apiFetch(`/organizations/${orgId}/job-offers`),
  getPublicCompanyProfile: (orgId) => apiFetch(`/organizations/${orgId}/public-profile`),
  savePublicCompanyProfile: (orgId, fields) => apiFetch(`/organizations/${orgId}/public-profile`, { method: "PUT", body: JSON.stringify(fields) }),
  saveCompanyClassification: (orgId, fields) => apiFetch(`/organizations/${orgId}/classification`, { method: "PUT", body: JSON.stringify(fields) }),
  listNaceCodes: () => apiFetch("/nace-codes"),
  getMessages: (applicationId) => apiFetch(`/applications/${applicationId}/messages`),
  sendMessage: (applicationId, body) => post(`/applications/${applicationId}/messages`, { body }),
  // offers
  listPublishedOffers: () => apiFetch("/job-offers"),
  searchLocations: (q, country) => apiFetch(`/locations?q=${encodeURIComponent(q)}${country ? `&country=${country}` : ""}`),
  createJobOffer: (draft) => post("/job-offers", draft),
  submitOfferForReview: (offerId) => post(`/job-offers/${offerId}/submit-for-review`),
  reviewOffer: (offerId) => post(`/job-offers/${offerId}/review`),
  publishOffer: (offerId) => post(`/job-offers/${offerId}/publish`),
  setTranslation: (offerId, field, locale, value) => post(`/job-offers/${offerId}/translations`, { field, locale, value }),
  listApplicationsForOffer: (offerId) => apiFetch(`/job-offers/${offerId}/applications`),
  getCandidateScores: (offerId) => apiFetch(`/job-offers/${offerId}/candidate-scores`),
  getCandidatePoolInsight: (offerId) => apiFetch(`/job-offers/${offerId}/candidate-pool-insight`),
  // platform
  bootstrapAdmin: () => post("/auth/bootstrap-admin"),
  createReport: (payload) => post("/reports", payload),
  resolveReport: (reportId, resolution, actorId) => post(`/reports/${reportId}/resolve`, { resolution, actorId }),
};

/* ---- Session kept for the tab's lifetime (survives reload, not a closed tab) ---- */
const SESSION_KEY = "zjobs_session";
function readSession() {
  try { return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function writeSession(session) {
  try {
    if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable: the session simply lasts until reload */ }
}

const ZJOBS_LOGO_DATA_URI = "data:image/png;base64,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";

/* ---- Profile completeness (section 6) — mirrors candidateProfile.ts ---- */
const COMPLETENESS_WEIGHTS = { title: 10, summary: 15, experience: 25, education: 15, skills: 15, languages: 10, resume: 10 };

function computeProfileCompleteness(input) {
  let score = 0;
  const missing = [];
  if (input.hasTitle) score += COMPLETENESS_WEIGHTS.title; else missing.push(t("missing_title"));
  if (input.hasSummary) score += COMPLETENESS_WEIGHTS.summary; else missing.push(t("missing_summary"));
  if (input.experienceCount > 0) score += COMPLETENESS_WEIGHTS.experience; else missing.push(t("missing_experience"));
  if (input.educationCount > 0) score += COMPLETENESS_WEIGHTS.education; else missing.push(t("missing_education"));
  if (input.skillCount > 0) score += COMPLETENESS_WEIGHTS.skills; else missing.push(t("missing_skills"));
  if (input.languageCount > 0) score += COMPLETENESS_WEIGHTS.languages; else missing.push(t("missing_languages"));
  if (input.hasResume) score += COMPLETENESS_WEIGHTS.resume; else missing.push(t("missing_resume"));
  return { score, missing };
}

/* ---- Employment Responsibility Index (section 8) ---- */
const badgeLabel = (badge) => t(`badge_${badge}`);

const EMPTY_PROFILE = { title: "", summary: "", experiences: [], education: [], skills: [], languages: [], documents: [] };

/* ---------------- Main app ---------------- */

export default function ZJobsDemo() {
  const [role, setRole] = useState("public");
  const [pillar, setPillar] = useState("first_jobs");
  const [locale, setLocaleState] = useState(initialLocale);
  setMessagesLocale(locale);
  function setLocale(next) {
    setMessagesLocale(next);
    rememberLocale(next);
    setLocaleState(next);
  }
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const [session, setSessionState] = useState(() => readSession()); // { token, userId, name }
  const [publicOffers, setPublicOffers] = useState([]);
  const [translations, setTranslations] = useState([]); // {entityId, field, locale, value}

  // candidate
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [applications, setApplications] = useState([]);
  const [savedOfferIds, setSavedOfferIds] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // partner
  const [orgs, setOrgs] = useState([]);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [orgOffers, setOrgOffers] = useState([]);

  // platform
  const [staffToken, setStaffToken] = useState(null);
  const [reports, setReports] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  // ?offre=<id> (links from the public site's search) opens that offer once the offers are loaded.
  const [selectedOfferId, setSelectedOfferId] = useState(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("offre");
      return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    } catch {
      return null;
    }
  });
  const [applyingOfferId, setApplyingOfferId] = useState(null);
  const [viewingCompanyOrgId, setViewingCompanyOrgId] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef(null);

  const userId = session?.userId || null;
  const currentOrg = orgs.find((o) => o.id === currentOrgId) || null;

  function notify(msg, tone = "info") {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  /** Runs an API call with the busy flag and a toast on failure. Returns the result or null. */
  async function run(fn, failKey) {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      notify(t(failKey, { error: err.message }), "warn");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function setSession(next) {
    api.setAuthToken(next?.token || null);
    writeSession(next);
    setSessionState(next);
  }
  if (session?.token && apiAuthToken !== session.token) api.setAuthToken(session.token);

  /* ---- Loading ---- */
  const loadPublicOffers = useCallback(async () => {
    try { setPublicOffers(await api.listPublishedOffers()); } catch { /* listing stays empty; the page explains */ }
  }, []);
  useEffect(() => { loadPublicOffers(); }, [loadPublicOffers, locale]);

  const loadCandidate = useCallback(async (id) => {
    const [bundle, apps, saved, al] = await Promise.all([
      api.getProfileBundle(id).catch(() => null),
      api.listMyApplications(id).catch(() => []),
      api.listSavedOffers(id).catch(() => []),
      api.listJobAlerts(id).catch(() => []),
    ]);
    if (bundle) {
      setProfile({
        title: bundle.profile?.professionalTitle || "",
        summary: bundle.profile?.summary || "",
        experiences: bundle.experiences || [],
        education: bundle.education || [],
        skills: bundle.skills || [],
        languages: bundle.languages || [],
        documents: bundle.documents || [],
      });
    }
    setApplications(apps || []);
    setSavedOfferIds((saved || []).map((o) => o.id));
    setAlerts(al || []);
  }, []);

  const loadOrgs = useCallback(async () => {
    try {
      const list = await api.listMyOrganizations();
      setOrgs(list);
      setCurrentOrgId((cur) => (cur && list.some((o) => o.id === cur) ? cur : list[0]?.id || null));
    } catch { setOrgs([]); }
  }, []);

  const loadOrgOffers = useCallback(async (orgId) => {
    if (!orgId) { setOrgOffers([]); return; }
    try { setOrgOffers(await api.listOrganizationOffers(orgId)); } catch { setOrgOffers([]); }
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(EMPTY_PROFILE); setApplications([]); setSavedOfferIds([]); setAlerts([]);
      setOrgs([]); setCurrentOrgId(null); setOrgOffers([]); setStaffToken(null);
      return;
    }
    loadCandidate(userId);
    loadOrgs();
  }, [userId, loadCandidate, loadOrgs]);
  useEffect(() => { loadOrgOffers(currentOrgId); }, [currentOrgId, loadOrgOffers]);
  // Coming back to a space shows what changed meanwhile (e.g. an employer moved an application).
  useEffect(() => {
    if (!userId) return;
    if (role === "candidate") loadCandidate(userId);
    if (role === "company" || role === "admin") { loadOrgs(); loadOrgOffers(currentOrgId); }
    if (role === "public") loadPublicOffers();
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Session ---- */
  async function login(email, password) {
    const result = await run(() => api.login({ email, password }), "toast_login_failed");
    if (!result) return;
    setSession({ token: result.token, userId: result.userId, name: result.fullName || email.split("@")[0] });
    notify(t("toast_logged_in"), "success");
  }

  async function signup(name, title, email, password, termsAccepted) {
    const result = await run(() => api.signupCandidate({ fullName: name, email, password, termsAccepted }), "toast_account_failed");
    if (!result) return;
    setSession({ token: result.token, userId: result.id, name });
    if (title) await api.putProfile(result.id, { professionalTitle: title, summary: "" }).catch(() => null);
    notify(t("toast_candidate_created", { name }), "success");
  }

  function logout() {
    setSession(null);
    notify(t("toast_logged_out"), "info");
  }

  /* ---- Candidate ---- */
  const completeness = userId ? computeProfileCompleteness({
    hasTitle: !!profile.title,
    hasSummary: !!profile.summary,
    experienceCount: profile.experiences.length,
    educationCount: profile.education.length,
    skillCount: profile.skills.length,
    languageCount: profile.languages.length,
    hasResume: profile.documents.some((d) => d.docType === "cv"),
  }) : null;

  async function saveProfile({ title, summary }) {
    const ok = await run(() => api.putProfile(userId, { professionalTitle: title, summary }), "toast_action_failed");
    if (ok) { setProfile((p) => ({ ...p, title, summary })); notify(t("toast_profile_saved"), "success"); }
  }
  async function addProfileItem(kind, call, successKey) {
    const ok = await run(call, "toast_action_failed");
    if (ok) { await loadCandidate(userId); if (successKey) notify(t(successKey), "success"); }
    return ok;
  }

  // Applying opens a short dialog: the employer's questions (if any) and an
  // optional message. Same profile, no form to fill in again.
  function applyToOffer(offerId) {
    if (!userId) { setRole("candidate"); return notify(t("toast_create_candidate_first"), "warn"); }
    if (applications.some((a) => a.jobOfferId === offerId)) return notify(t("toast_already_applied"), "warn");
    setApplyingOfferId(offerId);
  }

  async function submitApplication(offerId, answers, coverNote) {
    const result = await run(() => api.applyToOffer({ jobOfferId: offerId, candidateId: userId, answers, coverNote }), "toast_apply_failed");
    if (result) { setApplyingOfferId(null); await loadCandidate(userId); notify(t("toast_applied"), "success"); }
    return !!result;
  }

  async function withdraw(applicationId) {
    const result = await run(() => api.transitionApplication(applicationId, "withdrawn", "candidate"), "toast_action_failed");
    if (result) { await loadCandidate(userId); notify(t("toast_withdrawn"), "info"); }
  }

  async function toggleSavedOffer(offerId, isSaved) {
    if (!userId) return notify(t("toast_create_candidate_first"), "warn");
    const ok = await run(() => (isSaved ? api.unsaveOffer(userId, offerId) : api.saveOffer(userId, offerId)), "toast_save_failed");
    if (ok) setSavedOfferIds((prev) => (isSaved ? prev.filter((id) => id !== offerId) : [...prev, offerId]));
  }

  async function createAlert(queryParams) {
    const ok = await run(() => api.createJobAlert(userId, queryParams), "toast_action_failed");
    if (ok) { setAlerts(await api.listJobAlerts(userId).catch(() => alerts)); notify(t("toast_alert_created"), "success"); }
  }
  async function deleteAlert(alertId) {
    const ok = await run(() => api.deleteJobAlert(alertId).then(() => true), "toast_action_failed");
    if (ok) setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  async function deleteMyAccount() {
    const plan = await run(() => api.deleteMyPersonalData(userId), "toast_delete_failed");
    if (!plan) return;
    setSession(null);
    const retained = (plan.actions || []).filter((a) => a.action === "retain");
    notify(retained.length === 0 ? t("toast_account_deleted") : t("toast_account_partly_deleted", { count: retained.length }), "info");
  }

  /* ---- Partner ---- */
  async function createOrg(legalName) {
    const result = await run(() => api.createOrganization({ legalName, displayName: legalName, createdBy: userId }), "toast_org_failed");
    if (!result) return;
    await loadOrgs();
    setCurrentOrgId(result.id);
    notify(t("toast_org_created", { name: legalName }), "info");
  }

  async function requestVerification(orgId) {
    const ok = await run(() => api.requestOrganizationVerification(orgId), "toast_verification_request_failed");
    if (ok) { await loadOrgs(); notify(t("toast_verification_requested"), "info"); }
  }

  async function createOffer(orgId, draft, questions) {
    const ok = await run(() => api.createJobOffer({ organizationId: orgId, ...draft, ...(questions?.length ? { questions } : {}) }), "toast_offer_save_failed");
    if (ok) { await loadOrgOffers(orgId); notify(t("toast_offer_saved"), "info"); }
    return !!ok;
  }

  async function saveOfferQuestions(offerId, questions) {
    const saved = await run(() => api.putOfferQuestions(offerId, questions), "toast_questions_failed");
    if (saved) notify(t("questions_saved"), "success");
    return saved;
  }

  async function savePublicProfile(orgId, fields, classification) {
    const ok = await run(async () => {
      await api.savePublicCompanyProfile(orgId, fields);
      await api.saveCompanyClassification(orgId, classification);
      return true;
    }, "toast_action_failed");
    if (ok) notify(t("toast_public_page_saved"), "success");
  }

  async function submitOfferForReview(offerId) {
    const ok = await run(() => api.submitOfferForReview(offerId), "toast_offer_submit_failed");
    if (ok) { await loadOrgOffers(currentOrgId); notify(t("toast_offer_submitted"), "info"); }
  }

  async function addTranslation(entityId, field, targetLocale, value) {
    if (!value?.trim()) return;
    const ok = await run(() => api.setTranslation(entityId, field, targetLocale, value), "toast_action_failed");
    if (!ok) return;
    setTranslations((prev) => [...prev.filter((x) => !(x.entityId === entityId && x.field === field && x.locale === targetLocale)), { entityId, field, locale: targetLocale, value }]);
    notify(t("toast_translation_saved"), "success");
  }

  async function transitionForPartner(applicationId, to) {
    const updated = await run(() => api.transitionApplication(applicationId, to, "company"), "toast_action_failed");
    if (updated) { loadOrgOffers(currentOrgId); notify(t("toast_application_moved", { status: t(`status_${to}`) }), "success"); }
    return updated;
  }

  /* ---- Platform administration ---- */
  async function bootstrapStaff() {
    const ok = await run(() => api.bootstrapAdmin(), "toast_staff_failed");
    if (ok) { setStaffToken(session.token); notify(t("toast_staff_granted"), "success"); }
  }

  function addAudit(actorId, entityType, entityId, action) {
    setAuditLog((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, actorId, entityType, entityId, action, createdAt: new Date().toLocaleTimeString() }]);
  }

  async function approveVerification(orgId) {
    const ok = await run(() => api.approveOrganizationVerification(orgId), "toast_org_verify_failed");
    if (ok) { await loadOrgs(); notify(t("toast_org_verified"), "success"); addAudit("admin", "organization", orgId, "verify"); }
  }

  async function reviewOffer(offerId) {
    const result = await run(() => api.reviewOffer(offerId), "toast_offer_review_failed");
    if (!result) return;
    await loadOrgOffers(currentOrgId);
    if (result.status === "needs_changes") {
      setOrgOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, issues: result.issues || [] } : o)));
      notify(t("toast_offer_needs_changes"), "warn");
      addAudit("admin", "job_offer", offerId, "reject");
    } else {
      notify(t("toast_offer_approved"), "success");
      addAudit("admin", "job_offer", offerId, "approve");
    }
  }

  async function publishOffer(offerId) {
    const ok = await run(() => api.publishOffer(offerId), "toast_offer_publish_failed");
    if (ok) { await Promise.all([loadOrgOffers(currentOrgId), loadPublicOffers()]); notify(t("toast_offer_published"), "success"); addAudit("admin", "job_offer", offerId, "publish"); }
  }

  async function reportTarget(targetType, targetId, reason) {
    if (!reason?.trim()) return;
    if (!userId) return notify(t("toast_login_to_report"), "warn");
    const result = await run(() => api.createReport({ targetType, targetId, reason, reportedBy: userId }), "toast_report_failed");
    if (result) {
      setReports((prev) => [...prev, { id: result.id, targetType, targetId, reason, reportedBy: userId, status: "open" }]);
      notify(t("toast_report_saved"), "info");
    }
  }

  async function resolveReportAction(reportId, resolution) {
    const report = reports.find((r) => r.id === reportId);
    if (!report || report.status === "resolved" || report.status === "dismissed") return notify(t("toast_report_already_closed"), "warn");
    const result = await run(() => api.resolveReport(reportId, resolution, userId || "admin"), "toast_report_resolve_failed");
    if (!result) return;
    setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: result.status, resolution: result.resolution } : r)));
    if (resolution === "confirmed" && report.targetType === "job_offer") {
      await Promise.all([loadOrgOffers(currentOrgId), loadPublicOffers()]);
      notify(t("toast_report_confirmed"), "warn");
    } else {
      notify(t("toast_report_unfounded"), "success");
    }
  }

  /* ---- Derived ---- */
  const offersForPillar = useMemo(() => publicOffers.filter((o) => o.pillar === pillar), [publicOffers, pillar]);
  const allKnownOffers = useMemo(() => {
    const byId = new Map(publicOffers.map((o) => [o.id, o]));
    for (const o of orgOffers) if (!byId.has(o.id)) byId.set(o.id, o);
    return [...byId.values()];
  }, [publicOffers, orgOffers]);
  const selectedOffer = allKnownOffers.find((o) => o.id === selectedOfferId) || null;
  const candidate = userId ? { id: userId, name: session.name, title: profile.title, summary: profile.summary } : null;

  const roles = [
    { key: "public", label: t("role_public"), icon: <Search size={14} aria-hidden="true" /> },
    { key: "candidate", label: t("role_candidate"), icon: <User size={14} aria-hidden="true" /> },
    { key: "company", label: t("role_company"), icon: <Building2 size={14} aria-hidden="true" /> },
    { key: "admin", label: t("role_admin"), icon: <Landmark size={14} aria-hidden="true" /> },
  ];

  return (
    <div className="zj-root">
      <FontsAndStyles />
      <a className="zj-skip-link" href="#zj-main">{t("skip_link")}</a>

      <header className="zj-header">
        <div className="zj-brand">
          <img className="zj-brand-mark" src={ZJOBS_LOGO_DATA_URI} alt="" />
          <span className="zj-brand-name">Z Jobs</span>
        </div>
        <div className="zj-header-right">
          <div className="zj-locale-switch" role="group" aria-label={t("language")}>
            {LOCALES.map((l) => (
              <button key={l.code} type="button" lang={l.code} className={`zj-locale-btn ${locale === l.code ? "is-active" : ""}`} aria-pressed={locale === l.code} onClick={() => setLocale(l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          <nav className="zj-role-switch" aria-label={t("main_nav")}>
            {roles.map((r) => (
              <button key={r.key} type="button" className={`zj-tab ${role === r.key ? "is-active" : ""}`} aria-current={role === r.key ? "page" : undefined} onClick={() => setRole(r.key)}>
                {r.icon}
                {r.label}
              </button>
            ))}
          </nav>
          {session && (
            <button type="button" className="zj-btn is-ghost is-small" onClick={logout}>{t("logout")}<span className="zj-visually-hidden"> ({session.name})</span></button>
          )}
        </div>
      </header>

      <div className={`zj-toast ${toast ? `tone-${toast.tone}` : "is-empty"}`} role="status" aria-live="polite">{toast?.msg}</div>

      <main className="zj-main" id="zj-main" tabIndex={-1}>
        {role === "public" && (
          <PublicView pillar={pillar} setPillar={setPillar} offers={offersForPillar} onSelect={setSelectedOfferId} locale={locale} />
        )}

        {role === "candidate" && (!candidate ? (
          <AuthPanel onLogin={login} onSignup={signup} busy={busy} headingId="cand-auth-h" />
        ) : (
          <CandidateDashboard
            candidate={candidate}
            completeness={completeness}
            experiences={profile.experiences}
            education={profile.education}
            skills={profile.skills}
            languages={profile.languages}
            documents={profile.documents}
            onSaveProfile={saveProfile}
            onAddExperience={(exp) => addProfileItem("experience", () => api.addExperience(userId, exp), "toast_experience_added")}
            onAddEducation={(edu) => addProfileItem("education", () => api.addEducation(userId, edu), "toast_education_added")}
            onAddSkill={(s) => addProfileItem("skill", () => api.addSkill(userId, s))}
            onAddLanguage={(l) => addProfileItem("language", () => api.addLanguage(userId, l))}
            onAddDocument={(d) => addProfileItem("document", () => api.addDocument(userId, d), null)}
            offers={publicOffers}
            orgs={orgs}
            savedOfferIds={savedOfferIds}
            onToggleSaved={toggleSavedOffer}
            onApply={applyToOffer}
            onOpenOffer={setSelectedOfferId}
            applications={applications}
            onWithdraw={withdraw}
            onFetchMyScore={(id) => api.getApplication(id)}
            onLoadMessages={(id) => api.getMessages(id)}
            onSendMessage={(id, body) => api.sendMessage(id, body)}
            alerts={alerts}
            onCreateAlert={createAlert}
            onDeleteAlert={deleteAlert}
            onCheckCVQuality={(id, payload) => api.checkCVQuality(id, payload)}
            onCheckCoverLetter={(id, payload) => api.checkCoverLetter(id, payload)}
            onLogout={logout}
            onDeleteAccount={deleteMyAccount}
            locale={locale}
            busy={busy}
          />
        ))}

        {role === "company" && (!session ? (
          <AuthPanel onLogin={login} onSignup={signup} busy={busy} headingId="org-auth-h" intro={t("partner_auth_intro")} />
        ) : !currentOrg ? (
          <OrganizationSetup orgs={orgs} onCreateOrg={createOrg} onSelectOrg={setCurrentOrgId} busy={busy} />
        ) : (
          <PartnerDashboard
            org={currentOrg}
            orgs={orgs}
            offers={orgOffers}
            onSelectOrg={setCurrentOrgId}
            onRequestVerification={requestVerification}
            onViewResponsibility={() => setViewingCompanyOrgId(currentOrgId)}
            onCreateOffer={createOffer}
            onSubmitForReview={submitOfferForReview}
            translations={translations}
            onAddTranslation={addTranslation}
            onFetchPoolInsight={(id) => api.getCandidatePoolInsight(id)}
            onLoadApplications={(id) => api.listApplicationsForOffer(id)}
            onLoadQuestions={(id) => api.getOfferQuestions(id)}
            onSaveQuestions={saveOfferQuestions}
            onLoadScores={(id) => api.getCandidateScores(id)}
            onTransition={transitionForPartner}
            onSearchLocations={(q) => api.searchLocations(q)}
            onLoadPublicProfile={(id) => api.getPublicCompanyProfile(id)}
            onLoadMessages={(id) => api.getMessages(id)}
            onSendMessage={(id, body) => api.sendMessage(id, body)}
            onSavePublicProfile={savePublicProfile}
            onListNaceCodes={() => api.listNaceCodes()}
            busy={busy}
          />
        ))}

        {role === "admin" && (
          <AdminView
            orgs={orgs}
            offers={orgOffers}
            onApproveVerification={approveVerification}
            onReviewOffer={reviewOffer}
            onPublishOffer={publishOffer}
            onViewResponsibility={setViewingCompanyOrgId}
            reports={reports}
            onResolveReport={resolveReportAction}
            auditLog={auditLog}
            staffToken={staffToken}
            onBootstrapStaff={bootstrapStaff}
            sessionToken={session?.token}
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
          alreadyApplied={applications.some((a) => a.jobOfferId === selectedOffer.id)}
          onViewCompanyProfile={() => setViewingCompanyOrgId(selectedOffer.organizationId)}
          onReport={(reason) => reportTarget("job_offer", selectedOffer.id, reason)}
        />
      )}

      {applyingOfferId && (
        <ApplyDialog
          offer={allKnownOffers.find((o) => o.id === applyingOfferId) || { id: applyingOfferId, title: "" }}
          onLoadQuestions={(id) => api.getOfferQuestions(id)}
          onSubmit={submitApplication}
          onClose={() => setApplyingOfferId(null)}
          busy={busy}
        />
      )}

      {viewingCompanyOrgId && (
        <CompanyProfileDrawer
          orgId={viewingCompanyOrgId}
          onClose={() => setViewingCompanyOrgId(null)}
          onFetchProfile={(id) => api.getPublicCompanyProfile(id)}
          onOpenOffer={(id) => { setViewingCompanyOrgId(null); setSelectedOfferId(id); }}
        />
      )}
    </div>
  );
}

/* ---------------- Views ---------------- */

function PublicView({ pillar, setPillar, offers, onSelect, locale }) {
  const [place, setPlace] = useState("");
  const placeKey = normalizeText(place);
  const shown = placeKey
    ? offers.filter((o) => o.location && normalizeText(`${o.location.city} ${o.location.postalCode || ""} ${o.location.adminArea || ""}`).includes(placeKey))
    : offers;
  return (
    <section className="zj-public" aria-labelledby="public-h">
      <div className="zj-hero">
        <p className="zj-eyebrow">{t("hero_eyebrow")}</p>
        <h1 id="public-h" className="zj-hero-line">
          {t("hero_line_1")}
          <br />
          {t("hero_line_2")}
        </h1>
        <p className="zj-hero-sub">{t("hero_sub")}</p>
      </div>

      <div className="zj-pillars" role="group" aria-label={t("field_pillar")}>
        {PILLAR_KEYS.map((key) => (
          <button key={key} type="button" className={`zj-pillar ${pillar === key ? "is-active" : ""}`} aria-pressed={pillar === key} onClick={() => setPillar(key)}>
            {pillarLabel(key)}
          </button>
        ))}
      </div>

      <form className="zj-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <Field label={t("filter_place")}>
          <input type="search" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("ph_filter_place")} />
        </Field>
      </form>
      <h2 className="zj-visually-hidden">{t("public_list_heading", { pillar: pillarLabel(pillar) })}</h2>
      <p className="zj-hint-inline" aria-live="polite">{t("results_count", { count: shown.length })}</p>
      <ul className="zj-grid zj-plain-list">
        {shown.map((o) => (
          <li key={o.id}>
            <button type="button" className="zj-card" onClick={() => onSelect(o.id)}>
              <span className="zj-card-top">
                <span className="zj-card-title">{o.title}</span>
                <VerificationBadge status="verified" />
              </span>
              {o.translation?.isFallback && locale !== "fr" && (
                <span className="zj-fallback-note">{t("fallback_note", { locale: locale.toUpperCase() })}</span>
              )}
              <OfferPlace location={o.location} workRegime={o.workRegime} />
              <span className="zj-card-desc">{o.description.slice(0, 110)}{o.description.length > 110 ? "…" : ""}</span>
              <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="zj-empty">{offers.length === 0 ? t("public_empty") : t("no_results")}</p>}
    </section>
  );
}

/** Keeps keyboard focus inside a drawer, closes on Escape, restores focus on close. */
function useDialog(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    node?.querySelector("button, [href], input, select, textarea")?.focus();
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll("button:not([disabled]), [href], input, select, textarea")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
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
        <h1 className="zj-view-title">{t("staff_needed_title")}</h1>
        <p className="zj-panel-hint">{t("staff_needed_hint")}</p>
        <button type="button" className="zj-btn is-primary" disabled={!sessionToken} onClick={onBootstrapStaff}>
          {sessionToken ? t("become_staff") : t("toast_create_candidate_first")}
        </button>
      </section>
    );
  }

  return (
    <section className="zj-panel">
      <h1 className="zj-view-title">{t("role_admin")}</h1>
      <h2 className="zj-section-title">{t("verification_queue")}</h2>
      <div className="zj-list">
        {pendingOrgs.map((o) => (
          <div key={o.id} className="zj-list-row">
            <strong>{o.legalName}</strong>
            <button type="button" className="zj-btn is-primary" onClick={() => onApproveVerification(o.id)}>{t("verify")}</button>
          </div>
        ))}
        {pendingOrgs.length === 0 && <p className="zj-empty">{t("no_pending_verifications")}</p>}
      </div>

      <h2 className="zj-subhead">{t("verified_companies")}</h2>
      <div className="zj-list">
        {verifiedOrgs.map((o) => (
          <div key={o.id} className="zj-list-row">
            <div><strong>{o.legalName}</strong> <VerificationBadge status={o.verificationStatus} /></div>
            <button type="button" className="zj-btn is-ghost" onClick={() => onViewResponsibility(o.id)}><Award size={14} /> {t("view_eri")}</button>
          </div>
        ))}
        {verifiedOrgs.length === 0 && <p className="zj-empty">{t("no_verified_companies")}</p>}
      </div>

      <h2 className="zj-subhead">{t("moderation_queue")}</h2>
      <div className="zj-list">
        {pendingOffers.map((o) => (
          <div key={o.id} className="zj-list-row is-column">
            <div className="zj-list-row-top">
              <strong>{o.title}</strong>
              <span className="zj-status status-pending_review">{offerStatusLabel("pending_review")}</span>
            </div>
            <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
            <button type="button" className="zj-btn is-primary" onClick={() => onReviewOffer(o.id)}>{t("validate")}</button>
          </div>
        ))}
        {pendingOffers.length === 0 && <p className="zj-empty">{t("no_offers_to_review")}</p>}
      </div>

      <h2 className="zj-subhead">{t("approved_ready")}</h2>
      <div className="zj-list">
        {approvedOffers.map((o) => (
          <div key={o.id} className="zj-list-row">
            <strong>{o.title}</strong>
            <button type="button" className="zj-btn is-primary" onClick={() => onPublishOffer(o.id)}>{t("publish")}</button>
          </div>
        ))}
        {approvedOffers.length === 0 && <p className="zj-empty">{t("nothing_to_publish")}</p>}
      </div>

      <h2 className="zj-subhead"><AlertTriangle size={15} /> {t("open_reports")}</h2>
      <div className="zj-list">
        {openReports.map((r) => (
          <div key={r.id} className="zj-list-row is-column">
            <div className="zj-list-row-top">
              <strong>{r.targetType === "job_offer" ? t("report_target_offer") : t("report_target_company")} #{r.targetId}</strong>
              <span className="zj-status status-pending_review">{r.status}</span>
            </div>
            <p className="zj-report-reason">{r.reason}</p>
            <div className="zj-drawer-actions is-row">
              <button type="button" className="zj-btn is-primary" onClick={() => onResolveReport(r.id, "confirmed")}>{t("confirm_report")}</button>
              <button type="button" className="zj-btn is-ghost" onClick={() => onResolveReport(r.id, "unfounded")}>{t("mark_unfounded")}</button>
            </div>
          </div>
        ))}
        {openReports.length === 0 && <p className="zj-empty">{t("no_open_reports")}</p>}
      </div>

      {resolvedReports.length > 0 && (
        <>
          <h3 className="zj-subhead">{t("resolved_reports")}</h3>
          <div className="zj-list">
            {resolvedReports.map((r) => (
              <div key={r.id} className="zj-list-row">
                <span>{r.reason}</span>
                <span className={`zj-status ${r.resolution === "confirmed" ? "status-rejected" : "status-approved"}`}>
                  {r.resolution === "confirmed" ? t("report_confirmed") : t("report_unfounded")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="zj-subhead">{t("audit_log")}</h2>
      <div className="zj-audit-list">
        {[...auditLog].reverse().slice(0, 15).map((a) => (
          <div key={a.id} className="zj-audit-row">
            <span className="zj-audit-time">{a.createdAt}</span>
            <span className="zj-audit-action">{a.action}</span>
            <span className="zj-audit-entity">{a.entityType}:{a.entityId}</span>
            <span className="zj-audit-actor">{t("audit_by", { actor: a.actorId })}</span>
          </div>
        ))}
        {auditLog.length === 0 && <p className="zj-empty">{t("audit_empty")}</p>}
      </div>
    </section>
  );
}

function ApplyDialog({ offer, onLoadQuestions, onSubmit, onClose, busy }) {
  const ref = useDialog(onClose);
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [coverNote, setCoverNote] = useState("");
  useEffect(() => {
    let cancelled = false;
    onLoadQuestions(offer.id).then((q) => { if (!cancelled) setQuestions(q || []); }).catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, [offer.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = (questions || []).some((q) => q.required && !String(answers[q.id] ?? "").trim());
  return (
    <div className="zj-drawer-backdrop" onClick={onClose}>
      <div className="zj-drawer" role="dialog" aria-modal="true" aria-labelledby="apply-h" ref={ref} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="zj-drawer-close" onClick={onClose}>{t("close")}</button>
        <p className="zj-eyebrow">{t("apply")}</p>
        <h2 id="apply-h">{offer.title}</h2>
        <p className="zj-panel-hint">{t("apply_intro")}</p>
        {!questions && <p className="zj-empty">{t("loading")}</p>}
        {questions && (
          <form
            className="zj-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(offer.id, questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })), coverNote.trim());
            }}
          >
            {questions.length > 0 && <p className="zj-field-hint">{t("apply_questions_note")}</p>}
            <AnswerFields questions={questions} value={answers} onChange={setAnswers} />
            <Field label={`${t("apply_message")} (${t("optional")})`} hint={t("apply_message_hint")}>
              <textarea rows={4} maxLength={2000} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
            </Field>
            <button type="submit" className="zj-btn is-primary" disabled={busy || missing}>
              {t("apply_send")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function OfferDetail({ offer, org, onClose, onApply, canApply, alreadyApplied, onViewCompanyProfile, onReport }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const ref = useDialog(onClose);

  return (
    <div className="zj-drawer-backdrop" onClick={onClose}>
      <div className="zj-drawer" role="dialog" aria-modal="true" aria-labelledby="offer-detail-h" ref={ref} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="zj-drawer-close" onClick={onClose}>{t("close")}</button>
        <p className="zj-eyebrow">{org?.legalName || offer.organizationName || ""}</p>
        <h2 id="offer-detail-h">{offer.title}</h2>
        <VerificationBadge status="verified" />
        <OfferPlace location={offer.location} workRegime={offer.workRegime} />
        <SalaryLedger min={offer.salaryMin} max={offer.salaryMax} currencyCode={offer.salaryCurrency} period={offer.salaryPeriod} fixed={offer.hasFixedSalary} />
        <dl className="zj-facts">
          <div><dt>{t("field_contract_type")}</dt><dd>{t(`contract_${offer.contractType}`)}</dd></div>
          <div><dt>{t("field_regime")}</dt><dd>{t(`regime_${offer.workRegime}`)}</dd></div>
          <div><dt>{t("field_pillar")}</dt><dd>{pillarLabel(offer.pillar)}</dd></div>
        </dl>
        <p className="zj-drawer-desc">{offer.description}</p>
        <div className="zj-drawer-actions">
          {canApply && (
            <button type="button" className="zj-btn is-primary" disabled={alreadyApplied} onClick={() => { onApply(); onClose(); }}>
              {alreadyApplied ? t("already_applied") : t("apply")} <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="zj-btn is-ghost" onClick={onViewCompanyProfile}><Building2 size={14} aria-hidden="true" /> {t("view_company_profile")}</button>
          {!reporting && (
            <button type="button" className="zj-btn is-ghost is-danger" onClick={() => setReporting(true)}><AlertTriangle size={14} aria-hidden="true" /> {t("report_offer")}</button>
          )}
        </div>
        {reporting && (
          <form className="zj-report-box" onSubmit={(e) => { e.preventDefault(); onReport(reason); setReporting(false); setReason(""); }}>
            <Field label={t("describe_problem")}>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ph_report")} />
            </Field>
            <button type="submit" className="zj-btn is-primary" disabled={!reason.trim()}>{t("submit_report")}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function CompanyProfileDrawer({ orgId, onClose, onFetchProfile, onOpenOffer }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const ref = useDialog(onClose);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    onFetchProfile(orgId)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="zj-drawer-backdrop" onClick={onClose}>
      <div className="zj-drawer" role="dialog" aria-modal="true" aria-labelledby="company-drawer-h" ref={ref} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="zj-drawer-close" onClick={onClose}>{t("close")}</button>
        <p className="zj-eyebrow" id="company-drawer-h">{profile ? profile.legalName : t("eri_title")}</p>
        <div aria-live="polite">
          {error && <p className="zj-empty">{t("profile_load_failed", { error })}</p>}
          {!profile && !error && <p className="zj-empty">{t("loading")}</p>}
        </div>
        {profile && <CompanyPresentation profile={profile} onOpenOffer={onOpenOffer} />}
        {profile && (
          <>
            <h2>{t("eri_title")}</h2>
            <VerificationBadge status={profile.verificationStatus} />
            <div className="zj-badges-row">
              {profile.badges.length === 0 && <p className="zj-empty">{t("no_badges")}</p>}
              {profile.badges.map((b) => <span key={b} className="zj-eri-badge"><Award size={13} aria-hidden="true" /> {badgeLabel(b)}</span>)}
            </div>
            <h3 className="zj-subhead">{t("eri_components")}</h3>
            <div className="zj-eri-grid">
              <EriMeter label={t("eri_salary_transparency")} value={profile.components.salaryTransparencyScore} />
              <EriMeter label={t("eri_offer_completeness")} value={profile.components.offerCompletenessScore} />
              <EriMeter label={t("eri_response")} value={profile.components.responseScore} />
              <EriMeter label={t("eri_integrity")} value={profile.components.integrityScore} />
            </div>
            <h3 className="zj-subhead">{t("raw_data")}</h3>
            <ul className="zj-raw-metrics">
              <li>{t("raw_published_offers")}<strong>{profile.metrics.publishedOffersCount}</strong></li>
              <li>{t("raw_first_job_hires")}<strong>{profile.metrics.firstJobHiresCount}</strong></li>
              <li>{t("raw_senior_hires")}<strong>{profile.metrics.seniorHiresCount}</strong></li>
              <li>{t("raw_complaints")}<strong>{profile.metrics.confirmedComplaintsCount}</strong></li>
            </ul>
            <p className="zj-panel-hint">{t("eri_server_note")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function CompanyPresentation({ profile, onOpenOffer }) {
  const p = profile.profile || {};
  const verified = profile.verificationStatus === "verified" || profile.verificationStatus === "enhanced_verified";
  const texts = [["company_about", p.description], ["company_culture", p.cultureNotes], ["company_remote", p.remotePolicyNotes], ["company_inclusion", p.inclusionPolicyNotes]].filter(([, v]) => v);
  const facts = [
    p.headquarters && ["company_hq", locationLabel(p.headquarters)],
    p.smeCategory && p.smeCategory !== "unknown" && ["company_size", t(`sme_${p.smeCategory}`)],
    p.nace && ["company_sector", naceSectionLabel(p.nace.section) || p.nace.labelEn],
  ].filter(Boolean);
  const offers = profile.offers || [];
  return (
    <div className="zj-company">
      <h2>{profile.displayName}</h2>
      <p><a className="zj-link" href={companyPageUrl(profile.id)} target="_blank" rel="noopener">{t("profile_view_public")}</a></p>
      {!verified && <p className="zj-notice">{t("company_not_verified")}</p>}
      {texts.map(([key, value]) => (
        <section key={key}>
          <h3 className="zj-subhead">{t(key)}</h3>
          <p className="zj-company-text">{value}</p>
        </section>
      ))}
      {(facts.length > 0 || p.website) && (
        <section>
          <h3 className="zj-subhead">{t("company_details")}</h3>
          <dl className="zj-company-facts">
            {facts.map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
            {p.website && <div><dt>{t("company_website")}</dt><dd><a className="zj-link" href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https:\/\//, "")}</a></dd></div>}
          </dl>
          {p.smeCategory && p.smeCategory !== "unknown" && <p className="zj-field-hint">{t("sme_note")}</p>}
        </section>
      )}
      <section>
        <h3 className="zj-subhead">{t("company_open_offers")} ({profile.offersTotal ?? offers.length})</h3>
        {offers.length === 0 ? <p className="zj-empty">{t("company_no_offers")}</p> : (
          <ul className="zj-plain-list">
            {offers.map((o) => (
              <li key={o.id} className="zj-company-offer">
                <strong>{o.title}</strong>
                <OfferPlace location={o.location} workRegime={o.workRegime} />
                <button type="button" className="zj-btn is-ghost is-small" onClick={() => onOpenOffer(o.id)}>{t("company_open_offer")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
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
        --amber-text: #7A5D18; /* 5.3:1 on --paper, for text */
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
      .zj-company { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
      .zj-company-text { white-space: pre-line; margin: 0; }
      .zj-company-facts { display: grid; gap: 6px; margin: 0; }
      .zj-company-facts div { display: flex; gap: 8px; flex-wrap: wrap; }
      .zj-company-facts dt { font-weight: 600; }
      .zj-company-facts dd { margin: 0; }
      .zj-company-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 0; border-top: 1px dashed var(--line); }
      .zj-link { color: var(--trust); text-decoration: underline; text-underline-offset: 2px; }
      .zj-root button, .zj-root input, .zj-root select, .zj-root textarea { font-family: inherit; font-size: 14px; }

      .zj-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 28px; border-bottom: 2px solid var(--amber);
        background: var(--paper-raised);
        flex-wrap: wrap; gap: 12px;
      }
      .zj-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .zj-locale-switch { display: flex; gap: 2px; border: 1px solid var(--line); padding: 2px; }
      .zj-locale-btn { border: none; background: transparent; padding: 5px 8px; font-size: 11px; font-weight: 600; cursor: pointer; color: #3D4A46; font-family: 'IBM Plex Mono', monospace; }
      .zj-locale-btn.is-active { background: var(--ink); color: var(--paper); opacity: 1; }
      .zj-fallback-note { font-size: 11px; color: var(--amber-text); background: var(--amber-soft); padding: 3px 8px; width: fit-content; }
      .zj-translation-editor { border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 6px; }
      .zj-brand { display: flex; align-items: center; gap: 10px; }
      .zj-brand-mark { width: 28px; height: 28px; border-radius: 7px; display: block; box-shadow: 0 0 0 1px rgba(22,33,31,0.08); }
      .zj-brand-name { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; letter-spacing: 0.01em; }

      .zj-role-switch { display: flex; gap: 4px; background: var(--paper); border: 1px solid var(--line); padding: 3px; }
      .zj-tab {
        display: flex; align-items: center; gap: 6px; border: none; background: transparent;
        padding: 7px 12px; cursor: pointer; color: #3D4A46;
      }
      .zj-tab.is-active { background: var(--ink); color: var(--paper); opacity: 1; }
      .zj-tab:focus-visible { outline: 2px solid var(--trust); outline-offset: 2px; }

      .zj-main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 80px; }
      .zj-main:focus { outline: none; }

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
      .zj-card-title { font-family: 'Fraunces', serif; font-size: 16px; margin: 0; font-weight: 600; }
      .zj-card-desc { font-size: 13px; color: #465650; margin: 0; }

      .zj-ledger { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--line); font-family: 'IBM Plex Mono', monospace; }
      .zj-ledger-amount { font-size: 15px; font-weight: 600; }
      .zj-ledger-period { font-size: 11px; opacity: 0.7; margin-left: 2px; }
      .zj-ledger-tag { display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 3px 6px; text-transform: uppercase; letter-spacing: 0.04em; }
      .zj-ledger-tag.is-fixed { background: var(--trust-soft); color: var(--trust); }
      .zj-ledger-tag.is-risk { background: var(--danger-soft); color: var(--danger); }

      .zj-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 8px; font-weight: 600; }
      .zj-badge.is-trust { background: var(--trust-soft); color: var(--trust); }
      .zj-badge.is-pending { background: var(--amber-soft); color: var(--amber-text); }
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
      .zj-status.status-needs_changes, .zj-status.status-pending_review, .zj-status.status-interview, .zj-status.status-offer { background: var(--amber-soft); color: var(--amber-text); }
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
      .zj-relevance-badge.is-partial { background: #f3ecd8; color: var(--amber-text); }
      .zj-relevance-badge.is-mismatch { background: #f3e6e0; color: var(--danger); }
      .zj-relevance-badge.is-unknown { background: #eee; color: #6b6555; }
      .zj-cv-match { margin: 8px 0 12px; display: flex; flex-direction: column; gap: 6px; }

      .zj-drawer-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }

      .zj-badges-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 6px; }
      .zj-eri-badge { display: flex; align-items: center; gap: 5px; background: var(--amber-soft); color: var(--amber-text); font-size: 12px; font-weight: 600; padding: 5px 10px; }

      .zj-eri-grid { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
      .zj-eri-meter-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
      .zj-eri-meter-value { font-family: 'IBM Plex Mono', monospace; font-weight: 600; }

      .zj-raw-metrics { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }

      .zj-toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 18px; background: var(--ink); color: var(--paper); font-size: 13px; z-index: 50;
      }
      .zj-toast.tone-success { background: var(--trust); }
      .zj-toast.tone-warn { background: var(--amber-text); color: #fff; }
      .zj-toast.is-empty { padding: 0; background: transparent; }

      .zj-drawer-backdrop { position: fixed; inset: 0; background: rgba(22,33,31,0.4); display: flex; justify-content: flex-end; z-index: 40; }
      .zj-drawer { width: min(420px, 90vw); background: var(--paper-raised); height: 100%; padding: 28px; overflow-y: auto; }
      .zj-drawer-close { border: none; background: transparent; color: #3D4A46; cursor: pointer; margin-bottom: 16px; padding: 4px 0; font-weight: 600; text-decoration: underline; }
      .zj-drawer h2 { font-family: 'Fraunces', serif; font-weight: 600; margin: 4px 0 12px; }
      .zj-drawer-desc { margin: 16px 0 20px; color: #333; }


      /* ---- accessibility helpers ---- */
      .zj-skip-link { position: absolute; left: 12px; top: -60px; z-index: 100; background: var(--ink); color: var(--paper); padding: 10px 14px; font-weight: 600; }
      .zj-skip-link:focus { top: 10px; }
      .zj-visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .zj-root a:focus-visible, .zj-root select:focus-visible, .zj-root input:focus-visible, .zj-root textarea:focus-visible, .zj-root summary:focus-visible, .zj-card:focus-visible, .zj-pillar:focus-visible, .zj-locale-btn:focus-visible, .zj-drawer-close:focus-visible, .zj-section-btn:focus-visible { outline: 2px solid var(--trust); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { .zj-root * { transition: none !important; animation: none !important; } }

      /* ---- dashboards ---- */
      .zj-view-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 26px; margin: 0 0 4px; }
      .zj-section-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 19px; margin: 8px 0 12px; }
      .zj-dash-section { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
      .zj-section-nav, .zj-auth-switch { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); margin: 10px 0 4px; }
      .zj-auth-switch { border-bottom: none; margin-bottom: 14px; }
      .zj-section-btn { border: none; border-bottom: 3px solid transparent; background: transparent; padding: 9px 12px; cursor: pointer; color: #3D4A46; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
      .zj-section-btn.is-active { color: var(--ink); border-bottom-color: var(--trust); }
      .zj-auth-switch .zj-section-btn { border: 1px solid var(--line); }
      .zj-auth-switch .zj-section-btn.is-active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
      .zj-section-count { font-family: 'IBM Plex Mono', monospace; font-size: 11px; background: var(--trust-soft); color: var(--trust); padding: 1px 6px; border-radius: 999px; }
      .zj-busy { font-size: 12px; color: #3D4A46; font-family: 'IBM Plex Mono', monospace; }
      .zj-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
      .zj-kpi { border: 1px solid var(--line); background: var(--paper); padding: 14px; display: flex; flex-direction: column; gap: 2px; }
      .zj-kpi-value { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; line-height: 1.1; }
      .zj-kpi-label { font-size: 13px; font-weight: 600; }
      .zj-kpi-hint { font-size: 11px; color: #5c5544; }
      .zj-kpi.is-good { border-left: 4px solid var(--trust); }
      .zj-kpi.is-warn { border-left: 4px solid var(--amber); }
      .zj-kpi.is-bad { border-left: 4px solid var(--danger); }
      .zj-thread { display: flex; flex-direction: column; gap: 8px; width: 100%; }
      .zj-thread > .zj-btn { align-self: flex-start; }
      .zj-thread-panel { border: 1px solid var(--line); background: var(--paper-raised); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .zj-thread-list:focus-visible { outline: 2px solid var(--trust); outline-offset: 2px; }
      .zj-thread-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
      .zj-message { border-left: 3px solid var(--line); padding: 6px 10px; background: #fff; }
      .zj-message.is-mine { border-left-color: var(--trust); background: var(--trust-soft); }
      .zj-message-meta { font-size: 12px; color: #3D4A46; }
      .zj-message-body { margin: 4px 0 0; white-space: pre-line; overflow-wrap: anywhere; }
      .zj-thread-form { display: flex; flex-direction: column; gap: 8px; }
      .zj-deadline { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #3D4A46; width: fit-content; }
      .zj-deadline.is-warn { color: var(--amber-text); background: var(--amber-soft); padding: 2px 6px; font-weight: 600; }
      .zj-deadline.is-late { color: var(--danger); background: var(--danger-soft); padding: 2px 6px; font-weight: 600; }
      .zj-next-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .zj-next-steps li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--paper); border: 1px solid var(--line); border-left: 4px solid var(--trust); flex-wrap: wrap; }
      .zj-next-steps li.is-warn { border-left-color: var(--amber); }
      .zj-plain-list { list-style: none; margin: 0; padding: 0; }
      .zj-offer-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin: 0; }
      .zj-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .zj-btn.is-small { padding: 5px 10px; font-size: 12px; }
      .zj-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .zj-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
      .zj-filters .zj-field { min-width: 180px; flex: 1; }
      .zj-align-end { align-self: flex-end; }
      .zj-subform { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px dashed var(--line); margin-bottom: 8px; }
      .zj-form-row { flex-wrap: wrap; }
      .zj-form-wide { max-width: 680px; }
      .zj-fieldset { border: 1px solid var(--line); padding: 12px; display: flex; flex-direction: column; gap: 8px; margin: 0; }
      .zj-fieldset legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
      .zj-field-error { color: var(--danger); font-size: 12px; margin: 0; }
      .zj-checkbox-inline { align-self: flex-end; padding-bottom: 8px; }
      .zj-notice { background: var(--amber-soft); color: var(--amber-text); padding: 10px 12px; font-size: 13px; margin: 0; }
      .zj-confirm { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; }
      .zj-score-box { margin-top: 8px; font-size: 12px; color: #3D4A46; }
      .zj-score-box ul, .zj-score-details ul { margin: 4px 0 0; padding-left: 18px; }
      .zj-score-details summary { cursor: pointer; font-size: 12px; font-weight: 600; }
      .zj-stepper { list-style: none; margin: 6px 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 0; }
      .zj-step { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 92px; padding-right: 10px; position: relative; font-size: 11px; color: #5c5544; }
      .zj-step-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); display: inline-flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; background: var(--paper); }
      .zj-step.is-done .zj-step-dot { background: var(--trust); border-color: var(--trust); color: #fff; }
      .zj-step.is-current .zj-step-dot { border-color: var(--trust); color: var(--trust); font-weight: 700; }
      .zj-step.is-current { color: var(--ink); font-weight: 600; }
      .zj-step.is-skipped { opacity: 0.55; }
      .zj-step-date { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }
      .zj-board { display: grid; grid-template-columns: repeat(5, minmax(170px, 1fr)); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
      .zj-board-col { background: var(--paper); border: 1px solid var(--line); padding: 10px; min-height: 120px; }
      .zj-board-title { font-size: 13px; margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; }
      .zj-board-list { display: flex; flex-direction: column; gap: 8px; }
      .zj-board-card { background: var(--paper-raised); border: 1px solid var(--line); padding: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
      .zj-board-card .zj-status { margin-left: 0; width: fit-content; }
      .zj-facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 12px 0 0; font-size: 13px; }
      .zj-facts dt { font-size: 11px; color: #5c5544; }
      .zj-facts dd { margin: 0; font-weight: 600; }
      .zj-questions-edit { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 12px; }
      .zj-questions-edit li { border-left: 2px solid rgba(43,94,167,0.25); padding-left: 12px; }
      .zj-answers { display: grid; gap: 8px; margin: 8px 0 0; font-size: 13px; }
      .zj-answers dt { font-size: 12px; color: #5F6773; }
      .zj-answers dd { margin: 0; font-weight: 600; }
      .zj-cover-note { white-space: pre-line; font-size: 13px; margin: 8px 0 0; }
      .zj-place { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #3D4A46; }
      .zj-place-chosen { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--line); background: var(--paper); }
      .zj-location-results { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
      .zj-location-option { width: 100%; text-align: left; border: 1px solid var(--line); background: var(--paper); padding: 7px 10px; cursor: pointer; color: var(--ink); }
      .zj-location-option:hover, .zj-location-option:focus-visible { border-color: var(--trust); outline: 2px solid var(--trust); outline-offset: 0; }
      @media (max-width: 900px) { .zj-board { grid-template-columns: repeat(5, 200px); } }

      @media (max-width: 640px) {
        .zj-header { flex-direction: column; align-items: stretch; }
        .zj-role-switch { justify-content: space-between; }
      }
    `}</style>
  );
}
