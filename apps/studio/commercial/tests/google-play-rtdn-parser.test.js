import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGooglePlayRtdnEnvelope } from '../lib/google-play-rtdn-parser.js';

const config = {
  packageName: 'com.zoperatingsystem.zstudio',
  pubsubSubscription: 'projects/zstudio-billing/subscriptions/zstudio-google-play-rtdn',
};
function envelope(data, overrides = {}) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(data)).toString('base64'),
      messageId: '2070443601311540',
      publishTime: '2026-08-21T00:00:00Z',
    },
    subscription: config.pubsubSubscription,
    ...overrides,
  };
}
function base(extra) {
  return {
    version: '1.0',
    packageName: config.packageName,
    eventTimeMillis: '1800000000000',
    ...extra,
  };
}

test('parses subscription RTDN as trigger-only evidence', () => {
  const result = parseGooglePlayRtdnEnvelope(envelope(base({
    subscriptionNotification: {
      version: '1.0',
      notificationType: 4,
      purchaseToken: 'opaque-token-ABC',
    },
  })), config);
  assert.equal(result.kind, 'subscription');
  assert.equal(result.notificationType, 4);
  assert.equal(result.purchaseToken, 'opaque-token-ABC');
  assert.equal(result.rawProviderPayloadIncluded, false);
});

test('parses voided subscription as current-state trigger but ignores one-time products', () => {
  const subscription = parseGooglePlayRtdnEnvelope(envelope(base({
    voidedPurchaseNotification: {
      purchaseToken: 'opaque-token',
      orderId: 'GPA.1234',
      productType: 1,
      refundType: 1,
    },
  })), config);
  assert.equal(subscription.kind, 'voided_subscription');
  assert.equal(subscription.orderId, 'GPA.1234');
  assert.equal(subscription.refundType, 1);

  const oneTime = parseGooglePlayRtdnEnvelope(envelope(base({
    voidedPurchaseNotification: {
      purchaseToken: 'opaque-token',
      orderId: 'GPA.5678',
      productType: 2,
      refundType: 1,
    },
  })), config);
  assert.equal(oneTime.kind, 'one_time_ignored');
  assert.equal(oneTime.purchaseToken, null);
});

test('classifies test and pending refund review as non-commercial notifications', () => {
  assert.equal(parseGooglePlayRtdnEnvelope(envelope(base({ testNotification: { version: '1.0' } })), config).kind, 'test');
  const review = parseGooglePlayRtdnEnvelope(envelope(base({
    pendingRefundReviewNotification: {
      version: '1.0',
      pendingRefundToken: 'secret-review-token',
      orderId: 'GPA.review',
      refundReason: 7,
    },
  })), config);
  assert.equal(review.kind, 'pending_refund_review');
  assert.equal(review.pendingRefundToken, 'secret-review-token');
  assert.equal(review.refundReason, 7);
});

test('fails closed on wrong Pub/Sub subscription, package, multiple notification kinds or unknown subscription notification type', () => {
  assert.throws(() => parseGooglePlayRtdnEnvelope(envelope(base({ testNotification: { version: '1.0' } }), { subscription: 'projects/x/subscriptions/y' }), config));
  assert.throws(() => parseGooglePlayRtdnEnvelope(envelope({ ...base({ testNotification: { version: '1.0' } }), packageName: 'com.example.other' }), config));
  assert.throws(() => parseGooglePlayRtdnEnvelope(envelope(base({ testNotification: { version: '1.0' }, subscriptionNotification: { version: '1.0', notificationType: 4, purchaseToken: 'x' } })), config));
  assert.throws(() => parseGooglePlayRtdnEnvelope(envelope(base({ subscriptionNotification: { version: '1.0', notificationType: 99, purchaseToken: 'x' } })), config));
});
