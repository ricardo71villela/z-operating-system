import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppleNotificationsHttpHandler,
} from '../lib/apple-notification-http.js';
import {
  CommercialWriterRpcError,
} from '../lib/commercial-writer-client.js';

const config = Object.freeze({
  environment: 'sandbox',
  bundleId: 'com.zoperatingsystem.zstudio',
});

function request({
  method = 'POST',
  body = { signedPayload: 'signed-notification-jws' },
  headers = {},
} = {}) {
  return { method, body, headers };
}

function response() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body === undefined ? '' : String(body);
    },
  };
}

function reconciledResult(overrides = {}) {
  return {
    verification: 'verified_notification_reconciled',
    writerExecuted: true,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function testResult(overrides = {}) {
  return {
    verification: 'verified_notification_test',
    writerExecuted: false,
    rawJwsIncluded: false,
    ...overrides,
  };
}

function handlerWith({
  loadConfig = () => config,
  reconcileNotification = async () => reconciledResult(),
} = {}) {
  return createAppleNotificationsHttpHandler({
    loadConfig,
    reconcileNotification,
  });
}

test('commercial notification endpoint accepts signedPayload only, requires no Bearer auth and acknowledges reconciled writer success with empty 200', async () => {
  const calls = [];
  const handler = handlerWith({
    reconcileNotification: async (signedPayload, receivedConfig) => {
      calls.push({ signedPayload, receivedConfig });
      return reconciledResult();
    },
  });
  const res = response();

  await handler(request({ headers: {} }), res);

  assert.equal(res.status, 200);
  assert.equal(res.body, '');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.deepEqual(calls, [{
    signedPayload: 'signed-notification-jws',
    receivedConfig: config,
  }]);
});

test('verified Apple TEST notification is acknowledged without requiring a writer', async () => {
  const handler = handlerWith({
    reconcileNotification: async () => testResult(),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.status, 200);
  assert.equal(res.body, '');
});

test('cryptographically verified but unsupported Apple event family is acknowledged without commercial state', async () => {
  const handler = handlerWith({
    reconcileNotification: async () => {
      throw new Error('APPLE_NOTIFICATION_TYPE_UNSUPPORTED');
    },
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.status, 200);
  assert.equal(res.body, '');
});

test('invalid signed notification evidence fails with 400 and never echoes JWS', async () => {
  const handler = handlerWith({
    reconcileNotification: async () => {
      throw new Error('APPLE_SIGNED_NOTIFICATION_UNVERIFIED');
    },
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.status, 400);
  assert.equal(res.body.includes('APPLE_NOTIFICATION_REJECTED'), true);
  assert.equal(res.body.includes('signed-notification-jws'), false);
});

test('App Store Server API failures request retry with 503', async () => {
  const handler = handlerWith({
    reconcileNotification: async () => {
      const error = new Error('server api unavailable');
      error.httpStatusCode = 500;
      throw error;
    },
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.status, 503);
  assert.equal(
    JSON.parse(res.body).code,
    'APPLE_NOTIFICATION_PROCESSING_UNAVAILABLE',
  );
});

test('writer failures are never acknowledged as successful Apple delivery', async () => {
  const retryable = handlerWith({
    reconcileNotification: async () => {
      throw new CommercialWriterRpcError(
        'COMMERCIAL_WRITER_RPC_TRANSPORT_FAILED',
        { retryable: true },
      );
    },
  });
  const retryableRes = response();
  await retryable(request(), retryableRes);
  assert.equal(retryableRes.status, 503);
  assert.equal(
    JSON.parse(retryableRes.body).code,
    'COMMERCIAL_WRITE_UNAVAILABLE',
  );

  const permanent = handlerWith({
    reconcileNotification: async () => {
      throw new CommercialWriterRpcError(
        'COMMERCIAL_WRITER_RPC_FAILED',
        { retryable: false },
      );
    },
  });
  const permanentRes = response();
  await permanent(request(), permanentRes);
  assert.equal(permanentRes.status, 500);
  assert.equal(
    JSON.parse(permanentRes.body).code,
    'COMMERCIAL_WRITE_FAILED',
  );
});

test('handler refuses malformed JSON, extra client authority and oversized signed payload before reconciliation', async () => {
  let calls = 0;
  const handler = handlerWith({
    reconcileNotification: async () => {
      calls += 1;
      return reconciledResult();
    },
  });

  const invalidJson = response();
  await handler(request({ body: '{' }), invalidJson);
  assert.equal(invalidJson.status, 400);

  const extraAuthority = response();
  await handler(request({
    body: {
      signedPayload: 'signed-notification-jws',
      personId: 'a1111111-b222-c333-d444-e55555555555',
    },
  }), extraAuthority);
  assert.equal(extraAuthority.status, 400);

  const oversized = response();
  await handler(request({
    body: { signedPayload: 'x'.repeat(262_145) },
  }), oversized);
  assert.equal(oversized.status, 413);

  assert.equal(calls, 0);
});

test('non-POST methods are rejected and configuration failure requests retry', async () => {
  const handler = handlerWith();
  const methodRes = response();
  await handler(request({ method: 'GET' }), methodRes);
  assert.equal(methodRes.status, 405);
  assert.equal(methodRes.headers.Allow, 'POST');

  const configHandler = handlerWith({
    loadConfig: () => {
      throw new Error('missing config');
    },
  });
  const configRes = response();
  await configHandler(request(), configRes);
  assert.equal(configRes.status, 503);
  assert.equal(
    JSON.parse(configRes.body).code,
    'COMMERCIAL_CONFIG_UNAVAILABLE',
  );
});

test('unexpected reconciliation result is not acknowledged with 2xx', async () => {
  const handler = handlerWith({
    reconcileNotification: async () => ({
      verification: 'verified_notification_reconciled',
      writerExecuted: false,
      rawJwsIncluded: false,
    }),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.status, 503);
  assert.equal(
    JSON.parse(res.body).code,
    'APPLE_NOTIFICATION_PROCESSING_INVALID',
  );
});

test('handler dependency contract fails closed', () => {
  assert.throws(
    () => createAppleNotificationsHttpHandler(),
    /APPLE_NOTIFICATION_HTTP_DEPENDENCIES_INVALID/,
  );
});
