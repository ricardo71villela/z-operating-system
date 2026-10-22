// Shared building blocks for the Z Jobs portal views (ZJobsDemo.jsx and
// the two dashboards). Kept free of app state so any view can import them.
import React from "react";
import { ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle, BadgeCheck, MapPin } from "lucide-react";
import { t, messagesLocale, formatAmount } from "./messages.js";

export const PILLAR_KEYS = ["first_jobs", "professional_careers", "senior_careers"];
export const pillarLabel = (key) => t(`pillar_${key}`);

// Same tripartite relation as packages/domain/src/rules/jobOffer.ts —
// see TEMP_AGENCY_CONTRACT_TYPES there (Directive 2008/104/EC, art. 5 and 6).
export const TEMP_AGENCY_CONTRACT_TYPES = ["temporary_agency", "interim"];
export const CONTRACT_TYPES = [
  "permanent", "fixed_term", "temporary_agency", "interim", "project_based",
  "seasonal", "paid_internship", "trainee_program", "replacement_contract", "other",
];

// Mirrors canTransitionApplication() in the domain package.
export const APPLICATION_TRANSITIONS = {
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

// The main path an application follows, used for the progress steppers.
export const APPLICATION_PATH = ["submitted", "received", "screening", "shortlisted", "interview", "offer", "hired"];
export const ACTIVE_APPLICATION_STATUSES = ["submitted", "received", "screening", "shortlisted", "interview", "assessment", "offer"];

export const statusLabel = (status) => t(`status_${status}`);
export const offerStatusLabel = (status) => t(`offer_${status}`);

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(messagesLocale() === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function SalaryLedger({ min, max, currencyCode = "EUR", period = "monthly", fixed }) {
  const periodLabel = { hourly: t("period_hourly"), daily: t("period_daily"), monthly: t("period_monthly"), yearly: t("period_yearly") }[period] || "";
  const symbol = currencyCode === "EUR" ? "€" : currencyCode;
  return (
    <div className="zj-ledger">
      <span className="zj-ledger-amount">
        {messagesLocale() === "fr"
          ? <>{formatAmount(min)}{max ? `–${formatAmount(max)}` : ""}&nbsp;{symbol}</>
          : <>{symbol}{formatAmount(min)}{max ? `–${formatAmount(max)}` : ""}</>}
        <span className="zj-ledger-period">{periodLabel}</span>
      </span>
      <span className={`zj-ledger-tag ${fixed ? "is-fixed" : "is-risk"}`}>
        {fixed ? <><CheckCircle2 size={12} aria-hidden="true" /> {t("salary_fixed")}</> : <><AlertTriangle size={12} aria-hidden="true" /> {t("salary_not_fixed")}</>}
      </span>
    </div>
  );
}

export function VerificationBadge({ status }) {
  const map = {
    verified: { label: t("verif_verified"), cls: "is-trust", icon: <ShieldCheck size={13} aria-hidden="true" /> },
    enhanced_verified: { label: t("verif_enhanced"), cls: "is-trust", icon: <BadgeCheck size={13} aria-hidden="true" /> },
    pending: { label: t("verif_pending"), cls: "is-pending", icon: <Clock size={13} aria-hidden="true" /> },
    unverified: { label: t("verif_unverified"), cls: "is-muted", icon: <XCircle size={13} aria-hidden="true" /> },
  };
  const m = map[status] || map.unverified;
  return <span className={`zj-badge ${m.cls}`}>{m.icon}{m.label}</span>;
}

/** Label wraps the control, so every input gets an accessible name. */
export function Field({ label, children, hint, required }) {
  return (
    <label className="zj-field">
      <span className="zj-field-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
      {children}
      {hint && <span className="zj-field-hint">{hint}</span>}
    </label>
  );
}

/** A headline number on a dashboard. */
export function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`zj-kpi ${tone ? `is-${tone}` : ""}`}>
      <span className="zj-kpi-value">{value}</span>
      <span className="zj-kpi-label">{label}</span>
      {hint && <span className="zj-kpi-hint">{hint}</span>}
    </div>
  );
}

/**
 * Section navigation inside a dashboard. Uses buttons with aria-current
 * rather than an ARIA tablist: each section is a full region the reader
 * moves into, not a panel that swaps in place.
 */
export function SectionNav({ label, sections, current, onChange }) {
  return (
    <nav className="zj-section-nav" aria-label={label}>
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`zj-section-btn ${current === s.key ? "is-active" : ""}`}
          aria-current={current === s.key ? "page" : undefined}
          onClick={() => onChange(s.key)}
        >
          {s.label}
          {typeof s.count === "number" && s.count > 0 && <span className="zj-section-count">{s.count}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Ordered progress (e.g. verification steps, application stages). */
export function Stepper({ steps, currentIndex, label, ended }) {
  return (
    <ol className="zj-stepper" aria-label={label}>
      {steps.map((s, i) => {
        const state = ended && i > currentIndex ? "is-skipped" : i < currentIndex ? "is-done" : i === currentIndex ? "is-current" : "is-todo";
        return (
          <li key={s.key} className={`zj-step ${state}`} aria-current={i === currentIndex ? "step" : undefined}>
            <span className="zj-step-dot" aria-hidden="true">{i < currentIndex ? "✓" : i + 1}</span>
            <span className="zj-step-label">{s.label}</span>
            {s.date && <span className="zj-step-date">{s.date}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Accent-insensitive comparison key (same rule as the API's location search). */
export function normalizeText(text) {
  return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** "Lyon (69001) · Rhône (69)" style label for an offer or a search result. */
export function locationLabel(loc) {
  if (!loc) return "";
  const country = { FR: "France", BE: "Belgique", LU: "Luxembourg" }[loc.countryCode] || loc.countryCode;
  const city = loc.postalCode ? `${loc.city} (${loc.postalCode})` : loc.city;
  return [city, loc.adminArea, country].filter(Boolean).join(" · ");
}

export function OfferPlace({ location, workRegime }) {
  if (!location && workRegime !== "remote") return null;
  return (
    <span className="zj-place">
      <MapPin size={12} aria-hidden="true" />
      {location ? locationLabel(location) : t("regime_remote")}
      {location && workRegime === "remote" ? ` · ${t("regime_remote")}` : ""}
    </span>
  );
}

/**
 * Pick a reference town (France, Belgium, Luxembourg). Typing searches the API;
 * results are plain buttons, so the picker works with a keyboard and a screen
 * reader without a custom combobox.
 */
export function LocationPicker({ value, onChange, search, label, hint, required }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [status, setStatus] = React.useState("idle");
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setStatus("idle"); return undefined; }
    let cancelled = false;
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const found = await search(q);
        if (!cancelled) { setResults(found || []); setStatus("done"); }
      } catch {
        if (!cancelled) { setResults([]); setStatus("error"); }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  if (value) {
    return (
      <div className="zj-field">
        <span className="zj-field-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
        <div className="zj-place-chosen">
          <MapPin size={14} aria-hidden="true" /> <strong>{locationLabel(value)}</strong>
          <button type="button" className="zj-btn is-ghost is-small" onClick={() => { onChange(null); setQuery(""); }}>{t("change")}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="zj-location-picker">
      <Field label={label} hint={hint} required={required}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("ph_location")} autoComplete="off" />
      </Field>
      <div aria-live="polite" className="zj-hint-inline">
        {status === "loading" && t("searching")}
        {status === "done" && results.length === 0 && t("no_location_found")}
        {status === "error" && t("location_search_failed")}
      </div>
      {results.length > 0 && (
        <ul className="zj-plain-list zj-location-results" aria-label={t("location_results")}>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="zj-location-option" onClick={() => onChange(r)}>
                <strong>{r.city}</strong>{r.altName ? ` / ${r.altName}` : ""}
                <span className="zj-hint-inline"> {[r.postalCode, r.adminArea, r.countryCode].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
