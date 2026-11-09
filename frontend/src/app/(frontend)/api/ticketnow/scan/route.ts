import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { failure, verifyOrigin } from '@/lib/http'

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)
    const { token } = await request.json()
    if (typeof token !== 'string' || !/^TN:[a-f0-9-]{36}:[A-Z]{1,3}-\d{1,2}-\d{1,2}$/.test(token))
      throw new Error('Vé không đúng định dạng QR TicketNow.')
    const [, ticketToken, seat] = token.split(':')
    const payload = await getPayloadClient()
    const { docs } = await payload.find({
      collection: 'bookings',
      where: { ticketToken: { equals: ticketToken } },
      user,
      overrideAccess: false,
      depth: 0,
      limit: 1,
    })
    const booking = docs[0]
    if (!booking || booking.status !== 'confirmed')
      throw new Error('Vé không hợp lệ, đã hoàn hoặc không thuộc sự kiện của bạn.')
    try {
      await payload.create({
        collection: 'ticket-scans',
        user,
        overrideAccess: false,
        context: { ticketWorkflow: true },
        data: {
          token,
          booking: booking.id,
          event: booking.event,
          owner: booking.owner,
          scannedBy: user.id,
          seat,
          usedAt: new Date().toISOString(),
        },
      })
    } catch {
      throw new Error('Vé đã được sử dụng hoặc không hợp lệ. Không cho phép vào cổng lần hai.')
    }
    return Response.json({ ok: true, reference: booking.reference, seat })
  } catch (error) {
    return failure(error)
  }
}
