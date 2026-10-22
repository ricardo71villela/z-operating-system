// Candidate dashboard: overview, profile, offers & alerts, applications, account.
// Everything shown here is loaded from (and saved to) the API, so it survives a reload.
import React, { useMemo, useState } from "react";
import {
  ArrowRight, Award, Bell, Briefcase, Eye, FileText, GraduationCap, Languages, LogOut, Plus, Search, Trash2, User,
} from "lucide-react";
import { t } from "./messages.js";
import {
  ACTIVE_APPLICATION_STATUSES, APPLICATION_PATH, APPLICATION_TRANSITIONS, Field, Kpi, PILLAR_KEYS, SalaryLedger,
  SectionNav, Stepper, formatDate, pillarLabel, statusLabel, OfferPlace, normalizeText,
  ResponseDeadlineNote,
} from "./shared.jsx";

/* ---------------- Sign in / sign up ---------------- */

export function AuthPanel({ onLogin, onSignup, busy, headingId, intro }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const signupReady = name && email && password.length >= 12 && termsAccepted;

  function submit(e) {
    e.preventDefault();
    if (mode === "login") onLogin(email, password);
    else if (signupReady) onSignup(name, title, email, password, termsAccepted);
  }

  return (
    <section className="zj-panel" aria-labelledby={headingId}>
      <h1 id={headingId} className="zj-view-title">{mode === "login" ? t("login_title") : t("signup_title")}</h1>
      <p className="zj-panel-hint">{intro || (mode === "login" ? t("login_hint") : t("signup_hint"))}</p>
      <div className="zj-auth-switch" role="group" aria-label={t("auth_mode")}>
        <button type="button" className={`zj-section-btn ${mode === "login" ? "is-active" : ""}`} aria-pressed={mode === "login"} onClick={() => setMode("login")}>{t("login")}</button>
        <button type="button" className={`zj-section-btn ${mode === "signup" ? "is-active" : ""}`} aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>{t("create_account")}</button>
      </div>
      <form className="zj-form" onSubmit={submit}>
        {mode === "signup" && (
          <Field label={t("field_full_name")} required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ph_full_name")} autoComplete="name" required />
          </Field>
        )}
        <Field label={t("field_email")} required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("ph_email")} autoComplete="email" required />
        </Field>
        <Field label={t("field_password")} required hint={mode === "signup" ? t("password_hint") : undefined}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("ph_password")} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 12 : undefined} />
        </Field>
        {mode === "signup" && (
          <>
            <Field label={t("field_job_title")}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ph_job_title")} />
            </Field>
            <label className="zj-checkbox">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required />
              {t("accept_terms")}
            </label>
          </>
        )}
        <button type="submit" className="zj-btn is-primary" disabled={busy || !email || !password || (mode === "signup" && !signupReady)}>
          {mode === "login" ? t("login") : t("create_account")} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

/* ---------------- Relevance (explainable, never a black box) ---------------- */

const STOPWORDS = new Set([
  "para", "com", "uma", "que", "dos", "das", "the", "and", "for", "with", "our", "you",
  "your", "will", "have", "this", "from", "are", "not", "una", "per", "che", "les", "des",
  "notre", "votre", "cette", "entre", "comme", "aussi", "leurs", "nous", "vous", "pour", "avec", "dans",
]);

export function extractKeywords(text) {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

export function matchCVAgainstOffer(cvText, offerKeywords) {
  const haystack = cvText.toLowerCase();
  const matched = [];
  const missing = [];
  for (const kw of offerKeywords) {
    if (haystack.includes(kw.toLowerCase())) matched.push(kw); else missing.push(kw);
  }
  const matchRate = offerKeywords.length === 0 ? 1 : matched.length / offerKeywords.length;
  return { matchedKeywords: matched, missingKeywords: missing, matchRate };
}

/** Portal version of packages/domain/src/rules/matching.ts: keyword overlap, always explained. */
function computeOfferRelevance(offer, { skills, experiences }) {
  const cvText = [...(experiences || []).map((e) => `${e.title || ""} ${e.description || ""}`), ...(skills || [])].join(" ");
  const offerKeywords = extractKeywords(`${offer.title} ${offer.description}`);
  if ((skills || []).length === 0 && (experiences || []).length === 0) {
    return { score: null, level: "unknown", label: t("relevance_no_profile") };
  }
  if (offerKeywords.length === 0) return { score: null, level: "unknown", label: t("relevance_no_description") };
  const match = matchCVAgainstOffer(cvText, offerKeywords);
  if (match.matchRate >= 0.3) return { score: Math.round(match.matchRate * 100), level: "match", label: t("relevance_match", { count: match.matchedKeywords.length }) };
  if (match.matchedKeywords.length > 0) return { score: Math.round(match.matchRate * 100), level: "partial", label: t("relevance_partial", { count: match.matchedKeywords.length }) };
  return { score: 0, level: "mismatch", label: t("relevance_mismatch") };
}

/* ---------------- Dashboard ---------------- */

export function CandidateDashboard(props) {
  const { candidate, applications, offers, busy } = props;
  const [section, setSection] = useState("overview");

  const active = applications.filter((a) => ACTIVE_APPLICATION_STATUSES.includes(a.status));
  const interviews = applications.filter((a) => ["interview", "assessment", "offer"].includes(a.status));
  const sections = [
    { key: "overview", label: t("cand_nav_overview") },
    { key: "profile", label: t("cand_nav_profile") },
    { key: "offers", label: t("cand_nav_offers"), count: offers.length },
    { key: "applications", label: t("cand_nav_applications"), count: active.length },
    { key: "account", label: t("cand_nav_account") },
  ];

  return (
    <section className="zj-panel" aria-labelledby="cand-title">
      <div className="zj-panel-head">
        <div>
          <h1 id="cand-title" className="zj-view-title">{t("hello", { name: candidate.name || t("candidate_fallback_name") })}</h1>
          <p className="zj-panel-hint">{candidate.title || t("no_job_title")}</p>
        </div>
        {busy && <span className="zj-busy" role="status">{t("saving")}</span>}
      </div>

      <SectionNav label={t("cand_nav_label")} sections={sections} current={section} onChange={setSection} />

      {section === "overview" && (
        <Overview
          {...props}
          active={active}
          interviews={interviews}
          go={setSection}
        />
      )}
      {section === "profile" && <ProfileSection {...props} />}
      {section === "offers" && <OffersSection {...props} />}
      {section === "applications" && <ApplicationsSection {...props} />}
      {section === "account" && <AccountSection {...props} />}
    </section>
  );
}

function Overview({ completeness, applications, active, interviews, savedOfferIds, alerts, offers, go }) {
  const steps = [];
  if (completeness && completeness.score < 100) {
    steps.push({ key: "profile", text: t("next_complete_profile", { items: completeness.missing.slice(0, 3).join(", ") }), action: () => go("profile"), cta: t("cand_nav_profile") });
  }
  const offered = applications.find((a) => a.status === "offer");
  if (offered) steps.push({ key: "offer", text: t("next_answer_offer", { title: offered.offerTitle }), action: () => go("applications"), cta: t("cand_nav_applications") });
  if (applications.length === 0 && offers.length > 0) steps.push({ key: "apply", text: t("next_first_application", { count: offers.length }), action: () => go("offers"), cta: t("cand_nav_offers") });
  if (alerts.length === 0) steps.push({ key: "alert", text: t("next_create_alert"), action: () => go("offers"), cta: t("create_alert") });

  return (
    <div className="zj-dash-section" aria-labelledby="cand-overview-h">
      <h2 id="cand-overview-h" className="zj-visually-hidden">{t("cand_nav_overview")}</h2>
      <div className="zj-kpis">
        <Kpi label={t("kpi_profile")} value={`${completeness?.score ?? 0} %`} tone={(completeness?.score ?? 0) >= 80 ? "good" : "warn"} />
        <Kpi label={t("kpi_active_applications")} value={active.length} />
        <Kpi label={t("kpi_interviews")} value={interviews.length} tone={interviews.length > 0 ? "good" : undefined} />
        <Kpi label={t("kpi_saved")} value={savedOfferIds.length} />
      </div>

      <h3 className="zj-subhead">{t("next_steps")}</h3>
      {steps.length === 0 ? (
        <p className="zj-empty">{t("next_none")}</p>
      ) : (
        <ul className="zj-next-steps">
          {steps.map((s) => (
            <li key={s.key}>
              <span>{s.text}</span>
              <button type="button" className="zj-btn is-ghost" onClick={s.action}>{s.cta} <ArrowRight size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="zj-subhead">{t("recent_applications")}</h3>
      {applications.length === 0 ? (
        <p className="zj-empty">{t("applications_empty")}</p>
      ) : (
        <div className="zj-list">
          {applications.slice(0, 3).map((a) => <ApplicationSummary key={a.id} application={a} />)}
        </div>
      )}
    </div>
  );
}

function ApplicationSummary({ application: a }) {
  return (
    <div className="zj-list-row">
      <div>
        <strong>{a.offerTitle}</strong>
        <span className="zj-hint-inline"> · {a.organizationName}</span>
      </div>
      <span className={`zj-status status-${a.status}`}>{statusLabel(a.status)}</span>
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileSection({
  candidate, completeness, experiences, education, skills, languages, documents,
  onSaveProfile, onAddExperience, onAddEducation, onAddSkill, onAddLanguage, onAddDocument,
  offers, orgs, locale, onCheckCVQuality, onCheckCoverLetter,
}) {
  const [title, setTitle] = useState(candidate.title || "");
  const [summary, setSummary] = useState(candidate.summary || "");
  const dirty = title !== (candidate.title || "") || summary !== (candidate.summary || "");

  return (
    <div className="zj-dash-section" aria-labelledby="cand-profile-h">
      <h2 id="cand-profile-h" className="zj-section-title">{t("cand_nav_profile")}</h2>
      {completeness && (
        <div className="zj-completeness">
          <div className="zj-completeness-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completeness.score} aria-label={t("kpi_profile")}>
            <div className="zj-completeness-fill" style={{ width: `${completeness.score}%` }} />
          </div>
          <span className="zj-completeness-label">{t("profile_complete", { score: completeness.score })}</span>
          {completeness.missing.length > 0 && (
            <span className="zj-completeness-hint">{t("profile_missing", { items: completeness.missing.join(", ") })}</span>
          )}
        </div>
      )}

      <form className="zj-form" onSubmit={(e) => { e.preventDefault(); onSaveProfile({ title, summary }); }}>
        <Field label={t("field_job_title")}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ph_job_title")} />
        </Field>
        <Field label={t("section_summary")} hint={t("summary_hint")}>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t("ph_summary")} />
        </Field>
        <button type="submit" className="zj-btn is-primary" disabled={!dirty}>{t("save")}</button>
      </form>

      <h3 className="zj-subhead"><Briefcase size={14} aria-hidden="true" /> {t("section_experience")}</h3>
      <ExperienceForm onAdd={onAddExperience} />
      <div className="zj-list nested">
        {experiences.map((e) => (
          <div key={e.id} className="zj-list-row">
            <div>
              <strong>{e.title}</strong> — {e.companyName}
              {e.description && <p className="zj-exp-desc">{e.description}</p>}
            </div>
            <span className="zj-hint-inline">{e.startDate ? formatDate(e.startDate) : ""}{e.isCurrent ? t("experience_current") : ""}</span>
          </div>
        ))}
        {experiences.length === 0 && <p className="zj-empty">{t("experience_empty")}</p>}
      </div>

      <h3 className="zj-subhead"><GraduationCap size={14} aria-hidden="true" /> {t("section_education")}</h3>
      <EducationForm onAdd={onAddEducation} />
      <div className="zj-list nested">
        {education.map((e) => (
          <div key={e.id} className="zj-list-row">
            <div><strong>{e.degree}</strong>{e.fieldOfStudy ? ` ${t("education_in")} ${e.fieldOfStudy}` : ""}</div>
            <span className="zj-hint-inline">{e.institutionName}</span>
          </div>
        ))}
        {education.length === 0 && <p className="zj-empty">{t("education_empty")}</p>}
      </div>

      <h3 className="zj-subhead"><Award size={14} aria-hidden="true" /> {t("section_skills")}</h3>
      <TagInput items={skills} onAdd={onAddSkill} label={t("add_skill")} placeholder={t("ph_skill")} />

      <h3 className="zj-subhead"><Languages size={14} aria-hidden="true" /> {t("section_languages")}</h3>
      <TagInput items={languages} onAdd={onAddLanguage} label={t("add_language")} placeholder={t("ph_language")} />

      <h3 className="zj-subhead"><FileText size={14} aria-hidden="true" /> {t("section_documents")}</h3>
      <DocumentForm onAdd={onAddDocument} />
      <div className="zj-list nested">
        {documents.map((d) => (
          <div key={d.id} className="zj-list-row">
            <div><strong>{d.fileName}</strong></div>
            <span className="zj-hint-inline">{t(`doc_${d.docType}`)}</span>
          </div>
        ))}
        {documents.length === 0 && <p className="zj-empty">{t("documents_empty")}</p>}
      </div>

      <CVStudioPanel
        experiences={experiences}
        skills={skills}
        documents={documents}
        locale={locale}
        publishedOffers={offers}
        orgs={orgs}
        candidateId={candidate.id}
        onCheckCVQuality={onCheckCVQuality}
        onCheckCoverLetter={onCheckCoverLetter}
      />
    </div>
  );
}

function ExperienceForm({ onAdd }) {
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [description, setDescription] = useState("");
  function submit(e) {
    e.preventDefault();
    if (!companyName || !title || !startDate) return;
    onAdd({ companyName, title, startDate: `${startDate}-01`, isCurrent, description });
    setCompanyName(""); setTitle(""); setStartDate(""); setIsCurrent(false); setDescription("");
  }
  return (
    <form className="zj-subform" onSubmit={submit} aria-label={t("add_experience")}>
      <div className="zj-form-row">
        <Field label={t("ph_role")} required><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label={t("ph_company")} required><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></Field>
      </div>
      <div className="zj-form-row">
        <Field label={t("field_start_date")} required><input type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></Field>
        <label className="zj-checkbox zj-checkbox-inline"><input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} /> {t("field_current_job")}</label>
      </div>
      <Field label={t("field_experience_description")} hint={t("ph_experience_description")}>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <button type="submit" className="zj-btn is-ghost" disabled={!companyName || !title || !startDate}><Plus size={14} aria-hidden="true" /> {t("add_experience")}</button>
    </form>
  );
}

function EducationForm({ onAdd }) {
  const [institutionName, setInstitutionName] = useState("");
  const [degree, setDegree] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  function submit(e) {
    e.preventDefault();
    if (!institutionName || !degree) return;
    onAdd({ institutionName, degree, fieldOfStudy });
    setInstitutionName(""); setDegree(""); setFieldOfStudy("");
  }
  return (
    <form className="zj-subform" onSubmit={submit} aria-label={t("add_education")}>
      <div className="zj-form-row">
        <Field label={t("ph_degree")} required><input value={degree} onChange={(e) => setDegree(e.target.value)} required /></Field>
        <Field label={t("ph_field_of_study")}><input value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} /></Field>
        <Field label={t("ph_institution")} required><input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} required /></Field>
      </div>
      <button type="submit" className="zj-btn is-ghost" disabled={!institutionName || !degree}><Plus size={14} aria-hidden="true" /> {t("add_education")}</button>
    </form>
  );
}

function DocumentForm({ onAdd }) {
  const [docType, setDocType] = useState("cv");
  const [fileName, setFileName] = useState("");
  function submit(e) {
    e.preventDefault();
    if (!fileName) return;
    onAdd({ docType, fileName });
    setFileName("");
  }
  return (
    <form className="zj-subform" onSubmit={submit} aria-label={t("add_document")}>
      <div className="zj-form-row">
        <Field label={t("field_doc_type")}>
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="cv">{t("doc_cv")}</option>
            <option value="certificate">{t("doc_certificate")}</option>
            <option value="portfolio">{t("doc_portfolio")}</option>
            <option value="cover_letter">{t("doc_cover_letter")}</option>
          </select>
        </Field>
        <Field label={t("ph_file_name")}><input value={fileName} onChange={(e) => setFileName(e.target.value)} /></Field>
      </div>
      <button type="submit" className="zj-btn is-ghost" disabled={!fileName}><Plus size={14} aria-hidden="true" /> {t("add_document")}</button>
    </form>
  );
}

function TagInput({ items, onAdd, label, placeholder }) {
  const [value, setValue] = useState("");
  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  }
  return (
    <div>
      <form className="zj-inline-form" onSubmit={submit}>
        <Field label={label}><input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <button type="submit" className="zj-btn is-ghost zj-align-end" disabled={!value.trim()}><Plus size={14} aria-hidden="true" /> {t("add")}</button>
      </form>
      <ul className="zj-tags" aria-label={label}>
        {items.map((it) => <li key={it} className="zj-tag">{it}</li>)}
      </ul>
      {items.length === 0 && <p className="zj-empty">{t("tags_empty")}</p>}
    </div>
  );
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

  async function handleCheckQuality() {
    setQualityBusy(true);
    try {
      const result = await onCheckCVQuality(candidateId, {
        locale: locale || "fr",
        experiences,
        skills,
        certifications: certifications.map((c) => c.fileName || t("default_certification")),
        hasPortfolioLink,
      });
      setQuality(result);
    } catch (err) {
      setQuality({ score: null, signals: [{ code: "ERROR", message: t("check_failed", { error: err.message }) }] });
    } finally {
      setQualityBusy(false);
    }
  }

  const selectedOffer = publishedOffers.find((o) => o.id === selectedOfferId) || null;
  const employerName = selectedOffer ? (orgs?.find((o) => o.id === selectedOffer.organizationId)?.legalName || selectedOffer.organizationName) : undefined;

  const keywordMatch = useMemo(() => {
    if (!selectedOffer) return null;
    const cvText = [...experiences.map((e) => e.description || ""), ...(skills || [])].join(" ");
    return matchCVAgainstOffer(cvText, extractKeywords(selectedOffer.description));
  }, [selectedOffer, experiences, skills]);

  async function handleCheckLetter() {
    if (!selectedOffer) return;
    setLetterBusy(true);
    try {
      const result = await onCheckCoverLetter(candidateId, { bodyText: coverLetterText, employerName, jobOfferTitle: selectedOffer.title });
      setLetterCheck(result);
    } catch (err) {
      setLetterCheck({ personalized: false, checks: [{ code: "ERROR", message: t("check_failed", { error: err.message }) }] });
    } finally {
      setLetterBusy(false);
    }
  }

  return (
    <>
      <h3 className="zj-subhead"><FileText size={14} aria-hidden="true" /> {t("cv_studio_title")}</h3>
      <p className="zj-panel-hint">{t("cv_studio_hint")}</p>
      <button type="button" className="zj-btn is-ghost" onClick={handleCheckQuality} disabled={qualityBusy}>
        {qualityBusy ? t("checking") : t("analyse_cv")}
      </button>
      <div aria-live="polite">
        {quality && (
          <div className="zj-cv-quality">
            <div className="zj-completeness-track">
              <div className="zj-completeness-fill" style={{ width: `${quality.score ?? 0}%`, background: (quality.score ?? 0) >= 70 ? "var(--trust)" : "var(--danger)" }} />
            </div>
            <span className="zj-completeness-label">{t("cv_strength", { score: quality.score ?? "—" })}</span>
          </div>
        )}
        {quality && quality.signals.length > 0 ? (
          <ul className="zj-cv-signals">
            {quality.signals.map((s) => <li key={s.code} className="zj-cv-signal">{s.code === "ERROR" ? s.message : t(`cv_${s.code}`)}</li>)}
          </ul>
        ) : quality ? <p className="zj-empty">{t("cv_no_signals")}</p> : null}
      </div>

      <div className="zj-cv-target">
        <Field label={t("test_against_offer")}>
          <select value={selectedOfferId} onChange={(e) => setSelectedOfferId(e.target.value)}>
            <option value="">{t("choose_offer")}</option>
            {publishedOffers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </Field>
        {selectedOffer && keywordMatch && (
          <div className="zj-cv-match" aria-live="polite">
            <span className="zj-completeness-label">{t("keyword_match", { rate: Math.round(keywordMatch.matchRate * 100) })}</span>
            {keywordMatch.missingKeywords.length > 0 && (
              <ul className="zj-tags" aria-label={t("missing_keywords")}>
                {keywordMatch.missingKeywords.map((kw) => <li key={kw} className="zj-tag zj-tag-missing">{kw}</li>)}
              </ul>
            )}
          </div>
        )}
        {selectedOffer && (
          <>
            <Field label={t("cover_letter_for", { title: selectedOffer.title })}>
              <textarea className="zj-summary" rows={4} value={coverLetterText} onChange={(e) => setCoverLetterText(e.target.value)} placeholder={t("ph_cover_letter")} />
            </Field>
            <button type="button" className="zj-btn is-ghost" onClick={handleCheckLetter} disabled={letterBusy || !coverLetterText.trim()}>
              {letterBusy ? t("checking") : t("check_letter")}
            </button>
            <div aria-live="polite">
              {letterCheck && (letterCheck.personalized ? (
                <p className="zj-empty">{t("letter_ok")}</p>
              ) : (
                <ul className="zj-cv-signals">
                  {letterCheck.checks.map((c) => (
                    <li key={c.code} className="zj-cv-signal">{c.code === "ERROR" ? c.message : t(`letter_${c.code}`, { employer: employerName, title: selectedOffer.title })}</li>
                  ))}
                </ul>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- Offers & alerts ---------------- */

function OffersSection({
  offers, skills, experiences, savedOfferIds, applications, onToggleSaved, onApply, onOpenOffer,
  alerts, onCreateAlert, onDeleteAlert,
}) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [pillar, setPillar] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const appliedIds = new Set(applications.map((a) => a.jobOfferId));
  const q = query.trim().toLowerCase();
  const placeKey = normalizeText(place);

  const rows = offers
    .filter((o) => !pillar || o.pillar === pillar)
    .filter((o) => !onlySaved || savedOfferIds.includes(o.id))
    .filter((o) => !q || `${o.title} ${o.description}`.toLowerCase().includes(q))
    .filter((o) => !placeKey || (o.location && normalizeText(`${o.location.city} ${o.location.postalCode || ""} ${o.location.adminArea || ""}`).includes(placeKey)))
    .map((o) => ({ offer: o, relevance: computeOfferRelevance(o, { skills, experiences }) }))
    .sort((a, b) => (b.relevance.score ?? -1) - (a.relevance.score ?? -1));

  return (
    <div className="zj-dash-section" aria-labelledby="cand-offers-h">
      <h2 id="cand-offers-h" className="zj-section-title">{t("offers_for_you")}</h2>
      <p className="zj-panel-hint">{t("offers_for_you_hint")}</p>

      <form className="zj-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <Field label={t("filter_keywords")}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("ph_filter_keywords")} />
        </Field>
        <Field label={t("filter_place")}>
          <input type="search" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("ph_filter_place")} />
        </Field>
        <Field label={t("field_pillar")}>
          <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="">{t("all_pillars")}</option>
            {PILLAR_KEYS.map((k) => <option key={k} value={k}>{pillarLabel(k)}</option>)}
          </select>
        </Field>
        <label className="zj-checkbox zj-align-end"><input type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} /> {t("only_saved")}</label>
      </form>

      <p className="zj-hint-inline" aria-live="polite">{t("results_count", { count: rows.length })}</p>
      <ul className="zj-list zj-plain-list">
        {rows.map(({ offer: o, relevance }) => {
          const saved = savedOfferIds.includes(o.id);
          const applied = appliedIds.has(o.id);
          return (
            <li key={o.id} className="zj-list-row is-column">
              <div className="zj-list-row-top">
                <div className="zj-relevance-row">
                  {relevance.score !== null && <span className={`zj-relevance-badge is-${relevance.level}`}>{relevance.score} %</span>}
                  <h3 className="zj-offer-title">{o.title}</h3>
                </div>
                <span className="zj-hint-inline">{pillarLabel(o.pillar)}</span>
              </div>
              <OfferPlace location={o.location} workRegime={o.workRegime} />
              <p className="zj-exp-desc">{relevance.label}</p>
              <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
              <div className="zj-actions">
                <button type="button" className="zj-btn is-ghost" onClick={() => onOpenOffer(o.id)}><Eye size={14} aria-hidden="true" /> {t("view_offer")}<span className="zj-visually-hidden"> {o.title}</span></button>
                <button type="button" className="zj-btn is-ghost" aria-pressed={saved} onClick={() => onToggleSaved(o.id, saved)}>
                  {saved ? t("saved") : t("save")}<span className="zj-visually-hidden"> {o.title}</span>
                </button>
                <button type="button" className="zj-btn is-primary" disabled={applied} onClick={() => onApply(o.id)}>
                  {applied ? t("already_applied") : t("apply")}<span className="zj-visually-hidden"> {o.title}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="zj-empty">{offers.length === 0 ? t("no_published_offers") : t("no_results")}</p>}

      <h3 className="zj-subhead"><Bell size={14} aria-hidden="true" /> {t("alerts_title")}</h3>
      <p className="zj-panel-hint">{t("alerts_hint")}</p>
      <AlertForm onCreate={onCreateAlert} defaultQuery={query} defaultPillar={pillar} />
      <ul className="zj-list zj-plain-list">
        {alerts.map((a) => (
          <li key={a.id} className="zj-list-row">
            <span>
              <Search size={13} aria-hidden="true" /> {a.queryParams?.keywords || t("alert_any_keywords")}
              {a.queryParams?.pillar ? ` · ${pillarLabel(a.queryParams.pillar)}` : ""}
            </span>
            <button type="button" className="zj-btn is-ghost is-danger" onClick={() => onDeleteAlert(a.id)}>
              <Trash2 size={14} aria-hidden="true" /> {t("delete")}<span className="zj-visually-hidden"> {a.queryParams?.keywords || ""}</span>
            </button>
          </li>
        ))}
      </ul>
      {alerts.length === 0 && <p className="zj-empty">{t("alerts_empty")}</p>}
    </div>
  );
}

function AlertForm({ onCreate, defaultQuery, defaultPillar }) {
  const [keywords, setKeywords] = useState(defaultQuery || "");
  const [pillar, setPillar] = useState(defaultPillar || "");
  return (
    <form className="zj-filters" onSubmit={(e) => { e.preventDefault(); onCreate({ keywords: keywords.trim(), pillar: pillar || undefined }); setKeywords(""); }}>
      <Field label={t("filter_keywords")}><input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t("ph_filter_keywords")} /></Field>
      <Field label={t("field_pillar")}>
        <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
          <option value="">{t("all_pillars")}</option>
          {PILLAR_KEYS.map((k) => <option key={k} value={k}>{pillarLabel(k)}</option>)}
        </select>
      </Field>
      <button type="submit" className="zj-btn is-ghost zj-align-end"><Bell size={14} aria-hidden="true" /> {t("create_alert")}</button>
    </form>
  );
}

/* ---------------- Applications ---------------- */

function ApplicationsSection({ applications, onWithdraw, onFetchMyScore }) {
  return (
    <div className="zj-dash-section" aria-labelledby="cand-apps-h">
      <h2 id="cand-apps-h" className="zj-section-title">{t("my_applications")}</h2>
      {applications.length === 0 && <p className="zj-empty">{t("applications_empty")}</p>}
      <ul className="zj-list zj-plain-list">
        {applications.map((a) => <ApplicationCard key={a.id} application={a} onWithdraw={onWithdraw} onFetchMyScore={onFetchMyScore} />)}
      </ul>
    </div>
  );
}

function ApplicationCard({ application: a, onWithdraw, onFetchMyScore }) {
  const [score, setScore] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const ended = ["rejected", "withdrawn", "closed"].includes(a.status);
  const reached = Math.max(...(a.history || []).map((h) => APPLICATION_PATH.indexOf(h.to)), 0);
  const currentIndex = ended ? reached : Math.max(APPLICATION_PATH.indexOf(a.status), reached);
  const dateFor = (status) => (a.history || []).find((h) => h.to === status)?.at;
  const steps = APPLICATION_PATH.map((s) => ({ key: s, label: statusLabel(s), date: dateFor(s) ? formatDate(dateFor(s)) : undefined }));
  const lastChange = (a.history || []).at(-1)?.at || a.createdAt;

  async function showScore() {
    try {
      const app = await onFetchMyScore(a.id);
      setScore(app.myScoreForThisOffer || { error: t("no_score_yet") });
    } catch (err) {
      setScore({ error: err.message });
    }
  }

  return (
    <li className="zj-list-row is-column">
      <div className="zj-list-row-top">
        <div>
          <h3 className="zj-offer-title">{a.offerTitle}</h3>
          <span className="zj-hint-inline">{a.organizationName} · {t("applied_on", { date: formatDate(a.createdAt) })} · {t("last_update", { date: formatDate(lastChange) })}</span>
        </div>
        <span className={`zj-status status-${a.status}`}>{statusLabel(a.status)}</span>
      </div>
      <ResponseDeadlineNote response={a.response} audience="candidate" />
      <Stepper steps={steps} currentIndex={currentIndex} ended={ended} label={t("application_progress", { title: a.offerTitle })} />
      {ended && <p className="zj-hint-inline">{t(`ended_${a.status}`)}</p>}
      <div className="zj-actions">
        <button type="button" className="zj-btn is-ghost" onClick={showScore}>{t("show_my_score")}</button>
        {APPLICATION_TRANSITIONS[a.status]?.includes("withdrawn") && !confirming && (
          <button type="button" className="zj-btn is-ghost is-danger" onClick={() => setConfirming(true)}>{t("withdraw")}</button>
        )}
        {confirming && (
          <span className="zj-confirm" role="group" aria-label={t("withdraw_confirm_label")}>
            {t("withdraw_confirm")}
            <button type="button" className="zj-btn is-primary" onClick={() => { onWithdraw(a.id); setConfirming(false); }}>{t("withdraw")}</button>
            <button type="button" className="zj-btn is-ghost" onClick={() => setConfirming(false)}>{t("cancel")}</button>
          </span>
        )}
      </div>
      <div aria-live="polite">
        {score && !score.error && (
          <div className="zj-score-box">
            <strong>{t("score_line", { score: score.score })}</strong>{t("score_note")}
            <ul>{(score.factors || []).map((f, i) => <li key={i}>{f.explanation || f.messageKey}</li>)}</ul>
          </div>
        )}
        {score && score.error && <p className="zj-empty">{score.error}</p>}
      </div>
    </li>
  );
}

/* ---------------- Account ---------------- */

function AccountSection({ onLogout, onDeleteAccount }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="zj-dash-section" aria-labelledby="cand-account-h">
      <h2 id="cand-account-h" className="zj-section-title">{t("account_settings")}</h2>
      <button type="button" className="zj-btn is-ghost" onClick={onLogout}><LogOut size={14} aria-hidden="true" /> {t("logout")}</button>
      <h3 className="zj-subhead">{t("delete_account")}</h3>
      {!confirming ? (
        <button type="button" className="zj-btn is-ghost is-danger" onClick={() => setConfirming(true)}><User size={14} aria-hidden="true" /> {t("delete_account")}</button>
      ) : (
        <div className="zj-report-box" role="group" aria-label={t("delete_account")}>
          <p>{t("delete_account_warning")}</p>
          <div className="zj-actions">
            <button type="button" className="zj-btn is-primary" onClick={onDeleteAccount}>{t("delete_account_confirm")}</button>
            <button type="button" className="zj-btn is-ghost" onClick={() => setConfirming(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
