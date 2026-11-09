import 'server-only'
import { randomUUID } from 'node:crypto'
import { getPayloadClient } from '@/lib/payload'
import type { Booking, User } from '@/payload-types'

const context = { ticketWorkflow: true }
export async function expireOwnBookings(user: User, cancelAllHeld = false) {
  try {
    const payload = await getPayloadClient()
    const whereCondition = cancelAllHeld
      ? { and: [{ owner: { equals: user.id } }, { status: { equals: 'held' } }] }
      : {
          and: [
            { owner: { equals: user.id } },
            { status: { equals: 'held' } },
            { expiresAt: { less_than: new Date().toISOString() } },
          ],
        }
    const expired = await payload.find({
      collection: 'bookings',
      where: whereCondition,
      user,
      overrideAccess: true,
      depth: 0,
      limit: 100,
    })
    for (const booking of expired.docs) {
      await payload.update({
        collection: 'bookings',
        id: booking.id,
        data: { status: 'expired', activeKey: null },
        context,
        user,
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'seat-claims',
        where: { booking: { equals: booking.id } },
        context,
        user,
        overrideAccess: true,
      })
    }
  } catch {
    // Non-blocking
  }
}
export async function holdSeats(
  user: User,
  event: string,
  seats: string[],
  key: string,
  resetPrevious = true,
) {
  const payload = await getPayloadClient()
  await expireOwnBookings(user, resetPrevious)
  const idempotencyKey = `${user.id}:${key}`
  const previous = await payload.find({
    collection: 'bookings',
    where: { idempotencyKey: { equals: idempotencyKey } },
    user,
    overrideAccess: false,
    depth: 0,
    limit: 1,
  })
  if (previous.docs[0]) {
    const original = previous.docs[0]
    if (
      String(original.event) !== event ||
      original.seats
        .map((s: any) => s.code)
        .sort()
        .join(',') !== [...seats].sort().join(',')
    )
      throw new Error('Đơn dùng cùng mã yêu cầu nhưng có nội dung khác. Vui lòng thử lại.')
    return original
  }
  // Remove only expired holds; sold seats can never be released by this path.
  await payload.delete({
    collection: 'seat-claims',
    where: {
      and: [
        { event: { equals: event } },
        { status: { equals: 'held' } },
        { expiresAt: { less_than: new Date().toISOString() } },
      ],
    },
    user,
    overrideAccess: false,
    context: { expireClaims: true },
  })
  let booking: Booking
  try {
    booking = await payload.create({
      collection: 'bookings',
      user,
      overrideAccess: false,
      context,
      depth: 0,
      data: {
        owner: user.id,
        event,
        reference: `TN-${randomUUID().slice(0, 8).toUpperCase()}`,
        idempotencyKey,
        activeKey: String(user.id),
        status: 'held',
        total: 0,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        seats: seats.map((code) => ({ code, price: 0 })),
      },
    })
  } catch {
    const existing = await payload.find({
      collection: 'bookings',
      where: { idempotencyKey: { equals: idempotencyKey } },
      user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
    })
    if (existing.docs[0]) return existing.docs[0]
    throw new Error('Bạn đang có đơn chờ thanh toán hoặc sự kiện chưa mở bán. Kiểm tra Vé của tôi.')
  }
  try {
    for (const code of [...seats].sort()) {
      // A durable unique key is the final arbiter, including concurrent requests.
      await payload.create({
        collection: 'seat-claims',
        user,
        overrideAccess: false,
        context,
        data: {
          key: `${event}:${code}`,
          event,
          booking: booking.id,
          owner: user.id,
          status: 'held',
          expiresAt: booking.expiresAt,
        },
      })
    }
  } catch {
    await payload.delete({
      collection: 'seat-claims',
      where: { booking: { equals: booking.id } },
      user,
      overrideAccess: false,
      context,
    })
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { status: 'cancelled', activeKey: null },
      user,
      overrideAccess: false,
      context,
    })
    throw new Error('Ghế vừa được người khác giữ. Vui lòng chọn ghế khác.')
  }
  return booking
}
export async function changeBooking(user: User, id: string, action: string, method?: string) {
  const payload = await getPayloadClient()
  await payload.delete({
    collection: 'booking-locks',
    where: {
      and: [{ key: { equals: id } }, { expiresAt: { less_than: new Date().toISOString() } }],
    },
    user,
    overrideAccess: false,
    context,
  })
  let lock
  try {
    lock = await payload.create({
      collection: 'booking-locks',
      user,
      overrideAccess: false,
      context,
      data: { key: id, owner: user.id, expiresAt: new Date(Date.now() + 120000).toISOString() },
    })
  } catch {
    throw new Error('Đơn đang được xử lý. Vui lòng đợi một chút rồi thử lại.')
  }
  try {
    return await changeBookingLocked(user, id, action, method)
  } finally {
    await payload.delete({
      collection: 'booking-locks',
      id: lock.id,
      user,
      overrideAccess: false,
      context,
    })
  }
}
async function changeBookingLocked(user: User, id: string, action: string, method?: string) {
  const payload = await getPayloadClient()
  await expireOwnBookings(user)
  const booking = await payload.findByID({
    collection: 'bookings',
    id,
    user,
    overrideAccess: false,
    depth: 1,
  })
  if (action === 'pay' && booking.status === 'confirmed') return booking
  if (action === 'refund' && booking.status === 'refunded') return booking
  const event = typeof booking.event === 'object' ? booking.event : null
  if (action === 'refund') {
    if (booking.status !== 'confirmed' || !event) throw new Error('Đơn không đủ điều kiện hoàn vé.')
    const scans = await payload.find({
      collection: 'ticket-scans',
      where: { booking: { equals: id } },
      user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
    })
    if (scans.docs.length) throw new Error('Vé đã được sử dụng, không thể hoàn vé.')
    const hours = (new Date(event.date).getTime() - Date.now()) / 3600000
    if (hours < 48) throw new Error('Hoàn vé chỉ áp dụng trước sự kiện ít nhất 48 giờ.')
    const updated = await payload.update({
      collection: 'bookings',
      id,
      user,
      overrideAccess: false,
      context,
      data: {
        status: 'refunded',
        refundAmount: Math.round(booking.total * (hours >= 168 ? 1 : 0.5)),
      },
    })
    await payload.delete({
      collection: 'seat-claims',
      where: { booking: { equals: id } },
      user,
      overrideAccess: false,
      context,
    })
    return updated
  }
  if (booking.status !== 'held' || new Date(booking.expiresAt).getTime() <= Date.now())
    throw new Error('Đơn đã hết hạn hoặc không còn chờ thanh toán.')
  if (action === 'cancel' || action === 'fail') {
    const updated = await payload.update({
      collection: 'bookings',
      id,
      user,
      overrideAccess: false,
      context,
      data: { status: action === 'cancel' ? 'cancelled' : 'failed', activeKey: null },
    })
    await payload.delete({
      collection: 'seat-claims',
      where: { booking: { equals: id } },
      user,
      overrideAccess: false,
      context,
    })
    return updated
  }
  if (action !== 'pay' || !['bank', 'card', 'wallet'].includes(method ?? ''))
    throw new Error('Chọn phương thức thanh toán hợp lệ.')
  const claims = await payload.find({
    collection: 'seat-claims',
    where: { booking: { equals: id } },
    user,
    overrideAccess: false,
    depth: 0,
    limit: 6,
    context,
  })
  if (claims.docs.length !== booking.seats.length || claims.docs.some((c: any) => c.status !== 'held'))
    throw new Error('Ghế đã hết thời gian giữ. Vui lòng đặt lại.')
  const sold = await payload.update({
    collection: 'seat-claims',
    where: {
      and: [
        { booking: { equals: id } },
        { status: { equals: 'held' } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    data: { status: 'sold' },
    user,
    overrideAccess: false,
    context,
  })
  if (sold.docs.length !== booking.seats.length) {
    await payload.update({
      collection: 'bookings',
      id,
      data: { status: 'expired', activeKey: null },
      user,
      overrideAccess: false,
      context,
    })
    await payload.delete({
      collection: 'seat-claims',
      where: { booking: { equals: id } },
      user,
      overrideAccess: false,
      context,
    })
    throw new Error('Ghế đã hết thời gian giữ. Vui lòng đặt lại.')
  }
  return payload.update({
    collection: 'bookings',
    id,
    user,
    overrideAccess: false,
    context,
    data: {
      status: 'confirmed',
      activeKey: null,
      paymentMethod: method,
      ticketToken: booking.ticketToken || randomUUID(),
    },
  })
}
