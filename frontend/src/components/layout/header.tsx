'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowUpRight,
  LoaderCircle,
  Menu,
  Ticket,
  UserRound,
  X,
  LayoutDashboard,
  Shield,
} from 'lucide-react'
import { ROLE_WORKSPACES } from '@/lib/roles'
import { useApp } from '@/components/AppProvider'
import { Brand } from './brand'
import { UserMenu } from './user-menu'
import { MobileNav } from './mobile-nav'

const workspaceIcons = { customer: Ticket, organizer: LayoutDashboard, admin: Shield }

export function Header() {
  const { user, loading, openAuth, logout, openHelp } = useApp()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const pathname = usePathname()

  const workspace = user ? ROLE_WORKSPACES[user.role] : null
  const WorkspaceIcon = user ? workspaceIcons[user.role] : Ticket

  const publicLink = {
    href: '/#explore',
    label: 'Khám phá sự kiện',
    icon: null,
    active: pathname === '/' || pathname.startsWith('/events'),
  }

  const privateLinks = workspace
    ? [
        {
          href: workspace.href,
          label: workspace.label,
          icon: WorkspaceIcon,
          active:
            pathname.startsWith(workspace.href) ||
            (user?.role === 'customer' && pathname.startsWith('/checkout/')),
        },
      ]
    : []

  const navigation =
    user && user.role !== 'customer' ? [...privateLinks, publicLink] : [publicLink, ...privateLinks]

  function closeAllMenus() {
    setMobileMenuOpen(false)
    setAccountMenuOpen(false)
  }

  return (
    <header className="relative z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-[82px] max-w-[1344px] items-center justify-between gap-5 px-5 lg:px-10">
        <Brand />

        {/* Desktop Navigation */}
        <nav
          aria-label="Điều hướng chính"
          className="ml-9 mr-auto hidden h-full items-center gap-8 text-[13px] font-medium lg:flex"
        >
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeAllMenus}
                aria-current={item.active ? 'page' : undefined}
                className={`flex h-full items-center gap-2 border-b-[3px] pt-[3px] transition ${
                  item.active
                    ? 'border-emerald-600 font-semibold text-emerald-700'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {Icon && <Icon size={16} />}
                {item.label}
              </Link>
            )
          })}
          <button
            onClick={openHelp}
            className="flex items-center gap-1.5 text-muted hover:text-ink transition"
          >
            Hỗ trợ
            <ArrowUpRight size={13} />
          </button>
        </nav>

        {/* User / Auth Actions */}
        <div className="flex items-center gap-4">
          {user && workspace ? (
            <UserMenu
              user={user}
              workspace={workspace}
              isOpen={accountMenuOpen}
              onToggle={() => {
                setAccountMenuOpen(!accountMenuOpen)
                setMobileMenuOpen(false)
              }}
              onClose={() => setAccountMenuOpen(false)}
              onLogout={() => void logout()}
            />
          ) : loading ? (
            <span
              role="status"
              aria-label="Đang kiểm tra phiên đăng nhập"
              className="flex h-10 w-10 items-center justify-center text-muted"
            >
              <LoaderCircle size={18} className="animate-spin text-emerald-700" />
            </span>
          ) : (
            <button
              onClick={() => {
                closeAllMenus()
                openAuth()
              }}
              aria-label="Đăng nhập"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-ink px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap text-white transition hover:bg-emerald-900 active:scale-95 sm:px-4"
            >
              <UserRound size={15} />
              <span className="hidden sm:inline">Đăng nhập</span>
            </button>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => {
              setMobileMenuOpen(!mobileMenuOpen)
              setAccountMenuOpen(false)
            }}
            className="lg:hidden p-1.5 text-ink"
            aria-label="Mở điều hướng"
            aria-expanded={mobileMenuOpen}
            aria-controls="ticketnow-mobile-nav"
          >
            {mobileMenuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </div>

      <MobileNav
        isOpen={mobileMenuOpen}
        navigation={navigation}
        onClose={() => setMobileMenuOpen(false)}
        onOpenHelp={openHelp}
      />
    </header>
  )
}
