import type { AccessResult, CollectionConfig } from 'payload'
import { admin, cms, eventWrite, organizer } from '@/lib/access'
import { eventChanged, eventDeleted } from '@/lib/invalidate'
import { hasSeatLayout, parseSeatLayout, readSeatLayout } from '@/lib/seat-layout'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    group: 'Sự kiện',
    defaultColumns: ['title', 'category', 'date', 'status'],
  },
  access: {
    read: ({ req }): AccessResult =>
      cms(req.user) || admin(req.user)
        ? true
        : organizer(req.user)
          ? { or: [{ status: { not_equals: 'draft' } }, { organizer: { equals: req.user!.id } }] }
          : { status: { not_equals: 'draft' } },
    create: ({ req }) => cms(req.user) || admin(req.user) || organizer(req.user),
    update: eventWrite,
    delete: ({ req }) => cms(req.user),
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (organizer(req.user)) {
          data.organizer = operation === 'create' ? req.user!.id : originalDoc.organizer
          if (operation === 'update' && originalDoc.status !== 'draft') {
            // Ticket prices and seating geometry are immutable after publication.
            for (const key of ['tiers', 'date']) {
              if (
                data[key] !== undefined &&
                JSON.stringify(data[key]) !== JSON.stringify(originalDoc[key])
              )
                throw new Error('Không thể đổi ngày/hạng vé sau khi công bố.')
            }
          }
        }
        const tiers = data.tiers ?? originalDoc?.tiers ?? []
        if (new Set(tiers.map((t: { code: string }) => t.code)).size !== tiers.length)
          throw new Error('Mã khu ghế phải khác nhau.')
        for (const tier of tiers) {
          if (
            !Number.isInteger(tier.rows) ||
            !Number.isInteger(tier.seatsPerRow) ||
            !Number.isSafeInteger(tier.price)
          )
            throw new Error('Số hàng, số ghế và giá vé phải là số nguyên.')
        }
        const incomingLayout =
          data.seatLayout === undefined ? originalDoc?.seatLayout : data.seatLayout
        if (hasSeatLayout(incomingLayout)) {
          const layout = parseSeatLayout(incomingLayout, tiers)
          if (
            operation === 'update' &&
            originalDoc.status !== 'draft' &&
            JSON.stringify(layout) !==
              JSON.stringify(readSeatLayout(originalDoc.seatLayout, originalDoc.tiers))
          ) {
            throw new Error('Không thể thay đổi mặt bằng sau khi sự kiện đã công bố.')
          }
          if (
            operation === 'update' &&
            originalDoc.status !== 'draft' &&
            hasSeatLayout(originalDoc.seatLayout)
          ) {
            const grid = (items: typeof tiers) =>
              items
                .map((tier: { code: string; rows: number; seatsPerRow: number }) => ({
                  code: tier.code,
                  rows: tier.rows,
                  seatsPerRow: tier.seatsPerRow,
                }))
                .sort((a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code))
            if (JSON.stringify(grid(tiers)) !== JSON.stringify(grid(originalDoc.tiers)))
              throw new Error('Không thể đổi cấu trúc hàng/ghế của mặt bằng đã công bố.')
          }
        } else if (
          operation === 'update' &&
          originalDoc.status !== 'draft' &&
          hasSeatLayout(originalDoc.seatLayout) &&
          data.seatLayout !== undefined
        ) {
          throw new Error('Không thể xóa mặt bằng của sự kiện đã công bố.')
        }
        if (data.organizer) {
          const owner = await req.payload.findByID({
            collection: 'users',
            id: typeof data.organizer === 'object' ? data.organizer.id : data.organizer,
            user: req.user,
            overrideAccess: false,
            depth: 0,
            req,
          })
          if (!['organizer', 'admin'].includes(owner.role))
            throw new Error('Tài khoản tổ chức phải có quyền Organizer hoặc Admin.')
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const bookings = await req.payload.find({
          collection: 'bookings',
          where: { event: { equals: id } },
          user: req.user,
          overrideAccess: false,
          req,
          depth: 0,
          limit: 1,
        })
        if (bookings.docs.length)
          throw new Error('Sự kiện đã có đơn đặt vé, hãy đóng hoặc hủy thay vì xóa.')
      },
    ],
    afterChange: [eventChanged],
    afterDelete: [eventDeleted],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 160 },
    { name: 'slug', type: 'slug', useAsSlug: 'title' },
    { name: 'subtitle', type: 'text' },
    { name: 'description', type: 'textarea', required: true },
    { name: 'image', type: 'upload', relationTo: 'media' },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: ['Âm nhạc', 'Sân khấu & Nghệ thuật', 'Thể thao', 'Workshop', 'Hội thảo', 'Lễ hội'],
    },
    {
      name: 'city',
      type: 'select',
      required: true,
      options: ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt'],
    },
    { name: 'venue', type: 'text', required: true },
    { name: 'date', type: 'date', required: true },
    { name: 'onSaleAt', type: 'date' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      required: true,
      options: [
        { label: 'Bản nháp', value: 'draft' },
        { label: 'Sắp mở bán', value: 'published' },
        { label: 'Đang mở bán', value: 'on_sale' },
        { label: 'Đã đóng', value: 'closed' },
        { label: 'Đã hủy', value: 'cancelled' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'organizer',
      type: 'relationship',
      relationTo: 'users',
      filterOptions: { role: { in: ['organizer', 'admin'] } },
    },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'waitingRoom',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Bật phòng chờ trước khi khách chọn ghế.' },
    },
    {
      name: 'seatLayout',
      type: 'group',
      label: 'Mặt bằng sân khấu & khu vé',
      admin: {
        description:
          'Cấu hình tùy chọn. Sự kiện cũ chưa có mặt bằng tiếp tục dùng sơ đồ minh họa, không đổi mã ghế.',
      },
      fields: [
        {
          name: 'stage',
          type: 'group',
          label: 'Sân khấu',
          fields: [
            { name: 'label', type: 'text', maxLength: 60 },
            { name: 'x', type: 'number', min: 0, max: 100 },
            { name: 'y', type: 'number', min: 0, max: 100 },
            { name: 'width', type: 'number', min: 15, max: 100 },
            { name: 'height', type: 'number', min: 6, max: 100 },
          ],
        },
        {
          name: 'zones',
          type: 'array',
          label: 'Khu vé',
          maxRows: 4,
          fields: [
            { name: 'tierCode', type: 'text' },
            { name: 'color', type: 'select', options: ['amber', 'teal', 'violet', 'blue'] },
            { name: 'aisle', type: 'checkbox' },
            { name: 'x', type: 'number', min: 0, max: 100 },
            { name: 'y', type: 'number', min: 0, max: 100 },
            { name: 'width', type: 'number', min: 20, max: 100 },
            { name: 'height', type: 'number', min: 20, max: 100 },
          ],
        },
      ],
    },
    {
      name: 'tiers',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 4,
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'code',
          type: 'text',
          required: true,
          validate: (value: string | null | undefined) =>
            /^[A-Z]{1,3}$/.test(value ?? '') || 'Dùng 1–3 chữ cái in hoa.',
        },
        { name: 'price', type: 'number', required: true, min: 0, max: 100000000 },
        { name: 'rows', type: 'number', required: true, min: 1, max: 10 },
        { name: 'seatsPerRow', type: 'number', required: true, min: 1, max: 12 },
      ],
    },
  ],
}
