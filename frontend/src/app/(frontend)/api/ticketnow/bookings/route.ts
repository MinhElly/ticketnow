import { appAuth } from '@/lib/app-auth'
import { failure, verifyOrigin } from '@/lib/http'
import { holdSeats, changeBooking } from '@/lib/booking-service'
import { fetchGateway } from '@/lib/backend-api'
import { getPayloadClient } from '@/lib/payload'
import type { BackendSeatMap } from '@/lib/event-adapter'
import { normalizeToBackendSeatId, normalizeToFrontendSeatCode } from '@/lib/seat-normalization'

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
          (s: unknown) => typeof s !== 'string' || !/^[A-Z0-9-]{3,30}$/.test(s),
        ) ||
        typeof body.key !== 'string' ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(body.key)
      ) {
        throw new Error('Chọn từ 1 đến 6 ghế hợp lệ.')
      }

      let backendBookingId: string | null = null

      // Query seatmap to resolve tierId, price, and exact backend seat IDs
      const seatmap = await fetchGateway<BackendSeatMap>(`/api/v1/events/${body.event}/seatmap`).catch(
        () => null,
      )

      if (seatmap?.sections) {
        // Collect all backend seat IDs and map frontend seat codes
        const allBackendSeatIds: string[] = []
        const seatDetailMap = new Map<string, { tierId: string; price: number; backendSeatId: string }>()

        for (const sec of seatmap.sections) {
          if (Array.isArray(sec.seats)) {
            for (const s of sec.seats) {
              allBackendSeatIds.push(s.seatId)
              const detail = {
                tierId: sec.tier.id,
                price: Number(sec.tier.price) || 0,
                backendSeatId: s.seatId,
              }
              // Map both backend ID (e.g. "A-01-01") and frontend code (e.g. "A-1-1")
              seatDetailMap.set(s.seatId, detail)
              const frontendCode = normalizeToFrontendSeatCode(s.seatId)
              seatDetailMap.set(frontendCode, detail)
            }
          }
        }

        const seatSelections = body.seats.map((seatCode: string) => {
          const detail = seatDetailMap.get(seatCode)
          const backendSeatId = detail?.backendSeatId || normalizeToBackendSeatId(seatCode, allBackendSeatIds)
          const tierId = detail?.tierId || (seatmap.sections[0]?.tier?.id)
          const price = detail?.price ?? (Number(seatmap.sections[0]?.tier?.price) || 0)

          return {
            seatId: backendSeatId,
            tierId,
            price,
          }
        })

        try {
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
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err)

          // If error is genuinely because another user is currently holding the seat:
          if (
            message.includes('already held') ||
            message.includes('locked by another') ||
            (message.includes('unavailable') && !message.includes('do not exist in inventory'))
          ) {
            throw new Error('Ghế vừa được người khác giữ. Vui lòng chọn ghế khác.')
          }

          // If seats need initialization in seat-inventory, auto-initialize and retry once:
          if (message.includes('do not exist in inventory') && seatmap.sections) {
            try {
              const allSeatsToInit = seatmap.sections.flatMap((sec) =>
                (sec.seats || []).map((s) => ({
                  seatId: s.seatId,
                  tierId: sec.tier.id,
                })),
              )
              if (allSeatsToInit.length > 0) {
                await fetchGateway(`/api/v1/events/${body.event}/seats/initialize`, {
                  method: 'POST',
                  body: JSON.stringify({ seats: allSeatsToInit }),
                })

                // Retry booking after initializing seats
                const retriedBooking = await fetchGateway<any>('/api/v1/bookings', {
                  method: 'POST',
                  headers: { 'Idempotency-Key': body.key },
                  body: JSON.stringify({
                    eventId: body.event,
                    seats: seatSelections,
                  }),
                })

                if (retriedBooking?.id) {
                  backendBookingId = retriedBooking.id
                }
              }
            } catch (initErr: any) {
              const initMsg = initErr instanceof Error ? initErr.message : String(initErr)
              if (initMsg.includes('already held') || initMsg.includes('unavailable')) {
                throw new Error('Ghế vừa được người khác giữ. Vui lòng chọn ghế khác.')
              }
            }
          }
        }
      }

      // If backend booking succeeded, try syncing with local PayloadCMS non-blockingly
      if (backendBookingId) {
        try {
          await holdSeats(user, body.event, body.seats, body.key, true)
        } catch {
          // Non-blocking sync for PayloadCMS
        }
        return Response.json({ ok: true, id: backendBookingId })
      }

      // If not on backend (e.g. local CMS event or Gateway offline), use local PayloadCMS
      const booking = await holdSeats(user, body.event, body.seats, body.key, true)
      return Response.json({ ok: true, id: booking.id })
    }

    // 2. ACTION: CREATE-PAYMENT / CONFIRM / PAY / CANCEL / REFUND
    if (
      typeof body.id !== 'string' ||
      body.id.length > 100 ||
      !['create-payment', 'pay', 'confirm-payment', 'cancel', 'fail', 'refund'].includes(body.action)
    ) {
      throw new Error('Yêu cầu không hợp lệ.')
    }

    // Handle CREATE-PAYMENT action (generates VietQR code & payment details)
    if (body.action === 'create-payment') {
      let amount = 0
      let orderCode = Math.floor(100000 + Math.random() * 900000)
      let qrCode = ''
      let checkoutUrl = ''
      let paymentId = ''

      // Look up booking details
      try {
        const backendBooking = await fetchGateway<any>(`/api/v1/bookings/${body.id}`).catch(() => null)
        if (backendBooking) {
          amount = Number(backendBooking.totalAmount) || 0
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
          }
        }

        // Call payment-service to create payment record
        const payment = await fetchGateway<any>('/api/v1/payments', {
          method: 'POST',
          body: JSON.stringify({
            bookingId: body.id,
            amount: Math.max(1000, amount),
            description: `TicketNow ${body.id.slice(0, 8)}`,
            provider: 'MOCK',
          }),
        }).catch(() => null)

        if (payment) {
          paymentId = payment.id
          orderCode = payment.orderCode || orderCode
          qrCode = payment.qrCode || ''
          checkoutUrl = payment.checkoutUrl || ''
        }
      } catch (err) {
        console.warn('Payment link creation note:', err)
      }

      return Response.json({
        ok: true,
        payment: {
          id: paymentId,
          orderCode,
          amount,
          qrCode,
          checkoutUrl,
          bankName: 'MBBank (Ngân hàng Quân Đội)',
          accountNumber: '0345678902',
          accountName: 'TICKETNOW VIETNAM',
          transferContent: `TN${orderCode}`,
        },
      })
    }

    // Handle PAY / CONFIRM-PAYMENT action
    if (body.action === 'pay' || body.action === 'confirm-payment') {
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

        // Determine orderCode
        let orderCode = body.orderCode
        if (!orderCode) {
          const payments = await fetchGateway<any[]>(`/api/v1/payments/by-booking/${body.id}`).catch(() => [])
          if (Array.isArray(payments) && payments.length > 0) {
            orderCode = payments[0].orderCode
          }
        }

        if (!orderCode) {
          const payment = await fetchGateway<any>('/api/v1/payments', {
            method: 'POST',
            body: JSON.stringify({
              bookingId: body.id,
              amount: Math.max(1000, amount),
              description: `Payment for booking ${body.id}`,
              provider: 'MOCK',
            }),
          }).catch(() => null)
          if (payment) orderCode = payment.orderCode
        }

        // Simulate payment success (triggers Kafka PaymentSucceeded -> confirms booking & issues ticket)
        if (orderCode) {
          await fetchGateway<any>(`/api/v1/payments/mock/simulate-success/${orderCode}`, {
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
        const booking = await changeBooking(user, body.id, 'pay', body.method)
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
