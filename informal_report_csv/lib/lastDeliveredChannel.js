'use strict';

const DIGITAL_CHANNELS = new Set(['IO', 'PEC', 'SMS', 'EMAIL']);
const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;

function eventError(element, field) {
  return new Error(`DELIVERED ${element.elementId ?? '(senza elementId)'}: ${field} mancante o non valido`);
}

function deliveryInstant(element) {
  const value = element.eventTimestamp ?? element.timestamp;
  const match = typeof value === 'string' ? ISO_TIMESTAMP.exec(value) : null;
  if (!match) throw eventError(element, 'timestamp');

  const localMs = Date.parse(`${match[1]}Z`);
  const offsetHours = Number(match[5] ?? 0);
  const offsetMinutes = Number(match[6] ?? 0);
  if (!Number.isFinite(localMs) || new Date(localMs).toISOString().slice(0, 19) !== match[1] ||
      offsetHours > 23 || offsetMinutes > 59) {
    throw eventError(element, 'timestamp');
  }

  const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000 * (match[4] === '-' ? -1 : 1);
  return { secondsMs: localMs - offsetMs, fraction: match[2] ?? '' };
}

function compareInstants(left, right) {
  if (left.secondsMs !== right.secondsMs) return left.secondsMs - right.secondsMs;
  // Date.parse truncates fractions; compare them separately to retain timeline precision.
  const length = Math.max(left.fraction.length, right.fraction.length);
  const a = left.fraction.padEnd(length, '0');
  const b = right.fraction.padEnd(length, '0');
  return a === b ? 0 : a > b ? 1 : -1;
}

function lastDeliveredChannel(timeline) {
  if (!Array.isArray(timeline)) return '';

  const byElementId = new Map();
  for (const element of timeline) {
    if (typeof element?.elementId === 'string' && element.elementId.length > 0) {
      byElementId.set(element.elementId, element);
    }
  }

  let latest;
  for (const element of timeline) {
    if (element?.category !== 'DELIVERED') continue;
    const instant = deliveryInstant(element);
    let channel = element.details?.channel;
    if (channel === 'ANALOG') {
      const sourceElementId = element.details.sourceElementId;
      const source = typeof sourceElementId === 'string' && sourceElementId.length > 0
        ? byElementId.get(sourceElementId) : undefined;
      if (!source) throw eventError(element, 'sourceElementId');
      const deliveryType = source.details?.deliveryType;
      if (typeof deliveryType !== 'string' || deliveryType.trim().length === 0) {
        throw eventError(element, 'deliveryType');
      }
      channel = `ANALOG_${deliveryType}`;
    } else if (!DIGITAL_CHANNELS.has(channel)) {
      throw eventError(element, 'channel');
    }
    if (!latest || compareInstants(instant, latest.instant) >= 0) {
      latest = { instant, channel };
    }
  }
  return latest?.channel ?? '';
}

module.exports = { lastDeliveredChannel };
