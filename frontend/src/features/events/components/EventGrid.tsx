'use client'

import React from 'react'
import { Ticket, ChevronDown } from 'lucide-react'
import type { Event } from '@/types'
import { EventCard } from './EventCard'

interface EventGridProps {
  events: Event[]
  limit: number
  onLoadMore: () => void
  totalFiltered: number
}

export function EventGrid({ events, limit, onLoadMore, totalFiltered }: EventGridProps) {
  const visibleEvents = events.slice(0, limit)
  const hasMore = visibleEvents.length < totalFiltered

  if (visibleEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-stone-200 bg-white py-16 px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
          <Ticket size={28} strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-bold text-ink">Không tìm thấy sự kiện phù hợp</h3>
        <p className="mt-1 text-xs text-muted max-w-sm">
          Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác để xem thêm sự kiện.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-6 py-3 text-xs font-semibold text-ink shadow-sm transition hover:border-emerald-500 hover:bg-stone-50 active:scale-95"
          >
            Xem thêm sự kiện
            <ChevronDown size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
