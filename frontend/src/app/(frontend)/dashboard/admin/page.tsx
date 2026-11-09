import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getEvents } from '@/lib/events'
import { AccessPage } from '@/components/AccessPage'
import { Dashboard } from '@/components/Dashboard'

export default async function AdminDashboardPage() {
  const user = await appAuth.currentUser()
  if (!user) return <AccessPage role="Admin" />
  if (user.role !== 'admin') return <AccessPage role="Admin" denied />

  let events: any[] = []
  let bookings: any[] = []
  let users: any[] = []

  try {
    // 1. Fetch real events from Spring Boot Gateway
    const gatewayEvents = await getEvents()
    events = gatewayEvents as any[]
  } catch {
    events = []
  }

  // 2. Fetch or fallback users and bookings
  try {
    const payload = await getPayloadClient()
    const [bookingsRes, usersRes] = await Promise.all([
      payload.find({ collection: 'bookings', depth: 1, overrideAccess: true, limit: 100 }),
      payload.find({ collection: 'users', depth: 0, overrideAccess: true, limit: 100 }),
    ])
    bookings = bookingsRes?.docs || []
    users = usersRes?.docs || []
  } catch {
    // Fallback demo users for dashboard management
    users = [
      { id: '1', name: 'Admin Demo', email: 'admin01@example.com', role: 'admin' },
      { id: '2', name: 'Organizer Demo', email: 'organizer01@example.com', role: 'organizer' },
      { id: '3', name: 'Customer Demo', email: 'customer01@example.com', role: 'customer' },
    ]
  }

  if (users.length === 0) {
    users = [
      { id: '1', name: 'Admin Demo', email: 'admin01@example.com', role: 'admin' },
      { id: '2', name: 'Organizer Demo', email: 'organizer01@example.com', role: 'organizer' },
      { id: '3', name: 'Customer Demo', email: 'customer01@example.com', role: 'customer' },
    ]
  }

  return <Dashboard user={user} events={events} bookings={bookings} users={users} />
}
