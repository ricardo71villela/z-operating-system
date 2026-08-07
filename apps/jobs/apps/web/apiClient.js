// apps/web/apiClient.js
//
// Camada de acesso à API real — substitui o estado local falso do
// ZJobsDemo.jsx por chamadas fetch() reais contra apps/api/src/server.ts.
//
// AVISO SOBRE DUPLICAÇÃO: este ficheiro existe para ser importado por
// scripts Node (ver apps/api/scripts/verify-web-client.ts, onde foi
// testado a sério). O ZJobsDemo.jsx, por ser um artefacto de página
// única sem sistema de módulos no browser, tem a SUA PRÓPRIA cópia
// inline destas mesmas funções — não importa este ficheiro. Se
// alterares uma rota aqui, tens de replicar a alteração lá também, ou
// as duas cópias divergem sem ninguém notar — exatamente a classe de
// problema já apanhada nesta sessão para o simulador fiscal e o
// Estúdio de CV.
//
// AVISO HONESTO: este módulo foi testado a sério contra o servidor local
// (ver apps/api/scripts/verify-web-client.ts) — as chamadas fetch() estão
// corretamente moldadas e o servidor responde como esperado. O que NÃO foi
// possível testar aqui é o ZJobsDemo.jsx a correr num browser real a
// chamar isto: o Postgres/API correm dentro de um contentor isolado desta
// sessão, e o browser de quem abre o demo é uma máquina diferente, sem
// rede entre as duas. Ligar API_BASE_URL a um servidor publicado num
// endereço real resolve isto — o código já está pronto para essa troca.

const API_BASE_URL = (typeof window !== "undefined" && window.ZJOBS_API_BASE_URL) || "http://localhost:4000";

let authToken = null;

function setAuthToken(token) {
  authToken = token;
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && body.error) || `Pedido falhou: ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

// ---------------- Autenticação ----------------

export async function signupCandidate({ fullName, email, password, termsAccepted }) {
  const result = await apiFetch("/candidates", {
    method: "POST",
    body: JSON.stringify({ fullName, email, password, termsAccepted }),
  });
  if (result.token) setAuthToken(result.token);
  return result;
}

export async function login({ email, password }) {
  const result = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (result.token) setAuthToken(result.token);
  return result;
}

export function logout() {
  setAuthToken(null);
}

// ---------------- Organizações ----------------

export async function createOrganization({ legalName, displayName, createdBy }) {
  return apiFetch("/organizations", {
    method: "POST",
    body: JSON.stringify({ legalName, displayName, createdBy }),
  });
}

export async function listOrganizations() {
  return apiFetch("/organizations", { method: "GET" });
}

export async function requestOrganizationVerification(orgId) {
  return apiFetch(`/organizations/${orgId}/request-verification`, { method: "POST" });
}

export async function approveOrganizationVerification(orgId) {
  return apiFetch(`/organizations/${orgId}/approve-verification`, { method: "POST" });
}

export async function bootstrapAdmin() {
  return apiFetch("/auth/bootstrap-admin", { method: "POST" });
}

// ---------------- Ofertas de emprego ----------------

export async function createJobOffer(draft) {
  return apiFetch("/job-offers", { method: "POST", body: JSON.stringify(draft) });
}

export async function submitOfferForReview(offerId) {
  return apiFetch(`/job-offers/${offerId}/submit-for-review`, { method: "POST" });
}

export async function reviewOffer(offerId) {
  return apiFetch(`/job-offers/${offerId}/review`, { method: "POST" });
}

export async function publishOffer(offerId) {
  return apiFetch(`/job-offers/${offerId}/publish`, { method: "POST" });
}

export async function listPublishedOffers() {
  return apiFetch("/job-offers?status=published", { method: "GET" });
}

// ---------------- Candidaturas ----------------

export async function applyToOffer({ jobOfferId, candidateId }) {
  return apiFetch("/applications", {
    method: "POST",
    body: JSON.stringify({ jobOfferId, candidateId }),
  });
}

export { API_BASE_URL, setAuthToken };
