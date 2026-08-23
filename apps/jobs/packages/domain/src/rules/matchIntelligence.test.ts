import assert from 'node:assert/strict';
import { buildMatchIntelligence, classifyMatchFit, computeMatchConfidence } from './matchIntelligence';
import type { MatchFactor, MatchResult } from './matching';

const factors: MatchFactor[] = [
  { code: 'skills', level: 'match', weight: 0.35, messageKey: 'skills' },
  { code: 'contract_type', level: 'match', weight: 0.15, messageKey: 'contract' },
  { code: 'work_regime', level: 'partial', weight: 0.15, messageKey: 'regime' },
  { code: 'salary_fit', level: 'mismatch', weight: 0.15, messageKey: 'salary' },
  { code: 'life_stage', level: 'unknown', weight: 0.1, messageKey: 'life' },
  { code: 'location', level: 'unknown', weight: 0.1, messageKey: 'location' },
];

assert.equal(computeMatchConfidence(factors), 80);
assert.equal(classifyMatchFit(84, 80), 'strong');
assert.equal(classifyMatchFit(90, 30), 'insufficient_evidence');
assert.equal(classifyMatchFit(68, 80), 'good');
assert.equal(classifyMatchFit(52, 80), 'possible');
assert.equal(classifyMatchFit(30, 80), 'weak');

const result: MatchResult = { score: 72.5, factors };
const intelligence = buildMatchIntelligence(result);

assert.equal(intelligence.score, 72.5);
assert.equal(intelligence.confidence, 80);
assert.equal(intelligence.fitBand, 'good');
assert.equal(intelligence.advisoryOnly, true);
assert.deepEqual(intelligence.strengths.map((factor) => factor.code), ['skills', 'contract_type']);
assert.deepEqual(intelligence.tradeoffs.map((factor) => factor.code), ['work_regime']);
assert.deepEqual(intelligence.conflicts.map((factor) => factor.code), ['salary_fit']);
assert.deepEqual(intelligence.unknowns.map((factor) => factor.code), ['life_stage', 'location']);

const skillMismatch: MatchResult = {
  score: 40,
  factors: factors.map((factor) =>
    factor.code === 'skills' ? { ...factor, level: 'mismatch' as const } : factor,
  ),
};
assert.equal(buildMatchIntelligence(skillMismatch).conflicts.some((factor) => factor.code === 'skills'), false);

console.log('MATCH INTELLIGENCE: PASS');
