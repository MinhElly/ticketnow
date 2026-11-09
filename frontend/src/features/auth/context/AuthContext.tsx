'use client'

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@/types'
import { ROLE_WORKSPACES } from '@/lib/roles'
import { AuthModal } from '../components/AuthModal'
import { HelpDrawer } from '@/features/help/components/HelpDrawer'

interface AuthContextType {
  user: User | null
  loading: boolean
  openAuth: () => void
  closeAuth: () => void
  logout: () => Promise<void>
  openHelp: () => void
  closeHelp: () => void
  toggleFavorite: (event: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  openAuth: () => {},
  closeAuth: () => {},
  logout: async () => {},
  openHelp: () => {},
  closeHelp: () => {},
  toggleFavorite: async () => {},
})

export const useAuth = () => useContext(AuthContext)
// Backwards compatibility alias for components importing useApp
export const useApp = useAuth

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/ticketnow/session')
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function handleAuthSubmit(data: Record<string, any>, mode: 'login' | 'signup') {
    const response = await fetch('/api/ticketnow/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, mode }),
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || 'Xác thực không thành công.')
    }
    const authenticatedUser: User = result.user
    setUser(authenticatedUser)
    setAuthModalOpen(false)
    router.replace(ROLE_WORKSPACES[authenticatedUser.role].href)
    router.refresh()
  }

  async function logout() {
    const response = await fetch('/api/ticketnow/session', { method: 'DELETE' })
    if (response.ok) {
      setUser(null)
      router.refresh()
      router.push('/')
    }
  }

  async function toggleFavorite(event: string) {
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    const response = await fetch('/api/ticketnow/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    setUser((current) => (current ? { ...current, favorites: result.favorites } : null))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        openAuth: () => setAuthModalOpen(true),
        closeAuth: () => setAuthModalOpen(false),
        logout,
        openHelp: () => setHelpDrawerOpen(true),
        closeHelp: () => setHelpDrawerOpen(false),
        toggleFavorite,
      }}
    >
      {children}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSubmit={handleAuthSubmit}
      />

      <HelpDrawer
        isOpen={helpDrawerOpen}
        onClose={() => setHelpDrawerOpen(false)}
        onOpen={() => setHelpDrawerOpen(true)}
      />
    </AuthContext.Provider>
  )
}
