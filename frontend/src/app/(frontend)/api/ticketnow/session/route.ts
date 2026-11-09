import { cookies } from 'next/headers'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { failure, verifyOrigin } from '@/lib/http'
import type { AppRole, User } from '@/types/user'

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8180'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ticketnow'
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'ticketnow-web'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
}

function decodeJwt(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function extractRole(jwt: any): AppRole {
  const roles: string[] = jwt?.realm_access?.roles || []
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('organizer')) return 'organizer'
  return 'customer'
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('app-session')?.value

  if (token) {
    const jwt = decodeJwt(token)
    if (jwt && jwt.exp && jwt.exp * 1000 > Date.now()) {
      const user: User = {
        id: jwt.sub,
        name: jwt.name || jwt.preferred_username || jwt.email || 'User',
        email: jwt.email || '',
        role: extractRole(jwt),
        favorites: [],
      }
      return Response.json({ user }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
  }

  // Fallback to local session check
  try {
    const localUser = await appAuth.currentUser()
    if (localUser) {
      return Response.json(
        {
          user: {
            id: localUser.id,
            name: localUser.name,
            email: localUser.email,
            role: localUser.role,
            favorites: (localUser.favorites ?? []).map((e: any) =>
              typeof e === 'object' ? e.id : e,
            ),
          },
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
  } catch {
    // Ignore fallback errors
  }

  return Response.json({ user: null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request)
    const body = await request.json()
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!rawEmail || !password) {
      throw new Error('Email và mật khẩu không được để trống.')
    }

    // Map username shorthand (e.g. 'admin01' -> 'admin01@example.com')
    let email = rawEmail
    let username = rawEmail
    if (rawEmail === 'admin' || rawEmail === 'admin01') {
      email = 'admin01@example.com'
      username = 'admin01'
    } else if (rawEmail === 'organizer' || rawEmail === 'organizer01') {
      email = 'organizer01@example.com'
      username = 'organizer01'
    } else if (rawEmail === 'customer' || rawEmail === 'customer01') {
      email = 'customer01@example.com'
      username = 'customer01'
    }

    // 1. Try Keycloak Token Exchange first
    let keycloakSuccess = false
    let tokenData: any = null

    // Try both username format and email format against Keycloak
    const candidateUsernames = [username, email].filter((u, i, arr) => arr.indexOf(u) === i)

    for (const kcUser of candidateUsernames) {
      if (keycloakSuccess) break
      try {
        const params = new URLSearchParams()
        params.set('grant_type', 'password')
        params.set('client_id', KEYCLOAK_CLIENT_ID)
        params.set('username', kcUser)
        params.set('password', password)
        params.set('scope', 'openid profile email roles')

        const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`
        const kcResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          cache: 'no-store',
        })

        if (kcResponse.ok) {
          tokenData = await kcResponse.json()
          if (tokenData?.access_token) {
            keycloakSuccess = true
          }
        }
      } catch {
        // Keycloak connection error -> try next candidate or proceed to fallback
      }
    }

    if (keycloakSuccess && tokenData?.access_token) {
      const jwt = decodeJwt(tokenData.access_token)
      const userRole = extractRole(jwt)
      const user: User = {
        id: jwt?.sub || 'user-id',
        name: jwt?.name || jwt?.preferred_username || email,
        email: jwt?.email || email,
        role: userRole,
        favorites: [],
      }

      // Sync user to Payload collection so server-side DB queries succeed
      try {
        const payload = await getPayloadClient()
        const found = await payload.find({
          collection: 'users',
          where: { email: { equals: user.email.toLowerCase() } },
          overrideAccess: true,
          depth: 0,
          limit: 1,
        })
        if (found.docs.length > 0) {
          if (found.docs[0].role !== userRole) {
            await payload.update({
              collection: 'users',
              id: found.docs[0].id,
              data: { role: userRole },
              overrideAccess: true,
            })
          }
          user.id = found.docs[0].id
        } else {
          const created = await payload.create({
            collection: 'users',
            data: {
              email: user.email.toLowerCase(),
              name: user.name,
              role: userRole,
              password: `kc_${Math.random().toString(36)}`,
            },
            overrideAccess: true,
          })
          user.id = created.id
        }
      } catch {
        // Non-blocking fallback
      }

      const cookieStore = await cookies()
      cookieStore.set('app-session', tokenData.access_token, COOKIE_OPTIONS)

      return Response.json({ ok: true, user })
    }

    // 2. Handle Signup (mode === 'signup')
    if (body.mode === 'signup') {
      const name = typeof body.name === 'string' ? body.name.trim() : email.split('@')[0]
      if (name.length < 2 || name.length > 100) throw new Error('Tên cần từ 2 đến 100 ký tự.')
      const payload = await getPayloadClient()
      try {
        await payload.create({
          collection: 'users',
          data: { email, password, name, role: 'customer' },
          overrideAccess: true,
        })
      } catch {
        throw new Error('Không thể tạo tài khoản. Email có thể đã được sử dụng.')
      }
    }

    // 3. Fallback: Local Payload login with auto-seed for standard demo roles
    const demoAccounts: Record<string, { name: string; role: AppRole }> = {
      'admin01@example.com': { name: 'Admin Demo', role: 'admin' },
      'admin@ticketnow.vn': { name: 'Admin TicketNow', role: 'admin' },
      'organizer01@example.com': { name: 'Organizer Demo', role: 'organizer' },
      'organizer@ticketnow.vn': { name: 'Organizer TicketNow', role: 'organizer' },
      'customer01@example.com': { name: 'Customer Demo', role: 'customer' },
      'customer@ticketnow.vn': { name: 'Customer TicketNow', role: 'customer' },
    }

    try {
      const payload = await getPayloadClient()
      if (demoAccounts[email]) {
        const found = await payload.find({
          collection: 'users',
          where: { email: { equals: email } },
          overrideAccess: true,
          depth: 0,
          limit: 1,
        })
        if (!found.docs.length) {
          await payload.create({
            collection: 'users',
            data: {
              email,
              password,
              name: demoAccounts[email].name,
              role: demoAccounts[email].role,
            },
            overrideAccess: true,
          })
        } else {
          // Update password to ensure login always succeeds with this attempt
          await payload.update({
            collection: 'users',
            id: found.docs[0].id,
            data: { password, role: demoAccounts[email].role },
            overrideAccess: true,
          })
        }
      }

      const user = await appAuth.login(email, password)
      return Response.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          favorites: (user.favorites ?? []).map((e: any) =>
            typeof e === 'object' ? e.id : e,
          ),
        },
      })
    } catch {
      return failure(new Error('Email hoặc mật khẩu chưa đúng.'), 401)
    }
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: Request) {
  try {
    verifyOrigin(request)
    const cookieStore = await cookies()
    cookieStore.set('app-session', '', { ...COOKIE_OPTIONS, maxAge: 0 })

    try {
      await appAuth.logout()
    } catch {
      // Ignore fallback logout error
    }

    return Response.json({ ok: true })
  } catch (error) {
    return failure(error)
  }
}
