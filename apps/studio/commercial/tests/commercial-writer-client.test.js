import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommercialWriterRpcError,
  COMMERCIAL_WRITER_ARGUMENT_NAMES,
  COMMERCIAL_WRITER_RPC,
  applyAppleCurrentStateCommercialEvent,
  createCommercialWriterClient,
} from '../lib/commercial-writer-client.js';
import { buildVerifiedCommercialWriterArgs } from '../lib/commercial-event-adapter.js';

const secretKey = 'sb_secret_test';
const personId = 'a1111111-b222-c333-d444-e55555555555';
const subscriptionId = 'b1111111-b222-c333-d444-e55555555555';
const originalTransactionId = '2000000000000000';
const currentTransactionId = '2000000000000005';
const productId =
  'com.zoperatingsystem.zstudio.subscription.monthly';

const config = Object.freeze({
  supabaseUrl: 'https://example.supabase.co',
  supabaseSecretKey: secretKey,
});

function activeWriterArgs(overrides = {}) {
  return buildVerifiedCommercialWriterArgs({
    personId,
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: `app:${'a'.repeat(64)}`,
    sourceSubscriptionRef: originalTransactionId,
    sourceProductRef: productId,
    eventType: 'renewed',
    planCode: 'monthly',
    status: 'active',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    cancelAtPeriodEnd: false,
    effectiveAtMs: 1789761800000,
    ...overrides,
  });
}

function appleSnapshot(overrides = {}) {
  return {
    verification: 'verified_current_state',
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: `app:${'b'.repeat(64)}`,
    sourceSubscriptionRef: originalTransactionId,
    sourceProductRef: productId,
    personId,
    planCode: 'monthly',
    normalizedStatus: 'active',
    appleStatus: 1,
    appleRevokedEquivalent: false,
    cancelAtPeriodEnd: false,
    subscriptionGroupIdentifier: '12345678',
    effectiveAtMs: 1789761800000,
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    transactionId: currentTransactionId,
    originalTransactionId,
    currentProductId: productId,
    autoRenewProductId: productId,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function response({
  status = 200,
  body,
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined
        ? ''
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
    },
  };
}

test('posts exactly the 15 verified writer arguments with modern Supabase secret-key auth', async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return response({
      body: {
        result: 'applied',
        subscription_id: subscriptionId,
        subscription_status: 'active',
        plan_code: 'monthly',
        studio_access_status: 'active',
        ai_access_status: 'active',
      },
    });
  };

  const client = createCommercialWriterClient(config, { fetchImpl });
  const writerArgs = activeWriterArgs();
  const result = await client.applyVerifiedCommercialEvent(writerArgs);

  assert.equal(client.rpcFunction, COMMERCIAL_WRITER_RPC);
  assert.equal(
    client.endpoint,
    'https://example.supabase.co/rest/v1/rpc/'
      + 'zstudio_apply_verified_commercial_event',
  );
  assert.equal(calls.length, 1);

  const [url, request] = calls[0];
  assert.equal(url, client.endpoint);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.apikey, secretKey);
  assert.equal('authorization' in request.headers, false);
  assert.equal('Authorization' in request.headers, false);
  assert.equal(request.headers.accept, 'application/json');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), writerArgs);
  assert.deepEqual(Object.keys(writerArgs), COMMERCIAL_WRITER_ARGUMENT_NAMES);

  assert.deepEqual(result, {
    result: 'applied',
    subscriptionId,
    subscriptionStatus: 'active',
    planCode: 'monthly',
    studioAccessStatus: 'active',
    aiAccessStatus: 'active',
    processingStatus: null,
  });
});

test('legacy service-role config is rejected before transport', async () => {
  let fetchCalled = false;
  assert.throws(
    () => createCommercialWriterClient({
      supabaseUrl: config.supabaseUrl,
      supabaseServiceRole: 'legacy-test-value',
    }, {
      fetchImpl: async () => {
        fetchCalled = true;
        return response({ body: {} });
      },
    }),
    /COMMERCIAL_WRITER_SUPABASE_SECRET_KEY_REQUIRED/,
  );
  assert.equal(fetchCalled, false);
});

test('malformed secret key is rejected before transport', () => {
  assert.throws(
    () => createCommercialWriterClient({
      supabaseUrl: config.supabaseUrl,
      supabaseSecretKey: 'not-a-secret-key',
    }),
    /COMMERCIAL_WRITER_SUPABASE_SECRET_KEY_INVALID/,
  );
});

test('accepts all four writer result families and normalizes only non-sensitive response state', async () => {
  const cases = [
    {
      result: 'applied',
      subscription_id: subscriptionId,
      subscription_status: 'active',
      plan_code: 'monthly',
      studio_access_status: 'active',
      ai_access_status: 'active',
    },
    {
      result: 'duplicate',
      subscription_id: subscriptionId,
      processing_status: 'applied',
    },
    {
      result: 'ignored_stale',
      subscription_id: subscriptionId,
      subscription_status: 'active',
      plan_code: 'monthly',
    },
    {
      result: 'applied_same_state',
      subscription_id: subscriptionId,
      subscription_status: 'active',
      plan_code: 'monthly',
    },
  ];

  for (const payload of cases) {
    const client = createCommercialWriterClient(config, {
      fetchImpl: async () => response({ body: payload }),
    });
    const result = await client.applyVerifiedCommercialEvent(
      activeWriterArgs(),
    );
    assert.equal(result.result, payload.result);
    assert.equal(result.subscriptionId, subscriptionId);
    assert.equal(JSON.stringify(result).includes(secretKey), false);
  }
});

test('fails closed before transport when writer argument names are missing or extended', async () => {
  let fetchCalled = false;
  const client = createCommercialWriterClient(config, {
    fetchImpl: async () => {
      fetchCalled = true;
      return response({ body: {} });
    },
  });

  const missing = { ...activeWriterArgs() };
  delete missing.p_effective_at;
  await assert.rejects(
    () => client.applyVerifiedCommercialEvent(missing),
    /COMMERCIAL_WRITER_ARGUMENT_CONTRACT_INVALID/,
  );

  const extra = {
    ...activeWriterArgs(),
    raw_jws: 'forbidden',
  };
  await assert.rejects(
    () => client.applyVerifiedCommercialEvent(extra),
    /COMMERCIAL_WRITER_ARGUMENT_CONTRACT_INVALID/,
  );

  assert.equal(fetchCalled, false);
});

test('database conflicts are non-retryable and expose only normalized Postgres and commercial error codes', async () => {
  const client = createCommercialWriterClient(config, {
    fetchImpl: async () => response({
      status: 409,
      body: {
        code: '23505',
        message: 'COMMERCIAL_EVENT_CONFLICT',
        details: `must never leak ${secretKey}`,
        hint: 'sensitive detail',
      },
    }),
  });

  await assert.rejects(
    async () => client.applyVerifiedCommercialEvent(activeWriterArgs()),
    (error) => {
      assert.ok(error instanceof CommercialWriterRpcError);
      assert.equal(error.code, 'COMMERCIAL_WRITER_RPC_FAILED');
      assert.equal(error.httpStatus, 409);
      assert.equal(error.retryable, false);
      assert.equal(error.postgresCode, '23505');
      assert.equal(error.databaseCode, 'COMMERCIAL_EVENT_CONFLICT');
      assert.equal(JSON.stringify(error).includes(secretKey), false);
      assert.equal(String(error).includes(secretKey), false);
      assert.equal('details' in error, false);
      assert.equal('hint' in error, false);
      return true;
    },
  );
});

test('transient HTTP and transport failures are classified retryable without automatic retry', async () => {
  let httpCalls = 0;
  const httpClient = createCommercialWriterClient(config, {
    fetchImpl: async () => {
      httpCalls += 1;
      return response({
        status: 503,
        body: {
          code: 'PGRST000',
          message: 'temporary upstream problem',
        },
      });
    },
  });

  await assert.rejects(
    () => httpClient.applyVerifiedCommercialEvent(activeWriterArgs()),
    (error) => {
      assert.equal(error.code, 'COMMERCIAL_WRITER_RPC_FAILED');
      assert.equal(error.httpStatus, 503);
      assert.equal(error.retryable, true);
      assert.equal(error.databaseCode, null);
      return true;
    },
  );
  assert.equal(httpCalls, 1);

  let transportCalls = 0;
  const transportClient = createCommercialWriterClient(config, {
    fetchImpl: async () => {
      transportCalls += 1;
      throw new TypeError('network unavailable');
    },
  });

  await assert.rejects(
    () => transportClient.applyVerifiedCommercialEvent(activeWriterArgs()),
    (error) => {
      assert.equal(error.code, 'COMMERCIAL_WRITER_RPC_TRANSPORT_FAILED');
      assert.equal(error.retryable, true);
      return true;
    },
  );
  assert.equal(transportCalls, 1);
});

test('malformed successful RPC responses fail closed', async () => {
  const invalidCases = [
    'not-json',
    {},
    {
      result: 'unexpected',
      subscription_id: subscriptionId,
    },
    {
      result: 'applied',
      subscription_id: 'not-a-uuid',
    },
  ];

  for (const body of invalidCases) {
    const client = createCommercialWriterClient(config, {
      fetchImpl: async () => response({ body }),
    });

    await assert.rejects(
      () => client.applyVerifiedCommercialEvent(activeWriterArgs()),
      /COMMERCIAL_WRITER_RPC_RESPONSE|COMMERCIAL_WRITER_RESPONSE/,
    );
  }
});

test('Apple verified current state flows through the adapter into the exact writer client boundary', async () => {
  const calls = [];
  const client = {
    async applyVerifiedCommercialEvent(args) {
      calls.push(args);
      return {
        result: 'applied',
        subscriptionId,
      };
    },
  };

  const result = await applyAppleCurrentStateCommercialEvent(
    appleSnapshot(),
    config,
    { client },
  );

  assert.equal(result.result, 'applied');
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]), COMMERCIAL_WRITER_ARGUMENT_NAMES);
  assert.equal(calls[0].p_person_id, personId);
  assert.equal(calls[0].p_billing_source, 'apple_app_store');
  assert.equal(calls[0].p_billing_environment, 'sandbox');
  assert.equal(calls[0].p_source_subscription_ref, originalTransactionId);
  assert.equal(calls[0].p_source_product_ref, productId);
  assert.equal(calls[0].p_event_type, 'renewed');
  assert.equal(calls[0].p_status, 'active');
  assert.equal('signedTransactionInfo' in calls[0], false);
  assert.equal('signedRenewalInfo' in calls[0], false);
  assert.equal('jwsRepresentation' in calls[0], false);
});

test('future verified recovery/restoration hints survive the full Apple-to-writer path only when adapter permits them', async () => {
  const eventTypes = [];
  const client = {
    async applyVerifiedCommercialEvent(args) {
      eventTypes.push(args.p_event_type);
      return {
        result: 'applied_same_state',
        subscriptionId,
      };
    },
  };

  await applyAppleCurrentStateCommercialEvent(
    appleSnapshot(),
    config,
    { client, eventTypeHint: 'recovered' },
  );
  await applyAppleCurrentStateCommercialEvent(
    appleSnapshot(),
    config,
    { client, eventTypeHint: 'restored' },
  );

  assert.deepEqual(eventTypes, ['recovered', 'restored']);

  await assert.rejects(
    () => applyAppleCurrentStateCommercialEvent(
      appleSnapshot({
        normalizedStatus: 'expired',
        currentPeriodStartMs: null,
        currentPeriodEndMs: null,
      }),
      config,
      { client, eventTypeHint: 'restored' },
    ),
    /APPLE_COMMERCIAL_EVENT_HINT_INVALID/,
  );
});
