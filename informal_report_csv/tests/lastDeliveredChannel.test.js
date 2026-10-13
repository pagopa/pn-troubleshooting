'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lastDeliveredChannel } = require('../lib/lastDeliveredChannel');

function delivered(channel, eventTimestamp = '2026-10-06T16:06:50Z', extra = {}) {
  return {
    elementId: `DELIVERED-${channel}`,
    category: 'DELIVERED',
    eventTimestamp,
    details: { channel, recIndex: 0 },
    ...extra,
  };
}

for (const channel of ['IO', 'PEC', 'SMS', 'EMAIL']) {
  test(`returns ${channel} for a delivered digital message`, () => {
    assert.equal(lastDeliveredChannel([delivered(channel)]), channel);
  });
}

test('returns empty without DELIVERED, including successful feedback', () => {
  for (const timeline of [undefined, [], [
    { category: 'SEND_DIGITAL_MESSAGE_FEEDBACK', details: { channel: 'IO', responseStatus: 'OK' } },
    { category: 'WORKFLOW_DONE_REACHED' },
  ]]) {
    assert.equal(lastDeliveredChannel(timeline), '');
  }
});

test('selects the latest delivery across recipients without mutating the timeline', () => {
  const timeline = [
    delivered('PEC', '2026-10-06T16:06:51Z', { details: { channel: 'PEC', recIndex: 1 } }),
    delivered('IO'),
    { category: 'SEND_DIGITAL_MESSAGE_FEEDBACK', eventTimestamp: '2026-10-06T16:07:00Z',
      details: { channel: 'SMS', responseStatus: 'KO' } },
  ];
  const original = JSON.stringify(timeline);
  assert.equal(lastDeliveredChannel(timeline), 'PEC');
  assert.equal(JSON.stringify(timeline), original);
});

test('preserves sub-millisecond precision with different fraction lengths', () => {
  assert.equal(lastDeliveredChannel([
    delivered('EMAIL', '2026-10-06T16:06:50.123000001Z'),
    delivered('IO', '2026-10-06T16:06:50.123Z'),
  ]), 'EMAIL');
});

test('normalizes offsets and chooses the last original element on equal instants', () => {
  assert.equal(lastDeliveredChannel([
    delivered('PEC', '2026-10-06T18:06:50.100+02:00'),
    delivered('SMS', '2026-10-06T16:06:50.1Z'),
  ]), 'SMS');
  assert.equal(lastDeliveredChannel([
    delivered('PEC', '2026-10-06T18:06:51+02:00'),
    delivered('SMS', '2026-10-06T16:06:50Z'),
  ]), 'PEC');
});

test('falls back to timestamp only when eventTimestamp is absent', () => {
  assert.equal(lastDeliveredChannel([
    delivered('IO', undefined, { eventTimestamp: undefined, timestamp: '2026-10-06T16:06:50Z' }),
  ]), 'IO');
  assert.throws(() => lastDeliveredChannel([
    delivered('IO', '', { timestamp: '2026-10-06T16:06:50Z' }),
  ]), /DELIVERED-IO.*timestamp/);
});

for (const timestamp of [undefined, 'invalid', '2026-02-30T16:06:50Z',
  '2026-10-06T24:00:00Z', '2026-10-06T16:06:50+25:00']) {
  test(`rejects invalid timestamp ${timestamp}`, () => {
    assert.throws(() => lastDeliveredChannel([
      delivered('IO', timestamp, { eventTimestamp: timestamp }),
    ]), /DELIVERED-IO.*timestamp/);
  });
}

for (const deliveryType of ['RS', 'TEST_PRODUCT']) {
  test(`resolves ANALOG_${deliveryType} from the exact linked feedback`, () => {
    const timeline = [
      delivered('ANALOG', undefined, {
        details: { channel: 'ANALOG', sourceElementId: 'feedback-1' },
      }),
      { category: 'SEND_DIGITAL_MESSAGE_FEEDBACK', details: { channel: 'IO', responseStatus: 'KO' } },
      { elementId: 'feedback-other', category: 'SEND_ANALOG_MESSAGE_FEEDBACK',
        details: { deliveryType: 'OTHER', responseStatus: 'OK' } },
      { elementId: 'feedback-1', category: 'SEND_ANALOG_MESSAGE_FEEDBACK',
        details: { deliveryType, responseStatus: 'OK' } },
      { category: 'WORKFLOW_DONE_REACHED' },
    ];
    assert.equal(lastDeliveredChannel(timeline), `ANALOG_${deliveryType}`);
  });
}

for (const channel of [undefined, '', 'UNKNOWN']) {
  test(`rejects unsupported channel ${channel}`, () => {
    assert.throws(() => lastDeliveredChannel([
      delivered('INVALID', undefined, { details: { channel } }),
    ]), /DELIVERED-INVALID.*channel/);
  });
}

for (const sourceElementId of [undefined, '', 'missing']) {
  test(`rejects unresolved analog source ${sourceElementId}`, () => {
    assert.throws(() => lastDeliveredChannel([
      delivered('ANALOG', undefined, { details: { channel: 'ANALOG', sourceElementId } }),
    ]), /DELIVERED-ANALOG.*sourceElementId/);
  });
}

for (const deliveryType of [undefined, '', '  ', 123]) {
  test(`rejects missing or invalid postal product ${deliveryType}`, () => {
    assert.throws(() => lastDeliveredChannel([
      delivered('ANALOG', undefined, { details: { channel: 'ANALOG', sourceElementId: 'source' } }),
      { elementId: 'source', details: { deliveryType } },
    ]), /DELIVERED-ANALOG.*deliveryType/);
  });
}

test('does not conceal an invalid delivery behind a later valid one', () => {
  assert.throws(() => lastDeliveredChannel([
    delivered('ANALOG'),
    delivered('IO', '2026-10-06T16:07:00Z'),
  ]), /sourceElementId/);
});

test('selects the latest analog delivery and its own postal product', () => {
  assert.equal(lastDeliveredChannel([
    delivered('ANALOG', '2026-10-06T16:07:00Z', {
      details: { channel: 'ANALOG', sourceElementId: 'new-source' },
    }),
    { elementId: 'old-source', details: { deliveryType: 'RS' } },
    delivered('ANALOG', '2026-10-06T16:06:50Z', {
      details: { channel: 'ANALOG', sourceElementId: 'old-source' },
    }),
    { elementId: 'new-source', details: { deliveryType: 'TEST_PRODUCT' } },
  ]), 'ANALOG_TEST_PRODUCT');
});

test('compares negative timezone offsets across date boundaries', () => {
  assert.equal(lastDeliveredChannel([
    delivered('EMAIL', '2026-10-05T23:59:59-01:00'),
    delivered('SMS', '2026-10-06T00:59:58Z'),
  ]), 'EMAIL');
});
