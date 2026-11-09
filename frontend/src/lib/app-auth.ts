import 'server-only'
import { cookies } from 'next/headers'
import { createPayloadRequest, JWTAuthentication, logoutOperation } from 'payload'
import { getPayloadClient } from '@/lib/payload'

function decodeJwt(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function extractRole(jwt: any): 'admin' | 'organizer' | 'customer' {
  const roles: string[] = jwt?.realm_access?.roles || []
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('organizer')) return 'organizer'
  return 'customer'
}

export function createAppAuth(appUserCollection: 'users') {
  const secure =
    process.env.NODE_ENV === 'production' ||
    process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://')
  const options = {
    httpOnly: true,
    secure: Boolean(secure),
    sameSite: secure ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
  return {
    async currentUser() {
      const token = (await cookies()).get('app-session')?.value
      if (!token) return null

      // 1. Check if token is a valid Keycloak JWT
      const jwt = decodeJwt(token)
      if (jwt && jwt.exp && jwt.exp * 1000 > Date.now() && (jwt.iss || jwt.realm_access)) {
        const role = extractRole(jwt)
        const email = jwt.email || `${jwt.preferred_username || 'user'}@example.com`
        const name = jwt.name || jwt.preferred_username || email
        return {
          id: jwt.sub || 'keycloak-user',
          name,
          email,
          role,
          favorites: [],
          collection: appUserCollection,
        } as any
      }

      // 2. Native Payload JWT fallback
      try {
        const payload = await getPayloadClient()
        const authHeaders = new Headers({ Authorization: `JWT ${token}` })
        const result = await payload.auth({ headers: authHeaders })
        const { user } = result.user
          ? result
          : await JWTAuthentication({
              headers: authHeaders,
              payload,
              strategyName: 'ticketnow-app-jwt',
            })
        if (!user || user.collection !== appUserCollection) return null
        const doc = await payload.findByID({
          collection: appUserCollection,
          id: user.id,
          user,
          overrideAccess: false,
          depth: 0,
        })
        return { ...doc, collection: 'users' as const }
      } catch {
        return null
      }
    },
    async login(email: string, password: string) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (!result.token || !result.user) throw new Error('Không thể đăng nhập.')
      ;(await cookies()).set('app-session', result.token, options)
      return result.user
    },
    async logout() {
      const token = (await cookies()).get('app-session')?.value
      if (token) {
        const payload = await getPayloadClient()
        const headers = new Headers({ Authorization: `JWT ${token}` })
        const { user } = await JWTAuthentication({ headers, payload })
        if (user?.collection === appUserCollection) {
          const req = await createPayloadRequest({ payload, user, req: { headers } })
          await logoutOperation({ collection: payload.collections[appUserCollection], req })
        }
      }
      ;(await cookies()).set('app-session', '', { ...options, maxAge: 0 })
    },
  }
}
export const appAuth = createAppAuth('users')
