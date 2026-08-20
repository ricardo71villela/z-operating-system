import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../../infrastructure/supabase/migrations/20260821004000_zstudio_google_play_reconciliation_hardening_v1.sql', import.meta.url),
  'utf8',
);

function must(...parts) {
  for (const part of parts) assert.ok(sql.includes(part), `missing ${part}`);
}

test('reconciliation accepts only exact prepared purchase_seen or completed intents', () => {
  must(
    'zstudio_reconcile_google_play_purchase_intent',
    "v_intent.state not in ('prepared', 'purchase_seen', 'completed')",
    "v_subscription_ref !~ '^google:play:purchase:[0-9a-f]{64}$'",
    "raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_IDENTITY_CONFLICT'",
    "raise exception 'GOOGLE_PLAY_RECONCILE_INTENT_PLAN_CONFLICT'",
  );
});

test('completed intent remains retry-safe only for the exact hashed subscription', () => {
  must(
    "if v_intent.state = 'completed' then",
    "raise exception 'GOOGLE_PLAY_RECONCILE_COMPLETED_INTENT_CONFLICT'",
    "'result', 'completed'",
  );
});

test('terminal trial claim requires exact preflight intent and does not touch access tables', () => {
  must(
    'zstudio_claim_verified_google_play_trial_consumption',
    "i.trial_reserved",
    "i.state in ('purchase_seen', 'completed')",
    "claimed_billing_source = 'google_play'",
    'claimed_source_subscription_ref = v_subscription_ref',
  );
  const claimBody = sql.split('create function public.zstudio_claim_verified_google_play_trial_consumption', 2)[1];
  assert.equal(claimBody.includes('insert into studio.subscriptions'), false);
  assert.equal(claimBody.includes('insert into studio.entitlements'), false);
  assert.equal(claimBody.includes('insert into studio.billing_events'), false);
});

test('sandbox terminal claim is ignored and browser roles have no execute privilege', () => {
  must(
    "return jsonb_build_object('result', 'sandbox_ignored')",
    'from public, anon, authenticated, service_role;',
    'to service_role;',
  );
});

test('provider-proven canceled pending purchase closes exact intent and releases only its reservation', () => {
  must(
    'zstudio_fail_google_play_purchase_intent',
    "v_intent.state <> 'purchase_seen'",
    "state = 'failed'",
    "t.state = 'reserved'",
    "t.reserved_billing_source = 'google_play'",
    't.reservation_ref = p_intent_id::text',
  );
});
