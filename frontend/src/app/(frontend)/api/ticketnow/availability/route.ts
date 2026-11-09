import { fetchGateway } from '@/lib/backend-api'
import { getPayloadClient } from '@/lib/payload'
import { failure } from '@/lib/http'
import { normalizeToFrontendSeatCode } from '@/lib/seat-normalization'

interface SeatResponse {
  seatId: string
  tierId: string
  status: 'AVAILABLE' | 'HELD' | 'CONFIRMED'
  heldBy?: string | null
  expiresAt?: string | null
}

export async function GET(request: Request) {
  try {
    const event = new URL(request.url).searchParams.get('event')
    if (!event || event.length > 100) throw new Error('Sự kiện không hợp lệ.')

    // 1. Try querying real Seat Inventory via API Gateway
    try {
      const seats = await fetchGateway<SeatResponse[]>(`/api/v1/events/${event}/seats`, {
        cache: 'no-store',
      })

      if (Array.isArray(seats)) {
        const claimsMap = new Map<string, string>()

        for (const s of seats) {
          if (s.status === 'HELD' || s.status === 'CONFIRMED') {
            const status = s.status === 'CONFIRMED' ? 'sold' : 'held'
            // Include both original backend seatId ("A-01-01") and frontend code ("A-1-1")
            claimsMap.set(s.seatId, status)
            const frontendCode = normalizeToFrontendSeatCode(s.seatId)
            claimsMap.set(frontendCode, status)
          }
        }

        const claims = Array.from(claimsMap.entries()).map(([code, status]) => ({ code, status }))
        return Response.json({ claims }, { headers: { 'Cache-Control': 'no-store' } })
      }
    } catch {
      // Gateway error or offline -> proceed to fallback
    }

    // 2. Fallback to local CMS
    const payload = await getPayloadClient()
    const claims = await payload.find({
      collection: 'seat-claims',
      where: {
        and: [
          { event: { equals: event } },
          {
            or: [
              { status: { equals: 'sold' } },
              { expiresAt: { greater_than: new Date().toISOString() } },
            ],
          },
        ],
      },
      limit: 1000,
      depth: 0,
      overrideAccess: false,
      select: { key: true, status: true },
    })

    return Response.json(
      {
        claims: claims.docs.map((c: any) => ({
          code: c.key.slice(c.key.indexOf(':') + 1),
          status: c.status,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return failure(error)
  }
}
