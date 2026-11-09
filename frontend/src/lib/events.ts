import { unstable_cache } from 'next/cache'
import { fetchGateway } from '@/lib/backend-api'
import {
  adaptToFrontendEvent,
  type BackendEvent,
  type BackendVenue,
  type BackendSeatMap,
} from '@/lib/event-adapter'
import { getPayloadClient, findBySlug } from '@/lib/payload'
import type { Event } from '@/types/event'

interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const getEvents = unstable_cache(
  async (): Promise<Event[]> => {
    try {
      // 1. Fetch events from Spring Boot Gateway
      const [eventsPage, venuesPage] = await Promise.all([
        fetchGateway<PageResponse<BackendEvent>>('/api/v1/events?page=0&size=50'),
        fetchGateway<PageResponse<BackendVenue>>('/api/v1/venues?page=0&size=50').catch(() => ({
          content: [],
          page: 0,
          size: 0,
          totalElements: 0,
          totalPages: 0,
          last: true,
        })),
      ])

      const venueMap = new Map<string, BackendVenue>()
      for (const venue of venuesPage.content) {
        venueMap.set(venue.id, venue)
      }

      if (eventsPage?.content?.length) {
        return eventsPage.content.map((be) => adaptToFrontendEvent(be, venueMap.get(be.venueId)))
      }
    } catch {
      // Gateway error or offline -> proceed to fallback
    }

    // 2. Fallback to local CMS docs
    try {
      const payload = await getPayloadClient()
      const docs = (
        await payload.find({
          collection: 'events',
          where: { status: { in: ['on_sale', 'published'] } },
          sort: 'date',
          limit: 100,
          depth: 1,
          overrideAccess: false,
        })
      ).docs
      return docs as unknown as Event[]
    } catch {
      return []
    }
  },
  ['ticketnow-events-v2'],
  { tags: ['events'], revalidate: 30 },
)

export async function getEvent(idOrSlug: string): Promise<Event | null> {
  try {
    // 1. Try Gateway
    const backendEvent = await fetchGateway<BackendEvent>(`/api/v1/events/${idOrSlug}`)
    if (backendEvent?.id) {
      const [venue, seatMap] = await Promise.all([
        backendEvent.venueId
          ? fetchGateway<BackendVenue>(`/api/v1/venues/${backendEvent.venueId}`).catch(() => null)
          : null,
        fetchGateway<BackendSeatMap>(`/api/v1/events/${backendEvent.id}/seatmap`).catch(() => null),
      ])
      return adaptToFrontendEvent(backendEvent, venue, seatMap)
    }
  } catch {
    // Gateway error -> proceed to fallback
  }

  // 2. Fallback to local CMS
  try {
    const doc = await findBySlug('events', idOrSlug, { depth: 1 })
    return (doc as unknown as Event) || null
  } catch {
    return null
  }
}
