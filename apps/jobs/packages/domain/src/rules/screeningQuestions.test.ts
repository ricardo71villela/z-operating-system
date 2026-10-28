// packages/domain/src/rules/screeningQuestions.test.ts
import assert from 'node:assert/strict';
import { validateScreeningQuestions, validateScreeningAnswers, isForbiddenQuestion } from './screeningQuestions';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; } catch (err) { console.log(`  ✗ ${name}`); console.log(`    ${(err as Error).message}`); failed++; }
}

console.log('screeningQuestions');

test('até 5 perguntas, posições 1..n, obrigatórias por omissão', () => {
  const r = validateScreeningQuestions([
    { kind: 'yes_no', label: 'Avez-vous le permis B ?' },
    { kind: 'number', label: "Combien d'années d'expérience en Node.js ?", required: false },
  ]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.questions.map((q) => q.position), [1, 2]);
    assert.equal(r.questions[0].required, true);
    assert.equal(r.questions[1].required, false);
  }
});

test('mais de 5 perguntas recusado', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ kind: 'short_text', label: `Question numéro ${i}` }));
  assert.deepEqual(validateScreeningQuestions(six), { ok: false, error: 'too_many_questions' });
});

test('tipo inválido, texto curto e duplicado recusados', () => {
  assert.equal((validateScreeningQuestions([{ kind: 'choice', label: 'Question valide ?' }]) as any).error, 'question_kind_invalid');
  assert.equal((validateScreeningQuestions([{ kind: 'yes_no', label: 'Ok' }]) as any).error, 'question_label_length');
  assert.equal((validateScreeningQuestions([{ kind: 'yes_no', label: 'Permis B ?' }, { kind: 'yes_no', label: 'permis b ?' }]) as any).error, 'question_duplicate');
});

test('perguntas discriminatórias recusadas (FR e EN)', () => {
  for (const label of ['Êtes-vous enceinte ?', 'Quel âge avez-vous ?', 'Do you have children?', 'Quelle est votre religion ?', 'Êtes-vous syndiqué ?', 'What is your nationality?']) {
    assert.equal(isForbiddenQuestion(label), true, label);
  }
  for (const label of ['Avez-vous le permis B ?', 'Pouvez-vous travailler le samedi ?', 'Combien d’années d’expérience en comptabilité ?', 'Do you speak German?', 'Avez-vous travaillé dans le secteur de la santé ?', 'Do you know single sign-on?', 'Original documents available?']) {
    assert.equal(isForbiddenQuestion(label), false, label);
  }
});

const questions = [
  { id: 'q1', position: 1, kind: 'yes_no' as const, label: 'Permis B ?', required: true },
  { id: 'q2', position: 2, kind: 'number' as const, label: 'Années ?', required: true },
  { id: 'q3', position: 3, kind: 'short_text' as const, label: 'Disponibilité ?', required: false },
];

test('respostas normalizadas: oui → yes, "3,5" → 3.5, texto aparado', () => {
  const r = validateScreeningAnswers(questions, [
    { questionId: 'q1', answer: 'Oui' }, { questionId: 'q2', answer: '3,5' }, { questionId: 'q3', answer: '  Janvier  ' },
  ]);
  assert.deepEqual(r, { ok: true, answers: [{ questionId: 'q1', answer: 'yes' }, { questionId: 'q2', answer: '3.5' }, { questionId: 'q3', answer: 'Janvier' }] });
});

test('obrigatória sem resposta recusada; facultativa sem resposta omitida', () => {
  assert.equal((validateScreeningAnswers(questions, [{ questionId: 'q1', answer: true }]) as any).error, 'answer_required');
  const r = validateScreeningAnswers(questions, [{ questionId: 'q1', answer: false }, { questionId: 'q2', answer: 2 }]);
  assert.ok(r.ok && r.answers.length === 2 && r.answers[0].answer === 'no');
});

test('valores inválidos e pergunta desconhecida recusados', () => {
  assert.equal((validateScreeningAnswers(questions, [{ questionId: 'q1', answer: 'peut-être' }, { questionId: 'q2', answer: 1 }]) as any).error, 'answer_yes_no_invalid');
  assert.equal((validateScreeningAnswers(questions, [{ questionId: 'q1', answer: 'yes' }, { questionId: 'q2', answer: 'beaucoup' }]) as any).error, 'answer_number_invalid');
  assert.equal((validateScreeningAnswers(questions, [{ questionId: 'qX', answer: 'yes' }]) as any).error, 'answer_unknown_question');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
