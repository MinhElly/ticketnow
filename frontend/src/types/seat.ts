export type SeatStatus = 'AVAILABLE' | 'HELD' | 'CONFIRMED'

export interface SeatItem {
  seatId: string
  code: string
  row: number
  seat: number
  tierId: string
  tierName?: string
  price?: number
  status: SeatStatus
  heldUntil?: string
}

export interface HoldResult {
  success: boolean
  failedSeatIds?: string[]
  expiresAt?: string
  message?: string
}

export interface SeatMapResponse {
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
