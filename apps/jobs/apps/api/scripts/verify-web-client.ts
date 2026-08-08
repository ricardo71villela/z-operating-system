// apps/api/scripts/verify-web-client.ts
//
// Testa o módulo apps/web/apiClient.js — a camada que o ZJobsDemo.jsx vai
// usar para deixar de ter estado falso — contra o servidor real a correr
// localmente. Prova que as chamadas fetch() estão corretamente moldadas
// e que o servidor responde como o cliente espera.

import * as api from '../../web/apiClient.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error('FALHOU: ' + message);
  console.log('  ✓ ' + message);
}

async function main() {
  console.log('=== Verificação do cliente da API real (apiClient.js) ===\n');

  console.log('1. Candidato regista-se');
  const ana = await api.signupCandidate({ fullName: 'Ana Verificação', email: `ana-${Date.now()}@teste.pt`, password: 'senha123456', termsAccepted: true });
  assert(!!ana.id, 'candidato recebeu um id');
  assert(!!ana.token, 'candidato recebeu um token de sessão');

  console.log('\n2. Recrutador regista-se e cria organização');
  const recrutador = await api.signupCandidate({ fullName: 'Recrutador Verificação', email: `r-${Date.now()}@teste.pt`, password: 'senha123456', termsAccepted: true });
  const org = await api.createOrganization({ legalName: 'Zeta Verificação Lda', displayName: 'Zeta Verificação', createdBy: recrutador.id });
  assert(!!org.id, 'organização criada com id');

  console.log('\n3. Bootstrap de staff (para poder rever/publicar)');
  const staff = await api.signupCandidate({ fullName: 'Staff Verificação', email: `staff-${Date.now()}@teste.pt`, password: 'senha123456', termsAccepted: true });
  api.setAuthToken(staff.token);
  await api.bootstrapAdmin();

  console.log('\n3b. Organização pede e recebe verificação (regra real: só empregador verificado cria ofertas)');
  api.setAuthToken(recrutador.token);
  await api.requestOrganizationVerification(org.id);
  api.setAuthToken(staff.token);
  await api.approveOrganizationVerification(org.id);

  console.log('\n4. Recrutador cria oferta de emprego');
  api.setAuthToken(recrutador.token);
  const offer = await api.createJobOffer({
    organizationId: org.id, title: 'Engenheiro/a Backend (verificação)', description: 'Oferta criada pelo script de verificação do cliente real.',
    contractType: 'permanent', salaryMin: 2200, salaryCurrency: 'EUR', salaryPeriod: 'monthly',
    hasFixedSalary: true, workRegime: 'remote', employerIdentified: true, pillar: 'professional_careers',
  });
  assert(!!offer.id, 'oferta criada com id');
  assert(offer.status === 'draft', 'oferta começa em rascunho');

  console.log('\n5. Recrutador submete para revisão');
  await api.submitOfferForReview(offer.id);

  console.log('\n6. Staff revê e publica');
  api.setAuthToken(staff.token);
  await api.reviewOffer(offer.id);
  await api.publishOffer(offer.id);

  console.log('\n7. Qualquer visitante vê a oferta publicada');
  api.setAuthToken(null);
  const published = await api.listPublishedOffers();
  const found = published.find((o: any) => o.id === offer.id);
  assert(!!found, 'a oferta publicada aparece na lista pública');
  assert(found.status === 'published', 'estado correto: published');

  console.log('\n8. Candidata candidata-se');
  api.setAuthToken(ana.token);
  const application = await api.applyToOffer({ jobOfferId: offer.id, candidateId: ana.id });
  assert(!!application.id, 'candidatura criada com id');
  assert(application.status === 'submitted', 'candidatura começa em submitted');

  console.log('\n=== Jornada completa verificada com sucesso, ponta a ponta ===');
}

main().catch((err) => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
