import { check } from 'k6';
import {
  EVENT_ID,
  baseOptions,
  bookingId,
  hold,
  isHandled,
  seatId,
} from '../lib/common.js';

// S4: phân tán - mỗi VU giữ một ghế khác nhau, tranh chấp gần như bằng 0.
// Đặt SEATS >= VUS và seed đủ ghế trước khi chạy.
const VUS = Number(__ENV.VUS || 1000);
const SEATS = Number(__ENV.SEATS || VUS);

export const options = baseOptions(VUS, __ENV.MAX_DURATION || '10m');

export default function () {
  const index = ((__VU - 1) % SEATS) + 1;
  const response = hold(EVENT_ID, [seatId(index)], bookingId('s4'));

  check(response, {
    'S4 hold handled (200/409)': isHandled,
  });
}
