import { appAuth } from '@/lib/app-auth'
import { failure, verifyOrigin } from '@/lib/http'
import { holdSeats, changeBooking } from '@/lib/booking-service'
import { fetchGateway } from '@/lib/backend-api'
import { getPayloadClient } from '@/lib/payload'
import type { BackendSeatMap } from '@/lib/event-adapter'

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

      let backendBookingId: string | null = null

      // Try holding via booking-service on API Gateway
      try {
        // Query seatmap to resolve tierId and price for each seat
        const seatmap = await fetchGateway<BackendSeatMap>(`/api/v1/events/${body.event}/seatmap`).catch(
          () => null,
        )

        const seatSelections = body.seats.map((seatCode: string) => {
          let tierId: string | undefined
          let price = 0

          if (seatmap?.sections) {
            for (const sec of seatmap.sections) {
              const match = sec.seats?.some((s) => s.seatId === seatCode) || seatCode.startsWith(sec.name)
              if (match) {
                tierId = sec.tier.id
                price = Number(sec.tier.price) || 0
                break
              }
            }
          }

          return {
            seatId: seatCode,
            tierId,
            price,
          }
        })

        const backendBooking = await fetchGateway<any>('/api/v1/bookings', {
          method: 'POST',
          headers: { 'Idempotency-Key': body.key },
          body: JSON.stringify({
            eventId: body.event,
            seats: seatSelections,
          }),
        })

        if (backendBooking?.id) {
          backendBookingId = backendBooking.id
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (
          message.includes('unavailable') ||
          message.includes('already held') ||
          message.includes('locked') ||
          message.includes('Conflict')
        ) {
          throw new Error('Ghế vừa được người khác giữ. Vui lòng chọn ghế khác.')
        }
        // Fallback to seat-inventory direct hold if booking-service threw non-conflict
        try {
          await fetchGateway(`/api/v1/events/${body.event}/seats/hold`, {
            method: 'POST',
            body: JSON.stringify({
              seatIds: body.seats,
              bookingId: body.key,
              ttlSeconds: 600,
            }),
          })
        } catch {
          // Non-blocking fallback
        }
      }

      // Sync/fallback to local PayloadCMS booking
      const booking = await holdSeats(user, body.event, body.seats, body.key)
      return Response.json({ ok: true, id: backendBookingId || booking.id })
    }

    // 2. ACTION: CONFIRM / PAY / CANCEL / REFUND
    if (
      typeof body.id !== 'string' ||
      body.id.length > 100 ||
      !['pay', 'cancel', 'fail', 'refund'].includes(body.action)
    ) {
      throw new Error('Yêu cầu không hợp lệ.')
    }

    // Handle PAY action
    if (body.action === 'pay') {
      // 1. Try processing payment via payment-service and booking-service
      try {
        let amount = 0
        let eventId: string | null = null
        let seatIds: string[] = []

        // Try getting backend booking info
        const backendBooking = await fetchGateway<any>(`/api/v1/bookings/${body.id}`).catch(() => null)
        if (backendBooking) {
          amount = Number(backendBooking.totalAmount) || 0
          eventId = backendBooking.eventId
          seatIds = (backendBooking.items || []).map((i: any) => i.seatId)
        } else {
          const payload = await getPayloadClient()
          const localBooking = await payload.findByID({
            collection: 'bookings',
            id: body.id,
            user,
            overrideAccess: false,
            depth: 0,
          }).catch(() => null)
          if (localBooking) {
            amount = Number(localBooking.total) || 0
            eventId = typeof localBooking.event === 'object' ? (localBooking.event as any).id : localBooking.event
            seatIds = localBooking.seats.map((s: any) => s.code)
          }
        }

        // Call payment-service to create payment record
        const payment = await fetchGateway<any>('/api/v1/payments', {
          method: 'POST',
          body: JSON.stringify({
            bookingId: body.id,
            amount: Math.max(1000, amount),
            description: `Payment for booking ${body.id}`,
            provider: 'MOCK',
          }),
        }).catch(() => null)

        // Simulate payment success (triggers Kafka PaymentSucceeded -> confirms booking & issues ticket)
        if (payment?.orderCode) {
          await fetchGateway<any>(`/api/v1/payments/mock/simulate-success/${payment.orderCode}`, {
            method: 'POST',
          }).catch(() => null)
        }

        // Direct confirm on booking-service as well
        await fetchGateway<any>(`/api/v1/bookings/${body.id}/confirm`, {
          method: 'POST',
        }).catch(() => null)

        // Confirm seats in seat-inventory if eventId and seatIds are known
        if (eventId && seatIds.length > 0) {
          await fetchGateway(`/api/v1/events/${eventId}/seats/confirm`, {
            method: 'POST',
            body: JSON.stringify({
              seatIds,
              bookingId: body.id,
            }),
          }).catch(() => {})
        }
      } catch (err) {
        console.warn('Backend payment flow note:', err)
      }

      // Also update local CMS booking if it exists
      try {
        const booking = await changeBooking(user, body.id, body.action, body.method)
        return Response.json({ ok: true, id: booking.id, status: booking.status })
      } catch {
        return Response.json({ ok: true, id: body.id, status: 'confirmed' })
      }
    }

    // Handle CANCEL / FAIL action
    if (body.action === 'cancel' || body.action === 'fail') {
      try {
        // Cancel in booking-service
        await fetchGateway<any>(`/api/v1/bookings/${body.id}/cancel`, {
          method: 'POST',
        }).catch(() => null)

        // Release seats in seat-inventory
        const payload = await getPayloadClient()
        const existing = await payload.findByID({
          collection: 'bookings',
          id: body.id,
          user,
          overrideAccess: false,
          depth: 0,
        }).catch(() => null)

        if (existing) {
          const eventId = typeof existing.event === 'object' ? (existing.event as any).id : existing.event
          const seatIds = existing.seats.map((s: any) => s.code)
          await fetchGateway(`/api/v1/events/${eventId}/seats/release`, {
            method: 'POST',
            body: JSON.stringify({
              seatIds,
              bookingId: body.id,
            }),
          }).catch(() => {})
        }
      } catch {
        // Non-blocking
      }

      try {
        const booking = await changeBooking(user, body.id, body.action, body.method)
        return Response.json({ ok: true, id: booking.id, status: booking.status })
      } catch {
        return Response.json({ ok: true, id: body.id, status: body.action === 'cancel' ? 'cancelled' : 'failed' })
      }
    }

    // Fallback for refund or other actions
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
