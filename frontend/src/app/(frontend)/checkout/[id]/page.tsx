import { notFound } from 'next/navigation'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { expireOwnBookings } from '@/lib/booking-service'
import { AccessPage } from '@/components/AccessPage'
import { Checkout } from '@/components/Checkout'
import { fetchGateway } from '@/lib/backend-api'
import { getEvent } from '@/lib/events'

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Customer" />
  if (user.role !== 'customer') return <AccessPage role="Customer" denied />
  const { id } = await params

  let booking: any = null

  // 1. First attempt to load booking from Spring Boot Gateway
  try {
    const backendBooking = await fetchGateway<any>(`/api/v1/bookings/${id}`)
    if (backendBooking?.id) {
      const event = await getEvent(backendBooking.eventId)
      if (event) {
        const isConfirmed = backendBooking.status === 'CONFIRMED'
        const isCancelled = backendBooking.status === 'CANCELLED'
        const isExpired = backendBooking.status === 'EXPIRED'
        const status = isConfirmed ? 'confirmed' : isCancelled ? 'cancelled' : isExpired ? 'expired' : 'held'

        booking = {
          id: backendBooking.id,
          reference: `TN-${backendBooking.id.slice(0, 8).toUpperCase()}`,
          status,
          total: Number(backendBooking.totalAmount) || 0,
          expiresAt: backendBooking.expiresAt || new Date(Date.now() + 600000).toISOString(),
          seats: (backendBooking.items || []).map((item: any) => ({
            code: item.seatId,
            price: Number(item.price) || 0,
          })),
          event,
          owner: backendBooking.userId,
          createdAt: backendBooking.createdAt,
          updatedAt: backendBooking.createdAt,
        }
      }
    }
  } catch {
    // Gateway error or booking not in booking-service -> proceed to PayloadCMS fallback
  }

  // 2. Fallback to PayloadCMS
  if (!booking) {
    try {
      const payload = await getPayloadClient()
      await expireOwnBookings(user)
      booking = await payload.findByID({
        collection: 'bookings',
        id,
        depth: 1,
        user,
        overrideAccess: false,
      })
    } catch {
      // ignore
    }
  }

  if (!booking) {
    notFound()
  }

  return <Checkout booking={booking} />
}
