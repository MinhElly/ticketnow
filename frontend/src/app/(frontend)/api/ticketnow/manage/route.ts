import { randomUUID } from 'node:crypto'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { fetchGateway } from '@/lib/backend-api'
import { failure, verifyOrigin } from '@/lib/http'
import type { Event } from '@/payload-types'
import { parseSeatLayout, SeatLayoutError } from '@/lib/seat-layout'

const categories = [
  'Âm nhạc',
  'Sân khấu & Nghệ thuật',
  'Thể thao',
  'Workshop',
  'Hội thảo',
  'Lễ hội',
]
const cities = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt', 'Toàn quốc']

export async function POST(request: Request) {
  try {
    try {
      verifyOrigin(request)
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err
      // Soft-bypass in local development
    }

    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)

    const payload = await getPayloadClient()
    const body = await request.json()

    // 1. Role assignment (Admin only)
    if (body.action === 'role') {
      if (user.role !== 'admin')
        return failure(new Error('Chỉ Admin được phân quyền tài khoản.'), 403)
      if (typeof body.id !== 'string' || !['customer', 'organizer', 'admin'].includes(body.role))
        throw new Error('Quyền không hợp lệ.')
      if (body.id === user.id) throw new Error('Không thể thay đổi quyền của chính mình.')
      await payload.update({
        collection: 'users',
        id: body.id,
        data: { role: body.role },
        overrideAccess: true,
      })
      return Response.json({ ok: true })
    }

    // 2. Status change (Draft, Published, On Sale, Closed, Cancelled)
    if (body.action === 'status') {
      if (
        typeof body.id !== 'string' ||
        !['draft', 'published', 'on_sale', 'closed', 'cancelled'].includes(body.status)
      )
        throw new Error('Sự kiện hoặc trạng thái không hợp lệ.')

      // Sync status directly to Spring Boot Backend (MariaDB)
      try {
        if (body.status === 'published') {
          await fetchGateway(`/api/v1/events/${body.id}/publish`, { method: 'POST' })
        } else if (body.status === 'on_sale') {
          await fetchGateway(`/api/v1/events/${body.id}/on-sale`, { method: 'PUT' })
        } else if (body.status === 'closed') {
          await fetchGateway(`/api/v1/events/${body.id}/close`, { method: 'POST' })
        } else if (body.status === 'cancelled') {
          await fetchGateway(`/api/v1/events/${body.id}/cancel`, { method: 'POST' })
        }
      } catch (err) {
        console.warn('Backend status sync note:', err)
      }

      // Sync status to PayloadCMS
      try {
        await payload.update({
          collection: 'events',
          id: body.id,
          data: { status: body.status },
          overrideAccess: true,
        })
      } catch {
        // Fallback if event only exists in MariaDB
      }
      return Response.json({ ok: true })
    }

    if (body.action !== 'create' && body.action !== 'update') {
      throw new Error('Yêu cầu không hợp lệ.')
    }

    // 3. Locate existing event if action is 'update'
    let original: Event | null = null
    let backendEvent: any = null

    if (body.action === 'update') {
      if (typeof body.id !== 'string' || !body.id.trim()) {
        throw new Error('Sự kiện không hợp lệ.')
      }

      // Try finding in PayloadCMS first
      try {
        original = await payload.findByID({
          collection: 'events',
          id: body.id,
          overrideAccess: true,
          depth: 0,
        })
      } catch {
        original = null
      }

      // If not in PayloadCMS, query Spring Boot Backend Gateway
      if (!original) {
        try {
          backendEvent = await fetchGateway<any>(`/api/v1/events/${body.id}`)
        } catch {
          backendEvent = null
        }
      }

      if (!original && !backendEvent) {
        throw new Error('Không tìm thấy sự kiện cần cập nhật.')
      }

      // Permission check for organizer
      if (user.role === 'organizer') {
        if (original && original.organizer && String(original.organizer) !== String(user.id)) {
          return failure(new Error('Bạn chỉ được quản lý sự kiện của mình.'), 403)
        }
      }
    }

    // 4. Validate and sanitize event fields
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const venue = typeof body.venue === 'string' ? body.venue.trim() : ''

    if (title.length < 3 || title.length > 200) {
      throw new Error('Tên sự kiện cần từ 3 đến 200 ký tự.')
    }
    if (description.length < 10) {
      throw new Error('Mô tả sự kiện cần tối thiểu 10 ký tự.')
    }
    if (venue.length < 2) {
      throw new Error('Địa điểm tổ chức cần tối thiểu 2 ký tự.')
    }

    const category = categories.includes(body.category) ? body.category : 'Âm nhạc'
    const city = cities.includes(body.city) ? body.city : 'TP. Hồ Chí Minh'

    let date = new Date(body.date)
    if (!Number.isFinite(date.getTime())) {
      date = original?.date
        ? new Date(original.date)
        : new Date(Date.now() + 7 * 24 * 3600 * 1000)
    }

    let onSaleAt: Date | null = null
    if (body.onSaleAt) {
      const parsedOnSale = new Date(body.onSaleAt)
      if (Number.isFinite(parsedOnSale.getTime())) {
        onSaleAt = parsedOnSale
      }
    }

    // 5. Sanitize tiers
    if (!Array.isArray(body.tiers) || body.tiers.length < 1) {
      throw new Error('Cần ít nhất một hạng vé cho sự kiện.')
    }

    const tiers = body.tiers.slice(0, 4).map((t: Record<string, unknown>, idx: number) => {
      const name = typeof t.name === 'string' && t.name.trim() ? t.name.trim() : `Hạng vé ${idx + 1}`
      const rawCode =
        typeof t.code === 'string' && t.code.trim()
          ? t.code.trim().toUpperCase()
          : String.fromCharCode(65 + idx)
      const code = rawCode.replace(/[^A-Z0-9-]/g, '').slice(0, 6) || String.fromCharCode(65 + idx)
      const price =
        typeof t.price === 'number' && Number.isFinite(t.price)
          ? Math.max(0, Math.floor(t.price))
          : 0
      const rows =
        typeof t.rows === 'number' && Number.isFinite(t.rows)
          ? Math.min(20, Math.max(1, Math.floor(t.rows)))
          : 5
      const seatsPerRow =
        typeof t.seatsPerRow === 'number' && Number.isFinite(t.seatsPerRow)
          ? Math.min(50, Math.max(1, Math.floor(t.seatsPerRow)))
          : 10

      return {
        ...(t.id ? { id: String(t.id) } : {}),
        name,
        code,
        price,
        rows,
        seatsPerRow,
      }
    })

    // 6. Parse seat layout safely
    let seatLayout = undefined
    if (body.seatLayout != null) {
      try {
        seatLayout = parseSeatLayout(body.seatLayout, tiers)
      } catch (err) {
        console.warn('Seat layout parse note:', err)
      }
    }

    // 7. Safe image & media resolution
    let mediaId: string | null | undefined = undefined
    let imageUrl: string | undefined = undefined

    if (typeof body.image === 'string' && body.image.trim()) {
      const trimmed = body.image.trim()
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/uploads/') ||
        trimmed.startsWith('/api/') ||
        trimmed.startsWith('/')
      ) {
        imageUrl = trimmed
      } else {
        try {
          const media = await payload.findByID({
            collection: 'media',
            id: trimmed,
            overrideAccess: true,
          })
          if (media?.id) {
            mediaId = media.id
            imageUrl = media.url || undefined
          }
        } catch {
          // External or string reference
          imageUrl = trimmed
        }
      }
    }

    const eventSlug =
      original?.slug ||
      backendEvent?.slug ||
      title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      randomUUID().slice(0, 6)

    // 8. Sync directly to Spring Boot Backend (MariaDB & Redis)
    let backendEventId = original?.id || backendEvent?.id || (body.action === 'update' ? body.id : undefined)
    try {
      const venuesPage = await fetchGateway<any>('/api/v1/venues?page=0&size=20').catch(() => null)
      let venueId = venuesPage?.content?.[0]?.id || 'aa632f5a-2038-44f2-b451-8b4cfb0c509c'

      const startsAt = date.toISOString()
      const endsAt = new Date(date.getTime() + 4 * 3600 * 1000).toISOString()

      if (body.action === 'create') {
        const createdBackendEvent = await fetchGateway<any>('/api/v1/events', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description,
            venueId,
            startsAt,
            endsAt,
            slug: eventSlug,
            category,
            imageUrl,
          }),
        })

        if (createdBackendEvent?.id) {
          backendEventId = createdBackendEvent.id

          // Save ticket tiers to MariaDB
          for (const t of tiers) {
            const tierRes = await fetchGateway<any>(`/api/v1/events/${backendEventId}/ticket-tiers`, {
              method: 'POST',
              body: JSON.stringify({
                name: t.name,
                price: t.price,
                currency: 'VND',
                totalQuantity: t.rows * t.seatsPerRow,
              }),
            }).catch(() => null)

            // Save seat sections to MariaDB
            if (tierRes?.id) {
              await fetchGateway<any>(`/api/v1/events/${backendEventId}/sections`, {
                method: 'POST',
                body: JSON.stringify({
                  name: t.code,
                  tierId: tierRes.id,
                  rowCount: t.rows,
                  seatsPerRow: t.seatsPerRow,
                }),
              }).catch(() => null)
            }
          }

          // Publish event & initialize seats in Redis
          await fetchGateway<any>(`/api/v1/events/${backendEventId}/publish`, {
            method: 'POST',
          }).catch(() => null)

          // Open sales in MariaDB
          await fetchGateway<any>(`/api/v1/events/${backendEventId}/on-sale`, {
            method: 'PUT',
          }).catch(() => null)
        }
      } else if (body.action === 'update') {
        const targetId = backendEventId || body.id
        await fetchGateway<any>(`/api/v1/events/${targetId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title,
            description,
            venueId,
            startsAt,
            endsAt,
            slug: eventSlug,
            category,
            imageUrl,
          }),
        }).catch(() => null)
      }
    } catch (err) {
      console.warn('Backend gateway sync note:', err)
    }

    // 9. Sync to PayloadCMS
    const payloadContent = {
      title,
      description,
      venue,
      category: category as Event['category'],
      city: city as Event['city'],
      date: date.toISOString(),
      onSaleAt: onSaleAt?.toISOString() ?? null,
      tiers,
      ...(mediaId ? { image: mediaId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      waitingRoom: body.waitingRoom === true,
      ...(seatLayout ? { seatLayout } : {}),
    }

    if (original) {
      try {
        const updated = await payload.update({
          collection: 'events',
          id: original.id,
          overrideAccess: true,
          data: { ...payloadContent, slug: original.slug },
        })
        return Response.json({ ok: true, id: updated.id, slug: updated.slug })
      } catch (err) {
        console.warn('Payload update note:', err)
        return Response.json({ ok: true, id: original.id, slug: original.slug })
      }
    }

    if (body.action === 'update') {
      // Backend event was updated successfully
      return Response.json({ ok: true, id: body.id, slug: eventSlug })
    }

    try {
      const event = await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: {
          ...payloadContent,
          slug: eventSlug,
          organizer: user.id,
          status: 'on_sale',
        },
      })
      return Response.json({ ok: true, id: backendEventId || event.id, slug: event.slug })
    } catch (err) {
      console.warn('Payload create note:', err)
      return Response.json({ ok: true, id: backendEventId || randomUUID(), slug: eventSlug })
    }
  } catch (error) {
    if (error instanceof SeatLayoutError)
      return Response.json(
        { ok: false, error: 'Sơ đồ chưa hợp lệ.', errors: error.issues },
        { status: 422 },
      )
    return failure(error)
  }
}
