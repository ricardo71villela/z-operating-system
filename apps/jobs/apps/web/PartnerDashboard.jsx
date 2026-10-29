// Partner (employer) dashboard: overview & to-dos, offers, candidate pipeline, new offer.
// Offers and applications come from the API, so the dashboard survives a reload.
import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Award, Building2, Plus, Users } from "lucide-react";
import { t } from "./messages.js";
import { LOCALES } from "./messages.js";
import {
  APPLICATION_TRANSITIONS, CONTRACT_TYPES, Field, Kpi, PILLAR_KEYS, SalaryLedger, SectionNav, Stepper,
  TEMP_AGENCY_CONTRACT_TYPES, VerificationBadge, formatDate, offerStatusLabel, pillarLabel, statusLabel,
  LocationPicker, OfferPlace, companyPageUrl, naceSectionLabel, ResponseDeadlineNote, MessageThread,
} from "./shared.jsx";
import { QuestionsEditor, OfferQuestions, ApplicationAnswers } from "./ScreeningQuestions.jsx";

const PIPELINE_COLUMNS = [
  { key: "new", statuses: ["submitted", "received"] },
  { key: "review", statuses: ["screening", "shortlisted"] },
  { key: "interview", statuses: ["interview", "assessment"] },
  { key: "offer", statuses: ["offer"] },
  { key: "closed", statuses: ["hired", "rejected", "withdrawn", "closed"] },
];
const TO_PROCESS = ["submitted", "received"];

const sumStatuses = (offer, statuses) => statuses.reduce((n, s) => n + (offer.applicationsByStatus?.[s] || 0), 0);

export function OrganizationSetup({ orgs, onCreateOrg, onSelectOrg, busy }) {
  const [legalName, setLegalName] = useState("");
  return (
    <section className="zj-panel" aria-labelledby="org-setup-h">
      <h1 id="org-setup-h" className="zj-view-title">{orgs.length > 0 ? t("choose_org_title") : t("create_org_title")}</h1>
      <p className="zj-panel-hint">{t("create_org_hint")}</p>
      {orgs.length > 0 && (
        <ul className="zj-list zj-plain-list">
          {orgs.map((o) => (
            <li key={o.id} className="zj-list-row">
              <span><strong>{o.legalName}</strong> <VerificationBadge status={o.verificationStatus} /></span>
              <button type="button" className="zj-btn is-ghost" onClick={() => onSelectOrg(o.id)}>{t("select")}<span className="zj-visually-hidden"> {o.legalName}</span></button>
            </li>
          ))}
        </ul>
      )}
      <form className="zj-form" onSubmit={(e) => { e.preventDefault(); if (legalName) onCreateOrg(legalName); }}>
        <h2 className="zj-subhead">{t("create_org_title")}</h2>
        <Field label={t("field_legal_name")} required>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder={t("ph_legal_name")} required />
        </Field>
        <button type="submit" className="zj-btn is-primary" disabled={!legalName || busy}>
          {t("create_org")} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

export function PartnerDashboard(props) {
  const { org, orgs, offers, onSelectOrg, busy } = props;
  const [section, setSection] = useState("overview");
  const [focusOfferId, setFocusOfferId] = useState(null);

  const toProcess = offers.reduce((n, o) => n + sumStatuses(o, TO_PROCESS), 0);
  const sections = [
    { key: "overview", label: t("org_nav_overview") },
    { key: "offers", label: t("org_nav_offers"), count: offers.length },
    { key: "candidates", label: t("org_nav_candidates"), count: toProcess },
    { key: "new", label: t("org_nav_new_offer") },
    { key: "profile", label: t("org_nav_profile") },
  ];
  function openCandidates(offerId) {
    setFocusOfferId(offerId);
    setSection("candidates");
  }

  return (
    <section className="zj-panel" aria-labelledby="org-title">
      <div className="zj-panel-head">
        <div>
          <h1 id="org-title" className="zj-view-title">{org.legalName}</h1>
          <VerificationBadge status={org.verificationStatus} />
        </div>
        <div className="zj-actions">
          {busy && <span className="zj-busy" role="status">{t("saving")}</span>}
          {orgs.length > 1 && (
            <Field label={t("switch_org")}>
              <select value={org.id} onChange={(e) => onSelectOrg(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.legalName}</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      <SectionNav label={t("org_nav_label")} sections={sections} current={section} onChange={setSection} />

      {section === "overview" && <OrgOverview {...props} toProcess={toProcess} go={setSection} openCandidates={openCandidates} />}
      {section === "offers" && <OffersList {...props} openCandidates={openCandidates} go={setSection} />}
      {section === "candidates" && <Pipeline {...props} focusOfferId={focusOfferId} setFocusOfferId={setFocusOfferId} />}
      {section === "profile" && <PublicProfileForm {...props} />}
      {section === "new" && (
        <div className="zj-dash-section" aria-labelledby="org-new-h">
          <h2 id="org-new-h" className="zj-section-title">{t("create_offer")}</h2>
          {org.verificationStatus !== "verified" && org.verificationStatus !== "enhanced_verified" ? (
            <div className="zj-notice">
              <p>{t(org.verificationStatus === "pending" ? "offer_needs_verification_pending" : "offer_needs_verification")}</p>
              {org.verificationStatus !== "pending" && props.onRequestVerification && (
                <button type="button" className="zj-btn is-primary" onClick={() => props.onRequestVerification(org.id)}>{t("request_verification")}</button>
              )}
            </div>
          ) : (
            <OfferForm onSearchLocations={props.onSearchLocations} onCreate={async (draft, questions) => { const ok = await props.onCreateOffer(org.id, draft, questions); if (ok) setSection("offers"); }} />
          )}
        </div>
      )}
    </section>
  );
}

function OrgOverview({ org, offers, toProcess, go, openCandidates, onRequestVerification, onViewResponsibility }) {
  const verified = org.verificationStatus === "verified" || org.verificationStatus === "enhanced_verified";
  const verifIndex = verified ? 2 : org.verificationStatus === "pending" ? 1 : 0;
  const published = offers.filter((o) => o.status === "published");
  const inReview = offers.filter((o) => o.status === "pending_review" || o.status === "approved");
  const toFix = offers.filter((o) => o.status === "needs_changes");
  const drafts = offers.filter((o) => o.status === "draft");
  const hires = offers.reduce((n, o) => n + (o.applicationsByStatus?.hired || 0), 0);
  const overdue = offers.reduce((n, o) => n + (o.overdueApplications || 0), 0);

  const todos = [];
  if (org.verificationStatus === "unverified") todos.push({ key: "verify", text: t("todo_request_verification"), cta: t("request_verification"), action: () => onRequestVerification(org.id) });
  for (const o of toFix) todos.push({ key: `fix-${o.id}`, text: t("todo_fix_offer", { title: o.title }), cta: t("org_nav_offers"), action: () => go("offers"), tone: "warn" });
  for (const o of drafts) todos.push({ key: `draft-${o.id}`, text: t("todo_submit_draft", { title: o.title }), cta: t("org_nav_offers"), action: () => go("offers") });
  for (const o of offers) {
    if (o.overdueApplications > 0) todos.push({ key: `late-${o.id}`, text: t("todo_overdue", { count: o.overdueApplications, title: o.title }), cta: t("org_nav_candidates"), action: () => openCandidates(o.id), tone: "warn" });
  }
  for (const o of offers) {
    const n = sumStatuses(o, TO_PROCESS);
    if (n > 0) todos.push({ key: `apps-${o.id}`, text: t("todo_new_applications", { count: n, title: o.title }), cta: t("org_nav_candidates"), action: () => openCandidates(o.id) });
  }
  if (offers.length === 0) todos.push({ key: "first", text: t("todo_first_offer"), cta: t("org_nav_new_offer"), action: () => go("new") });

  return (
    <div className="zj-dash-section" aria-labelledby="org-overview-h">
      <h2 id="org-overview-h" className="zj-visually-hidden">{t("org_nav_overview")}</h2>
      <Stepper
        label={t("verification_steps")}
        currentIndex={verifIndex}
        steps={[
          { key: "created", label: t("verif_step_created") },
          { key: "requested", label: t("verif_step_requested") },
          { key: "verified", label: t("verif_step_verified") },
        ]}
      />
      {org.verificationStatus === "pending" && <p className="zj-panel-hint">{t("verification_pending_hint")}</p>}

      <div className="zj-kpis">
        <Kpi label={t("kpi_published")} value={published.length} />
        <Kpi label={t("kpi_in_review")} value={inReview.length} />
        <Kpi label={t("kpi_to_fix")} value={toFix.length} tone={toFix.length > 0 ? "warn" : undefined} />
        <Kpi label={t("kpi_to_process")} value={toProcess} tone={toProcess > 0 ? "warn" : undefined} hint={t("kpi_to_process_hint")} />
        <Kpi label={t("kpi_overdue")} value={overdue} tone={overdue > 0 ? "bad" : "good"} hint={t("kpi_overdue_hint")} />
        <Kpi label={t("kpi_hires")} value={hires} tone={hires > 0 ? "good" : undefined} />
      </div>

      <p className="zj-panel-hint">{t("deadline_rule")}</p>

      <h3 className="zj-subhead">{t("todo_title")}</h3>
      {todos.length === 0 ? <p className="zj-empty">{t("todo_none")}</p> : (
        <ul className="zj-next-steps">
          {todos.map((s) => (
            <li key={s.key} className={s.tone === "warn" ? "is-warn" : ""}>
              <span>{s.text}</span>
              <button type="button" className="zj-btn is-ghost" onClick={s.action}>{s.cta} <ArrowRight size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}

      {verified && (
        <>
          <h3 className="zj-subhead">{t("eri_title")}</h3>
          <p className="zj-panel-hint">{t("eri_dashboard_hint")}</p>
          <button type="button" className="zj-btn is-ghost" onClick={onViewResponsibility}><Award size={14} aria-hidden="true" /> {t("view_my_eri")}</button>
        </>
      )}
    </div>
  );
}

function OffersList({ offers, onSubmitForReview, openCandidates, translations, onAddTranslation, onFetchPoolInsight, onLoadQuestions, onSaveQuestions, go }) {
  const [poolByOffer, setPoolByOffer] = useState({});
  async function showPool(offerId) {
    try {
      const insight = await onFetchPoolInsight(offerId);
      setPoolByOffer((p) => ({ ...p, [offerId]: insight }));
    } catch (err) {
      setPoolByOffer((p) => ({ ...p, [offerId]: { error: err.message } }));
    }
  }
  return (
    <div className="zj-dash-section" aria-labelledby="org-offers-h">
      <div className="zj-list-row-top">
        <h2 id="org-offers-h" className="zj-section-title">{t("my_offers")}</h2>
        <button type="button" className="zj-btn is-primary" onClick={() => go("new")}><Plus size={14} aria-hidden="true" /> {t("org_nav_new_offer")}</button>
      </div>
      {offers.length === 0 && <p className="zj-empty">{t("offers_empty")}</p>}
      <ul className="zj-list zj-plain-list">
        {offers.map((o) => {
          const total = Object.values(o.applicationsByStatus || {}).reduce((a, b) => a + b, 0);
          const pending = sumStatuses(o, TO_PROCESS);
          return (
            <li key={o.id} className="zj-list-row is-column">
              <div className="zj-list-row-top">
                <h3 className="zj-offer-title">{o.title}</h3>
                <span className={`zj-status status-${o.status}`}>{offerStatusLabel(o.status)}</span>
              </div>
              <span className="zj-hint-inline">{pillarLabel(o.pillar)} · {t(`contract_${o.contractType}`)} · {t("created_on", { date: formatDate(o.createdAt) })}</span>
              <OfferPlace location={o.location} workRegime={o.workRegime} />
              <SalaryLedger min={o.salaryMin} max={o.salaryMax} currencyCode={o.salaryCurrency} period={o.salaryPeriod} fixed={o.hasFixedSalary} />
              <p className="zj-hint-inline">{t(`offer_status_help_${o.status}`)}</p>
              {o.issues?.length > 0 && (
                <ul className="zj-issues" aria-label={t("issues_to_fix")}>
                  {o.issues.map((i) => (
                    <li key={i.code}><AlertTriangle size={12} aria-hidden="true" /> {t(`issue_${i.code}`) === `issue_${i.code}` ? i.message : t(`issue_${i.code}`)}</li>
                  ))}
                </ul>
              )}
              <div className="zj-actions">
                {o.status === "draft" && (
                  <button type="button" className="zj-btn is-primary" onClick={() => onSubmitForReview(o.id)}>{t("submit_for_review")}<span className="zj-visually-hidden"> {o.title}</span></button>
                )}
                {(o.status === "published" || total > 0) && (
                  <button type="button" className="zj-btn is-ghost" onClick={() => openCandidates(o.id)}>
                    <Users size={14} aria-hidden="true" /> {t("view_candidates", { count: total })}{pending > 0 ? ` · ${t("new_count", { count: pending })}` : ""}{o.overdueApplications > 0 ? ` · ${t("offer_overdue", { count: o.overdueApplications })}` : ""}<span className="zj-visually-hidden"> {o.title}</span>
                  </button>
                )}
                {o.status === "published" && (
                  <button type="button" className="zj-btn is-ghost" onClick={() => showPool(o.id)}>{t("view_pool")}<span className="zj-visually-hidden"> {o.title}</span></button>
                )}
              </div>
              <div aria-live="polite">
                {poolByOffer[o.id] && !poolByOffer[o.id].error && (
                  <p className="zj-hint-inline">{t("pool_line", { matching: poolByOffer[o.id].matchingCandidatesEstimate, total: poolByOffer[o.id].totalOpenCandidatesOnPlatform })} {poolByOffer[o.id].scopeNote}</p>
                )}
                {poolByOffer[o.id]?.error && <p className="zj-empty">{poolByOffer[o.id].error}</p>}
              </div>
              {(o.status === "draft" || o.status === "needs_changes") && onLoadQuestions && (
                <OfferQuestions offerId={o.id} onLoad={onLoadQuestions} onSave={onSaveQuestions} />
              )}
              {o.status === "published" && <TranslationEditor offerId={o.id} translations={translations} onAdd={onAddTranslation} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TranslationEditor({ offerId, translations, onAdd }) {
  const [targetLocale, setTargetLocale] = useState("en");
  const [value, setValue] = useState("");
  const existing = translations.filter((x) => x.entityId === offerId && x.field === "title");
  return (
    <form className="zj-translation-editor" onSubmit={(e) => { e.preventDefault(); onAdd(offerId, "title", targetLocale, value); setValue(""); }}>
      <span className="zj-hint-inline">{t("title_translations")}</span>
      <div className="zj-tags">
        {existing.map((x) => <span key={x.locale} className="zj-tag">{x.locale.toUpperCase()}: {x.value}</span>)}
        {existing.length === 0 && <span className="zj-empty">{t("title_translations_empty")}</span>}
      </div>
      <div className="zj-form-row">
        <Field label={t("field_language")}>
          <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)}>
            {LOCALES.filter((l) => l.code !== "fr").map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </Field>
        <Field label={t("ph_translated_title")}><input value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <button type="submit" className="zj-btn is-ghost zj-align-end" disabled={!value.trim()}><Plus size={14} aria-hidden="true" /> {t("add_translation")}</button>
      </div>
    </form>
  );
}

function Pipeline({ offers, focusOfferId, setFocusOfferId, onLoadApplications, onLoadScores, onTransition, onLoadMessages, onSendMessage }) {
  const candidates = offers.filter((o) => o.status === "published" || Object.keys(o.applicationsByStatus || {}).length > 0);
  const offerId = focusOfferId && candidates.some((o) => o.id === focusOfferId) ? focusOfferId : candidates[0]?.id;
  const offer = candidates.find((o) => o.id === offerId);
  const [apps, setApps] = useState(null);
  const [scores, setScores] = useState({});
  const [error, setError] = useState(null);

  async function load() {
    if (!offerId) return;
    setError(null);
    try {
      const list = await onLoadApplications(offerId);
      setApps(list);
      try {
        const scored = await onLoadScores(offerId);
        setScores(Object.fromEntries((scored || []).map((s) => [s.applicationId, s.score])));
      } catch { setScores({}); }
    } catch (err) {
      setError(err.message);
      setApps([]);
    }
  }
  useEffect(() => { setApps(null); load(); }, [offerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function move(appId, to) {
    const updated = await onTransition(appId, to);
    if (updated) setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...updated } : a)));
  }

  return (
    <div className="zj-dash-section" aria-labelledby="org-cands-h">
      <h2 id="org-cands-h" className="zj-section-title">{t("org_nav_candidates")}</h2>
      {candidates.length === 0 ? <p className="zj-empty">{t("pipeline_no_offers")}</p> : (
        <>
          <Field label={t("pipeline_offer")}>
            <select value={offerId} onChange={(e) => setFocusOfferId(e.target.value)}>
              {candidates.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </Field>
          <p className="zj-panel-hint">{t("pipeline_anonymous_note")}</p>
          {error && <p className="zj-empty" role="alert">{error}</p>}
          {apps === null && <p className="zj-empty" role="status">{t("loading")}</p>}
          {apps && apps.length === 0 && !error && <p className="zj-empty">{t("applications_none")}</p>}
          {apps && apps.length > 0 && (
            <div className="zj-board">
              {PIPELINE_COLUMNS.map((col) => {
                const inCol = apps.filter((a) => col.statuses.includes(a.status));
                return (
                  <section key={col.key} className="zj-board-col" aria-labelledby={`col-${col.key}`}>
                    <h3 id={`col-${col.key}`} className="zj-board-title">{t(`pipeline_col_${col.key}`)} <span className="zj-section-count">{inCol.length}</span></h3>
                    <ul className="zj-plain-list zj-board-list">
                      {inCol.map((a) => <PipelineCard key={a.id} application={a} score={scores[a.id]} offerTitle={offer?.title} onMove={move} onLoadMessages={onLoadMessages} onSendMessage={onSendMessage} />)}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PipelineCard({ application: a, score, onMove, onLoadMessages, onSendMessage }) {
  const label = t("application_ref", { ref: a.id.slice(0, 6).toUpperCase() });
  const next = (APPLICATION_TRANSITIONS[a.status] || []).filter((s) => s !== "withdrawn" && s !== "closed");
  const forward = next.filter((s) => s !== "rejected");
  return (
    <li className="zj-board-card">
      <strong>{label}</strong>
      <span className={`zj-status status-${a.status}`}>{statusLabel(a.status)}</span>
      <span className="zj-hint-inline">{t("applied_on", { date: formatDate(a.createdAt) })}</span>
      <ResponseDeadlineNote response={a.response} audience="employer" />
      <ApplicationAnswers coverNote={a.coverNote} answers={a.answers} />
      <MessageThread applicationId={a.id} title={label} unread={a.unreadMessages || 0} audience="employer" onLoad={onLoadMessages} onSend={onSendMessage} />
      {score && (
        <details className="zj-score-details">
          <summary>{t("score_line", { score: score.score })}</summary>
          <ul>{(score.factors || []).map((f, i) => <li key={i}>{f.explanation || f.messageKey}</li>)}</ul>
        </details>
      )}
      <div className="zj-actions">
        {forward.map((s) => (
          <button key={s} type="button" className="zj-btn is-ghost is-small" onClick={() => onMove(a.id, s)}>
            {t("move_to", { status: statusLabel(s) })}<span className="zj-visually-hidden"> — {label}</span>
          </button>
        ))}
        {next.includes("rejected") && (
          <button type="button" className="zj-btn is-ghost is-small is-danger" onClick={() => onMove(a.id, "rejected")}>
            {t("reject")}<span className="zj-visually-hidden"> — {label}</span>
          </button>
        )}
      </div>
    </li>
  );
}

function OfferForm({ onCreate, onSearchLocations }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState(null);
  const [description, setDescription] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryPeriod, setSalaryPeriod] = useState("monthly");
  const [hasFixedSalary, setHasFixedSalary] = useState(true);
  const [pillar, setPillar] = useState("first_jobs");
  const [regime, setRegime] = useState("hybrid");
  const [contractType, setContractType] = useState("permanent");
  const [userCompanyName, setUserCompanyName] = useState("");
  const [equalTreatmentConfirmed, setEqualTreatmentConfirmed] = useState(false);
  const [derogationReference, setDerogationReference] = useState("");
  const [informedOfPermanentVacancies, setInformedOfPermanentVacancies] = useState(false);
  const [questions, setQuestions] = useState([]);
  const isTempAgency = TEMP_AGENCY_CONTRACT_TYPES.includes(contractType);
  const salaryOk = Number(salaryMin) > 0 && (!salaryMax || Number(salaryMax) >= Number(salaryMin));
  const placeOk = !!location || regime === "remote";

  function submit(e) {
    e.preventDefault();
    onCreate({
      title, description,
      salaryMin: Number(salaryMin) || 0,
      salaryMax: salaryMax ? Number(salaryMax) : null,
      salaryCurrency: "EUR", salaryPeriod, hasFixedSalary,
      workRegime: regime, pillar, contractType,
      locationId: location?.id || null,
      ...(isTempAgency ? {
        userCompanyName, equalTreatmentConfirmed,
        collectiveAgreementDerogationReference: derogationReference || null,
        informedOfPermanentVacancies,
      } : {}),
    }, questions.filter((q) => q.label.trim()));
  }

  return (
    <form className="zj-form zj-form-wide" onSubmit={submit}>
      <p className="zj-panel-hint">{t("offer_form_intro")}</p>
      <Field label={t("field_offer_title")} required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ph_offer_title")} required />
      </Field>
      <Field label={t("field_description")} hint={t("hint_description")} required>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required />
      </Field>
      <fieldset className="zj-fieldset">
        <legend>{t("salary_legend")}</legend>
        <div className="zj-form-row">
          <Field label={t("field_salary_min")} required><input type="number" min="0" inputMode="numeric" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} required /></Field>
          <Field label={t("field_salary_max")}><input type="number" min="0" inputMode="numeric" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} /></Field>
          <Field label={t("field_salary_period")}>
            <select value={salaryPeriod} onChange={(e) => setSalaryPeriod(e.target.value)}>
              {["hourly", "daily", "monthly", "yearly"].map((p) => <option key={p} value={p}>{t(`period_name_${p}`)}</option>)}
            </select>
          </Field>
        </div>
        {!salaryOk && salaryMin !== "" && <p className="zj-field-error" role="alert">{t("salary_invalid")}</p>}
        <label className="zj-checkbox">
          <input type="checkbox" checked={hasFixedSalary} onChange={(e) => setHasFixedSalary(e.target.checked)} />
          {t("fixed_salary_check")}
        </label>
        <p className="zj-field-hint">{t("salary_transparency_hint")}</p>
      </fieldset>
      <LocationPicker
        label={t("field_location")}
        hint={t("hint_location")}
        required={regime !== "remote"}
        value={location}
        onChange={setLocation}
        search={onSearchLocations}
      />
      <div className="zj-form-row">
        <Field label={t("field_pillar")}>
          <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
            {PILLAR_KEYS.map((k) => <option key={k} value={k}>{pillarLabel(k)}</option>)}
          </select>
        </Field>
        <Field label={t("field_regime")}>
          <select value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="on_site">{t("regime_on_site")}</option>
            <option value="hybrid">{t("regime_hybrid")}</option>
            <option value="remote">{t("regime_remote")}</option>
          </select>
        </Field>
        <Field label={t("field_contract_type")}>
          <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
            {CONTRACT_TYPES.map((value) => <option key={value} value={value}>{t(`contract_${value}`)}</option>)}
          </select>
        </Field>
      </div>
      {isTempAgency && (
        <fieldset className="zj-fieldset zj-temp-agency-block">
          <legend>{t("temp_agency_legend")}</legend>
          <p className="zj-panel-hint">{t("temp_agency_hint")}</p>
          <Field label={t("field_user_company")} hint={t("hint_user_company")}>
            <input value={userCompanyName} onChange={(e) => setUserCompanyName(e.target.value)} placeholder={t("ph_user_company")} />
          </Field>
          <label className="zj-checkbox"><input type="checkbox" checked={equalTreatmentConfirmed} onChange={(e) => setEqualTreatmentConfirmed(e.target.checked)} /> {t("equal_treatment")}</label>
          <Field label={t("field_derogation")} hint={t("hint_derogation")}>
            <input value={derogationReference} onChange={(e) => setDerogationReference(e.target.value)} placeholder={t("ph_derogation")} />
          </Field>
          <label className="zj-checkbox"><input type="checkbox" checked={informedOfPermanentVacancies} onChange={(e) => setInformedOfPermanentVacancies(e.target.checked)} /> {t("permanent_vacancies")}</label>
        </fieldset>
      )}
      <QuestionsEditor value={questions} onChange={setQuestions} />
      <button type="submit" className="zj-btn is-primary" disabled={!title || !description || !salaryOk || !placeOk}>
        {t("save_draft")} <ArrowRight size={14} aria-hidden="true" />
      </button>
      <p className="zj-field-hint"><Building2 size={12} aria-hidden="true" /> {t("offer_form_next_step")}</p>
    </form>
  );
}

/**
 * What the public company page shows. Text fields go to PUT
 * /organizations/:id/public-profile; headcount and NACE sector to the
 * existing PUT /organizations/:id/classification.
 */
function PublicProfileForm({ org, onLoadPublicProfile, onSavePublicProfile, onListNaceCodes, onSearchLocations, busy }) {
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ description: "", cultureNotes: "", remotePolicyNotes: "", inclusionPolicyNotes: "", website: "", employeeCount: "", naceCode: "" });
  const [headquarters, setHeadquarters] = useState(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([onLoadPublicProfile(org.id), onListNaceCodes().catch(() => [])]).then(([data, codes]) => {
      if (cancelled) return;
      const p = (data && data.profile) || {};
      setForm({
        description: p.description || "", cultureNotes: p.cultureNotes || "", remotePolicyNotes: p.remotePolicyNotes || "",
        inclusionPolicyNotes: p.inclusionPolicyNotes || "", website: p.website || "",
        employeeCount: p.employeeCount ?? "", naceCode: (p.nace && p.nace.code) || "",
      });
      setHeadquarters(p.headquarters || null);
      setSections((codes || []).filter((c) => c.level === "section"));
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const websiteOk = !form.website || /^https:\/\/[^\s/]+\.[^\s]+$/i.test(form.website.trim());
  const countOk = form.employeeCount === "" || (Number.isInteger(Number(form.employeeCount)) && Number(form.employeeCount) >= 0);

  function submit(e) {
    e.preventDefault();
    onSavePublicProfile(org.id, {
      description: form.description, cultureNotes: form.cultureNotes, remotePolicyNotes: form.remotePolicyNotes,
      inclusionPolicyNotes: form.inclusionPolicyNotes, website: form.website.trim(),
      headquartersLocationId: headquarters ? headquarters.id : null,
    }, {
      employeeCount: form.employeeCount === "" ? null : Number(form.employeeCount),
      naceCode: form.naceCode || null,
    });
  }

  return (
    <div className="zj-dash-section" aria-labelledby="org-profile-h">
      <div className="zj-panel-head">
        <h2 id="org-profile-h" className="zj-section-title">{t("profile_h")}</h2>
        <a className="zj-btn is-ghost is-small" href={companyPageUrl(org.id)} target="_blank" rel="noopener">{t("profile_view_public")}</a>
      </div>
      <p className="zj-panel-hint">{t("profile_intro")}</p>
      {!loaded ? <p className="zj-empty" role="status">{t("loading")}</p> : (
        <form className="zj-form zj-form-wide" onSubmit={submit}>
          <Field label={t("field_company_description")} hint={t("hint_company_description")}>
            <textarea value={form.description} onChange={set("description")} rows={6} maxLength={3000} />
          </Field>
          <Field label={t("field_culture")}>
            <textarea value={form.cultureNotes} onChange={set("cultureNotes")} rows={3} maxLength={1500} />
          </Field>
          <Field label={t("field_remote_policy")} hint={t("hint_remote_policy")}>
            <textarea value={form.remotePolicyNotes} onChange={set("remotePolicyNotes")} rows={2} maxLength={1500} />
          </Field>
          <Field label={t("field_inclusion")} hint={t("hint_inclusion")}>
            <textarea value={form.inclusionPolicyNotes} onChange={set("inclusionPolicyNotes")} rows={2} maxLength={1500} />
          </Field>
          <div className="zj-form-row">
            <Field label={t("field_website")} hint={t("hint_website")}>
              <input type="url" value={form.website} onChange={set("website")} placeholder="https://" maxLength={200} aria-invalid={!websiteOk} />
            </Field>
            <Field label={t("field_employee_count")}>
              <input type="number" min="0" step="1" inputMode="numeric" value={form.employeeCount} onChange={set("employeeCount")} aria-invalid={!countOk} />
            </Field>
          </div>
          {!websiteOk && <p className="zj-field-error" role="alert">{t("hint_website")}</p>}
          <LocationPicker label={t("field_headquarters")} value={headquarters} onChange={setHeadquarters} search={onSearchLocations} />
          {sections.length > 0 ? (
            <Field label={t("field_sector")}>
              <select value={form.naceCode} onChange={set("naceCode")}>
                <option value="">{t("sector_none")}</option>
                {sections.map((c) => <option key={c.code} value={c.code}>{c.code} — {naceSectionLabel(c.sectionLetter || c.code) || c.labelEn}</option>)}
              </select>
            </Field>
          ) : <p className="zj-field-hint">{t("sector_unavailable")}</p>}
          <button type="submit" className="zj-btn is-primary" disabled={busy || !websiteOk || !countOk}>{t("profile_save")}</button>
        </form>
      )}
    </div>
  );
}
