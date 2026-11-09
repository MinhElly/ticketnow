import QRCode from 'qrcode'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { expireOwnBookings } from '@/lib/booking-service'
import { AccessPage } from '@/components/AccessPage'
import { MyTickets } from '@/components/MyTickets'

export default async function TicketsPage() {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Customer" />
  if (user.role !== 'customer') return <AccessPage role="Customer" denied />

  let docs: any[] = []
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
    docs = result?.docs || []
  } catch {
    docs = []
  }

  const qrs: Record<string, string[]> = {}
  for (const booking of docs) {
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
  return <MyTickets bookings={docs} qrs={qrs} />
}
