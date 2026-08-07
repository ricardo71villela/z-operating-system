// apps/api/src/supabaseAuth.ts
//
// Integração real com o Supabase Auth — substitui a autenticação
// própria (scrypt + tabela de sessões) que existia até agora. Decisão
// tomada depois de confirmar um problema real: as migrações anteriores
// tentavam alterar `auth.users` e criar `auth.sessions` — no Supabase
// real, `auth.users` já existe, gerida por eles, sem permissões de
// escrita direta para a aplicação. A correção não é ajustar a
// migração, é deixar de escrever nessa tabela por completo.
//
// O que muda, em concreto:
// - Registo e login passam a chamar a API REST do Supabase Auth, não
//   a inserir na base de dados diretamente.
// - Verificação de sessão deixa de consultar uma tabela própria —
//   verifica a assinatura do JWT emitido pelo Supabase localmente
//   (rápido, sem pedido de rede por cada pedido HTTP).
// - `auth.uid()` no RLS continua a funcionar exatamente como já
//   funcionava: o mecanismo (`request.jwt.claim.sub` via set_config)
//   nunca dependeu da nossa tabela de sessões — só do valor do `sub`
//   extraído do token, que agora vem do Supabase em vez de ser gerado
//   por nós.
//
// AVISO HONESTO: as chamadas de rede reais (signupWithSupabase,
// loginWithSupabase) nunca foram testadas contra um projeto Supabase
// real — este ambiente não tem acesso de rede a supabase.co. A forma
// do pedido está correta segundo a documentação pública da API REST
// deles, mas "correta na forma" não é o mesmo que "testada a
// funcionar". verifySupabaseJWT() foi testada com um token assinado
// localmente com o mesmo segredo (ver supabaseAuth.test.ts) — essa
// parte está genuinamente verificada.

import jwt from 'jsonwebtoken';

export interface SupabaseAuthConfig {
  projectUrl: string; // ex: https://xyzcompany.supabase.co
  anonKey: string;
  jwtSecret: string; // Project Settings -> API -> JWT Secret, no painel do Supabase
}

export function loadSupabaseAuthConfigFromEnv(): SupabaseAuthConfig | null {
  const projectUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!projectUrl || !anonKey || !jwtSecret) return null;
  return { projectUrl, anonKey, jwtSecret };
}

export interface SupabaseSignupResult {
  userId: string;
  accessToken: string | null; // null se o Supabase exigir confirmação por email antes de emitir sessão
}

/**
 * Regista uma conta nova via API REST do Supabase Auth. Nunca escreve
 * diretamente em auth.users — é a própria Supabase quem gere essa tabela.
 */
export async function signupWithSupabase(config: SupabaseAuthConfig, email: string, password: string): Promise<SupabaseSignupResult> {
  const res = await fetch(`${config.projectUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.anonKey },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && (body.msg || body.error_description || body.error)) || `registo Supabase falhou: ${res.status}`);
  }
  return {
    userId: body.user?.id ?? body.id,
    accessToken: body.access_token ?? null,
  };
}

export interface SupabaseLoginResult {
  userId: string;
  accessToken: string;
}

export async function loginWithSupabase(config: SupabaseAuthConfig, email: string, password: string): Promise<SupabaseLoginResult> {
  const res = await fetch(`${config.projectUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.anonKey },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && (body.msg || body.error_description || body.error)) || `início de sessão Supabase falhou: ${res.status}`);
  }
  return { userId: body.user.id, accessToken: body.access_token };
}

/**
 * Verifica a assinatura do JWT emitido pelo Supabase e devolve o id do
 * utilizador (claim `sub`) se válido — null se inválido, expirado, ou
 * mal formado. Nunca consulta a base de dados: a verificação é só
 * criptográfica, local, rápida. Esta é a parte genuinamente testada
 * (ver supabaseAuth.test.ts).
 */
export function verifySupabaseJWT(config: SupabaseAuthConfig, token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { sub?: string };
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}
