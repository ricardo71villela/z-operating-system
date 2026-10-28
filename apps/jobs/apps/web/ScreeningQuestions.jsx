// Screening questions: the employer chooses up to 5 (yes/no, number, short
// text) while the offer is a draft; the candidate answers them when applying.
// The answers help the employer read the application. Nothing is decided
// automatically from them.
import React, { useEffect, useState } from "react";
import { t } from "./messages.js";
import { Field } from "./shared.jsx";

export const MAX_QUESTIONS = 5;
const KINDS = ["yes_no", "number", "short_text"];

/** Controlled list editor: value = [{ kind, label, required }]. */
export function QuestionsEditor({ value, onChange }) {
  const list = value || [];
  const update = (i, patch) => onChange(list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <fieldset className="zj-fieldset">
      <legend>{t("questions_legend")}</legend>
      <p className="zj-field-hint">{t("questions_hint")}</p>
      {list.length === 0 && <p className="zj-hint-inline">{t("questions_none")}</p>}
      <ol className="zj-questions-edit">
        {list.map((q, i) => (
          <li key={i}>
            <div className="zj-form-row">
              <Field label={t("question_label", { n: i + 1 })}>
                <input value={q.label} maxLength={300} onChange={(e) => update(i, { label: e.target.value })} placeholder={t("ph_question")} />
              </Field>
              <Field label={t("question_kind")}>
                <select value={q.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                  {KINDS.map((k) => <option key={k} value={k}>{t(`question_kind_${k}`)}</option>)}
                </select>
              </Field>
            </div>
            <label className="zj-checkbox">
              <input type="checkbox" checked={q.required !== false} onChange={(e) => update(i, { required: e.target.checked })} /> {t("question_required")}
            </label>
            <button type="button" className="zj-btn is-ghost is-small is-danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>
              {t("question_remove")}<span className="zj-visually-hidden"> {i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      {list.length < MAX_QUESTIONS && (
        <button type="button" className="zj-btn is-ghost is-small" onClick={() => onChange([...list, { kind: "yes_no", label: "", required: true }])}>
          {t("question_add")}
        </button>
      )}
    </fieldset>
  );
}

/** Questions of an existing draft offer: loads them, edits, saves. */
export function OfferQuestions({ offerId, onLoad, onSave }) {
  const [questions, setQuestions] = useState(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false;
    onLoad(offerId)
      .then((list) => { if (!cancelled) setQuestions(list.map(({ kind, label, required }) => ({ kind, label, required }))); })
      .catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, [offerId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!questions) return null;
  const clean = questions.filter((q) => q.label.trim());
  return (
    <details className="zj-score-details">
      <summary>{t("questions_summary", { count: clean.length })}</summary>
      <QuestionsEditor value={questions} onChange={setQuestions} />
      <button
        type="button"
        className="zj-btn is-primary is-small"
        onClick={async () => {
          setStatus("");
          const ok = await onSave(offerId, clean);
          if (ok) { setQuestions(ok.map(({ kind, label, required }) => ({ kind, label, required }))); setStatus(t("questions_saved")); }
        }}
      >
        {t("questions_save")}
      </button>
      <span role="status" className="zj-hint-inline"> {status}</span>
    </details>
  );
}

/** The candidate's answers, as the employer reads them. */
export function ApplicationAnswers({ coverNote, answers }) {
  if (!coverNote && !(answers && answers.length)) return null;
  const show = (a) => (a.kind === "yes_no" ? t(a.answer === "yes" ? "answer_yes" : "answer_no") : a.answer);
  return (
    <details className="zj-score-details" open>
      <summary>{t("application_answers")}</summary>
      {coverNote && <p className="zj-cover-note">{coverNote}</p>}
      {answers?.length > 0 && (
        <dl className="zj-answers">
          {answers.map((a) => (
            <div key={a.questionId}><dt>{a.label}</dt><dd>{show(a)}</dd></div>
          ))}
        </dl>
      )}
      <p className="zj-field-hint">{t("answers_never_decide")}</p>
    </details>
  );
}

/** Form fields of the apply dialog. value = { [questionId]: answer }. */
export function AnswerFields({ questions, value, onChange }) {
  const set = (id, v) => onChange({ ...value, [id]: v });
  return questions.map((q) => {
    const label = q.required ? q.label : `${q.label} (${t("optional")})`;
    if (q.kind === "yes_no") {
      return (
        <fieldset key={q.id} className="zj-fieldset">
          <legend>{label}{q.required && <span aria-hidden="true"> *</span>}</legend>
          <label className="zj-checkbox"><input type="radio" name={`q-${q.id}`} checked={value[q.id] === "yes"} onChange={() => set(q.id, "yes")} required={q.required} /> {t("answer_yes")}</label>
          <label className="zj-checkbox"><input type="radio" name={`q-${q.id}`} checked={value[q.id] === "no"} onChange={() => set(q.id, "no")} /> {t("answer_no")}</label>
        </fieldset>
      );
    }
    return (
      <Field key={q.id} label={label} required={q.required}>
        {q.kind === "number"
          ? <input type="number" min="0" step="any" inputMode="decimal" value={value[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} required={q.required} />
          : <input value={value[q.id] ?? ""} maxLength={1000} onChange={(e) => set(q.id, e.target.value)} required={q.required} />}
      </Field>
    );
  });
}
