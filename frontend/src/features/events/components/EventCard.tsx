'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, Heart, MapPin, Ticket } from 'lucide-react'
import type { Event } from '@/types'
import { money, eventDate } from '@/lib/format'
import { useAuth } from '@/features/auth/context/AuthContext'

export interface EventCardProps {
  event: Event
  showPrice?: boolean
  showBadge?: boolean
}

export function EventCard({ event, showPrice = true, showBadge = true }: EventCardProps) {
  const { user, toggleFavorite } = useAuth()
  const isFavorite = user?.favorites?.includes(event.id)
  const imageUrl = typeof event.image === 'string' ? event.image : event.image?.url
  const tiers = event.ticketTiers || event.tiers || []
  const lowestPrice = tiers.length
    ? Math.min(...tiers.map((t) => t.price))
    : undefined

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl">
      {/* Event Thumbnail */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-emerald-50 text-emerald-800">
            <Ticket size={36} strokeWidth={1.5} />
          </div>
        )}

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void toggleFavorite(event.id)
          }}
          aria-label={isFavorite ? 'Bỏ lưu sự kiện' : 'Lưu sự kiện yêu thích'}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600 backdrop-blur-sm transition hover:bg-white hover:text-red-500 active:scale-90"
        >
          <Heart size={16} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
        </button>

        {/* Category Badge */}
        {showBadge && event.category && (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            {event.category}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="space-y-2">
          {/* Date info */}
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <CalendarDays size={14} className="shrink-0" />
            <span>{eventDate(event.date)}</span>
          </p>

          {/* Title */}
          <h3 className="line-clamp-2 text-sm sm:text-base font-bold text-ink transition group-hover:text-emerald-700">
            <Link href={`/events/${event.slug || event.id}`}>{event.title}</Link>
          </h3>

          {/* Venue & Location */}
          <p className="flex items-center gap-1 text-[11px] text-muted line-clamp-1">
            <MapPin size={13} className="shrink-0" />
            <span>{event.venue}{event.city ? `, ${event.city}` : ''}</span>
          </p>
        </div>

        {/* Price & Action */}
        {showPrice && (
          <div className="mt-auto pt-4 border-t border-line flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted">Giá từ</p>
              <p className="text-xs sm:text-sm font-bold text-ink">
                {lowestPrice !== undefined ? money(lowestPrice) : 'Liên hệ'}
              </p>
            </div>

            <Link
              href={`/events/${event.slug || event.id}`}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              Đặt vé
            </Link>
          </div>
        )}
      </div>
    </article>
  )
}
