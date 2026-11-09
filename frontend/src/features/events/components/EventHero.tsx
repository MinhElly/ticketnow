'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Sparkles } from 'lucide-react'
import type { Event } from '@/types'
import { eventDate } from '@/lib/format'

interface EventHeroProps {
  slides: Event[]
}

export function EventHero({ slides }: EventHeroProps) {
  const [slide, setSlide] = useState(0)
  if (!slides || slides.length === 0) return null

  const activeIndex = slide % slides.length
  const currentEvent = slides[activeIndex]
  const heroImageUrl = typeof currentEvent?.image === 'string' ? currentEvent.image : currentEvent?.image?.url

  function nextSlide() {
    setSlide((prev) => (prev + 1) % slides.length)
  }

  function prevSlide() {
    setSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }

  return (
    <section
      role="region"
      aria-label="Sự kiện nổi bật"
      className="relative mb-8 overflow-hidden rounded-3xl bg-zinc-900 text-white shadow-2xl"
    >
      <div className="relative aspect-[21/9] min-h-[360px] w-full sm:min-h-[420px]">
        {heroImageUrl && (
          <Image
            src={heroImageUrl}
            alt={currentEvent.title}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />

        {/* Slide Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 lg:p-12">
          <div className="max-w-2xl">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-mint backdrop-blur-md border border-emerald-500/30">
              <Sparkles size={13} />
              Sự kiện nổi bật {String(activeIndex + 1).padStart(2, '0')}
            </span>

            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              {currentEvent.title}
            </h2>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-zinc-300">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={15} className="text-mint" />
                {eventDate(currentEvent.date)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-mint" />
                {currentEvent.venue} · {currentEvent.city}
              </span>
            </div>

            {currentEvent.description && (
              <p className="mt-3 line-clamp-2 text-xs sm:text-sm text-zinc-400">
                {currentEvent.description}
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              <Link
                href={`/events/${currentEvent.slug || currentEvent.id}`}
                className="btn-primary"
              >
                Khám phá ngay
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation arrows (only if multiple slides) */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 right-6 flex items-center gap-2">
          <button
            onClick={prevSlide}
            aria-label="Slide trước"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={nextSlide}
            aria-label="Slide tiếp theo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </section>
  )
}
