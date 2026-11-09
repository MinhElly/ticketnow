import { check } from 'k6';
import {
  EVENT_ID,
  baseOptions,
  bookingId,
  hold,
  isHandled,
  seatId,
} from '../lib/common.js';

// S2: 20.000 VU tranh chấp 2.000 ghế (10 VU/ghế, mô phỏng mở bán thật).
// Cần seed tối thiểu SEATS ghế: scripts/seed-seats.ps1 -Seats 2000.
const VUS = Number(__ENV.VUS || 20000);
const SEATS = Number(__ENV.SEATS || 2000);

export const options = baseOptions(VUS, __ENV.MAX_DURATION || '20m');

export default function () {
  const index = ((__VU - 1) % SEATS) + 1;
  const response = hold(EVENT_ID, [seatId(index)], bookingId('s2'));

  check(response, {
    'S2 hold handled (200/409)': isHandled,
  });
}
