export type EventStatus = 'draft' | 'published' | 'on_sale' | 'closed' | 'cancelled'

export interface Venue {
  id: string
  name: string
  address: string
  city: string
  capacity: number
}

export interface TicketTier {
  id?: string | null
  name: string
  code?: string
  price: number
  currency?: string
  rows?: number
  seatsPerRow?: number
  capacity?: number
  badgeColor?: string
  color?: string
}

export interface SeatSection {
  id: string
  name: string
  tierId: string
  rowCount: number
  seatsPerRow: number
  totalSeats?: number
}

export interface SeatLayout {
  sections?: SeatSection[]
  stagePosition?: 'top' | 'center' | 'bottom'
  width?: number
  height?: number
  aisles?: number[]
  stage?: {
    x?: number | null
    y?: number | null
    width?: number | null
    height?: number | null
    label?: string | null
  }
  zones?: Array<{
    x?: number | null
    y?: number | null
    width?: number | null
    height?: number | null
    tierCode?: string | null
    color?: string | null
    aisle?: boolean | null
  }> | null
  [key: string]: any
}

export interface Event {
  id: string
  title: string
  slug: string
  subtitle?: string | null
  description: string
  date: string
  endDate?: string
  onSaleAt?: string | null
  venue: string
  venueId?: string
  city: string
  status: EventStatus
  category: string
  featured?: boolean | null
  waitingRoom?: boolean | null
  image?: any
  tiers?: TicketTier[]
  ticketTiers?: TicketTier[]
  seatLayout?: SeatLayout | null
  organizerId?: string
  organizer?: any
  createdAt?: string
  updatedAt?: string
}
