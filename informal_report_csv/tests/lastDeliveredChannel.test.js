'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lastChannel } = require('../lib/lastDeliveredChannel');

const digitalEvent = (channel) => ({
  elementId: `DELIVERED.IUN_TEST.CHANNEL_${channel}`,
  category: 'DELIVERED',
  details: { channel },
});

test('returns an empty value when timeline has no channel event', () => {
  assert.equal(lastChannel(undefined), '');
  assert.equal(lastChannel([]), '');
  assert.equal(lastChannel([{ category: 'WORKFLOW_DONE_REACHED' }]), '');
});

for (const channel of ['IO', 'PEC', 'EMAIL']) {
  test(`returns ${channel} from the latest matching timeline event`, () => {
    assert.equal(lastChannel([
      digitalEvent('IO'),
      { category: 'WORKFLOW_DONE_REACHED' },
      digitalEvent(channel),
      { category: 'WORKFLOW_DONE_REACHED' },
    ]), channel);
  });
}

test('returns the delivery type from the latest analog send event', () => {
  assert.equal(lastChannel([
    digitalEvent('PEC'),
    {
      elementId: 'SEND_ANALOG_MESSAGE.IUN_TEST.DELIVERYTYPE_RS',
      category: 'SEND_ANALOG_MESSAGE',
      details: { deliveryType: 'RS' },
    },
    { category: 'WORKFLOW_DONE_REACHED' },
  ]), 'ANALOG_RS');
});

test('uses timeline order rather than event timestamps', () => {
  assert.equal(lastChannel([
    { ...digitalEvent('PEC'), eventTimestamp: '2026-10-07T10:00:00Z' },
    { ...digitalEvent('IO'), eventTimestamp: '2026-10-06T10:00:00Z' },
  ]), 'IO');
});

test('a later digital event takes precedence over an earlier analog send', () => {
  assert.equal(lastChannel([
    {
      category: 'SEND_ANALOG_MESSAGE',
      details: { deliveryType: 'RS' },
    },
    digitalEvent('EMAIL'),
  ]), 'EMAIL');
});

test('does not infer the latest channel from digital feedback details', () => {
  assert.equal(lastChannel([
    digitalEvent('PEC'),
    {
      category: 'SEND_DIGITAL_MESSAGE_FEEDBACK',
      details: { channel: 'IO', responseStatus: 'KO' },
    },
  ]), 'PEC');
});
