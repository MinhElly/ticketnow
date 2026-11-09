import type { Event, EventStatus, TicketTier, SeatLayout } from '@/types/event'

export interface BackendEvent {
  id: string
  title: string
  description?: string | null
  venueId: string
  organizerId: string
  startsAt: string
  endsAt: string
  status: 'DRAFT' | 'PUBLISHED' | 'ON_SALE' | 'CLOSED' | 'CANCELLED'
  version: number
  slug?: string | null
  category?: string | null
  imageUrl?: string | null
  totalConfiguredSeats?: number | null
  lowestPrice?: number | null
  createdAt?: string
  updatedAt?: string
}

export interface BackendVenue {
  id: string
  name: string
  address: string
  city: string
  capacity: number
}

export interface BackendSeatMap {
  eventId: string
  venueId: string
  venueCapacity: number
  totalConfiguredSeats: number
  sections: Array<{
    id: string
    name: string
    tier: {
      id: string
      name: string
      price: number
      currency: string
    }
    rowCount: number
    seatsPerRow: number
    totalSeats: number
    seats: Array<{
      seatId: string
      row: number
      seat: number
    }>
  }>
}

const STATUS_MAP: Record<string, EventStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ON_SALE: 'on_sale',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
}

export function adaptToFrontendEvent(
  backendEvent: BackendEvent,
  venue?: BackendVenue | null,
  seatMap?: BackendSeatMap | null,
): Event {
  const status: EventStatus = STATUS_MAP[backendEvent.status] || 'published'

  // Extract tiers from seatMap sections if available
  let tiers: TicketTier[] = (seatMap?.sections || []).map((sec, idx) => ({
    id: sec.tier.id,
    name: sec.tier.name || sec.name,
    code: sec.name.slice(0, 3).toUpperCase(),
    price: Number(sec.tier.price) || 0,
    currency: sec.tier.currency || 'VND',
    rows: sec.rowCount,
    seatsPerRow: sec.seatsPerRow,
    capacity: sec.totalSeats,
    color: ['amber', 'teal', 'violet', 'blue'][idx % 4],
  }))

  // If seatMap was not fetched (e.g. in list view) but backend provided summary stats:
  if (tiers.length === 0 && (backendEvent.totalConfiguredSeats != null || backendEvent.lowestPrice != null)) {
    const totalSeats = backendEvent.totalConfiguredSeats != null ? Number(backendEvent.totalConfiguredSeats) : 0
    const price = backendEvent.lowestPrice != null ? Number(backendEvent.lowestPrice) : 0
    tiers = [
      {
        id: `summary-${backendEvent.id}`,
        name: 'Vé tiêu chuẩn',
        code: 'GA',
        price,
        currency: 'VND',
        capacity: totalSeats,
        rows: 1,
        seatsPerRow: totalSeats,
      },
    ]
  }

  // Convert seatMap sections to seatLayout
  const seatLayout: SeatLayout | null = seatMap ? {
    stage: {
      x: 35,
      y: 5,
      width: 30,
      height: 12,
      label: 'SÂN KHẤU',
    },
    zones: seatMap.sections.map((sec, idx) => ({
      x: 10 + (idx % 2) * 45,
      y: 25 + Math.floor(idx / 2) * 35,
      width: 40,
      height: 30,
      tierCode: sec.name.slice(0, 3).toUpperCase(),
      color: ['amber', 'teal', 'violet', 'blue'][idx % 4],
      aisle: true,
    })),
  } : null

  const image = backendEvent.imageUrl
    ? { url: backendEvent.imageUrl, alt: backendEvent.title }
    : null

  return {
    id: backendEvent.id,
    title: backendEvent.title,
    slug: backendEvent.slug || backendEvent.id,
    description: backendEvent.description || '',
    date: backendEvent.startsAt,
    endDate: backendEvent.endsAt,
    venue: venue?.name || 'Địa điểm tổ chức',
    venueId: backendEvent.venueId,
    city: venue?.city || 'Toàn quốc',
    status,
    category: backendEvent.category || 'Âm nhạc',
    featured: true,
    image,
    tiers: tiers.length ? tiers : undefined,
    ticketTiers: tiers.length ? tiers : undefined,
    seatLayout,
    organizerId: backendEvent.organizerId,
  }
}
