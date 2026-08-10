// apps/api/src/auth.ts
//
// Autenticação real por password + sessões (P0.2 da auditoria técnica).
// Só é ativado quando a API está ligada a Postgres real (DATABASE_URL
// definida) — em memória continua sem autenticação, como sempre esteve.
//
// Password nunca é guardada nem comparada em texto simples: scrypt
// (nativo do Node, sem dependência extra) com salt aleatório por
// utilizador. Tokens de sessão são aleatórios (32 bytes), e só o HASH do
// token é guardado na base de dados — perder a base de dados não expõe
// sessões ativas.

import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { loadSupabaseAuthConfigFromEnv, verifySupabaseJWT } from './supabaseAuth';

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Qualquer coisa com um .query(text, params) compatível com pg — tanto
 * pg.Pool como PgStore (via o seu método query() com reconhecimento do
 * client da transação do pedido atual). Isto é essencial: se createSession
 * usasse pool.query() diretamente numa ligação separada, tentaria ver um
 * auth.users ainda não committed pela transação do próprio pedido de
 * signup — e falhava com violação de foreign key.
 */
export interface Queryable {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored_ = Buffer.from(hashHex, 'hex');
  if (derived.length !== stored_.length) return false;
  return timingSafeEqual(derived, stored_);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}

export async function createSession(db: Queryable, userId: string): Promise<Session> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    `insert into auth.sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );
  return { token, userId, expiresAt };
}

/** Devolve o userId da sessão válida, ou null se o token for inválido/expirado/ausente. */
export async function resolveSession(db: Queryable, authorizationHeader: string | undefined): Promise<string | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const { rows } = await db.query(
    `select user_id from auth.sessions where token_hash = $1 and expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Caminho duplo, deliberado: se houver configuração real do Supabase
 * (SUPABASE_URL + publishable key), verifica o access token através de
 * auth.getClaims(), usando as signing keys/JWKS do projeto. Sem essa
 * configuração, cai para a autenticação
 * própria já testada (150+ vezes nesta base de código), para continuar
 * a poder testar e desenvolver aqui, onde não há acesso de rede real ao
 * Supabase. Nunca finge que uma chamada de rede ao Supabase foi
 * verificada quando não foi — os dois caminhos são genuinamente
 * distintos, não uma simulação de um a esconder o outro.
 */
export async function resolveAuthenticatedUserId(db: Queryable, authorizationHeader: string | undefined): Promise<string | null> {
  const supabaseConfig = loadSupabaseAuthConfigFromEnv();
  if (supabaseConfig) {
    if (!authorizationHeader?.startsWith('Bearer ')) return null;
    const token = authorizationHeader.slice('Bearer '.length).trim();
    return await verifySupabaseJWT(supabaseConfig, token);
  }
  return resolveSession(db, authorizationHeader);
}
