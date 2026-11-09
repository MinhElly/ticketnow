import { notFound } from 'next/navigation'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { expireOwnBookings } from '@/lib/booking-service'
import { AccessPage } from '@/components/AccessPage'
import { Checkout } from '@/components/Checkout'

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Customer" />
  if (user.role !== 'customer') return <AccessPage role="Customer" denied />
  const { id } = await params
  const payload = await getPayloadClient()
  await expireOwnBookings(user)
  let booking
  try {
    booking = await payload.findByID({
      collection: 'bookings',
      id,
      depth: 1,
      user,
      overrideAccess: false,
    })
  } catch {
    notFound()
  }
  return <Checkout booking={booking} />
}
