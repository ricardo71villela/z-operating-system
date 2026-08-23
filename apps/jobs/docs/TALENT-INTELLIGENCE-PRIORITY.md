# Z Jobs — Talent Intelligence & Assessments — P0 Product Priority

## Decision

As of 2026-08-23, **Talent Intelligence / Candidate Assessments is a P0 Z Jobs product priority immediately after the PR #57 security hardening gate**.

This program is intended to move Z Jobs beyond a listings marketplace into an explainable talent-intelligence platform while preserving candidate dignity, privacy, fairness and human decision authority.

## Sequencing authority

1. **Close PR #57 security boundary first**
   - protect `GET /candidates/:id/profile-bundle` explicitly;
   - unauthenticated → blocked;
   - own candidate → allowed;
   - different authenticated candidate → blocked;
   - authorized platform staff → allowed;
   - prove the boundary in real PostgreSQL/RLS.
2. **Talent Intelligence / Assessments becomes the next P0 Z Jobs product program.**
3. Hosting/deployment remains a separate gate; this priority does not require Railway mutation.

## Product objective

Build a modular assessment platform that can add verified evidence to a candidate's professional profile without reducing a person to one opaque score.

The target model is:

```text
Professional profile
+ experience
+ declared skills
+ languages
+ job preferences
+ validated assessments
+ role-specific evidence
        ↓
Talent Profile Intelligence
        ↓
Explainable, human-reviewed recruiting support
```

## First assessment wave

### A1 — Logical / analytical reasoning

Initial capability should measure job-relevant reasoning primitives such as:

- pattern recognition;
- numerical reasoning;
- information interpretation;
- problem decomposition;
- attention to relevant constraints.

Output must be dimension-level evidence, not a universal intelligence label.

### A2 — Professional work-style questionnaire

A structured self-report module may describe professional work-style dimensions such as:

- collaboration;
- autonomy;
- planning/structure preference;
- adaptability;
- communication preference;
- decision style.

This is **not** a medical, clinical or psychiatric assessment and must never infer or label mental-health conditions, disability, personality disorders or other protected/sensitive traits.

### A3 — Role-specific skills assessment

Job-family modules should test evidence that is directly relevant to the role, for example:

- engineering: debugging, systems reasoning, SQL, code review;
- sales: scenario-based negotiation, objection handling, customer reasoning;
- operations/admin: prioritization, data accuracy, spreadsheet reasoning;
- management: structured decision scenarios, prioritization, communication trade-offs.

Role-specific assessment should generally carry more hiring relevance than generic psychometric signals because it is closer to demonstrated job capability.

## Later modules

Possible later extensions, only after the foundation is validated:

- language verification;
- communication exercises;
- portfolio/work-sample verification;
- structured situational judgement tests;
- timed technical challenges;
- candidate self-development reports;
- AI-assisted career coaching based on candidate-visible evidence.

## Integration with Matching

Assessment evidence may enrich the existing explainable matching authority, but must not create a hidden second ranking engine.

A match explanation may say, for example:

```text
Strong evidence
- required TypeScript/PostgreSQL skills matched
- salary and contract preferences align
- role-specific backend assessment completed with strong evidence

Trade-offs
- Kubernetes is preferred but not required

Unknown
- no verified language assessment yet
```

The system must identify the source and confidence of each factor.

## Non-negotiable employment safeguards

Because recruiting is a high-impact domain, the following rules are product requirements, not optional policy notes.

### Human decision authority

- Z Jobs assessments may **support** recruiters and candidates.
- They must not autonomously hire, reject, blacklist or otherwise make a final employment decision.
- No candidate may be presented as objectively “good” or “bad” through one total score.
- Employers must receive interpretable evidence and limitations.

### Protected and sensitive attributes

Assessment design and scoring must not use or infer protected/sensitive attributes such as race/ethnicity, religion, political beliefs, sexual orientation, health/disability status or other legally protected characteristics.

Questions whose primary purpose is to recover such attributes are out of scope.

### Accessibility and accommodations

- assessment timing and presentation must support reasonable accommodations;
- time-dependent scores must distinguish speed from correctness where possible;
- accessibility requirements must be tested before employer-facing use;
- inability to take one assessment format must not automatically imply lack of professional capability.

### Consent and transparency

Candidates must be told:

- what an assessment measures;
- why it is being requested;
- whether an employer will see the result;
- what data is retained;
- how long it is retained;
- whether retakes are permitted;
- how to challenge or report a result/problem.

### Validity and fairness

Before an assessment dimension affects employer-facing matching or filtering:

- the construct must be defined;
- scoring must be deterministic/reproducible where applicable;
- reliability must be measured;
- job relevance must be documented;
- adverse-impact/fairness monitoring must be designed;
- versioning must preserve which instrument produced a result.

A fun quiz is not automatically valid hiring evidence.

### Data minimization

Store only the minimum evidence needed for the declared purpose.

Raw item-level answers should have stricter access and retention than employer-facing derived results. Employer access should default to job-relevant dimensions and evidence, not unrestricted raw response history.

## Proposed domain model

The first implementation should separate assessment definition, attempt and result authority:

```text
AssessmentDefinition
- id
- code
- version
- assessmentType
- title
- purpose
- measuredDimensions
- timePolicy
- scoringAuthorityVersion
- status

AssessmentItem
- id
- assessmentDefinitionId
- itemType
- promptVersion
- dimension
- difficultyBand

AssessmentAttempt
- id
- assessmentDefinitionId
- candidateUserId
- startedAt
- completedAt
- status
- accommodationContext (minimal / controlled)

AssessmentResult
- id
- assessmentAttemptId
- assessmentVersion
- dimensionResults[]
- confidence/evidence metadata
- generatedAt

AssessmentShareGrant
- candidateUserId
- assessmentResultId
- employer/organization scope
- grantedAt
- revokedAt
```

Exact schema is not authorized by this document; this is a product/domain direction for the implementation gate.

## P0 implementation gates

### Gate TA0 — Architecture & legal/product contract

- define assessment taxonomy;
- define candidate consent and sharing model;
- define data retention;
- define human-review rule;
- define accessibility requirements;
- define prohibited uses;
- define instrument/version authority.

### Gate TA1 — Assessment foundation

- versioned assessment definitions;
- candidate attempts;
- deterministic scoring contract;
- dimension-level results;
- audit/history;
- no employer ranking yet.

### Gate TA2 — First three modules

- logical/analytical reasoning;
- professional work-style questionnaire;
- one role-specific skills assessment family.

### Gate TA3 — Candidate experience

- assessment center in Candidate account;
- progress/history;
- candidate-readable report;
- retake/version policy;
- accessibility/accommodation path.

### Gate TA4 — Controlled employer sharing

- explicit sharing/visibility authority;
- employer sees only approved job-relevant evidence;
- no raw sensitive response dump;
- explainable limitations.

### Gate TA5 — Matching integration

Only after validity/fairness gates:

- assessment factors may be added to existing Match Intelligence;
- source/confidence must be exposed;
- no automatic reject/hire outcome;
- no opaque composite candidate score.

## Commercial potential

Future commercial packaging may include:

### Candidate

- free baseline assessment(s);
- detailed self-development report;
- verified skills profile;
- interview/career preparation.

### Employer

- role-specific assessment packs;
- candidate comparison by disclosed job-relevant evidence;
- structured assessment workflows;
- recruiter analytics.

Commercial packaging must not override the fairness, consent or human-decision safeguards above.

## Definition of success

Talent Intelligence is successful when Z Jobs can answer:

> “What verified, job-relevant evidence does this candidate choose to provide, how reliable is it, and how does it relate to this role?”

It is **not** successful if the product merely generates a psychologically impressive but opaque number.

## Priority status

```text
Z_JOBS_TALENT_INTELLIGENCE_PRIORITY=P0
PRECONDITION=PR_57_SECURITY_HARDENING_PASS
FIRST_WAVE=LOGICAL_REASONING,WORK_STYLE,ROLE_SPECIFIC_SKILLS
AUTOMATED_HIRING_DECISION=FORBIDDEN
PROTECTED_ATTRIBUTE_INFERENCE=FORBIDDEN
HUMAN_DECISION_AUTHORITY=REQUIRED
EXPLAINABILITY=REQUIRED
```

## Last Updated

2026-08-23
