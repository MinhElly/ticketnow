import type { CollectionConfig } from 'payload'
import { admin, app, cms, roleField } from '@/lib/access'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: { tokenExpiration: 60 * 60 * 24 * 7 },
  admin: { useAsTitle: 'name', group: 'Tài khoản', defaultColumns: ['name', 'email', 'role'] },
  access: {
    admin: () => false,
    create: () => true,
    read: ({ req }) =>
      cms(req.user) || admin(req.user)
        ? true
        : app(req.user)
          ? { id: { equals: req.user!.id } }
          : false,
    update: ({ req }) =>
      cms(req.user) || admin(req.user)
        ? true
        : app(req.user)
          ? { id: { equals: req.user!.id } }
          : false,
    delete: ({ req }) => cms(req.user),
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 100 },
    { name: 'favorites', type: 'relationship', relationTo: 'events', hasMany: true, maxDepth: 0 },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'customer',
      saveToJWT: true,
      options: [
        { label: 'Customer', value: 'customer' },
        { label: 'Organizer', value: 'organizer' },
        { label: 'Admin', value: 'admin' },
      ],
      access: { create: roleField, update: roleField },
    },
  ],
}
