'use client'

import React, { useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown, LogOut, Ticket, LayoutDashboard, Shield } from 'lucide-react'
import type { User, WorkspaceConfig } from '@/types'

const workspaceIcons = {
  customer: Ticket,
  organizer: LayoutDashboard,
  admin: Shield,
}

interface UserMenuProps {
  user: User
  workspace: WorkspaceConfig
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onLogout: () => void
}

export function UserMenu({
  user,
  workspace,
  isOpen,
  onToggle,
  onClose,
  onLogout,
}: UserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const WorkspaceIcon = workspaceIcons[user.role] || Ticket

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={onToggle}
        aria-label="Mở menu tài khoản"
        aria-expanded={isOpen}
        aria-controls="ticketnow-account-menu"
        className="flex items-center gap-2 rounded-full border border-line p-1.5 pr-3 text-xs font-semibold hover:border-emerald-500 transition"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{user.name.split(' ').slice(-2).join(' ')}</span>
        <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <nav
          id="ticketnow-account-menu"
          aria-label="Menu tài khoản"
          className="absolute right-0 top-13 w-64 rounded-2xl border border-line bg-white p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="border-b border-line px-3 py-3">
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="mt-0.5 text-xs text-muted">{workspace.roleLabel}</p>
          </div>
          <Link
            href={workspace.href}
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-ink hover:bg-stone-50 transition"
          >
            <WorkspaceIcon size={16} className="text-emerald-700" />
            {workspace.menuLabel}
          </Link>
          <button
            onClick={() => {
              onClose()
              onLogout()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </nav>
      )}
    </div>
  )
}
