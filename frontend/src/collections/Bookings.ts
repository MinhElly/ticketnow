import type { AccessResult, CollectionConfig } from 'payload'
import { admin, app, cms, organizer, workflow } from '@/lib/access'

export const Bookings: CollectionConfig = {
  slug: 'bookings',
  admin: {
    useAsTitle: 'reference',
    group: 'Vé & Giao dịch',
    defaultColumns: ['reference', 'event', 'status', 'total'],
  },
  access: {
    read: ({ req }): AccessResult => {
      if (cms(req.user) || admin(req.user)) return true
      if (organizer(req.user)) return { 'event.organizer': { equals: req.user!.id } }
      return app(req.user) ? { owner: { equals: req.user!.id } } : false
    },
    create: ({ req }) =>
      app(req.user) && req.user!.role === 'customer' && Boolean(req.context.ticketWorkflow),
    update: ({ req }) =>
      app(req.user) && Boolean(req.context.ticketWorkflow)
        ? { owner: { equals: req.user!.id } }
        : false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req, originalDoc }) => {
        if (!req.context.ticketWorkflow && !cms(req.user))
          throw new Error('Chỉ thay đổi đơn qua luồng đặt vé.')
        if (operation === 'create') {
          data.owner = req.user!.id
          const event = await req.payload.findByID({
            collection: 'events',
            id: data.event,
            depth: 0,
            overrideAccess: false,
            user: req.user,
            req,
          })
          if (
            event.status !== 'on_sale' ||
            new Date(event.date).getTime() <= Date.now() ||
            (event.onSaleAt && new Date(event.onSaleAt).getTime() > Date.now())
          )
            throw new Error('Sự kiện chưa mở bán hoặc đã kết thúc.')
          if (
            !Array.isArray(data.seats) ||
            data.seats.length < 1 ||
            data.seats.length > 6 ||
            new Set(data.seats.map((s: { code: string }) => s.code)).size !== data.seats.length
          )
            throw new Error('Chọn từ 1 đến 6 ghế khác nhau.')
          data.total = 0
          for (const seat of data.seats) {
            const [section, rowText, numberText] = String(seat.code).split('-')
            const tier = event.tiers?.find((t) => t.code === section)
            const row = Number(rowText),
              number = Number(numberText)
            if (
              !tier ||
              !Number.isInteger(row) ||
              !Number.isInteger(number) ||
              row < 1 ||
              row > tier.rows ||
              number < 1 ||
              number > tier.seatsPerRow ||
              seat.code !== `${section}-${row}-${number}`
            )
              throw new Error('Ghế không hợp lệ.')
            seat.price = tier.price
            data.total += tier.price
          }
          data.status = 'held'
          data.expiresAt = new Date(Date.now() + 600000).toISOString()
          data.activeKey = String(req.user!.id)
        } else if (originalDoc) {
          const transitions: Record<string, string[]> = {
            held: ['confirmed', 'cancelled', 'expired', 'failed'],
            confirmed: ['refunded'],
          }
          if (
            data.status &&
            data.status !== originalDoc.status &&
            !transitions[originalDoc.status]?.includes(data.status)
          )
            throw new Error('Trạng thái đơn không hợp lệ.')
          for (const key of [
            'owner',
            'event',
            'total',
            'seats',
            'expiresAt',
            'reference',
            'idempotencyKey',
          ]) {
            if (
              data[key] !== undefined &&
              JSON.stringify(data[key]) !== JSON.stringify(originalDoc[key])
            )
              throw new Error('Không thể sửa thông tin đơn.')
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'reference',
      type: 'text',
      required: true,
      unique: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      unique: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'activeKey',
      type: 'text',
      unique: true,
      access: { create: workflow, update: workflow },
    },
    {
      name: 'status',
      type: 'select',
      options: ['held', 'confirmed', 'cancelled', 'expired', 'failed', 'refunded'],
      defaultValue: 'held',
      required: true,
      access: { create: workflow, update: workflow },
    },
    {
      name: 'total',
      type: 'number',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'seats',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 6,
      access: { create: workflow, update: () => false },
      fields: [
        { name: 'code', type: 'text', required: true },
        { name: 'price', type: 'number', required: true },
      ],
    },
    { name: 'ticketToken', type: 'text', access: { create: workflow, update: workflow } },
    { name: 'refundAmount', type: 'number', access: { create: workflow, update: workflow } },
    { name: 'paymentMethod', type: 'text', access: { create: workflow, update: workflow } },
  ],
}
