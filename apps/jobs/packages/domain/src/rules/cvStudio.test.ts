// packages/domain/src/rules/cvStudio.test.ts
import {
  computeCVQuality,
  matchCVAgainstOffer,
  recommendCVTemplate,
  validateCoverLetterPersonalization,
} from './cvStudio';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FALHOU: ${message}`);
  }
}

// --- computeCVQuality ---

const weakCV = computeCVQuality({
  locale: 'pt',
  experiences: [{ title: 'Assistente', description: 'Responsável por tarefas administrativas.' }],
  skills: ['excel'],
  certifications: [],
  hasPortfolioLink: false,
});
assert(weakCV.score < 100, 'CV fraco deve ter pontuação penalizada');
assert(
  weakCV.signals.some((s) => s.code === 'NO_QUANTIFIED_ACHIEVEMENTS'),
  'CV sem números deve sinalizar NO_QUANTIFIED_ACHIEVEMENTS',
);
assert(
  weakCV.signals.some((s) => s.code === 'NO_CERTIFICATIONS'),
  'CV sem certificações deve sinalizar NO_CERTIFICATIONS',
);

const strongCV = computeCVQuality({
  locale: 'pt',
  experiences: [
    {
      title: 'Gestor de Operações',
      description: 'Liderei uma equipa de 12 pessoas e reduzi custos operacionais em 18%.',
    },
  ],
  skills: ['gestão', 'excel'],
  certifications: ['PMP'],
  hasPortfolioLink: true,
});
assert(strongCV.score > weakCV.score, 'CV forte deve pontuar melhor que CV fraco');
assert(
  !strongCV.signals.some((s) => s.code === 'NO_QUANTIFIED_ACHIEVEMENTS'),
  'CV com percentagem não deve sinalizar NO_QUANTIFIED_ACHIEVEMENTS',
);

// --- matchCVAgainstOffer ---

const match = matchCVAgainstOffer(
  'Experiência em React, TypeScript e liderança de equipas ágeis.',
  ['React', 'Python', 'liderança'],
);
assert(match.matchedKeywords.includes('React'), 'deve encontrar React no texto do CV');
assert(match.missingKeywords.includes('Python'), 'deve sinalizar Python como ausente');
assert(match.matchRate > 0 && match.matchRate < 1, 'taxa de correspondência deve ser parcial');

const emptyOfferMatch = matchCVAgainstOffer('qualquer texto', []);
assert(emptyOfferMatch.matchRate === 1, 'sem palavras-chave da oferta, taxa deve ser 1');

// --- recommendCVTemplate ---

assert(
  recommendCVTemplate({ targetIndustry: 'tech', usesLargeATSEmployers: true }) === 'ats_safe',
  'grandes empregadores com ATS devem receber template ats_safe independentemente da indústria',
);
assert(
  recommendCVTemplate({ targetIndustry: 'creative', usesLargeATSEmployers: false }) ===
    'visual_creative',
  'indústria criativa sem ATS grande deve receber template visual_creative',
);
assert(
  recommendCVTemplate({ targetIndustry: 'corporate', usesLargeATSEmployers: false }) ===
    'visual_standard',
  'caso geral deve receber template visual_standard',
);

// --- validateCoverLetterPersonalization ---

const genericLetter = validateCoverLetterPersonalization({
  bodyText: 'To whom it may concern, I am writing to apply for a position.',
  employerName: 'Acme Lda',
  jobOfferTitle: 'Engenheiro de Software',
});
assert(!genericLetter.personalized, 'carta genérica não deve ser marcada como personalizada');
assert(
  genericLetter.checks.some((c) => c.code === 'GENERIC_OPENING_PHRASE'),
  'deve detetar fórmula de abertura genérica',
);
assert(
  genericLetter.checks.some((c) => c.code === 'MISSING_EMPLOYER_NAME'),
  'deve detetar ausência do nome do empregador',
);

const goodLetter = validateCoverLetterPersonalization({
  bodyText:
    'Escrevo para me candidatar à vaga de Engenheiro de Software na Acme Lda. ' +
    'Ao longo dos últimos cinco anos desenvolvi sistemas distribuídos e gostaria ' +
    'de trazer essa experiência para a vossa equipa, especialmente porque a Acme Lda ' +
    'tem uma cultura de engenharia que admiro há tempos e que se alinha com o meu percurso.',
  employerName: 'Acme Lda',
  jobOfferTitle: 'Engenheiro de Software',
});
assert(goodLetter.personalized, 'carta personalizada e completa deve passar em todas as verificações');
assert(goodLetter.checks.length === 0, 'carta válida não deve ter checks pendentes');

console.log(`\n${passed} testes passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
