'use client'

import React from 'react'
import Link from 'next/link'

interface NavItem {
  href: string
  label: string
  active: boolean
}

interface MobileNavProps {
  isOpen: boolean
  navigation: NavItem[]
  onClose: () => void
  onOpenHelp: () => void
}

export function MobileNav({ isOpen, navigation, onClose, onOpenHelp }: MobileNavProps) {
  if (!isOpen) return null

  return (
    <nav
      id="ticketnow-mobile-nav"
      aria-label="Điều hướng di động"
      className="flex flex-col gap-4 border-t border-line bg-white p-5 text-sm lg:hidden animate-in slide-in-from-top-2 duration-150"
    >
      {navigation.map((item) => (
        <Link
          key={item.href}
          onClick={onClose}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={`py-1 text-sm font-medium ${
            item.active ? 'font-semibold text-emerald-700' : 'text-ink hover:text-emerald-700'
          }`}
        >
          {item.label}
        </Link>
      ))}
      <button
        className="text-left py-1 text-sm text-muted hover:text-ink font-medium"
        onClick={() => {
          onClose()
          onOpenHelp()
        }}
      >
        Trung tâm hỗ trợ
      </button>
    </nav>
  )
}
