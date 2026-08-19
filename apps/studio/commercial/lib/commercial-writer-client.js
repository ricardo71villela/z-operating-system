import { buildAppleCurrentStateWriterArgs } from './commercial-event-adapter.js';

export const COMMERCIAL_WRITER_RPC =
  'zstudio_apply_verified_commercial_event';

export const COMMERCIAL_WRITER_ARGUMENT_NAMES = Object.freeze([
  'p_person_id',
  'p_billing_source',
  'p_billing_environment',
  'p_source_event_ref',
  'p_source_subscription_ref',
  'p_source_product_ref',
  'p_event_type',
  'p_plan_code',
  'p_status',
  'p_trial_started_at',
  'p_trial_ends_at',
  'p_current_period_start',
  'p_current_period_end',
  'p_cancel_at_period_end',
  'p_effective_at',
]);

const WRITER_RESULTS = new Set([
  'applied',
  'duplicate',
  'ignored_stale',
  'applied_same_state',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CommercialWriterRpcError extends Error {
  constructor(
    code,
    {
      httpStatus = null,
      retryable = false,
      postgresCode = null,
      databaseCode = null,
      cause,
    } = {},
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CommercialWriterRpcError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.postgresCode = postgresCode;
    this.databaseCode = databaseCode;
  }
}

function requiredString(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function requiredHttpsUrl(value) {
  const normalized = requiredString(
    value,
    'COMMERCIAL_WRITER_SUPABASE_URL_REQUIRED',
  ).replace(/\/+$/, '');

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('COMMERCIAL_WRITER_SUPABASE_URL_INVALID');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('COMMERCIAL_WRITER_SUPABASE_URL_INVALID');
  }

  return normalized;
}

function exactWriterArgs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COMMERCIAL_WRITER_ARGUMENTS_REQUIRED');
  }

  const actual = Object.keys(value).sort();
  const expected = [...COMMERCIAL_WRITER_ARGUMENT_NAMES].sort();

  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error('COMMERCIAL_WRITER_ARGUMENT_CONTRACT_INVALID');
  }

  return value;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function databaseCodeFromErrorBody(body) {
  const message = typeof body?.message === 'string'
    ? body.message.trim()
    : '';

  return /^COMMERCIAL_[A-Z0-9_]+$/.test(message)
    ? message
    : null;
}

function retryableHttpStatus(status) {
  return status === 408
    || status === 425
    || status === 429
    || status >= 500;
}

function normalizeWriterResult(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('COMMERCIAL_WRITER_RESPONSE_INVALID');
  }

  const result = String(payload.result ?? '').trim();
  if (!WRITER_RESULTS.has(result)) {
    throw new Error('COMMERCIAL_WRITER_RESPONSE_RESULT_INVALID');
  }

  const subscriptionId = String(payload.subscription_id ?? '').trim();
  if (!UUID_PATTERN.test(subscriptionId)) {
    throw new Error('COMMERCIAL_WRITER_RESPONSE_SUBSCRIPTION_ID_INVALID');
  }

  function optionalString(key) {
    if (payload[key] === undefined || payload[key] === null) return null;
    const value = String(payload[key]).trim();
    if (!value) {
      throw new Error('COMMERCIAL_WRITER_RESPONSE_INVALID');
    }
    return value;
  }

  return Object.freeze({
    result,
    subscriptionId: subscriptionId.toLowerCase(),
    subscriptionStatus: optionalString('subscription_status'),
    planCode: optionalString('plan_code'),
    studioAccessStatus: optionalString('studio_access_status'),
    aiAccessStatus: optionalString('ai_access_status'),
    processingStatus: optionalString('processing_status'),
  });
}

export function createCommercialWriterClient(
  config,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 10_000,
  } = {},
) {
  if (!config || typeof config !== 'object') {
    throw new Error('COMMERCIAL_WRITER_CONFIG_REQUIRED');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('COMMERCIAL_WRITER_FETCH_REQUIRED');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('COMMERCIAL_WRITER_TIMEOUT_INVALID');
  }

  const supabaseUrl = requiredHttpsUrl(config.supabaseUrl);
  const serviceRole = requiredString(
    config.supabaseServiceRole,
    'COMMERCIAL_WRITER_SERVICE_ROLE_REQUIRED',
  );
  const endpoint =
    `${supabaseUrl}/rest/v1/rpc/${COMMERCIAL_WRITER_RPC}`;

  async function applyVerifiedCommercialEvent(writerArgs) {
    const args = exactWriterArgs(writerArgs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apikey: serviceRole,
          authorization: `Bearer ${serviceRole}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = cause?.name === 'AbortError';
      throw new CommercialWriterRpcError(
        timedOut
          ? 'COMMERCIAL_WRITER_RPC_TIMEOUT'
          : 'COMMERCIAL_WRITER_RPC_TRANSPORT_FAILED',
        {
          retryable: true,
          cause,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    let text;
    try {
      text = await response.text();
    } catch (cause) {
      throw new CommercialWriterRpcError(
        'COMMERCIAL_WRITER_RPC_RESPONSE_READ_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableHttpStatus(response.status),
          cause,
        },
      );
    }

    const payload = parseJson(text);

    if (!response.ok) {
      throw new CommercialWriterRpcError(
        'COMMERCIAL_WRITER_RPC_FAILED',
        {
          httpStatus: response.status,
          retryable: retryableHttpStatus(response.status),
          postgresCode:
            typeof payload?.code === 'string'
              ? payload.code
              : null,
          databaseCode: databaseCodeFromErrorBody(payload),
        },
      );
    }

    if (payload === null) {
      throw new CommercialWriterRpcError(
        'COMMERCIAL_WRITER_RPC_RESPONSE_INVALID',
        {
          httpStatus: response.status,
          retryable: false,
        },
      );
    }

    try {
      return normalizeWriterResult(payload);
    } catch (cause) {
      throw new CommercialWriterRpcError(
        cause.message,
        {
          httpStatus: response.status,
          retryable: false,
          cause,
        },
      );
    }
  }

  return Object.freeze({
    rpcFunction: COMMERCIAL_WRITER_RPC,
    endpoint,
    applyVerifiedCommercialEvent,
  });
}

export async function applyAppleCurrentStateCommercialEvent(
  snapshot,
  config,
  {
    client,
    eventTypeHint,
    fetchImpl,
    timeoutMs,
  } = {},
) {
  const writerArgs = buildAppleCurrentStateWriterArgs(
    snapshot,
    { eventTypeHint },
  );
  const activeClient = client ?? createCommercialWriterClient(
    config,
    {
      fetchImpl,
      timeoutMs,
    },
  );

  return activeClient.applyVerifiedCommercialEvent(writerArgs);
}
