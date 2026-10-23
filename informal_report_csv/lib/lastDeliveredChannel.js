'use strict';

const DIGITAL_CHANNELS = new Set(['IO', 'PEC', 'EMAIL']);

function channelFromEvent(element) {
  const elementIdParts = typeof element?.elementId === 'string'
    ? element.elementId.split('.')
    : [];

  if (element?.category === 'SEND_ANALOG' || element?.category === 'SEND_ANALOG_MESSAGE') {
    const deliveryType = element.details?.deliveryType;
    return typeof deliveryType === 'string' && deliveryType.trim().length > 0
      ? `ANALOG_${deliveryType}`
      : '';
  }

  for (const channel of DIGITAL_CHANNELS) {
    const marker = `CHANNEL_${channel}`;
    if (elementIdParts.includes(marker) || element?.category === marker ||
      (element?.category === 'DELIVERED' && element?.details?.channel === channel)) {
      return channel;
    }
  }

  return undefined;
}

function lastChannel(timeline) {
  if (!Array.isArray(timeline)) return '';

  let latestChannel = '';
  for (const element of timeline) {
    const channel = channelFromEvent(element);
    if (channel !== undefined) latestChannel = channel;
  }
  return latestChannel;
}

module.exports = { lastChannel };
