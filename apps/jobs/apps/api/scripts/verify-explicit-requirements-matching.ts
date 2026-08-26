// Z Jobs — explicit qualification persistence + matching integration.
//
// Runs immediately after verify-vertical-slice.ts in jobs-postgres.yml,
// against the same disposable PostgreSQL database. The earlier vertical
// slice deliberately bootstraps the canonical CI staff account used here.
//
// This proves the full boundary, not just TypeScript shapes:
// HTTP create -> PostgreSQL columns -> PgStore enrichment -> publication ->
// matched-offers -> explicit-requirements skills evidence.

import { createServer } from '../src/server';

const PORT = 4322;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`, extra ?? '');
    failed++;
  }
}

async function jsonFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, init);
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function main() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // This account is created by verify-vertical-slice.ts, which runs in the
    // immediately preceding workflow step against the same disposable DB.
    const adminLogin = await jsonFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'staff@zjobs.local', password: 'staff-senha-123' }),
    });
    check('CI staff login available from preceding vertical slice', adminLogin.response.status === 200 && !!adminLogin.body?.token, adminLogin.body);
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body?.token}` };

    const recruiterSignup = await jsonFetch('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Requirements Recruiter',
        email: 'requirements-recruiter@zjobs.local',
        password: 'requirements-recruiter-123',
        termsAccepted: true,
      }),
    });
    check('recruiter created', recruiterSignup.response.status === 201 && !!recruiterSignup.body?.token, recruiterSignup.body);
    const recruiterHeaders = { Authorization: `Bearer ${recruiterSignup.body?.token}` };

    const orgCreate = await jsonFetch('/organizations', {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        legalName: 'Requirements Test Employer Lda',
        displayName: 'Requirements Test Employer',
        createdBy: recruiterSignup.body?.id,
        type: 'employer',
      }),
    });
    check('employer organization created', orgCreate.response.status === 201 && !!orgCreate.body?.id, orgCreate.body);
    const orgId = orgCreate.body?.id;

    const verificationRequest = await jsonFetch(`/organizations/${orgId}/request-verification`, {
      method: 'POST',
      headers: recruiterHeaders,
    });
    check('verification requested', verificationRequest.response.status === 200 && verificationRequest.body?.verificationStatus === 'pending', verificationRequest.body);

    const verificationApprove = await jsonFetch(`/organizations/${orgId}/approve-verification`, {
      method: 'POST',
      headers: adminHeaders,
    });
    check('staff verifies employer', verificationApprove.response.status === 200 && verificationApprove.body?.verificationStatus === 'verified', verificationApprove.body);

    const offerCreate = await jsonFetch('/job-offers', {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        organizationId: orgId,
        title: 'Backend Platform Engineer',
        description: 'Build reliable services for an international product.',
        responsibilities: 'Operate Kubernetes workloads and improve observability.',
        requiredQualifications: 'TypeScript PostgreSQL',
        preferredQualifications: 'Kubernetes',
        contractType: 'permanent',
        salaryMin: 3200,
        salaryMax: 4200,
        salaryCurrency: 'EUR',
        salaryPeriod: 'monthly',
        hasFixedSalary: true,
        workRegime: 'hybrid',
        employerIdentified: true,
        pillar: 'professional_careers',
      }),
    });
    check('offer created with explicit qualification fields',
      offerCreate.response.status === 201
      && offerCreate.body?.responsibilities === 'Operate Kubernetes workloads and improve observability.'
      && offerCreate.body?.requiredQualifications === 'TypeScript PostgreSQL'
      && offerCreate.body?.preferredQualifications === 'Kubernetes',
      offerCreate.body,
    );
    const offerId = offerCreate.body?.id;

    // submit-for-review returns mustGetJobOffer(), so this is the important
    // database round-trip assertion rather than merely echoing the POST body.
    const submitted = await jsonFetch(`/job-offers/${offerId}/submit-for-review`, {
      method: 'POST',
      headers: recruiterHeaders,
    });
    check('PostgreSQL round-trip preserves responsibilities', submitted.body?.responsibilities === 'Operate Kubernetes workloads and improve observability.', submitted.body);
    check('PostgreSQL round-trip preserves required qualifications', submitted.body?.requiredQualifications === 'TypeScript PostgreSQL', submitted.body);
    check('PostgreSQL round-trip preserves preferred qualifications', submitted.body?.preferredQualifications === 'Kubernetes', submitted.body);

    const reviewed = await jsonFetch(`/job-offers/${offerId}/review`, {
      method: 'POST',
      headers: adminHeaders,
    });
    check('explicit-requirements offer approved', reviewed.response.status === 200 && reviewed.body?.status === 'approved', reviewed.body);

    const published = await jsonFetch(`/job-offers/${offerId}/publish`, {
      method: 'POST',
      headers: adminHeaders,
    });
    check('explicit-requirements offer published', published.response.status === 200 && published.body?.status === 'published', published.body);

    const candidateSignup = await jsonFetch('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Requirements Candidate',
        email: 'requirements-candidate@zjobs.local',
        password: 'requirements-candidate-123',
        termsAccepted: true,
      }),
    });
    check('candidate created', candidateSignup.response.status === 201 && !!candidateSignup.body?.token, candidateSignup.body);
    const candidateId = candidateSignup.body?.id;
    const candidateHeaders = { Authorization: `Bearer ${candidateSignup.body?.token}` };

    const profile = await jsonFetch(`/candidates/${candidateId}/profile`, {
      method: 'PUT',
      headers: candidateHeaders,
      body: JSON.stringify({
        professionalTitle: 'Backend Engineer',
        summary: 'Backend engineer focused on typed services and relational data.',
        visibility: 'visible_to_verified_employers',
        desiredWorkRegime: 'hybrid',
        desiredContractTypes: ['permanent'],
        desiredSalaryMin: 3000,
        desiredSalaryCurrency: 'EUR',
      }),
    });
    check('candidate matching profile created', profile.response.status === 200, profile.body);

    await jsonFetch(`/candidates/${candidateId}/skills`, {
      method: 'POST', headers: candidateHeaders, body: JSON.stringify({ skillName: 'TypeScript' }),
    });
    await jsonFetch(`/candidates/${candidateId}/skills`, {
      method: 'POST', headers: candidateHeaders, body: JSON.stringify({ skillName: 'PostgreSQL' }),
    });

    const matched = await jsonFetch(`/candidates/${candidateId}/matched-offers?locale=en`, {
      headers: candidateHeaders,
    });
    const matchedOffer = Array.isArray(matched.body)
      ? matched.body.find((entry: any) => entry.offer?.id === offerId)
      : null;
    check('published offer appears in matched-offers', matched.response.status === 200 && !!matchedOffer, matched.body);

    const skillsFactor = matchedOffer?.match?.factors?.find((factor: any) => factor.code === 'skills');
    check('matched-offers uses explicit requirements as skills evidence',
      skillsFactor?.evidenceSource === 'explicit_requirements'
      && skillsFactor?.level === 'match'
      && skillsFactor?.requiredMatchCount === 2,
      skillsFactor,
    );
    check('preferred qualification is kept distinct from required evidence', skillsFactor?.preferredMatchCount === 0, skillsFactor);
    check('matching explanation remains translated and explainable',
      typeof skillsFactor?.explanation === 'string'
      && skillsFactor.explanation.toLowerCase().includes('skill'),
      skillsFactor,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log(`\nEXPLICIT_REQUIREMENTS_MATCHING_PASSED=${passed}`);
  console.log(`EXPLICIT_REQUIREMENTS_MATCHING_FAILED=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
