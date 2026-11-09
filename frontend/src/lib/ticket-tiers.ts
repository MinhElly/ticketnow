import type { Event } from '@/payload-types'

export type TicketTier = Event['tiers'][number]

const tierThemes = [
  {
    color: 'amber',
    label: 'Vàng hổ phách',
    fill: '#fffbeb',
    stroke: '#d97706',
    solid: '#b45309',
    dot: 'bg-amber-500',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-900',
    surface: 'border-amber-200 bg-amber-50/50',
    seat: 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-600 hover:bg-amber-100',
    selectedSeat: 'border-amber-600 bg-amber-600 text-white ring-2 ring-amber-600/20',
    focus: 'ring-2 ring-amber-400 ring-offset-2',
  },
  {
    color: 'teal',
    label: 'Xanh ngọc',
    fill: '#f0fdfa',
    stroke: '#0d9488',
    solid: '#0f766e',
    dot: 'bg-teal-500',
    text: 'text-teal-800',
    badge: 'bg-teal-100 text-teal-900',
    surface: 'border-teal-200 bg-teal-50/50',
    seat: 'border-teal-300 bg-teal-50 text-teal-900 hover:border-teal-600 hover:bg-teal-100',
    selectedSeat: 'border-teal-700 bg-teal-700 text-white ring-2 ring-teal-700/20',
    focus: 'ring-2 ring-teal-400 ring-offset-2',
  },
  {
    color: 'violet',
    label: 'Tím',
    fill: '#f5f3ff',
    stroke: '#8b5cf6',
    solid: '#6d28d9',
    dot: 'bg-violet-500',
    text: 'text-violet-800',
    badge: 'bg-violet-100 text-violet-900',
    surface: 'border-violet-200 bg-violet-50/50',
    seat: 'border-violet-300 bg-violet-50 text-violet-900 hover:border-violet-600 hover:bg-violet-100',
    selectedSeat: 'border-violet-700 bg-violet-700 text-white ring-2 ring-violet-700/20',
    focus: 'ring-2 ring-violet-400 ring-offset-2',
  },
  {
    color: 'blue',
    label: 'Xanh dương',
    fill: '#eff6ff',
    stroke: '#3b82f6',
    solid: '#1d4ed8',
    dot: 'bg-blue-500',
    text: 'text-blue-800',
    badge: 'bg-blue-100 text-blue-900',
    surface: 'border-blue-200 bg-blue-50/50',
    seat: 'border-blue-300 bg-blue-50 text-blue-900 hover:border-blue-600 hover:bg-blue-100',
    selectedSeat: 'border-blue-700 bg-blue-700 text-white ring-2 ring-blue-700/20',
    focus: 'ring-2 ring-blue-400 ring-offset-2',
  },
]

export const TIER_COLORS = ['amber', 'teal', 'violet', 'blue'] as const
export type TierColor = (typeof TIER_COLORS)[number]
export const TIER_THEMES = tierThemes
export function getTierTheme(color: string | null | undefined, fallbackIndex = 0) {
  return (
    tierThemes.find((theme) => theme.color === color) ??
    tierThemes[fallbackIndex % tierThemes.length]
  )
}

export function getTicketTierViews(
  tiers: TicketTier[],
  zones?: { tierCode?: string | null; color?: string | null }[] | null,
) {
  // Display order is schematic, not a claim about the venue's actual geometry.
  return [...tiers]
    .sort((a, b) => b.price - a.price)
    .map((tier, index) => ({
      tier,
      theme: getTierTheme(zones?.find((zone) => zone.tierCode === tier.code)?.color, index),
    }))
}
