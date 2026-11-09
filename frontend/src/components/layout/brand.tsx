'use client'

import Link from 'next/link'
import { Ticket } from 'lucide-react'

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex shrink-0 items-center gap-2.5 ${light ? 'text-white' : 'text-ink'}`}
      aria-label="TicketNow - Trang chủ"
    >
      <span className="flex h-9 w-10 -rotate-12 items-center justify-center rounded-[10px] bg-mint text-[#12342a]">
        <Ticket size={24} strokeWidth={2.2} />
      </span>
      <span className="text-[24px] font-extrabold tracking-[-1.2px]">
        ticket<span className={light ? 'text-mint' : 'text-emerald-700'}>now</span>
        <span className="ml-0.5 align-top text-[12px] text-emerald-600 font-bold">®</span>
      </span>
    </Link>
  )
}
