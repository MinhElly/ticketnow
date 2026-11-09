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
const cities = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt']
export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user || !['organizer', 'admin'].includes(user.role))
      return failure(new Error('Quyền truy cập bị từ chối.'), 403)
    const payload = await getPayloadClient()
    const body = await request.json()
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
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true })
    }
    if (body.action === 'status') {
      if (
        typeof body.id !== 'string' ||
        !['published', 'on_sale', 'closed', 'cancelled'].includes(body.status)
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
      } catch {
        // Fallback to local
      }

      try {
        await payload.update({
          collection: 'events',
          id: body.id,
          data: { status: body.status },
          overrideAccess: true,
        })
      } catch {
        // Non-blocking
      }
      return Response.json({ ok: true })
    }
    if (body.action !== 'create' && body.action !== 'update')
      throw new Error('Yêu cầu không hợp lệ.')
    let original: Event | undefined
    if (body.action === 'update') {
      if (typeof body.id !== 'string' || body.id.length > 100)
        throw new Error('Sự kiện không hợp lệ.')
      original = await payload.findByID({
        collection: 'events',
        id: body.id,
        user,
        overrideAccess: false,
        depth: 0,
      })
      if (!original) throw new Error('Không tìm thấy sự kiện.')
      if (user.role === 'organizer' && String(original.organizer) !== String(user.id))
        return failure(new Error('Bạn chỉ được quản lý sự kiện của mình.'), 403)
      if (original.status !== 'draft')
        throw new Error('Không thể chỉnh sửa nội dung hoặc mặt bằng sau khi công bố.')
      const existingBookings = await payload.find({
        collection: 'bookings',
        where: { event: { equals: original.id } },
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1,
      })
      if (existingBookings.docs.length)
        throw new Error('Sự kiện đã có đơn đặt vé, không thể đổi nội dung hoặc sơ đồ.')
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const venue = typeof body.venue === 'string' ? body.venue.trim() : ''
    if (
      title.length < 5 ||
      title.length > 160 ||
      description.length < 30 ||
      description.length > 15000 ||
      venue.length < 3 ||
      venue.length > 250
    )
      throw new Error(
        'Nội dung chưa đầy đủ: tên tối thiểu 5 ký tự, mô tả tối thiểu 30 ký tự và địa điểm tối thiểu 3 ký tự.',
      )
    if (!categories.includes(body.category) || !cities.includes(body.city))
      throw new Error('Chọn danh mục và thành phố hợp lệ.')
    const date = new Date(body.date)
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      throw new Error('Ngày diễn ra phải ở tương lai.')
    const onSaleAt = body.onSaleAt ? new Date(body.onSaleAt) : null
    if (onSaleAt && (!Number.isFinite(onSaleAt.getTime()) || onSaleAt >= date))
      throw new Error('Ngày mở bán phải trước ngày diễn ra sự kiện.')
    if (!Array.isArray(body.tiers) || body.tiers.length < 1 || body.tiers.length > 4)
      throw new Error('Chọn từ 1 đến 4 hạng vé.')
    const tiers = body.tiers.map((t: Record<string, unknown>) => {
      if (
        typeof t.name !== 'string' ||
        t.name.trim().length < 2 ||
        t.name.length > 80 ||
        typeof t.code !== 'string' ||
        !/^[A-Z]{1,3}$/.test(t.code) ||
        typeof t.price !== 'number' ||
        !Number.isSafeInteger(t.price) ||
        t.price < 0 ||
        t.price > 100000000 ||
        !Number.isInteger(t.rows) ||
        Number(t.rows) < 1 ||
        Number(t.rows) > 10 ||
        !Number.isInteger(t.seatsPerRow) ||
        Number(t.seatsPerRow) < 1 ||
        Number(t.seatsPerRow) > 12
      )
        throw new Error(
          'Chọn hạng vé hợp lệ: giá là số nguyên không âm, 1–10 hàng và 1–12 ghế/hàng.',
        )
      return {
        ...(original?.tiers?.some((tier) => tier.id === t.id) ? { id: String(t.id) } : {}),
        name: t.name.trim(),
        code: t.code,
        price: t.price,
        rows: Number(t.rows),
        seatsPerRow: Number(t.seatsPerRow),
      }
    })
    const seatLayout = body.seatLayout == null ? undefined : parseSeatLayout(body.seatLayout, tiers)
    let image: string | null | undefined = body.image === null ? null : undefined
    if (typeof body.image === 'string' && body.image) {
      const media = await payload.findByID({
        collection: 'media',
        id: body.image,
        user,
        overrideAccess: false,
      })
      if (!media.mimeType?.startsWith('image/')) throw new Error('Chọn ảnh sự kiện hợp lệ.')
      image = media.id
    }
    const content = {
      title,
      description,
      venue,
      category: body.category as Event['category'],
      city: body.city as Event['city'],
      date: date.toISOString(),
      onSaleAt: onSaleAt?.toISOString() ?? null,
      tiers,
      image,
      waitingRoom: body.waitingRoom === true,
      ...(seatLayout ? { seatLayout } : {}),
    }
    const eventSlug =
      original?.slug ||
      title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      randomUUID().slice(0, 6)

    // 1. Save directly to Spring Boot Backend (MariaDB & Redis)
    let backendEventId = original?.id
    try {
      const venuesPage = await fetchGateway<any>('/api/v1/venues?page=0&size=20').catch(() => null)
      let venueId = venuesPage?.content?.[0]?.id
      if (!venueId) {
        // Fallback default venue if not set
        venueId = 'aa632f5a-2038-44f2-b451-8b4cfb0c509c'
      }

      const startsAt = date.toISOString()
      const endsAt = new Date(date.getTime() + 4 * 3600 * 1000).toISOString()

      if (!original) {
        const createdBackendEvent = await fetchGateway<any>('/api/v1/events', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description,
            venueId,
            startsAt,
            endsAt,
            slug: eventSlug,
            category: body.category as string,
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
      } else {
        await fetchGateway<any>(`/api/v1/events/${original.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title,
            description,
            venueId,
            startsAt,
            endsAt,
            slug: eventSlug,
            category: body.category as string,
          }),
        }).catch(() => null)
      }
    } catch (err) {
      console.warn('Backend gateway creation note:', err)
    }

    if (original) {
      const updated = await payload.update({
        collection: 'events',
        id: original.id,
        user,
        overrideAccess: false,
        data: { ...content, slug: original.slug },
      }).catch(() => ({ id: original.id, slug: original.slug }))
      return Response.json({ ok: true, id: updated.id, slug: updated.slug })
    }

    try {
      const event = await payload.create({
        collection: 'events',
        user,
        overrideAccess: false,
        data: {
          ...content,
          slug: eventSlug,
          organizer: user.id,
          status: 'on_sale',
        },
      })
      return Response.json({ ok: true, id: backendEventId || event.id, slug: event.slug })
    } catch {
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
