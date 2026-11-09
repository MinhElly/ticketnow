'use client'

import React from 'react'
import {
  type LayoutRect,
  type LayoutTarget,
  type SeatLayout,
  type LayoutTemplate,
} from '@/lib/seat-layout'
import { FloorplanCanvas } from '@/components/FloorplanCanvas'
import { getTierTheme, type TicketTier } from '@/lib/ticket-tiers'

interface Step3SeatLayoutProps {
  layout: SeatLayout
  tiers: TicketTier[]
  template: LayoutTemplate | 'custom'
  onSelectTemplate: (t: LayoutTemplate) => void
  target: LayoutTarget
  onSelectTarget: (target: LayoutTarget) => void
  onTransform: (target: LayoutTarget, rect: LayoutRect) => void
  onUpdateStage: (patch: Partial<LayoutRect & { label: string }>) => void
  onUpdateZone: (index: number, patch: Partial<LayoutRect & { aisle?: boolean }>) => void
}

const templates: Array<{ id: LayoutTemplate; label: string; desc: string }> = [
  { id: 'auditorium', label: 'Hội trường', desc: 'Sân khấu phía trước, các khu vé theo hàng' },
  { id: 'side-stage', label: 'Sân khấu bên trái', desc: 'Các khu vé nằm về phía phải sân khấu' },
  { id: 'center-stage', label: 'Sân khấu trung tâm', desc: 'Bố trí các khu xung quanh sân khấu' },
]

export function Step3SeatLayout({
  layout,
  tiers,
  template,
  onSelectTemplate,
  target,
  onSelectTarget,
  onTransform,
  onUpdateStage,
  onUpdateZone,
}: Step3SeatLayoutProps) {
  const currentZone = target.kind === 'zone' ? layout.zones[target.index] : null
  const currentTier = target.kind === 'zone' ? tiers[target.index] : null
  const currentTheme =
    target.kind === 'zone' && currentZone
      ? getTierTheme(currentZone.color, target.index)
      : null

  return (
    <div className="space-y-5">
      {/* Templates Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelectTemplate(tpl.id)}
            className={`rounded-xl border p-3 text-left transition ${
              template === tpl.id
                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                : 'border-line bg-white hover:border-stone-300'
            }`}
          >
            <p className="text-xs font-bold">{tpl.label}</p>
            <p className="mt-1 text-[10px] text-muted line-clamp-2">{tpl.desc}</p>
          </button>
        ))}
      </div>

      {/* Floorplan canvas + controls */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Floorplan Canvas */}
        <div className="rounded-2xl border border-line bg-white p-4">
          <FloorplanCanvas
            layout={layout}
            tiers={tiers}
            mode="edit"
            target={target}
            onSelect={onSelectTarget}
            onTransform={onTransform}
          />
        </div>

        {/* Selected element controls */}
        <div className="rounded-2xl border border-line bg-white p-5 space-y-4">
          <h4 className="text-xs font-bold text-ink border-b border-line pb-3">
            {target.kind === 'stage'
              ? 'Tùy chỉnh: Sân khấu'
              : `Tùy chỉnh: Khu ${currentTier?.code || ''} (${currentTier?.name || ''})`}
          </h4>

          {target.kind === 'stage' ? (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-ink">
                Tên sân khấu
                <input
                  value={layout.stage.label}
                  onChange={(e) => onUpdateStage({ label: e.target.value })}
                  className="field mt-1 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink">
                  Vị trí X (%)
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={layout.stage.x}
                    onChange={(e) => onUpdateStage({ x: Number(e.target.value) || 0 })}
                    className="field mt-1 text-xs"
                  />
                </label>
                <label className="text-xs font-semibold text-ink">
                  Vị trí Y (%)
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={layout.stage.y}
                    onChange={(e) => onUpdateStage({ y: Number(e.target.value) || 0 })}
                    className="field mt-1 text-xs"
                  />
                </label>
              </div>
            </div>
          ) : currentZone && target.kind === 'zone' ? (
            <div className="space-y-3">
              {currentTheme && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${currentTheme.surface}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-sm ${currentTheme.dot}`} />
                    {currentTier?.name}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${currentTheme.badge}`}>
                    Khu {currentTier?.code}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink">
                  Vị trí X (%)
                  <input
                    type="number"
                    min={0}
                    max={85}
                    value={currentZone.x}
                    onChange={(e) => onUpdateZone(target.index, { x: Number(e.target.value) || 0 })}
                    className="field mt-1 text-xs"
                  />
                </label>
                <label className="text-xs font-semibold text-ink">
                  Vị trí Y (%)
                  <input
                    type="number"
                    min={0}
                    max={85}
                    value={currentZone.y}
                    onChange={(e) => onUpdateZone(target.index, { y: Number(e.target.value) || 0 })}
                    className="field mt-1 text-xs"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={currentZone.aisle ?? true}
                  onChange={(e) => onUpdateZone(target.index, { aisle: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                Lối đi giữa các hàng ghế
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
