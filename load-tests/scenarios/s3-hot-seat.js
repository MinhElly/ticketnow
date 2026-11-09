import { check } from 'k6';
import {
  EVENT_ID,
  baseOptions,
  bookingId,
  hold,
  isHandled,
} from '../lib/common.js';

// S3: hot seat - tất cả VU lao vào giữ đúng 1 ghế duy nhất.
// Kỳ vọng: 1 hold thành công, VUS-1 request trả 409.
const VUS = Number(__ENV.VUS || 1000);
const HOT_SEAT = __ENV.HOT_SEAT || 'S-00001';

export const options = baseOptions(VUS, __ENV.MAX_DURATION || '10m');

export default function () {
  const response = hold(EVENT_ID, [HOT_SEAT], bookingId('s3'));

  check(response, {
    'S3 hold handled (200/409)': isHandled,
  });
}
