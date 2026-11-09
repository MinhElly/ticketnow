import QRCode from 'qrcode'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { expireOwnBookings } from '@/lib/booking-service'
import { AccessPage } from '@/components/AccessPage'
import { MyTickets } from '@/components/MyTickets'
import { fetchGateway } from '@/lib/backend-api'
import { getEvent } from '@/lib/events'

export default async function TicketsPage() {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Customer" />
  if (user.role !== 'customer') return <AccessPage role="Customer" denied />

  const qrs: Record<string, string[]> = {}
  const allBookings: any[] = []
  const seenBookingIds = new Set<string>()

  // 1. Try querying real tickets from ticket-service via API Gateway
  try {
    const backendTickets = await fetchGateway<any[]>('/api/v1/tickets/my-tickets')
    if (Array.isArray(backendTickets) && backendTickets.length > 0) {
      // Group tickets by bookingId
      const ticketsByBooking = new Map<string, any[]>()
      for (const t of backendTickets) {
        const bId = t.bookingId || 'standalone'
        if (!ticketsByBooking.has(bId)) {
          ticketsByBooking.set(bId, [])
        }
        ticketsByBooking.get(bId)!.push(t)
      }

      for (const [bId, tickets] of ticketsByBooking.entries()) {
        const firstTicket = tickets[0]
        const event = await getEvent(firstTicket.eventId)
        if (event) {
          const bookingObj = {
            id: bId,
            reference: firstTicket.ticketCode
              ? `TN-${firstTicket.ticketCode.replace(/^TN-/, '')}`
              : `TN-${bId.slice(0, 8).toUpperCase()}`,
            status:
              firstTicket.status === 'CANCELLED'
                ? 'cancelled'
                : firstTicket.status === 'REFUNDED'
                  ? 'refunded'
                  : 'confirmed',
            total: tickets.reduce((sum, t) => sum + (Number(t.price) || 0), 0),
            seats: tickets.map((t) => ({
              code: t.seatCode,
              price: Number(t.price) || 0,
            })),
            event,
            owner: user.id,
            createdAt: firstTicket.issuedAt,
          }
          allBookings.push(bookingObj)
          seenBookingIds.add(bId)

          // Generate QR code SVGs for these tickets
          qrs[bId] = await Promise.all(
            tickets.map(async (t) => {
              const payloadToEncode = t.qrPayload || t.ticketCode || `TN:${t.id}:${t.seatCode}`
              return QRCode.toString(payloadToEncode, {
                type: 'svg',
                margin: 2,
                color: { dark: '#163b2c', light: '#ffffff' },
              })
            }),
          )
        }
      }
    }
  } catch {
    // Gateway or ticket-service offline
  }

  // 2. Query pending/held bookings from booking-service
  try {
    const myBookingsRes = await fetchGateway<any>('/api/v1/bookings/me?page=0&size=50')
    const bookingList = myBookingsRes?.content || (Array.isArray(myBookingsRes) ? myBookingsRes : [])
    for (const b of bookingList) {
      if (!seenBookingIds.has(b.id)) {
        const event = await getEvent(b.eventId)
        if (event) {
          const isConfirmed = b.status === 'CONFIRMED'
          const isCancelled = b.status === 'CANCELLED'
          const isExpired = b.status === 'EXPIRED'
          const status = isConfirmed ? 'confirmed' : isCancelled ? 'cancelled' : isExpired ? 'expired' : 'held'

          allBookings.push({
            id: b.id,
            reference: `TN-${b.id.slice(0, 8).toUpperCase()}`,
            status,
            total: Number(b.totalAmount) || 0,
            expiresAt: b.expiresAt,
            seats: (b.items || []).map((i: any) => ({
              code: i.seatId,
              price: Number(i.price) || 0,
            })),
            event,
            owner: b.userId,
            createdAt: b.createdAt,
          })
          seenBookingIds.add(b.id)
        }
      }
    }
  } catch {
    // Booking-service offline
  }

  // 3. Fallback / Merge with local PayloadCMS bookings
  try {
    const payload = await getPayloadClient()
    await expireOwnBookings(user)
    const result = await payload.find({
      collection: 'bookings',
      where: { owner: { equals: user.id } },
      user,
      overrideAccess: false,
      depth: 2,
      sort: '-createdAt',
      limit: 100,
    })
    const payloadDocs = result?.docs || []
    for (const booking of payloadDocs) {
      if (!seenBookingIds.has(booking.id)) {
        allBookings.push(booking)
        seenBookingIds.add(booking.id)

        if (booking.status === 'confirmed' && booking.ticketToken && Array.isArray(booking.seats)) {
          qrs[booking.id] = await Promise.all(
            booking.seats.map((seat: any) =>
              QRCode.toString(`TN:${booking.ticketToken}:${seat.code}`, {
                type: 'svg',
                margin: 2,
                color: { dark: '#163b2c', light: '#ffffff' },
              }),
            ),
          )
        }
      }
    }
  } catch {
    // Local CMS offline
  }

  return <MyTickets bookings={allBookings} qrs={qrs} />
}
