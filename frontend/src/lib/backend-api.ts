import 'server-only'
import { cookies } from 'next/headers'

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:8080'

export async function fetchGateway<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let sessionToken: string | undefined
  try {
    sessionToken = (await cookies()).get('app-session')?.value
  } catch {
    // cookies() might not be available in some build/static environments
  }

  const headers = new Headers(options.headers || {})

  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`)
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  const url = path.startsWith('http') ? path : `${GATEWAY_URL}${path}`

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let message = `Gateway error (${response.status})`
    try {
      const parsed = JSON.parse(errorBody)
      message = parsed.detail || parsed.message || parsed.error || message
    } catch {
      if (errorBody) message = errorBody
    }
    throw new Error(message)
  }

  if (response.status === 204) return null as T
  return response.json() as Promise<T>
}
