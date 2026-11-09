import type { CollectionConfig } from 'payload'

import { createFolderField, createTagField } from 'payload'
import { mediaChanged, mediaDeleted } from '@/lib/invalidate'
import { admin, cms, organizer } from '@/lib/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req }) => cms(req.user) || admin(req.user) || organizer(req.user),
    update: ({ req }) => cms(req.user) || admin(req.user),
    delete: ({ req }) => cms(req.user),
  },
  hooks: { afterChange: [mediaChanged], afterDelete: [mediaDeleted] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      return headers
    },
  },
}
