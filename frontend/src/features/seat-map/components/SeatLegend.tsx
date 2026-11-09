'use client'

import React from 'react'

export function SeatLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 py-3 text-xs text-muted border-t border-line mt-4">
      <div className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded bg-emerald-500" />
        <span>Ghế trống</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded bg-mint border border-emerald-600" />
        <span className="font-semibold text-emerald-800">Đang chọn</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded bg-stone-200 opacity-60" />
        <span>Đã bán / Đang giữ</span>
      </div>
    </div>
  )
}
