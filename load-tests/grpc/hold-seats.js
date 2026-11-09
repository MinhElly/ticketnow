import grpc from 'k6/net/grpc';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// So sánh độ trễ REST vs gRPC cho cùng kịch bản S1.
// k6 resolve đường dẫn proto tương đối với thư mục chứa script này.
//   k6 run load-tests/grpc/hold-seats.js
// Nếu proto nằm ở đường dẫn khác, truyền -e PROTO_DIR=<thư mục chứa proto>.
const PROTO_DIR = __ENV.PROTO_DIR || '../../contracts/proto';
const GRPC_HOST = __ENV.GRPC_HOST || 'localhost';
const GRPC_PORT = __ENV.GRPC_PORT || '9083';
const EVENT_ID = __ENV.EVENT_ID || 'bench-event';
const TOKEN = __ENV.TOKEN || '';
const VUS = Number(__ENV.VUS || 1000);
const SEATS = Number(__ENV.SEATS || 100);
const TTL_SECONDS = Number(__ENV.TTL_SECONDS || 600);

const client = new grpc.Client();
client.load([PROTO_DIR], 'seat_inventory.proto');

const holdsSuccess = new Counter('holds_success');
const holdsConflict = new Counter('holds_conflict');
const holdsUnexpected = new Counter('holds_unexpected');
const holdLatency = new Trend('hold_latency', true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    default: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function seatId(index) {
  return `${__ENV.SEAT_PREFIX || 'S'}-${String(index).padStart(Number(__ENV.SEAT_PADDING || 5), '0')}`;
}

export default function () {
  if (__ITER === 0) {
    client.connect(`${GRPC_HOST}:${GRPC_PORT}`, { plaintext: true });
  }

  const index = ((__VU - 1) % SEATS) + 1;
  const metadata = {};
  if (TOKEN) {
    metadata.authorization = `Bearer ${TOKEN}`;
  }

  const startedAt = Date.now();
  const response = client.invoke(
    'ticketnow.seat.v1.SeatInventory/HoldSeats',
    {
      eventId: EVENT_ID,
      seatIds: [seatId(index)],
      bookingId: `grpc-${__VU}-${__ITER}-${Date.now()}`,
      userId: 'benchmark',
      ttlSeconds: TTL_SECONDS,
    },
    {
      metadata: metadata,
      timeout: __ENV.GRPC_TIMEOUT || '2s',
      tags: { name: 'grpc_hold_seats' },
    },
  );

  holdLatency.add(Date.now() - startedAt);

  if (response.status !== grpc.StatusOK) {
    holdsUnexpected.add(1);
  } else if (response.message && response.message.success === true) {
    holdsSuccess.add(1);
  } else {
    holdsConflict.add(1);
  }

  check(response, {
    'gRPC transport OK': (r) => r.status === grpc.StatusOK,
  });
}
