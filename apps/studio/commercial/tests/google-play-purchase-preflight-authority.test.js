import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../../infrastructure/supabase/migrations/20260821002000_zstudio_google_play_purchase_preflight_authority_v1.sql', import.meta.url),
  'utf8',
);

function must(...parts) {
  for (const part of parts) assert.ok(sql.includes(part), `missing ${part}`);
}

test('creates server-only Google purchase intents with hashed provider correlation only', () => {
  must(
    'create table studio.google_play_purchase_intents',
    "state in ('prepared', 'purchase_seen', 'completed', 'expired', 'failed')",
    "source_subscription_ref ~ '^google:play:purchase:[0-9a-f]{64}$'",
    'revoke all on studio.google_play_purchase_intents',
  );
  assert.equal(sql.includes('purchase_token'), false);
});

test('preflight blocks parallel commercial chains and reserves the shared production trial', () => {
  must(
    'zstudio_prepare_google_play_purchase',
    "s.status in ('trialing', 'active', 'grace', 'past_due', 'paused')",
    "'zstudio:production-trial:' || p_person_id::text",
    "'reserved', 'google_play', v_intent_id::text, v_expires_at",
    "raise exception 'GOOGLE_PLAY_TRIAL_RESERVED_ELSEWHERE'",
  );
});

test('verified purchase binding requires exact person environment plan and namespaced token hash', () => {
  must(
    'zstudio_bind_google_play_purchase_intent',
    "v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$'",
    "raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_IDENTITY_CONFLICT'",
    "raise exception 'GOOGLE_PLAY_PURCHASE_INTENT_PLAN_CONFLICT'",
    "state = 'purchase_seen'",
  );
});

test('production trial current state is impossible without exact preflight reservation', () => {
  must(
    'zstudio_require_google_play_trial_preflight',
    "new.billing_source <> 'google_play'",
    "raise exception 'GOOGLE_PLAY_TRIAL_PREFLIGHT_REQUIRED'",
    "i.state = 'purchase_seen'",
    'i.source_subscription_ref = new.source_subscription_ref',
    'create trigger a_zstudio_require_google_play_trial_preflight',
  );
});

test('completion occurs after purchase_seen and releases only an unused still-reserved Google trial', () => {
  must(
    'zstudio_complete_google_play_purchase_intent',
    "v_intent.state <> 'purchase_seen'",
    "state = 'completed'",
    "t.state = 'reserved'",
    "t.reserved_billing_source = 'google_play'",
    't.reservation_ref = p_intent_id::text',
  );
});

test('all purchase-intent RPCs are service-role only', () => {
  for (const signature of [
    'zstudio_prepare_google_play_purchase(uuid,text,text)',
    'zstudio_bind_google_play_purchase_intent(uuid,uuid,text,text,text,boolean)',
    'zstudio_complete_google_play_purchase_intent(uuid,uuid,text,text)',
  ]) {
    assert.ok(sql.includes(`revoke all on function public.${signature}`));
    assert.ok(sql.includes(`grant execute on function public.${signature}`));
  }
});
