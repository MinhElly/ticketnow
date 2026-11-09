import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8083').replace(/\/+$/, '');
export const EVENT_ID = __ENV.EVENT_ID || 'bench-event';
export const TOKEN = __ENV.TOKEN || '';
export const TTL_SECONDS = Number(__ENV.TTL_SECONDS || 600);
export const SEAT_PREFIX = __ENV.SEAT_PREFIX || 'S';
export const SEAT_PADDING = Number(__ENV.SEAT_PADDING || 5);

export const holdsSuccess = new Counter('holds_success');
export const holdsConflict = new Counter('holds_conflict');
export const holdsUnexpected = new Counter('holds_unexpected');
export const holdLatency = new Trend('hold_latency', true);

export function seatId(index) {
  return `${SEAT_PREFIX}-${String(index).padStart(SEAT_PADDING, '0')}`;
}

export function bookingId(prefix) {
  return `${prefix}-${__VU}-${__ITER}-${Date.now()}`;
}

export function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  return headers;
}

export function hold(eventId, seatIds, booking) {
  const payload = JSON.stringify({
    bookingId: booking,
    seatIds: seatIds,
    ttlSeconds: TTL_SECONDS,
  });

  const response = http.post(
    `${BASE_URL}/api/v1/events/${eventId}/seats/hold`,
    payload,
    { headers: authHeaders(), tags: { name: 'hold_seats' } },
  );

  if (response.status === 200) {
    holdsSuccess.add(1);
  } else if (response.status === 409) {
    holdsConflict.add(1);
  } else {
    holdsUnexpected.add(1);
  }
  holdLatency.add(response.timings.duration);
  return response;
}

export function baseOptions(vus, maxDuration) {
  return {
    discardResponseBodies: true,
    scenarios: {
      default: {
        executor: 'per-vu-iterations',
        vus: vus,
        iterations: 1,
        maxDuration: maxDuration || '15m',
      },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  };
}

export function isHandled(response) {
  return response.status === 200 || response.status === 409;
}
