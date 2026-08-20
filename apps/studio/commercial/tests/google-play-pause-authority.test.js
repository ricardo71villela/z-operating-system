import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../../../infrastructure/supabase/migrations/20260820235500_zstudio_google_play_pause_authority_v1.sql', import.meta.url),
  'utf8',
);

function includesAll(...needles) {
  for (const needle of needles) {
    assert.ok(migration.includes(needle), `migration must include ${JSON.stringify(needle)}`);
  }
}

test('extends provider-neutral persistence with paused while keeping shared writer untouched', () => {
  includesAll(
    'add constraint subscriptions_status_check',
    "'paused',",
    'add constraint billing_events_event_type_check',
    "'pause_started',",
    'add constraint billing_events_target_status_check',
  );
  assert.equal(migration.includes('create or replace function public.zstudio_apply_verified_commercial_event'), false);
});

test('creates one narrow service-role Google Play pause authority', () => {
  includesAll(
    'create function public.zstudio_apply_verified_google_play_pause_event(',
    'security definer',
    'set search_path = pg_catalog',
    "where s.billing_source = 'google_play'",
    "and s.billing_environment = v_environment",
    'for update;',
    "raise exception 'GOOGLE_PLAY_PAUSE_SUBSCRIPTION_NOT_FOUND'",
    "raise exception 'GOOGLE_PLAY_PAUSE_IDENTITY_CONFLICT'",
  );
});

test('accepts only hashed/namespaced Google authority and never raw purchase tokens', () => {
  includesAll(
    "'^google:play:purchase:[0-9a-f]{64}$'",
    "'^google:play:event:[A-Za-z0-9._:-]+:snapshot:[0-9a-f]{64}$'",
    "'google:play:product:zstudio.access:base_plan:' || v_plan_code",
  );
  for (const forbidden of [
    'p_purchase_token',
    'raw_purchase_token',
    'authorization bearer',
    'service_account_private_key',
  ]) {
    assert.equal(migration.toLowerCase().includes(forbidden), false, `must not contain ${forbidden}`);
  }
});

test('pause is high-water ordered, duplicate safe and cannot resurrect revoked authority', () => {
  includesAll(
    "raise exception 'GOOGLE_PLAY_PAUSE_EVENT_CONFLICT'",
    "raise exception 'COMMERCIAL_EVENT_ORDER_CONFLICT'",
    "raise exception 'COMMERCIAL_SUBSCRIPTION_REVOKED'",
    "v_processing_status := 'ignored_stale'",
    "'result', 'duplicate'",
    "last_store_event_type = 'pause_started'",
  );
});

test('applied pause expires both subscription-derived access grants atomically', () => {
  includesAll(
    "status = 'paused'",
    "'studio_access',",
    "'ai_access',",
    "'expired',",
    "event_type,",
    "'pause_started',",
    "target_status,",
    "'paused',",
  );
});

test('browser roles cannot execute pause authority', () => {
  includesAll(
    'from public, anon, authenticated, service_role;',
    'to service_role;',
  );
});
