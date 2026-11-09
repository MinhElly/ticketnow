import { check } from 'k6';
import {
  EVENT_ID,
  baseOptions,
  bookingId,
  hold,
  isHandled,
  seatId,
} from '../lib/common.js';

// S1: 1.000 VU tranh chấp 100 ghế (10 VU/ghế).
// Kỳ vọng: đúng 100 hold thành công, phần còn lại 409 Conflict, không có ghế trùng.
const VUS = Number(__ENV.VUS || 1000);
const SEATS = Number(__ENV.SEATS || 100);

export const options = baseOptions(VUS, __ENV.MAX_DURATION || '10m');

export default function () {
  const index = ((__VU - 1) % SEATS) + 1;
  const response = hold(EVENT_ID, [seatId(index)], bookingId('s1'));

  check(response, {
    'S1 hold handled (200/409)': isHandled,
  });
}
