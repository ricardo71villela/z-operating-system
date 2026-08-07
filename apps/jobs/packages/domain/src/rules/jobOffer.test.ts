// packages/domain/src/rules/jobOffer.test.ts
// Corre com: npx tsx packages/domain/src/rules/jobOffer.test.ts
// (não depende de nenhum framework de testes externo, por isso funciona
// mesmo sem acesso à rede para instalar vitest/jest.)

import assert from 'node:assert/strict';
import {
  validateJobOfferForPublication,
  canTransition,
} from './jobOffer';
import type { JobOfferDraft, EmployerContext } from '../types/jobOffer';

function baseOffer(overrides: Partial<JobOfferDraft> = {}): JobOfferDraft {
  return {
    organizationId: 'org-1',
    title: 'Engenheiro/a de Software Backend',
    description:
      'Vaga para engenheiro backend júnior, integração numa equipa de ' +
      'produto, salário fixo mensal garantido, contrato sem termo.',
    contractType: 'permanent',
    salaryMin: 1500,
    salaryMax: 1900,
    salaryCurrency: 'EUR',
    salaryPeriod: 'monthly',
    hasFixedSalary: true,
    workRegime: 'hybrid',
    employerIdentified: true,
    pillar: 'first_jobs',
    status: 'draft',
    ...overrides,
  };
}

function verifiedEmployer(): EmployerContext {
  return { organizationId: 'org-1', verificationStatus: 'verified' };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('jobOffer rules');

test('oferta válida, empregador verificado -> válida', () => {
  const result = validateJobOfferForPublication(baseOffer(), verifiedEmployer());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('empregador não verificado -> rejeitada', () => {
  const result = validateJobOfferForPublication(baseOffer(), {
    organizationId: 'org-1',
    verificationStatus: 'pending',
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'EMPLOYER_NOT_VERIFIED'));
});

test('sem salário fixo -> rejeitada (regra central da secção 3.2)', () => {
  const result = validateJobOfferForPublication(
    baseOffer({ hasFixedSalary: false }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'MISSING_FIXED_SALARY'));
});

test('salário mínimo <= 0 -> rejeitada', () => {
  const result = validateJobOfferForPublication(
    baseOffer({ salaryMin: 0 }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'INVALID_SALARY_MIN'));
});

test('salário máximo abaixo do mínimo -> rejeitada', () => {
  const result = validateJobOfferForPublication(
    baseOffer({ salaryMin: 2000, salaryMax: 1000 }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'SALARY_MAX_BELOW_MIN'));
});

test('empregador não identificável -> rejeitada', () => {
  const result = validateJobOfferForPublication(
    baseOffer({ employerIdentified: false }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'EMPLOYER_NOT_IDENTIFIABLE'));
});

test('linguagem de comissão exclusiva -> sinalizada', () => {
  const result = validateJobOfferForPublication(
    baseOffer({
      description: 'Trabalho apenas à comissão, ganhos ilimitados, sem ordenado fixo.',
    }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'SUSPECTED_COMMISSION_ONLY_LANGUAGE'));
});

test('linguagem de MLM / taxa de inscrição -> bloqueia sempre (exclusão imperativa)', () => {
  const result = validateJobOfferForPublication(
    baseOffer({
      description:
        'Junte-se ao nosso marketing multinível, construa a sua equipa, taxa de inscrição de 50€.',
    }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'SUSPECTED_MLM_OR_PAY_TO_APPLY'));
});

test('descrição demasiado curta -> rejeitada', () => {
  const result = validateJobOfferForPublication(
    baseOffer({ description: 'Vaga.' }),
    verifiedEmployer(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'DESCRIPTION_TOO_SHORT'));
});

test('transições de estado: draft -> pending_review permitido', () => {
  assert.equal(canTransition('draft', 'pending_review'), true);
});

test('transições de estado: draft -> published NÃO permitido diretamente', () => {
  assert.equal(canTransition('draft', 'published'), false);
});

test('transições de estado: published -> filled permitido', () => {
  assert.equal(canTransition('published', 'filled'), true);
});

test('transições de estado: archived é terminal', () => {
  assert.equal(canTransition('archived', 'draft'), false);
});

// --- Trabalho temporário / interim (Diretiva 2008/104/CE) ---

console.log('\nvalidateJobOfferForPublication: trabalho temporário / interim');

function interimOffer(overrides: Partial<JobOfferDraft> = {}): JobOfferDraft {
  return baseOffer({
    contractType: 'interim',
    userCompanyName: 'Fábrica Alfa, S.A.',
    equalTreatmentConfirmed: true,
    informedOfPermanentVacancies: true,
    ...overrides,
  });
}

test('oferta interim completa e correta -> válida', () => {
  const r = validateJobOfferForPublication(interimOffer(), verifiedEmployer());
  assert.equal(r.valid, true);
});

test('oferta temporary_agency completa e correta -> válida (mesmas regras que interim)', () => {
  const r = validateJobOfferForPublication(
    interimOffer({ contractType: 'temporary_agency' }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, true);
});

test('interim sem empresa utilizadora identificada -> rejeitada', () => {
  const r = validateJobOfferForPublication(
    interimOffer({ userCompanyName: null }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'MISSING_USER_COMPANY'));
});

test('empresa utilizadora igual à ETT (mesmo nome) -> rejeitada', () => {
  const employer: EmployerContext = { organizationId: 'org-1', verificationStatus: 'verified', legalName: 'Fábrica Alfa, S.A.' };
  const r = validateJobOfferForPublication(interimOffer({ userCompanyName: 'fábrica alfa, s.a.' }), employer);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'USER_COMPANY_SAME_AS_AGENCY'));
});

test('sem confirmação de igualdade de tratamento e sem derrogação -> rejeitada', () => {
  const r = validateJobOfferForPublication(
    interimOffer({ equalTreatmentConfirmed: false, collectiveAgreementDerogationReference: null }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'EQUAL_TREATMENT_NOT_CONFIRMED'));
});

test('sem confirmação MAS com derrogação por convenção coletiva identificada -> válida', () => {
  const r = validateJobOfferForPublication(
    interimOffer({
      equalTreatmentConfirmed: false,
      collectiveAgreementDerogationReference: 'CCT Setor Têxtil 2025, cláusula 14.ª',
    }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, true, JSON.stringify(r.issues));
});

test('sem informação de vagas permanentes -> sinaliza aviso mas NÃO bloqueia publicação', () => {
  const r = validateJobOfferForPublication(
    interimOffer({ informedOfPermanentVacancies: false }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, true);
  assert.ok(r.issues.some((i) => i.code === 'PERMANENT_VACANCY_INFORMATION_PENDING' && i.severity === 'warning'));
});

test('contrato permanent NÃO exige nenhuma das regras de trabalho temporário', () => {
  const r = validateJobOfferForPublication(
    baseOffer({ contractType: 'permanent', userCompanyName: null }),
    verifiedEmployer(),
  );
  assert.equal(r.valid, true);
  assert.ok(!r.issues.some((i) => i.code === 'MISSING_USER_COMPANY'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
