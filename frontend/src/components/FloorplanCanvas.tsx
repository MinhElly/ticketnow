'use client'

import { useId, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { Check, Maximize2, Move, X, ZoomIn, ZoomOut } from 'lucide-react'
import { money } from '@/lib/format'
import { getTierTheme, type TicketTier } from '@/lib/ticket-tiers'
import {
  clampLayoutRect,
  getSeatLayoutIssues,
  type LayoutRect,
  type LayoutTarget,
  type SeatLayout,
} from '@/lib/seat-layout'

type Props = {
  layout: SeatLayout
  tiers: TicketTier[]
  mode?: 'edit' | 'select' | 'preview'
  target?: LayoutTarget | null
  onSelect?: (target: LayoutTarget) => void
  onTransform?: (target: LayoutTarget, rect: LayoutRect) => void
  selectedSeats?: string[]
  claims?: { code: string; status: string }[]
  onToggle?: (code: string) => void
  activeTier?: string | null
  onZoneRef?: (code: string, element: SVGGElement | null) => void
}

export function FloorplanCanvas({
  layout,
  tiers,
  mode = 'preview',
  target,
  onSelect,
  onTransform,
  selectedSeats = [],
  claims = [],
  onToggle,
  activeTier,
  onZoneRef,
}: Props) {
  const [zoom, setZoom] = useState(1)
  const svg = useRef<SVGSVGElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    target: LayoutTarget
    resize: boolean
    start: { x: number; y: number }
    rect: LayoutRect
  } | null>(null)
  const prefix = useId().replace(/:/g, '')
  const claimed = new Set(claims.map((claim) => claim.code))
  const editing = mode === 'edit'
  const issues = getSeatLayoutIssues(layout, tiers)
  const stage = clampLayoutRect(layout.stage, true)

  function point(clientX: number, clientY: number) {
    const root = svg.current
    const matrix = root?.getScreenCTM()
    if (!root || !matrix) return { x: 0, y: 0 }
    const value = root.createSVGPoint()
    value.x = clientX
    value.y = clientY
    const local = value.matrixTransform(matrix.inverse())
    return { x: local.x / 10, y: local.y / 7 }
  }
  function rectFor(item: LayoutTarget) {
    return clampLayoutRect(
      item.kind === 'stage' ? layout.stage : layout.zones[item.index],
      item.kind === 'stage',
    )
  }
  function start(event: PointerEvent<SVGGElement>, item: LayoutTarget, resize = false) {
    if (!editing || !onTransform || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    onSelect?.(item)
    drag.current = {
      target: item,
      resize,
      start: point(event.clientX, event.clientY),
      rect: rectFor(item),
    }
    svg.current?.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current
    if (!current || !onTransform) return
    const next = point(event.clientX, event.clientY)
    const dx = Math.round(next.x - current.start.x)
    const dy = Math.round(next.y - current.start.y)
    const rect = current.rect
    const minimum =
      current.target.kind === 'stage' ? { width: 15, height: 6 } : { width: 20, height: 20 }
    const updated = current.resize
      ? {
          ...rect,
          width: Math.max(minimum.width, Math.min(100 - rect.x, rect.width + dx)),
          height: Math.max(minimum.height, Math.min(100 - rect.y, rect.height + dy)),
        }
      : {
          ...rect,
          x: Math.max(0, Math.min(100 - rect.width, rect.x + dx)),
          y: Math.max(0, Math.min(100 - rect.height, rect.y + dy)),
        }
    onTransform(current.target, updated)
  }
  function stop(event: PointerEvent<SVGSVGElement>) {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function keyboard(event: KeyboardEvent<SVGGElement>, item: LayoutTarget, resize = false) {
    if (event.target !== event.currentTarget || !editing) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(item)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    onSelect?.(item)
    const rect = rectFor(item)
    const delta = event.shiftKey ? 5 : 1
    const dx = event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0
    const dy = event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0
    onTransform?.(
      item,
      clampLayoutRect(
        resize
          ? { ...rect, width: rect.width + dx, height: rect.height + dy }
          : { ...rect, x: rect.x + dx, y: rect.y + dy },
        item.kind === 'stage',
      ),
    )
  }
  function resetZoom() {
    setZoom(1)
    viewport.current?.scrollTo({ left: 0, top: 0 })
  }
  function resizeHandle(item: LayoutTarget, rect: LayoutRect, color: string) {
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={
          item.kind === 'stage' ? 'Đổi kích thước sân khấu' : `Đổi kích thước khu ${item.index + 1}`
        }
        onPointerDown={(event) => start(event, item, true)}
        onKeyDown={(event) => keyboard(event, item, true)}
        className="cursor-nwse-resize touch-none outline-none"
      >
        <rect
          x={(rect.x + rect.width) * 10 - 11}
          y={(rect.y + rect.height) * 7 - 11}
          width={22}
          height={22}
          rx={5}
          fill="white"
          stroke={color}
          strokeWidth={2}
        />
        <path
          d={`M ${(rect.x + rect.width) * 10 - 4} ${(rect.y + rect.height) * 7 + 4} l 8 -8`}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      </g>
    )
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] text-muted">
          {editing ? (
            <>
              <Move size={13} />
              Kéo để di chuyển · Kéo góc để đổi kích thước
            </>
          ) : (
            'Mặt bằng do ban tổ chức thiết kế'
          )}
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-1">
          <button
            type="button"
            aria-label="Thu nhỏ sơ đồ"
            disabled={zoom <= 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            className="rounded p-1.5 hover:bg-stone-100 disabled:cursor-default"
          >
            <ZoomOut size={15} />
          </button>
          <span className="w-10 text-center text-[10px] font-semibold tabular-nums">
            {zoom * 100}%
          </span>
          <button
            type="button"
            aria-label="Phóng to sơ đồ"
            disabled={zoom >= 5}
            onClick={() => setZoom(Math.min(5, zoom + 0.5))}
            className="rounded p-1.5 hover:bg-stone-100 disabled:cursor-default"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            aria-label="Vừa khung sơ đồ"
            onClick={resetZoom}
            className="rounded p-1.5 hover:bg-stone-100"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className="max-h-[520px] overflow-auto rounded-2xl border border-stone-200 bg-[#f5f8f4]"
        data-layout-source="organizer"
      >
        <div style={{ width: `${zoom * 100}%` }}>
          <svg
            ref={svg}
            viewBox="0 0 1000 700"
            role="group"
            aria-label={editing ? 'Trình thiết kế mặt bằng' : 'Sơ đồ mặt bằng ban tổ chức'}
            className="block w-full select-none"
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
          >
            <defs>
              <pattern id={`${prefix}-grid`} width={20} height={20} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={1} fill="#dce5dc" />
              </pattern>
              <clipPath id={`${prefix}-stage`}>
                <rect
                  x={stage.x * 10}
                  y={stage.y * 7}
                  width={stage.width * 10}
                  height={stage.height * 7}
                  rx={10}
                />
              </clipPath>
              {layout.zones.map((zone, index) => {
                const r = clampLayoutRect(zone)
                return (
                  <clipPath key={index} id={`${prefix}-zone-${index}`}>
                    <rect
                      x={r.x * 10}
                      y={r.y * 7}
                      width={r.width * 10}
                      height={r.height * 7}
                      rx={12}
                    />
                  </clipPath>
                )
              })}
            </defs>
            <rect width={1000} height={700} fill={`url(#${prefix}-grid)`} />
            <rect
              x={1}
              y={1}
              width={998}
              height={698}
              rx={14}
              fill="none"
              stroke="#dce5dc"
              strokeDasharray="5 5"
            />
            {layout.zones.map((zone, index) => {
              const tier = tiers.find((tier) => tier.code === zone.tierCode) ?? tiers[index]
              if (!tier) return null
              const r = clampLayoutRect(zone)
              const theme = getTierTheme(zone.color, index)
              const selectedZone = editing
                ? target?.kind === 'zone' && target.index === index
                : activeTier === tier.code
              const stroke = issues.length && editing ? '#dc2626' : theme.stroke
              const cols = Math.max(
                1,
                Math.min(12, Number.isFinite(tier.seatsPerRow) ? Math.floor(tier.seatsPerRow) : 1),
              )
              const rows = Math.max(
                1,
                Math.min(10, Number.isFinite(tier.rows) ? Math.floor(tier.rows) : 1),
              )
              const aisle = zone.aisle ? 18 : 0
              const compact = r.width < 34
              const headerHeight = compact ? 46 : 36
              const availableHeight = r.height * 7 - headerHeight - 14
              const dx = Math.min(32, (r.width * 10 - 60 - aisle) / cols)
              const dy = Math.min(32, availableHeight / rows)
              const size = Math.max(4, Math.min(26, dx - 4, dy - 4))
              const startX = r.x * 10 + (r.width * 10 - cols * dx - aisle) / 2 + 12
              const startY = r.y * 7 + headerHeight + (availableHeight - rows * dy) / 2
              const item: LayoutTarget = { kind: 'zone', index }
              return (
                <g
                  key={index}
                  ref={(element) => onZoneRef?.(tier.code, element)}
                  role={editing ? 'button' : 'region'}
                  tabIndex={editing ? 0 : undefined}
                  aria-label={
                    editing
                      ? `Chọn khu ${index + 1}: ${tier.name || tier.code}`
                      : `Khu ${tier.name}`
                  }
                  data-tier-code={tier.code}
                  data-unit-price={tier.price}
                  data-active={selectedZone}
                  data-x={zone.x}
                  data-y={zone.y}
                  data-width={zone.width}
                  data-height={zone.height}
                  data-color={zone.color}
                  data-aisle={zone.aisle}
                  onFocus={editing ? () => onSelect?.(item) : undefined}
                  onPointerDown={editing ? (event) => start(event, item) : undefined}
                  onKeyDown={editing ? (event) => keyboard(event, item) : undefined}
                  className={editing ? 'cursor-move touch-none outline-none' : undefined}
                >
                  <title>
                    {tier.name} · Khu {tier.code} · {money(tier.price)} ·{' '}
                    {tier.rows * tier.seatsPerRow} ghế
                  </title>
                  <rect
                    x={r.x * 10}
                    y={r.y * 7}
                    width={r.width * 10}
                    height={r.height * 7}
                    rx={12}
                    fill={theme.fill}
                    stroke={stroke}
                    strokeWidth={selectedZone ? 4 : 1.5}
                  />
                  <g clipPath={`url(#${prefix}-zone-${index})`}>
                    <text
                      x={r.x * 10 + 13}
                      y={r.y * 7 + 21}
                      fill={theme.solid}
                      fontSize={12}
                      fontWeight={700}
                    >
                      {tier.name.slice(0, compact ? 18 : 30) || 'Khu vé'} · {tier.code}
                    </text>
                    <text
                      x={compact ? r.x * 10 + 13 : (r.x + r.width) * 10 - 12}
                      y={r.y * 7 + (compact ? 35 : 21)}
                      fill={theme.solid}
                      fontSize={11}
                      fontWeight={700}
                      textAnchor={compact ? 'start' : 'end'}
                    >
                      {money(tier.price)}
                    </text>
                    {Array.from({ length: rows }, (_, row) => (
                      <g key={row}>
                        <text
                          x={startX - 7}
                          y={startY + row * dy + size / 2 + 3}
                          fill="#89938d"
                          fontSize={8}
                          textAnchor="end"
                        >
                          {tier.code}
                          {row + 1}
                        </text>
                        {Array.from({ length: cols }, (_, seat) => {
                          const code = `${tier.code}-${row + 1}-${seat + 1}`
                          const x =
                            startX +
                            seat * dx +
                            (zone.aisle && seat >= Math.ceil(cols / 2) ? aisle : 0)
                          const y = startY + row * dy
                          const isClaimed = claimed.has(code)
                          const isSelected = selectedSeats.includes(code)
                          const selectable = mode === 'select'
                          return (
                            <g
                              key={seat}
                              role={selectable ? 'button' : undefined}
                              tabIndex={selectable && !isClaimed ? 0 : undefined}
                              aria-label={
                                selectable
                                  ? `Ghế ${code}${isClaimed ? ' đã được đặt' : ''}`
                                  : undefined
                              }
                              aria-disabled={selectable ? isClaimed : undefined}
                              aria-pressed={selectable ? isSelected : undefined}
                              onClick={
                                selectable
                                  ? () => {
                                      if (!isClaimed) onToggle?.(code)
                                    }
                                  : undefined
                              }
                              onKeyDown={
                                selectable
                                  ? (event) => {
                                      if (
                                        (event.key === 'Enter' || event.key === ' ') &&
                                        !isClaimed
                                      ) {
                                        event.preventDefault()
                                        onToggle?.(code)
                                      }
                                    }
                                  : undefined
                              }
                              className={
                                selectable
                                  ? isClaimed
                                    ? 'cursor-not-allowed outline-none'
                                    : 'cursor-pointer outline-none focus:opacity-60 hover:opacity-70'
                                  : undefined
                              }
                            >
                              <title>
                                {tier.name} · Ghế {code} · {money(tier.price)}
                              </title>
                              <rect
                                x={x}
                                y={y}
                                width={size}
                                height={size}
                                rx={Math.min(4, size / 4)}
                                fill={isClaimed ? '#e0e4e0' : isSelected ? theme.solid : 'white'}
                                stroke={isClaimed ? '#d4dad4' : theme.stroke}
                                strokeWidth={isSelected ? 2 : 1}
                              />
                              {isClaimed || isSelected ? (
                                isClaimed ? (
                                  <X
                                    x={x + size * 0.15}
                                    y={y + size * 0.15}
                                    width={size * 0.7}
                                    height={size * 0.7}
                                    stroke="#a0a8a1"
                                  />
                                ) : (
                                  <Check
                                    x={x + size * 0.15}
                                    y={y + size * 0.15}
                                    width={size * 0.7}
                                    height={size * 0.7}
                                    stroke="white"
                                    strokeWidth={3}
                                  />
                                )
                              ) : (
                                <text
                                  x={x + size / 2}
                                  y={y + size / 2 + Math.min(4, size / 4)}
                                  fontSize={Math.max(4, Math.min(10, size * 0.45))}
                                  textAnchor="middle"
                                  fill={theme.solid}
                                >
                                  {seat + 1}
                                </text>
                              )}
                            </g>
                          )
                        })}
                      </g>
                    ))}
                  </g>
                  {selectedZone && editing && resizeHandle(item, r, stroke)}
                </g>
              )
            })}
            <g
              role={editing ? 'button' : 'group'}
              aria-label={editing ? 'Chọn sân khấu' : `Sân khấu: ${layout.stage.label}`}
              tabIndex={editing ? 0 : undefined}
              onFocus={editing ? () => onSelect?.({ kind: 'stage' }) : undefined}
              onPointerDown={editing ? (event) => start(event, { kind: 'stage' }) : undefined}
              onKeyDown={editing ? (event) => keyboard(event, { kind: 'stage' }) : undefined}
              className={editing ? 'cursor-move touch-none outline-none' : undefined}
              data-stage-label={layout.stage.label}
              data-x={layout.stage.x}
              data-y={layout.stage.y}
              data-width={layout.stage.width}
              data-height={layout.stage.height}
            >
              <rect
                x={stage.x * 10}
                y={stage.y * 7}
                width={stage.width * 10}
                height={stage.height * 7}
                rx={10}
                fill="#173b30"
                stroke={editing && issues.length ? '#dc2626' : '#a9e878'}
                strokeWidth={target?.kind === 'stage' && editing ? 4 : 2}
              />
              <text
                clipPath={`url(#${prefix}-stage)`}
                x={(stage.x + stage.width / 2) * 10}
                y={(stage.y + stage.height / 2) * 7 + 5}
                fill="#ddf8c9"
                textAnchor="middle"
                fontWeight={700}
                fontSize={Math.min(
                  18,
                  Math.max(9, (stage.width * 10) / Math.max(1, layout.stage.label.length * 0.7)),
                )}
                letterSpacing={2}
              >
                {layout.stage.label.toUpperCase()}
              </text>
              <title>{layout.stage.label}</title>
              {target?.kind === 'stage' &&
                editing &&
                resizeHandle({ kind: 'stage' }, stage, '#173b30')}
            </g>
          </svg>
        </div>
      </div>
      {editing && (
        <p className="mt-2 text-[9px] leading-5 text-muted">
          Có thể dùng phím mũi tên để di chuyển khu đang chọn; giữ Shift để đi 5%. Tọa độ theo % mặt
          bằng, không phải mét.
        </p>
      )}
    </div>
  )
}
