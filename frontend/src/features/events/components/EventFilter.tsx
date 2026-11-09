'use client'

import React from 'react'
import {
  Drama,
  Grid2X2,
  MapPin,
  Mic2,
  Music2,
  Palette,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react'

export const EVENT_CATEGORIES = [
  { name: 'Tất cả sự kiện', icon: Grid2X2, color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Âm nhạc', icon: Music2, color: 'bg-violet-50 text-violet-600' },
  { name: 'Sân khấu & Nghệ thuật', icon: Drama, color: 'bg-pink-50 text-pink-600' },
  { name: 'Thể thao', icon: Trophy, color: 'bg-orange-50 text-orange-500' },
  { name: 'Workshop', icon: Palette, color: 'bg-blue-50 text-blue-600' },
  { name: 'Hội thảo', icon: Mic2, color: 'bg-cyan-50 text-cyan-600' },
  { name: 'Lễ hội', icon: Sparkles, color: 'bg-amber-50 text-amber-600' },
]

interface EventFilterProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
  selectedCity: string
  onSelectCity: (city: string) => void
  query: string
  onChangeQuery: (query: string) => void
  onSubmitSearch: () => void
  cities?: string[]
}

export function EventFilter({
  selectedCategory,
  onSelectCategory,
  selectedCity,
  onSelectCity,
  query,
  onChangeQuery,
  onSubmitSearch,
  cities = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'],
}: EventFilterProps) {
  return (
    <div className="space-y-5 mb-8" id="explore">
      {/* Search Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmitSearch()
        }}
        className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition"
      >
        <Search size={18} className="text-muted shrink-0" />
        <input
          className="w-full bg-transparent text-xs sm:text-sm text-ink outline-none placeholder:text-stone-400"
          placeholder="Tìm kiếm sự kiện, nghệ sĩ, địa điểm..."
          aria-label="Tìm kiếm sự kiện"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 transition shrink-0"
        >
          Tìm kiếm
        </button>
      </form>

      {/* Category Pills & City Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Categories */}
        <div className="flex flex-wrap items-center gap-2">
          {EVENT_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = selectedCategory === cat.name
            return (
              <button
                key={cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-white border border-line text-muted hover:text-ink hover:border-stone-300'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-mint' : ''} />
                {cat.name}
              </button>
            )
          })}
        </div>

        {/* City Filter */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-xs">
          <MapPin size={14} className="text-emerald-700" />
          <select
            value={selectedCity}
            onChange={(e) => onSelectCity(e.target.value)}
            className="cursor-pointer bg-transparent text-xs font-medium text-ink outline-none"
            aria-label="Lọc theo địa điểm"
          >
            <option value="">Tất cả địa điểm</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
