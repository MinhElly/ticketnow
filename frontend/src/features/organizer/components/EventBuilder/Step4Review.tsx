'use client'

import React from 'react'
import { MapPin, CalendarDays, CheckCircle2, LockKeyhole } from 'lucide-react'
import type { SeatLayout } from '@/lib/seat-layout'
import { getTicketTierViews, type TicketTier } from '@/lib/ticket-tiers'
import { FloorplanCanvas } from '@/components/FloorplanCanvas'
import { money } from '@/lib/format'
import type { EventInfoState } from './Step1Info'

interface Step4ReviewProps {
  info: EventInfoState
  tiers: TicketTier[]
  layout: SeatLayout
}

export function Step4Review({ info, tiers, layout }: Step4ReviewProps) {
  const capacity = tiers.reduce(
    (sum, tier) =>
      sum + (Number.isFinite(tier.rows * tier.seatsPerRow) ? tier.rows * tier.seatsPerRow : 0),
    0,
  )
  const faceValue = tiers.reduce(
    (sum, tier) =>
      sum +
      (Number.isFinite(tier.price * tier.rows * tier.seatsPerRow)
        ? tier.price * tier.rows * tier.seatsPerRow
        : 0),
    0,
  )
  const tierViews = getTicketTierViews(tiers, layout.zones)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h4 className="text-lg font-bold text-ink">{info.title || 'Sự kiện chưa đặt tên'}</h4>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <MapPin size={14} className="text-emerald-700 shrink-0" />
            {info.venue || 'Chưa có địa điểm'}, {info.city}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted">
            <CalendarDays size={14} className="text-emerald-700 shrink-0" />
            {info.date ? info.date.replace('T', ' · ') : 'Chưa định ngày'} · UTC+7
          </p>
          {info.description && (
            <p className="mt-4 whitespace-pre-line text-xs leading-7 text-muted border-t border-line pt-4">
              {info.description}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h4 className="mb-4 text-sm font-bold text-ink">Seat map khách hàng sẽ nhìn thấy</h4>
          <FloorplanCanvas layout={layout} tiers={tiers} />
        </div>
      </div>

      <aside className="h-fit rounded-2xl border border-emerald-200 bg-white p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
          <CheckCircle2 size={24} />
        </div>
        <h4 className="text-base font-bold text-ink">Kiểm tra lần cuối</h4>
        <div className="my-5 space-y-3 text-[11px]">
          <p className="flex justify-between">
            <span className="text-muted">Số hạng vé</span>
            <strong className="text-ink">{tiers.length}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">Tổng ghế</span>
            <strong className="text-ink">{capacity}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">Sân khấu</span>
            <strong className="max-w-40 truncate text-ink">{layout.stage.label}</strong>
          </p>
        </div>

        <div className="space-y-3 border-y border-line py-4">
          {tierViews.map(({ tier, theme }) => (
            <p key={tier.code} className="flex items-start justify-between gap-2 text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-sm ${theme.dot}`} />
                <span className="font-medium text-ink">{tier.name}</span>
              </span>
              <strong>{money(tier.price)}</strong>
            </p>
          ))}
        </div>

        <p className="mt-4 text-[10px] leading-6 text-muted">Tổng giá trị vé tối đa</p>
        <p className="mt-1 text-xl font-bold text-emerald-800">{money(faceValue)}</p>

        <p className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-[10px] leading-6 text-emerald-900">
          <LockKeyhole size={15} className="mt-1 shrink-0 text-emerald-700" />
          <span>
            Lưu bản nháp không mở bán. Bạn có thể chỉnh sửa trước khi công bố; sau đó mặt bằng được khóa để bảo vệ vị trí vé.
          </span>
        </p>
      </aside>
    </div>
  )
}
