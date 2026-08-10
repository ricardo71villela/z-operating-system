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
import { createClient } from '@supabase/supabase-js';

export interface SupabaseAuthConfig {
  projectUrl: string;
  publicKey: string;
  jwtSecret: string;
}

export interface SupabaseAdminConfig {
  projectUrl: string;
  secretKey: string;
}

export function loadSupabaseAuthConfigFromEnv(): SupabaseAuthConfig | null {
  const projectUrl = process.env.SUPABASE_URL;
  const publicKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!projectUrl || !publicKey || !jwtSecret) return null;

  return { projectUrl, publicKey, jwtSecret };
}

export function loadSupabaseAdminConfigFromEnv(): SupabaseAdminConfig | null {
  const projectUrl = process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!projectUrl || !secretKey) return null;

  return { projectUrl, secretKey };
}

export async function getSupabaseUserEmail(
  config: SupabaseAdminConfig,
  userId: string,
): Promise<string | null> {
  const client = createClient(config.projectUrl, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(`Supabase Auth Admin getUserById failed: ${error.message}`);
  }

  return data.user?.email ?? null;
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
    headers: { 'Content-Type': 'application/json', apikey: config.publicKey },
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

export interface ZosIdentityBinding {
  binding_id: string;
  domain_code: string;
  local_entity_type: string;
  local_entity_id: string;
  canonical_person_id: string;
  binding_status: string;
  linked_at: string | null;
}

/**
 * Z Jobs Identity Adapter v1.
 *
 * Liga a identidade local Jobs já pré-registada à pessoa canónica ZOS.
 *
 * Esta operação é deliberadamente feita através do Data API com o
 * access token DO PRÓPRIO utilizador:
 *
 *   authenticated user
 *        -> zos_api
 *        -> ensure_current_identity_binding('jobs')
 *
 * Nunca usa service_role, jobs_runtime ou platform_internal para
 * contornar o contrato de identidade do Core.
 */
export async function ensureJobsIdentityBinding(
  config: SupabaseAuthConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZosIdentityBinding> {
  const token = accessToken.trim();

  if (!token) {
    throw new Error(
      'Z Jobs identity binding requires an authenticated Supabase access token',
    );
  }

  const client = createClient(
    config.projectUrl,
    config.publicKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: fetchImpl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  const { data, error } = await client
    .schema('zos_api')
    .rpc(
      'ensure_current_identity_binding',
      { p_domain_code: 'jobs' },
    );

  if (error) {
    throw new Error(
      `Z Jobs identity binding failed: ${error.message}`,
    );
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      'Z Jobs identity binding returned an unexpected result',
    );
  }

  const binding = data[0] as Partial<ZosIdentityBinding>;

  if (
    binding.domain_code !== 'jobs' ||
    binding.local_entity_type !== 'person' ||
    binding.binding_status !== 'linked' ||
    typeof binding.canonical_person_id !== 'string' ||
    !binding.canonical_person_id
  ) {
    throw new Error(
      'Z Jobs identity binding did not resolve a linked canonical person',
    );
  }

  return binding as ZosIdentityBinding;
}

export async function loginWithSupabase(config: SupabaseAuthConfig, email: string, password: string): Promise<SupabaseLoginResult> {
  const res = await fetch(`${config.projectUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.publicKey },
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
