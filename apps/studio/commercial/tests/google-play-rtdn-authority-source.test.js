import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../../../infrastructure/supabase/migrations/20260821005000_zstudio_google_play_rtdn_authority_v1.sql', import.meta.url), 'utf8');
function has(...parts) { for (const part of parts) assert.ok(sql.includes(part), `missing ${part}`); }

test('RTDN receipt ledger stores only trigger metadata and hashed subscription authority', () => {
  has(
    'create table studio.google_play_rtdn_receipts',
    "message_id text primary key",
    'source_subscription_ref text',
    "'^google:play:purchase:[0-9a-f]{64}$'",
    'alter table studio.google_play_rtdn_receipts enable row level security',
  );
  for (const forbidden of ['purchase_token', 'oidc_token', 'raw_payload', 'authorization_header']) {
    assert.equal(sql.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test('identity resolver prefers existing Google provider binding and cross-checks external identity', () => {
  has(
    'create function public.zstudio_resolve_google_play_rtdn_identity(',
    "where s.billing_source = 'google_play'",
    'and s.source_subscription_ref = v_subscription_ref',
    "raise exception 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_CONFLICT'",
    "raise exception 'GOOGLE_PLAY_RTDN_EXTERNAL_IDENTITY_REQUIRED'",
  );
});

test('new RTDN chain cannot bypass recoverable-subscription or production-trial preflight', () => {
  has(
    "s.status in ('trialing', 'active', 'grace', 'past_due', 'paused')",
    "raise exception 'GOOGLE_PLAY_RTDN_EXISTING_SUBSCRIPTION_CONFLICT'",
    "raise exception 'GOOGLE_PLAY_RTDN_TRIAL_PREFLIGHT_REQUIRED'",
    "i.state in ('prepared', 'purchase_seen')",
  );
});

test('processed lookup and final mark are service-role only and conflict-safe', () => {
  has(
    'create function public.zstudio_google_play_rtdn_is_processed(',
    'create function public.zstudio_mark_google_play_rtdn_processed(',
    "raise exception 'GOOGLE_PLAY_RTDN_MESSAGE_CONFLICT'",
    'to service_role;',
  );
});

test('pending refund review is preserved in a support-only queue without entitlement mutation', () => {
  has(
    'create table studio.google_play_pending_refund_reviews',
    'pending_refund_token text primary key',
    "status in ('pending_review', 'resolved_externally')",
    "p_event_time + interval '24 hours'",
    'create function public.zstudio_record_google_play_pending_refund_review(',
  );
  assert.equal(sql.includes('update studio.entitlements'), false);
  assert.equal(sql.includes('insert into studio.billing_events'), false);
});
