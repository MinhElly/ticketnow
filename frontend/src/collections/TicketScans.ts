import type { CollectionConfig } from 'payload'
import { admin, app, cms, organizer, workflow } from '@/lib/access'

export const TicketScans: CollectionConfig = {
  slug: 'ticket-scans',
  admin: { useAsTitle: 'seat', group: 'Vé & Giao dịch' },
  access: {
    read: ({ req }) =>
      cms(req.user) || admin(req.user)
        ? true
        : app(req.user)
          ? { owner: { equals: req.user!.id } }
          : false,
    create: ({ req }) =>
      (admin(req.user) || organizer(req.user)) && Boolean(req.context.ticketWorkflow),
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        const booking = await req.payload.findByID({
          collection: 'bookings',
          id: data.booking,
          depth: 0,
          user: req.user,
          overrideAccess: false,
          req,
        })
        if (
          booking.status !== 'confirmed' ||
          data.token !== `TN:${booking.ticketToken}:${data.seat}` ||
          !booking.seats.some((s) => s.code === data.seat)
        )
          throw new Error('Vé không hợp lệ hoặc đã bị hoàn.')
        data.owner = booking.owner
        data.event = booking.event
        data.scannedBy = req.user!.id
        data.usedAt = new Date().toISOString()
        return data
      },
    ],
  },
  fields: [
    {
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'booking',
      type: 'relationship',
      relationTo: 'bookings',
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
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'seat',
      type: 'text',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'scannedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: { create: workflow, update: () => false },
    },
    {
      name: 'usedAt',
      type: 'date',
      required: true,
      access: { create: workflow, update: () => false },
    },
  ],
}
