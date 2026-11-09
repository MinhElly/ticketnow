'use client'

/**
 * AppProvider / AuthContext re-exported from modular features/auth directory.
 * Preserves backwards compatibility for existing imports and test specs.
 */
export {
  AuthProvider,
  AuthProvider as AppProvider,
  useAuth,
  useApp,
} from '@/features/auth/context/AuthContext'
