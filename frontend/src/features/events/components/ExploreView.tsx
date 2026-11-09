'use client'

import React, { useMemo, useState } from 'react'
import type { Event } from '@/types'
import { EventHero } from './EventHero'
import { EventFilter } from './EventFilter'
import { EventGrid } from './EventGrid'

export function ExploreView({ events }: { events: Event[] }) {
  const [category, setCategory] = useState('Tất cả sự kiện')
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(8)

  const slides = events.filter((e) => e.featured)

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const normalized = (e.title + ' ' + (e.venue || '') + ' ' + (e.city || '')).toLocaleLowerCase('vi')
      const matchesCategory = category === 'Tất cả sự kiện' || e.category === category
      const matchesCity = !city || e.city === city
      const matchesSearch = !search || normalized.includes(search.toLocaleLowerCase('vi'))
      return matchesCategory && matchesCity && matchesSearch
    })
  }, [events, category, city, search])

  return (
    <main className="mx-auto max-w-[1344px] px-5 pt-8 lg:px-10 lg:pt-9">
      {/* Hero Header Title */}
      <section className="mb-6">
        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          TRẢI NGHIỆM TIẾP THEO CỦA BẠN
        </p>
        <h1 className="text-[27px] font-bold tracking-[-1px] sm:text-[32px] text-ink">
          Đi tìm khoảnh khắc. <span className="text-emerald-700">Chạm đến cảm xúc.</span>
        </h1>
        <p className="mt-1 text-xs leading-6 text-muted">
          Khám phá và đặt vé những sự kiện âm nhạc, nghệ thuật, thể thao bạn không muốn bỏ lỡ.
        </p>
      </section>

      {/* Featured Carousel Hero */}
      {slides.length > 0 && <EventHero slides={slides} />}

      {/* Filters */}
      <EventFilter
        selectedCategory={category}
        onSelectCategory={setCategory}
        selectedCity={city}
        onSelectCity={setCity}
        query={query}
        onChangeQuery={setQuery}
        onSubmitSearch={() => setSearch(query)}
      />

      {/* Events Grid */}
      <EventGrid
        events={filtered}
        limit={limit}
        onLoadMore={() => setLimit((prev) => prev + 8)}
        totalFiltered={filtered.length}
      />
    </main>
  )
}
