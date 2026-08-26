import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { deskAdmin, supabaseAdmin } from '../supabase/supabase-admin';
import type { DeskAuthContext } from '../auth/desk-auth-context';

export type DeskOAuthProvider = 'gmail' | 'microsoft' | 'google_calendar' | 'microsoft_calendar';
export type DeskOAuthPurpose = 'email_connect' | 'calendar_connect';

export interface ConsumedDeskOAuthState {
  workspaceId: string;
  workspaceMemberId: string;
  personId: string;
}

function stateSecret(): Buffer {
  const secret = process.env.DESK_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DESK_OAUTH_STATE_SECRET must be at least 32 characters.');
  }
  return Buffer.from(secret, 'utf8');
}

function nonceHash(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex');
}

function signatureFor(nonce: string): string {
  return createHmac('sha256', stateSecret()).update(`zdesk.oauth.v1.${nonce}`, 'utf8').digest('base64url');
}

function parseAndVerifyState(state: string): string {
  const [version, nonce, signature] = state.split('.');
  if (version !== 'v1' || !nonce || !signature) throw new UnauthorizedException('Invalid OAuth state.');

  const expected = Buffer.from(signatureFor(nonce), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new UnauthorizedException('Invalid OAuth state signature.');
  }
  return nonce;
}

@Injectable()
export class OAuthStateService {
  async issue(
    context: DeskAuthContext,
    provider: DeskOAuthProvider,
    purpose: DeskOAuthPurpose,
  ): Promise<string> {
    const nonce = randomBytes(32).toString('base64url');
    const tokenHash = nonceHash(nonce);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await deskAdmin.from('oauth_states').insert({
      token_hash: tokenHash,
      workspace_id: context.workspaceId,
      person_id: context.personId,
      provider,
      purpose,
      expires_at: expiresAt,
    });
    if (error) throw error;

    return `v1.${nonce}.${signatureFor(nonce)}`;
  }

  async consume(
    state: string,
    provider: DeskOAuthProvider,
    purpose: DeskOAuthPurpose,
  ): Promise<ConsumedDeskOAuthState> {
    const nonce = parseAndVerifyState(state);
    const { data, error } = await supabaseAdmin.rpc('zdesk_consume_oauth_state', {
      p_token_hash: nonceHash(nonce),
      p_provider: provider,
      p_purpose: purpose,
    });
    if (error) throw new UnauthorizedException('OAuth state is invalid, expired, or already consumed.');

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.workspace_id || !row?.workspace_member_id || !row?.person_id) {
      throw new UnauthorizedException('OAuth state did not resolve active Desk authority.');
    }

    return {
      workspaceId: row.workspace_id,
      workspaceMemberId: row.workspace_member_id,
      personId: row.person_id,
    };
  }
}
