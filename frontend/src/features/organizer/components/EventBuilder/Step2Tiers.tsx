'use client'

import React from 'react'
import { Plus, Trash2, Ticket } from 'lucide-react'
import type { TicketTier } from '@/lib/ticket-tiers'
import { money } from '@/lib/format'

export type EditableTier = TicketTier & { localKey: string }

interface Step2TiersProps {
  tiers: EditableTier[]
  onUpdateTier: (index: number, patch: Partial<TicketTier>) => void
  onAddTier: () => void
  onRemoveTier: (index: number) => void
}

export function Step2Tiers({ tiers, onUpdateTier, onAddTier, onRemoveTier }: Step2TiersProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Tối đa 4 hạng vé. Mỗi hạng vé tương ứng với một khu vực ghế và mức giá riêng biệt.
        </p>
        {tiers.length < 4 && (
          <button
            type="button"
            onClick={onAddTier}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
          >
            <Plus size={14} />
            Thêm hạng vé
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiers.map((tier, index) => (
          <div key={tier.localKey} className="rounded-2xl border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="flex items-center gap-2 text-xs font-bold text-ink">
                <Ticket size={16} className="text-emerald-700" />
                Hạng vé #{index + 1}
              </span>
              {tiers.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveTier(index)}
                  className="text-stone-400 hover:text-red-500 transition p-1"
                  aria-label="Xóa hạng vé"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-ink">
                Tên hạng vé
                <input
                  value={tier.name}
                  onChange={(e) => onUpdateTier(index, { name: e.target.value })}
                  placeholder="Ví dụ: VIP"
                  className="field mt-1 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-ink">
                Mã khu (1–6 ký tự)
                <input
                  value={tier.code}
                  onChange={(e) => onUpdateTier(index, { code: e.target.value.toUpperCase() })}
                  maxLength={6}
                  placeholder="VIP"
                  className="field mt-1 text-xs uppercase"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold text-ink">
              Giá vé (VNĐ)
              <input
                type="number"
                min={0}
                step={10000}
                value={tier.price}
                onChange={(e) => onUpdateTier(index, { price: Number(e.target.value) || 0 })}
                className="field mt-1 text-xs"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-ink">
                Số hàng
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tier.rows}
                  onChange={(e) => onUpdateTier(index, { rows: Number(e.target.value) || 1 })}
                  className="field mt-1 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-ink">
                Số ghế / hàng
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={tier.seatsPerRow}
                  onChange={(e) =>
                    onUpdateTier(index, { seatsPerRow: Number(e.target.value) || 1 })
                  }
                  className="field mt-1 text-xs"
                />
              </label>
            </div>

            <p className="text-[11px] text-muted pt-1">
              Khu {tier.code}: {tier.rows * tier.seatsPerRow} ghế · Doanh thu ước tính:{' '}
              {money(tier.rows * tier.seatsPerRow * tier.price)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
