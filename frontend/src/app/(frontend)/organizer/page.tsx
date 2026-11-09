import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getEvents } from '@/lib/events'
import { AccessPage } from '@/components/AccessPage'
import { Dashboard } from '@/components/Dashboard'

export default async function OrganizerPage() {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Organizer" />
  if (user.role !== 'organizer') return <AccessPage role="Organizer" denied />

  let events: any[] = []
  let bookings: any[] = []

  try {
    // 1. First attempt to load real events from Spring Boot Gateway
    const gatewayEvents = await getEvents()
    events = gatewayEvents as any[]
  } catch {
    events = []
  }

  // 2. Fallback to Payload if gateway events is empty
  if (events.length === 0) {
    try {
      const payload = await getPayloadClient()
      const result = await payload.find({
        collection: 'events',
        depth: 1,
        overrideAccess: true,
        limit: 100,
      })
      events = result?.docs || []
    } catch {
      // Offline fallback
    }
  }

  // 3. Load bookings (try PayloadCMS)
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'bookings',
      depth: 1,
      overrideAccess: true,
      limit: 100,
    })
    bookings = result?.docs || []
  } catch {
    bookings = []
  }

  return <Dashboard user={user} events={events} bookings={bookings} />
}
