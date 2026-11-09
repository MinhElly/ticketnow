import type { AccessResult, CollectionConfig } from 'payload'
import { app, cms, workflow } from '@/lib/access'

export const SeatClaims: CollectionConfig = {
  slug: 'seat-claims',
  admin: { useAsTitle: 'key', group: 'Vé & Giao dịch', hidden: true },
  access: {
    read: () => true,
    create: ({ req }) => app(req.user) && Boolean(req.context.ticketWorkflow),
    update: ({ req }) =>
      app(req.user) && Boolean(req.context.ticketWorkflow)
        ? { owner: { equals: req.user!.id } }
        : false,
    delete: ({ req }): AccessResult => {
      if (req.context.expireClaims)
        return {
          and: [
            { status: { equals: 'held' } },
            { expiresAt: { less_than: new Date().toISOString() } },
          ],
        }
      return app(req.user) && req.context.ticketWorkflow
        ? { owner: { equals: req.user!.id } }
        : false
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (!req.context.ticketWorkflow) throw new Error('Chỉ được giữ ghế trong luồng đặt vé.')
        if (operation === 'create') {
          const booking = await req.payload.findByID({
            collection: 'bookings',
            id: data.booking,
            depth: 0,
            user: req.user,
            overrideAccess: false,
            req,
          })
          if (
            booking.status !== 'held' ||
            new Date(booking.expiresAt).getTime() <= Date.now() ||
            !booking.seats.some((s) => `${booking.event}:${s.code}` === data.key)
          )
            throw new Error('Giữ ghế không hợp lệ.')
          data.owner = req.user!.id
          data.event = booking.event
          data.expiresAt = booking.expiresAt
          data.status = 'held'
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      index: true,
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
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: {
        read: ({ req }) => cms(req.user) || Boolean(req.context.ticketWorkflow),
        create: workflow,
        update: () => false,
      },
    },
    {
      name: 'booking',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      access: {
        read: ({ req }) => cms(req.user) || Boolean(req.context.ticketWorkflow),
        create: workflow,
        update: () => false,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'held',
      options: ['held', 'sold'],
      access: { create: workflow, update: workflow },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      access: { create: workflow, update: () => false },
    },
  ],
}
