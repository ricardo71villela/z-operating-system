// packages/domain/src/rules/screeningQuestions.ts
//
// Perguntas de pré-seleção escolhidas pelo empregador (até 5 por oferta) e
// as respostas do candidato, dadas ao candidatar-se.
//
// As respostas só ajudam o empregador a ler a candidatura: nada é decidido
// automaticamente a partir delas — nenhuma rejeição automática, a mesma
// regra do score do candidato (uma pessoa decide sempre).

export type ScreeningQuestionKind = 'yes_no' | 'number' | 'short_text';

export interface ScreeningQuestionInput {
  kind: ScreeningQuestionKind;
  label: string;
  required?: boolean;
}

export interface ScreeningQuestion {
  id: string;
  position: number;
  kind: ScreeningQuestionKind;
  label: string;
  required: boolean;
}

export interface ScreeningAnswerInput {
  questionId: string;
  answer: string | number | boolean | null | undefined;
}

export const MAX_SCREENING_QUESTIONS = 5;
export const MAX_ANSWER_LENGTH = 1000;
const KINDS: ScreeningQuestionKind[] = ['yes_no', 'number', 'short_text'];

// Perguntas que a lei proíbe num recrutamento (FR : Code du travail
// L1132-1 ; BE : loi du 10 mai 2007 ; LU : Code du travail L.241-1) :
// nunca sobre origem, religião, saúde, gravidez, família, orientação
// sexual, idade, opiniões políticas ou sindicais. Lista de palavras, não
// um classificador — a moderação humana da oferta continua a valer.
const FORBIDDEN_TOPICS = [
  /\b(enceinte|grossesse|pregnan\w*|enfants?\b|children|kids|mari[ée]e?\b|married|c[ée]libataire|situation (familiale|de famille)|marital|family status)/i,
  /\b(religion|religieu\w*|religious|confession|pratiquant\w*|church|mosqu[ée]e?|synagogue)/i,
  /\b([ée]tat de sant[ée]|probl[èe]mes? de sant[ée]|health (condition|status|problem\w*)|maladie|illness|handicap\w*|disabilit\w*)/i,
  /\b(nationalit[ée]|nationality|origine\b|origin\b|ethni\w*|race\b|couleur de peau)/i,
  /\b(syndi(c|qu)\w*|union member\w*|trade union|opinions? politiques?|political (views|opinion\w*)|parti politique|political party)/i,
  /\b(orientation sexuelle|sexual orientation|gay|lesbienne|lesbian|homosexu\w*)/i,
  /\b(quel [âa]ge|votre [âa]ge|how old|your age|date de naissance|date of birth|birth ?date)/i,
];

export function isForbiddenQuestion(label: string): boolean {
  return FORBIDDEN_TOPICS.some((re) => re.test(label));
}

export type QuestionsCheck =
  | { ok: true; questions: { position: number; kind: ScreeningQuestionKind; label: string; required: boolean }[] }
  | { ok: false; error: string; index?: number };

export function validateScreeningQuestions(input: unknown): QuestionsCheck {
  if (!Array.isArray(input)) return { ok: false, error: 'questions_not_a_list' };
  if (input.length > MAX_SCREENING_QUESTIONS) return { ok: false, error: 'too_many_questions' };
  const out: { position: number; kind: ScreeningQuestionKind; label: string; required: boolean }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const q = input[i] as Partial<ScreeningQuestionInput> | null;
    const label = typeof q?.label === 'string' ? q.label.replace(/\s+/g, ' ').trim() : '';
    if (!q || !KINDS.includes(q.kind as ScreeningQuestionKind)) return { ok: false, error: 'question_kind_invalid', index: i };
    if (label.length < 3 || label.length > 300) return { ok: false, error: 'question_label_length', index: i };
    if (isForbiddenQuestion(label)) return { ok: false, error: 'question_forbidden_topic', index: i };
    const key = label.toLowerCase();
    if (seen.has(key)) return { ok: false, error: 'question_duplicate', index: i };
    seen.add(key);
    out.push({ position: i + 1, kind: q.kind as ScreeningQuestionKind, label, required: q.required !== false });
  }
  return { ok: true, questions: out };
}

export type AnswersCheck =
  | { ok: true; answers: { questionId: string; answer: string }[] }
  | { ok: false; error: string; questionId?: string };

/** Normalised answers ('yes'/'no', a number as text, trimmed text). */
export function validateScreeningAnswers(questions: ScreeningQuestion[], input: unknown): AnswersCheck {
  const list = Array.isArray(input) ? (input as ScreeningAnswerInput[]) : [];
  const byId = new Map<string, ScreeningAnswerInput>();
  for (const a of list) {
    if (!a || typeof a.questionId !== 'string') continue;
    if (!questions.some((q) => q.id === a.questionId)) return { ok: false, error: 'answer_unknown_question', questionId: a.questionId };
    byId.set(a.questionId, a);
  }
  const out: { questionId: string; answer: string }[] = [];
  for (const q of questions) {
    const raw = byId.get(q.id)?.answer;
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!text) {
      if (q.required) return { ok: false, error: 'answer_required', questionId: q.id };
      continue;
    }
    if (q.kind === 'yes_no') {
      const v = typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : text.toLowerCase();
      const norm = ['yes', 'oui', 'true'].includes(v) ? 'yes' : ['no', 'non', 'false'].includes(v) ? 'no' : null;
      if (!norm) return { ok: false, error: 'answer_yes_no_invalid', questionId: q.id };
      out.push({ questionId: q.id, answer: norm });
    } else if (q.kind === 'number') {
      const n = Number(text.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, error: 'answer_number_invalid', questionId: q.id };
      out.push({ questionId: q.id, answer: String(n) });
    } else {
      if (text.length > MAX_ANSWER_LENGTH) return { ok: false, error: 'answer_too_long', questionId: q.id };
      out.push({ questionId: q.id, answer: text });
    }
  }
  return { ok: true, answers: out };
}
