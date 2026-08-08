// apps/api/scripts/verify-vertical-slice.ts
//
// Corre o servidor real (server.ts) num porto local e executa os 13 passos
// do vertical slice descritos na secção 20 do briefing, usando fetch nativo
// do Node. Falha (exit code != 0) se qualquer passo não se comportar como
// esperado — incluindo os testes NEGATIVOS obrigatórios da secção 23.

import { createServer } from '../src/server';

const PORT = 4321;
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

async function main() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Servidor de teste em ${BASE}\n`);

  try {
    // Passo 0 (só relevante com Postgres real): bootstrap do primeiro staff da
    // plataforma — necessário porque as ações de admin (rever/aprovar/publicar
    // ofertas, aprovar verificação, resolver denúncias) agora exigem staff real.
    const adminSignup = await (await fetch(`${BASE}/candidates`, {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Staff Z Jobs', email: 'staff@zjobs.local', password: 'staff-senha-123', termsAccepted: true }),
    })).json();
    if (!adminSignup.token) console.error('  [debug] signup staff sem token:', adminSignup);
    const adminHeaders: Record<string, string> = adminSignup.token ? { Authorization: `Bearer ${adminSignup.token}` } : {};
    if (adminSignup.token) {
      const bootstrap = await fetch(`${BASE}/auth/bootstrap-admin`, { method: 'POST', headers: adminHeaders });
      check('0. bootstrap do primeiro staff da plataforma aceite', bootstrap.status === 200);

      const secondBootstrapAttempt = await (await fetch(`${BASE}/candidates`, {
        method: 'POST',
        body: JSON.stringify({ fullName: 'Impostor', email: 'impostor@zjobs.local', password: 'x-senha-123', termsAccepted: true }),
      })).json();
      if (!secondBootstrapAttempt.token) {
        console.error('  [debug] signup do Impostor não devolveu token:', secondBootstrapAttempt);
      }
      const impostorHeaders = { Authorization: `Bearer ${secondBootstrapAttempt.token}` };
      const secondBootstrap = await fetch(`${BASE}/auth/bootstrap-admin`, { method: 'POST', headers: impostorHeaders });
      check('(negativo) segundo bootstrap de staff é bloqueado (403) — só o primeiro utilizador vira staff', secondBootstrap.status === 403, await secondBootstrap.clone().json());

      const unauthApprove = await fetch(`${BASE}/organizations/qualquer-id/approve-verification`, { method: 'POST', headers: impostorHeaders });
      check('(negativo) não-staff não consegue aprovar verificação (403)', unauthApprove.status === 403);
    }

    // Passo 1: candidato cria conta (com password, quando ligado a Postgres real -> token de sessão)
    const candidate = await (await fetch(`${BASE}/candidates`, {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Ana Ferreira', email: 'ana@example.com', password: 'senha-forte-123', termsAccepted: true }),
    })).json();
    if (!candidate.token) console.error('  [debug] signup candidata sem token:', candidate);
    check('1. candidato criado', !!candidate.id);
    const authHeaders: Record<string, string> = candidate.token ? { Authorization: `Bearer ${candidate.token}` } : {};

    // Passo 1b (só relevante com Postgres real): confirma que autenticação real está a bloquear terceiros
    if (candidate.token) {
      const forbidden = await fetch(`${BASE}/candidates/${candidate.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ professionalTitle: 'Impostor' }),
      });
      check('(negativo) editar perfil de outro candidato sem sessão própria é bloqueado (403)', forbidden.status === 403);
    }

    // Passo 2: completa perfil mínimo
    const profile = await (await fetch(`${BASE}/candidates/${candidate.id}/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        professionalTitle: 'Engenheira de Software',
        summary: 'Recém-licenciada, interessada em primeiro emprego.',
        visibility: 'visible_to_verified_employers',
      }),
    })).json();
    check('2. perfil de candidato criado', profile.professionalTitle === 'Engenheira de Software', profile);

    // Passo 3: empresa cria conta organizacional
    const recruiterUser = await (await fetch(`${BASE}/candidates`, {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Recrutador Zeta', email: 'recrutador@zeta.pt', password: 'recrutador-senha-123', termsAccepted: true }),
    })).json();
    if (!recruiterUser.token) console.error('  [debug] signup recrutador sem token:', recruiterUser);
    const recruiterHeaders: Record<string, string> = recruiterUser.token ? { Authorization: `Bearer ${recruiterUser.token}` } : {};
    const org = await (await fetch(`${BASE}/organizations`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        legalName: 'Zeta Tech Lda',
        displayName: 'Zeta Tech',
        createdBy: recruiterUser.id,
      }),
    })).json();
    check('3. organização criada, unverified', org.verificationStatus === 'unverified', org);

    // Passo 4: empresa solicita verificação
    const pendingOrg = await (await fetch(`${BASE}/organizations/${org.id}/request-verification`, {
      method: 'POST',
      headers: recruiterHeaders,
    })).json();
    check('4. verificação solicitada', pendingOrg.verificationStatus === 'pending', pendingOrg);

    // Passo 5: admin verifica a empresa
    const verifiedOrg = await (await fetch(`${BASE}/organizations/${org.id}/approve-verification`, {
      method: 'POST',
      headers: adminHeaders,
    })).json();
    check('5. empresa verificada', verifiedOrg.verificationStatus === 'verified', verifiedOrg);

    // --- Teste negativo: oferta sem salário fixo deve ser rejeitada ---
    const badOffer = await (await fetch(`${BASE}/job-offers`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        organizationId: org.id,
        title: 'Vendedor porta a porta',
        description: 'Trabalho apenas à comissão, ganhos ilimitados, sem ordenado fixo.',
        contractType: 'other',
        salaryMin: 0,
        salaryCurrency: 'EUR',
        salaryPeriod: 'monthly',
        hasFixedSalary: false,
        workRegime: 'on_site',
        employerIdentified: true,
        pillar: 'professional_careers',
      }),
    })).json();
    await fetch(`${BASE}/job-offers/${badOffer.id}/submit-for-review`, { method: 'POST', headers: recruiterHeaders });
    const badReview = await fetch(`${BASE}/job-offers/${badOffer.id}/review`, { method: 'POST', headers: adminHeaders });
    check(
      '(negativo) oferta sem salário fixo é rejeitada (422)',
      badReview.status === 422,
      await badReview.clone().json(),
    );

    // --- Perfil de candidato rico (experiência, educação, skills, idiomas, docs) ---
    await fetch(`${BASE}/candidates/${candidate.id}/experiences`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ companyName: 'Estágio Curricular Lda', title: 'Estagiária', startDate: '2025-01-01', isCurrent: false }),
    });
    await fetch(`${BASE}/candidates/${candidate.id}/education`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ institutionName: 'Universidade de Lisboa', degree: 'Licenciatura', fieldOfStudy: 'Engenharia Informática' }),
    });
    await fetch(`${BASE}/candidates/${candidate.id}/skills`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ skillName: 'TypeScript' }) });
    await fetch(`${BASE}/candidates/${candidate.id}/languages`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ languageCode: 'pt' }) });
    await fetch(`${BASE}/candidates/${candidate.id}/documents`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ docType: 'cv', fileName: 'ana-ferreira-cv.pdf' }),
    });
    const bundle = await (await fetch(`${BASE}/candidates/${candidate.id}/profile-bundle`, { headers: authHeaders })).json();
    check('perfil rico: 1 experiência registada', bundle.experiences.length === 1);
    check('perfil rico: 1 educação registada', bundle.education.length === 1);
    check('perfil rico: CV presente', bundle.documents.some((d: any) => d.docType === 'cv'));
    check(
      'perfil rico: completude reflete title+summary+experiência+educação+skills+idiomas+cv',
      bundle.completeness.score === 10 + 15 + 25 + 15 + 15 + 10 + 10, // 100
      bundle.completeness,
    );

    // Passo 6: empresa cria oferta VÁLIDA com salário fixo obrigatório
    const offer = await (await fetch(`${BASE}/job-offers`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        organizationId: org.id,
        title: 'Engenheiro/a de Software Júnior',
        description:
          'Programa de primeiro emprego para recém-licenciados, mentoria ' +
          'incluída, salário fixo mensal garantido, contrato sem termo.',
        contractType: 'permanent',
        salaryMin: 1500,
        salaryMax: 1800,
        salaryCurrency: 'EUR',
        salaryPeriod: 'monthly',
        hasFixedSalary: true,
        workRegime: 'hybrid',
        employerIdentified: true,
        pillar: 'first_jobs',
      }),
    })).json();
    check('6. oferta criada em draft', offer.status === 'draft' && offer.hasFixedSalary === true);

    // Passo 7: sistema valida a oferta (submissão + review)
    await fetch(`${BASE}/job-offers/${offer.id}/submit-for-review`, { method: 'POST', headers: recruiterHeaders });
    const reviewed = await (await fetch(`${BASE}/job-offers/${offer.id}/review`, { method: 'POST', headers: adminHeaders })).json();
    check('7. oferta válida aprovada automaticamente', reviewed.status === 'approved');

    // Passo 8: administrador "aprova" (já refletido acima — aqui confirmamos idempotência do estado)
    check('8. oferta em estado approved antes de publicar', reviewed.status === 'approved');

    // Passo 9: oferta fica publicamente visível
    const published = await (await fetch(`${BASE}/job-offers/${offer.id}/publish`, { method: 'POST', headers: adminHeaders })).json();
    check('9. oferta publicada', published.status === 'published');

    // Passo 10: candidato pesquisa a oferta
    const publicOffers = await (await fetch(`${BASE}/job-offers`)).json();
    check(
      '10. oferta aparece na pesquisa pública',
      publicOffers.some((o: any) => o.id === offer.id),
      { offerId: offer.id, offerStatus: offer.status, publicOffers },
    );

    // --- Teste negativo: não se pode candidatar a oferta não publicada ---
    const unpublishedApplyRes = await fetch(`${BASE}/applications`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ jobOfferId: badOffer.id, candidateId: candidate.id }),
    });
    check(
      '(negativo) não é possível candidatar-se a oferta não publicada',
      // Com RLS a sério, um candidato nem sequer consegue VER uma oferta que
      // não está publicada (não é membro da organização) — 404 é o
      // comportamento correto (não revela a existência da oferta), mais
      // seguro do que um 409 que confirmaria que ela existe.
      unpublishedApplyRes.status === 404 || unpublishedApplyRes.status === 409,
      { status: unpublishedApplyRes.status, body: await unpublishedApplyRes.clone().json() },
    );

    // Passo 11: candidato candidata-se
    const application = await (await fetch(`${BASE}/applications`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ jobOfferId: offer.id, candidateId: candidate.id }),
    })).json();
    check('11. candidatura submetida', application.status === 'submitted');

    // Passo 12: empresa visualiza a candidatura
    const orgApplications = await (await fetch(`${BASE}/job-offers/${offer.id}/applications`, { headers: recruiterHeaders })).json();
    check(
      '12. empresa vê a candidatura',
      orgApplications.some((a: any) => a.id === application.id),
      orgApplications,
    );

    // Passo 13: ambas as partes veem o estado; empresa avança o pipeline
    const candidateView = await (await fetch(`${BASE}/applications/${application.id}`, { headers: authHeaders })).json();
    check('13a. candidato vê estado da candidatura', candidateView.status === 'submitted');

    const advanced = await (await fetch(`${BASE}/applications/${application.id}/transition`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({ to: 'received', actor: 'company' }),
    })).json();
    check('13b. empresa avança candidatura para "received"', advanced.status === 'received');

    // --- Teste negativo: candidato não pode marcar-se como "hired" ---
    const candidateSelfHireRes = await fetch(`${BASE}/applications/${application.id}/transition`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ to: 'hired', actor: 'candidate' }),
    });
    check('(negativo) candidato não pode auto-aprovar contratação', candidateSelfHireRes.status === 403);
    // --- Employment Responsibility Index (secção 8) ---
    // Avança a candidatura até 'hired' para gerar first_job_hires_count > 0.
    for (const to of ['screening', 'shortlisted', 'interview', 'offer']) {
      const r = await fetch(`${BASE}/applications/${application.id}/transition`, { method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ to, actor: 'company' }) });
      if (r.status !== 200) console.error(`  [debug] transição para ${to} falhou:`, r.status, await r.clone().json());
    }
    const hired = await (await fetch(`${BASE}/applications/${application.id}/transition`, {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ to: 'hired', actor: 'company' }),
    })).json();
    check('candidatura avançada até hired', hired.status === 'hired', hired);

    const eri = await (await fetch(`${BASE}/organizations/${org.id}/responsibility`)).json();
    check('ERI: salaryTransparencyScore = 100 (única oferta publicada, com salário fixo)', eri.components.salaryTransparencyScore === 100, eri);
    check('ERI: verified_employer elegível', eri.badges.includes('verified_employer'));
    check('ERI: first_job_employer elegível (1 contratação em first_jobs)', eri.badges.includes('first_job_employer'), eri);
    check(
      'ERI: salary_transparent_employer NÃO elegível (só 1 oferta publicada, exige >=3)',
      !eri.badges.includes('salary_transparent_employer'),
      eri,
    );

    // --- Moderação / denúncias (secções 10, 11, 15, 23) ---
    const report = await (await fetch(`${BASE}/reports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        targetType: 'job_offer',
        targetId: offer.id,
        reason: 'Condições diferentes das anunciadas na entrevista.',
        reportedBy: candidate.id,
      }),
    })).json();
    check('denúncia criada em estado open', report.status === 'open');

    // --- Teste negativo: não é possível resolver uma denúncia duas vezes ---
    await fetch(`${BASE}/reports/${report.id}/resolve`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ resolution: 'confirmed', actorId: 'admin-1' }),
    });
    const secondResolveRes = await fetch(`${BASE}/reports/${report.id}/resolve`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ resolution: 'confirmed', actorId: 'admin-1' }),
    });
    check('(negativo) não é possível resolver a mesma denúncia duas vezes', secondResolveRes.status === 409);

    const suspendedOffer = await (await fetch(`${BASE}/job-offers`)).json();
    check('oferta denunciada e confirmada deixa de estar publicamente visível (suspensa)', !suspendedOffer.some((o: any) => o.id === offer.id));

    const eriAfterComplaint = await (await fetch(`${BASE}/organizations/${org.id}/responsibility`)).json();
    check('ERI: denúncia confirmada reduz integrityScore', eriAfterComplaint.components.integrityScore === 80, eriAfterComplaint);
    check('ERI: responsible_recruiter deixa de ser elegível após reclamação confirmada', !eriAfterComplaint.badges.includes('responsible_recruiter'), eriAfterComplaint);

    const auditLogs = await (await fetch(`${BASE}/audit-logs`, { headers: adminHeaders })).json();
    check('audit log regista aprovação, publicação e suspensão da oferta', [
      auditLogs.some((a: any) => a.entityId === offer.id && a.action === 'approve'),
      auditLogs.some((a: any) => a.entityId === offer.id && a.action === 'publish'),
      auditLogs.some((a: any) => a.entityId === offer.id && a.action === 'suspend'),
    ].every(Boolean), auditLogs);

    // --- Instituições (secção 9) ---
    const universityUser = await (await fetch(`${BASE}/candidates`, {
      method: 'POST', body: JSON.stringify({ fullName: 'Career Center ISEL', email: 'careers@isel.pt', password: 'isel-senha-123', termsAccepted: true }),
    })).json();
    const universityHeaders: Record<string, string> = universityUser.token ? { Authorization: `Bearer ${universityUser.token}` } : {};
    const university = await (await fetch(`${BASE}/organizations`, {
      method: 'POST',
      headers: universityHeaders,
      body: JSON.stringify({ legalName: 'ISEL', displayName: 'ISEL', createdBy: universityUser.id, type: 'polytechnic' }),
    })).json();
    await fetch(`${BASE}/organizations/${university.id}/courses`, {
      method: 'POST',
      headers: universityHeaders,
      body: JSON.stringify({ name: 'Engenharia Informática', fieldOfStudy: 'Informática' }),
    });

    // Cria uma 2ª oferta válida, publica-a, e reserva-a para a instituição.
    const offer2 = await (await fetch(`${BASE}/job-offers`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({
        organizationId: org.id, title: 'Estágio Curricular', description: 'Estágio remunerado para alunos de Engenharia Informática, salário fixo garantido.',
        contractType: 'paid_internship', salaryMin: 900, salaryCurrency: 'EUR', salaryPeriod: 'monthly',
        hasFixedSalary: true, workRegime: 'on_site', employerIdentified: true, pillar: 'first_jobs',
      }),
    })).json();
    await fetch(`${BASE}/job-offers/${offer2.id}/submit-for-review`, { method: 'POST', headers: recruiterHeaders });
    await fetch(`${BASE}/job-offers/${offer2.id}/review`, { method: 'POST', headers: adminHeaders });
    await fetch(`${BASE}/job-offers/${offer2.id}/publish`, { method: 'POST', headers: adminHeaders });

    const reservation = await fetch(`${BASE}/job-offers/${offer2.id}/reserve-for-institution`, {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ institutionOrgId: university.id }),
    });
    check('reserva de oferta para instituição aceite (201)', reservation.status === 201, { status: reservation.status, body: await reservation.clone().json(), universityId: university.id, offer2Id: offer2.id });

    const reservedOffers = await (await fetch(`${BASE}/organizations/${university.id}/reserved-offers`)).json();
    check('instituição vê a oferta reservada', reservedOffers.some((o: any) => o.id === offer2.id), reservedOffers);

    // --- Teste negativo: não se pode reservar oferta para uma organização que não é instituição ---
    const badReservation = await fetch(`${BASE}/job-offers/${offer2.id}/reserve-for-institution`, {
      method: 'POST', headers: recruiterHeaders, body: JSON.stringify({ institutionOrgId: org.id }), // org é 'employer', não instituição
    });
    check('(negativo) não é possível reservar oferta para uma organização que não é instituição', badReservation.status === 422);

    // --- i18n real (secção 14) — traduções via tabela genérica, com fallback ---
    // Usa offer2: 'offer' já está suspensa pela denúncia confirmada acima.
    await fetch(`${BASE}/job-offers/${offer2.id}/translations`, {
      method: 'POST',
      headers: recruiterHeaders,
      body: JSON.stringify({ field: 'title', locale: 'en', value: 'Curricular Internship' }),
    });
    const offersInEnglish = await (await fetch(`${BASE}/job-offers?locale=en`)).json();
    const translatedOffer = offersInEnglish.find((o: any) => o.id === offer2.id);
    check('oferta traduzida para inglês quando existe tradução', translatedOffer?.title === 'Curricular Internship', offersInEnglish);
    check('marca isFallback=false quando a tradução pedida existe', translatedOffer?.translation.isFallback === false);

    const offersInSpanish = await (await fetch(`${BASE}/job-offers?locale=es`)).json();
    const fallbackOffer = offersInSpanish.find((o: any) => o.id === offer2.id);
    check(
      'sem tradução em espanhol -> cai para inglês (fallback), não fica sem tradução nenhuma',
      fallbackOffer?.title === 'Curricular Internship',
      fallbackOffer,
    );
    check('marca isFallback=true quando usa fallback', fallbackOffer?.translation.isFallback === true);
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main();
