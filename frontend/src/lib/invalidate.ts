import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

function invalidate(slugs: (string | undefined)[]) {
  // CLI content writes run outside Next; there is no Next cache in that process.
  try {
    revalidateTag('events', { expire: 0 })
    for (const slug of new Set(slugs.filter(Boolean))) revalidateTag(`event:${slug}`, { expire: 0 })
  } catch (error) {
    if (!(error instanceof Error && /static generation store|incrementalCache/.test(error.message)))
      throw error
  }
}
export const eventChanged: CollectionAfterChangeHook = ({ doc, previousDoc }) => {
  invalidate([doc.slug, previousDoc?.slug])
  return doc
}
export const eventDeleted: CollectionAfterDeleteHook = ({ doc }) => {
  invalidate([doc.slug])
  return doc
}
export const mediaChanged: CollectionAfterChangeHook = ({ doc }) => {
  invalidate([])
  return doc
}
export const mediaDeleted: CollectionAfterDeleteHook = ({ doc }) => {
  invalidate([])
  return doc
}
