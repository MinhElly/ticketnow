import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { fetchGateway } from '@/lib/backend-api'
import { failure, verifyOrigin } from '@/lib/http'

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)
    const { token } = await request.json()
    if (typeof token !== 'string' || !token.trim())
      throw new Error('Vui lòng quét hoặc nhập mã vé.')

    const cleanToken = token.trim()

    // 1. Try Ticket Service Check-in via API Gateway
    try {
      const checkInBody = cleanToken.includes(':') || cleanToken.includes('.')
        ? { qrPayload: cleanToken, deviceInfo: 'GATE-SCANNER-WEB' }
        : { ticketCode: cleanToken, deviceInfo: 'GATE-SCANNER-WEB' }

      const checkInRes = await fetchGateway<any>('/api/v1/tickets/check-in', {
        method: 'POST',
        body: JSON.stringify(checkInBody),
      })

      if (checkInRes?.ticketCode) {
        return Response.json({
          ok: true,
          reference: checkInRes.ticketCode,
          seat: checkInRes.seatCode,
          tier: checkInRes.tierName,
          status: checkInRes.status,
          message: checkInRes.message || 'Check-in thành công',
        })
      }
    } catch (err: any) {
      const errMsg = err?.message || ''
      if (
        errMsg.includes('already been used') ||
        errMsg.includes('409') ||
        errMsg.includes('Conflict')
      ) {
        throw new Error('Vé đã được sử dụng hoặc không hợp lệ. Không cho phép vào cổng lần hai.')
      }
      if (errMsg.includes('Invalid ticket QR signature') || errMsg.includes('counterfeit')) {
        throw new Error('Vé không hợp lệ hoặc chữ ký QR bị làm giả.')
      }
      if (errMsg.includes('cancelled') || errMsg.includes('refunded')) {
        throw new Error('Vé không hợp lệ, đã bị hủy hoặc hoàn vé.')
      }
      // If error is not a network / 404 offline error, rethrow
      if (!errMsg.includes('Gateway error (404)') && !errMsg.includes('fetch failed') && !errMsg.includes('ECONNREFUSED')) {
        throw new Error(errMsg)
      }
    }

    // 2. Fallback: Local PayloadCMS ticket scan
    if (!/^TN:[a-f0-9-]{36}:[A-Z]{1,3}-\d{1,2}-\d{1,2}$/.test(cleanToken))
      throw new Error('Vé không đúng định dạng QR TicketNow.')
    const [, ticketToken, seat] = cleanToken.split(':')
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
          token: cleanToken,
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
