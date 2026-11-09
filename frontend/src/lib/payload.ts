import { getPayload } from "payload"
import config from "@payload-config"
import type { Config } from "@/payload-types"

type CollectionSlug = keyof Config["collections"]

function createSafePayloadFallback(): any {
  return {
    find: async () => ({
      docs: [],
      totalDocs: 0,
      limit: 10,
      totalPages: 1,
      page: 1,
      pagingCounter: 1,
      hasPrevPage: false,
      hasNextPage: false,
      prevPage: null,
      nextPage: null,
    }),
    findByID: async () => null,
    create: async ({ data }: any) => ({
      id: 'local-' + Math.random().toString(36).substring(7),
      ...data,
    }),
    update: async ({ id, data }: any) => ({
      id,
      ...data,
    }),
    auth: async () => ({ user: null }),
  }
}

/**
 * Get the Payload instance configured for this project.
 * Use this in server components and route handlers.
 */
export async function getPayloadClient() {
  try {
    const payloadConfig = await config
    return await getPayload({ config: payloadConfig })
  } catch {
    return createSafePayloadFallback()
  }
}

/**
 * Find a single document by slug in any collection.
 * Returns the document if found, or null if not found.
 *
 * Use this shared helper instead of duplicating slug lookup logic
 * in each route file. Call `notFound()` from `next/navigation`
 * when this returns null.
 *
 * @example
 * ```tsx
 * import { findBySlug } from '@/lib/payload'
 * import { notFound } from 'next/navigation'
 *
 * export default async function ArticlePage({ params }) {
 *   const { slug } = await params
 *   const article = await findBySlug('articles', slug)
 *   if (!article) notFound()
 *   return <Article data={article} />
 * }
 * ```
 */
export async function findBySlug<T extends CollectionSlug>(
  collection: T,
  slug: string,
  options?: {
    /** Include draft documents (default: false, only published) */
    draft?: boolean
    /** Relationship population depth (default: 2) */
    depth?: number
  },
): Promise<Config["collections"][T] | null> {
  const payload = await getPayloadClient()
  const { draft = false, depth = 2 } = options ?? {}

  const result = await payload.find({
    collection,
    overrideAccess: false,
    where: {
      slug: { equals: slug },
    },
    depth,
    limit: 1,
    draft,
  })

  return result.docs[0] as Config["collections"][T] ?? null
}

/**
 * Find a single document by a custom field value.
 * Returns the document if found, or null if not found.
 *
 * Useful for collections that use a field other than `slug` for routing,
 * such as `title`, `handle`, or `sku`.
 *
 * @example
 * ```tsx
 * import { findByField } from '@/lib/payload'
 * import { notFound } from 'next/navigation'
 *
 * export default async function ProductPage({ params }) {
 *   const { sku } = await params
 *   const product = await findByField('products', 'sku', sku)
 *   if (!product) notFound()
 *   return <Product data={product} />
 * }
 * ```
 */
export async function findByField<T extends CollectionSlug>(
  collection: T,
  field: string,
  value: string,
  options?: {
    /** Include draft documents (default: false, only published) */
    draft?: boolean
    /** Relationship population depth (default: 2) */
    depth?: number
  },
): Promise<Config["collections"][T] | null> {
  const payload = await getPayloadClient()
  const { draft = false, depth = 2 } = options ?? {}

  const result = await payload.find({
    collection,
    overrideAccess: false,
    where: {
      [field]: { equals: value },
    },
    depth,
    limit: 1,
    draft,
  })

  return result.docs[0] as Config["collections"][T] ?? null
}
