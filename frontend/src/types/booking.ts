export type BookingStatus = 'held' | 'confirmed' | 'expired' | 'cancelled' | 'refunded'

export interface BookedSeat {
  code: string
  price: number
  tierName?: string
}

export interface Booking {
  id: string
  reference: string
  event: string | { id: string; title: string; date: string; venue: string }
  seats: BookedSeat[]
  total: number
  status: BookingStatus
  expiresAt?: string
  createdAt?: string
  ticketToken?: string
  scannedAt?: string
}

export interface TicketItem {
  id: string
  bookingId: string
  eventTitle: string
  eventDate: string
  venue: string
  seatCode: string
  tierName: string
  price: number
  token: string
  isScanned: boolean
}
