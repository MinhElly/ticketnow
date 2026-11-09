import grpc from 'k6/net/grpc';
import { check } from 'k6';

// Seed ghế qua gRPC InitializeSeats (batch <= 1000) để kiểm tra nhanh
// transport gRPC khi chưa có token REST. Chạy:
//   k6 run -e EVENT_ID=e2e-test -e SEATS=100 load-tests/grpc/seed-seats.js
const PROTO_DIR = __ENV.PROTO_DIR || '../../contracts/proto';
const GRPC_HOST = __ENV.GRPC_HOST || 'localhost';
const GRPC_PORT = __ENV.GRPC_PORT || '9083';
const EVENT_ID = __ENV.EVENT_ID || 'bench-event';
const SEATS = Number(__ENV.SEATS || 20000);
const BATCH_SIZE = Math.min(Number(__ENV.BATCH_SIZE || 1000), 1000);
const TIER_ID = __ENV.TIER_ID || 'bench-tier';

const client = new grpc.Client();
client.load([PROTO_DIR], 'seat_inventory.proto');

export const options = {
  vus: 1,
  iterations: 1,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  client.connect(`${GRPC_HOST}:${GRPC_PORT}`, { plaintext: true });

  for (let start = 1; start <= SEATS; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, SEATS);
    const seats = [];
    for (let i = start; i <= end; i++) {
      seats.push({
        seatId: `S-${String(i).padStart(5, '0')}`,
        tierId: TIER_ID,
      });
    }

    const response = client.invoke(
      'ticketnow.seat.v1.SeatInventory/InitializeSeats',
      { eventId: EVENT_ID, seats: seats },
      { timeout: '30s', tags: { name: 'grpc_initialize_seats' } },
    );

    check(response, {
      'gRPC InitializeSeats OK': (r) => r.status === grpc.StatusOK,
    });
    console.log(`Seeded ${start}..${end} seats`);
  }
}
