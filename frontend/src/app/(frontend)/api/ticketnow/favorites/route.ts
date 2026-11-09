import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { failure, verifyOrigin } from '@/lib/http'

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const user = await appAuth.currentUser()
    if (!user) return failure(new Error('Vui lòng đăng nhập để lưu sự kiện.'), 401)
    const { event } = await request.json()
    if (typeof event !== 'string' || event.length > 100) throw new Error('Sự kiện không hợp lệ.')
    const payload = await getPayloadClient()
    await payload.findByID({
      collection: 'events',
      id: event,
      user,
      overrideAccess: false,
      depth: 0,
    })
    const currentFavorites: any[] = (user as any).favorites ?? []
    const favorites: string[] = currentFavorites.map((e: any) => (typeof e === 'object' ? e.id : e))
    const next = favorites.includes(event)
      ? favorites.filter((e: string) => e !== event)
      : [...favorites, event]
    if (next.length > 200) throw new Error('Bạn có thể lưu tối đa 200 sự kiện.')
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { favorites: next },
      user,
      overrideAccess: false,
    })
    return Response.json({ ok: true, favorites: next })
  } catch (error) {
    return failure(error)
  }
}
