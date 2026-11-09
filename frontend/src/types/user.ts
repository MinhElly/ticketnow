export type AppRole = 'customer' | 'organizer' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: AppRole
  favorites?: string[]
}

export interface WorkspaceConfig {
  label: string
  href: string
  roleLabel: string
  menuLabel: string
  description: string
}
