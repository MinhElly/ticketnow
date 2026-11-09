import type { CollectionConfig } from 'payload'
import { app, workflow } from '@/lib/access'

export const BookingLocks: CollectionConfig = {
  slug: 'booking-locks',
  admin: { hidden: true },
  access: {
    read: ({ req }) => (app(req.user) ? { owner: { equals: req.user!.id } } : false),
    create: ({ req }) => app(req.user) && Boolean(req.context.ticketWorkflow),
    update: () => false,
    delete: ({ req }) =>
      app(req.user) && req.context.ticketWorkflow ? { owner: { equals: req.user!.id } } : false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        const booking = await req.payload.findByID({
          collection: 'bookings',
          id: data.key,
          depth: 0,
          user: req.user,
          overrideAccess: false,
          req,
        })
        if (String(booking.owner) !== String(req.user!.id))
          throw new Error('Đơn không thuộc tài khoản của bạn.')
        data.owner = req.user!.id
        data.expiresAt = new Date(Date.now() + 120000).toISOString()
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
      name: 'expiresAt',
      type: 'date',
      required: true,
      access: { create: workflow, update: () => false },
    },
  ],
}
