import { appAuth } from '@/lib/app-auth'
import { failure, verifyOrigin } from '@/lib/http'
import { holdSeats, changeBooking } from '@/lib/booking-service'
import { fetchGateway } from '@/lib/backend-api'
import { getPayloadClient } from '@/lib/payload'

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user) return failure(new Error('Vui lòng đăng nhập để đặt vé.'), 401)
    if (user.role !== 'customer') {
      return failure(
        new Error('Chỉ Customer có thể mua vé. Vui lòng dùng tài khoản khách hàng.'),
        403,
      )
    }

    const body = await request.json()

    // 1. ACTION: HOLD SEATS
    if (body.action === 'hold') {
      if (
        typeof body.event !== 'string' ||
        !Array.isArray(body.seats) ||
        body.seats.length < 1 ||
        body.seats.length > 6 ||
        body.seats.some(
          (s: unknown) => typeof s !== 'string' || !/^[A-Z]{1,3}-\d{1,2}-\d{1,2}$/.test(s),
        ) ||
        typeof body.key !== 'string' ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(body.key)
      ) {
        throw new Error('Chọn từ 1 đến 6 ghế hợp lệ.')
      }

      // Try holding via Gateway seat-inventory
      try {
        await fetchGateway(`/api/v1/events/${body.event}/seats/hold`, {
          method: 'POST',
          body: JSON.stringify({
            seatIds: body.seats,
            bookingId: body.key,
            ttlSeconds: 600,
          }),
        })
      } catch (err) {
        // If seat-inventory explicitly rejected hold, rethrow error
        const message = err instanceof Error ? err.message : ''
        if (message.includes('not available') || message.includes('already held') || message.includes('locked')) {
          throw new Error('Ghế vừa được người khác giữ. Vui lòng chọn ghế khác.')
        }
        // If Gateway is offline, proceed to local booking service
      }

      const booking = await holdSeats(user, body.event, body.seats, body.key)
      return Response.json({ ok: true, id: booking.id })
    }

    // 2. ACTION: CONFIRM / PAY / CANCEL / REFUND
    if (
      typeof body.id !== 'string' ||
      body.id.length > 100 ||
      !['pay', 'cancel', 'fail', 'refund'].includes(body.action)
    ) {
      throw new Error('Yêu cầu không hợp lệ.')
    }

    // Find booking to get eventId and seats
    try {
      const payload = await getPayloadClient()
      const existing = await payload.findByID({
        collection: 'bookings',
        id: body.id,
        user,
        overrideAccess: false,
        depth: 0,
      })

      if (existing) {
        const eventId = typeof existing.event === 'object' ? (existing.event as any).id : existing.event
        const seatIds = existing.seats.map((s: any) => s.code)

        if (body.action === 'pay') {
          // Confirm seats in seat-inventory
          await fetchGateway(`/api/v1/events/${eventId}/seats/confirm`, {
            method: 'POST',
            body: JSON.stringify({
              seatIds,
              bookingId: body.id,
            }),
          }).catch(() => {})
        } else if (body.action === 'cancel' || body.action === 'fail') {
          // Release seats in seat-inventory
          await fetchGateway(`/api/v1/events/${eventId}/seats/release`, {
            method: 'POST',
            body: JSON.stringify({
              seatIds,
              bookingId: body.id,
            }),
          }).catch(() => {})
        }
      }
    } catch {
      // Ignore background seat-inventory sync failure if offline
    }

    const booking = await changeBooking(user, body.id, body.action, body.method)
    return Response.json({ ok: true, id: booking.id, status: booking.status })
  } catch (error) {
    console.warn(
      'TicketNow booking workflow:',
      error instanceof Error ? error.message : 'Unknown workflow error',
    )
    return failure(error)
  }
}
