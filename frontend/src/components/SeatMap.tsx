'use client'

import { useRef, useState } from 'react'
import { Check, Crown, Info, LayoutGrid, LoaderCircle, Music2, Ticket, X } from 'lucide-react'
import { money } from '@/lib/format'
import { getTicketTierViews, type TicketTier } from '@/lib/ticket-tiers'
import { readSeatLayout } from '@/lib/seat-layout'
import { FloorplanCanvas } from './FloorplanCanvas'

export type SeatClaim = { code: string; status: string }

type Props = {
  tiers: TicketTier[]
  claims: SeatClaim[]
  selected: string[]
  loaded: boolean
  availabilityError: boolean
  onToggle: (code: string) => void
  onRetry: () => void
  layout?: unknown
}

export function SeatMap({
  tiers,
  claims,
  selected,
  loaded,
  availabilityError,
  onToggle,
  onRetry,
  layout,
}: Props) {
  const [activeTier, setActiveTier] = useState<string | null>(null)
  const zones = useRef<Record<string, Element | null>>({})
  const overview = useRef<HTMLDivElement>(null)
  const configuredLayout = readSeatLayout(layout, tiers)
  const views = getTicketTierViews(tiers, configuredLayout?.zones)
  const claimedCodes = new Set(claims.map((claim) => claim.code))

  function focusZone(code: string) {
    setActiveTier(code)
    zones.current[code]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div ref={overview} className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Chọn khu vé & vị trí</h3>
          <p className="mt-1.5 text-[10px] leading-5 text-muted">Mỗi màu là một hạng vé riêng.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveTier(null)
            overview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-[10px] font-medium text-muted hover:border-emerald-300 hover:text-emerald-800"
        >
          <LayoutGrid size={13} />
          Toàn bộ sơ đồ
        </button>
      </div>
      <div
        aria-label="So sánh các hạng vé"
        className={`mb-5 grid gap-2 ${views.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
      >
        {views.map(({ tier, theme }) => {
          const selectedCount = selected.filter((code) => code.startsWith(`${tier.code}-`)).length
          const available =
            tier.rows * tier.seatsPerRow -
            claims.filter((claim) => claim.code.startsWith(`${tier.code}-`)).length
          return (
            <button
              key={tier.code}
              type="button"
              aria-label={`Xem khu ${tier.name}`}
              aria-pressed={activeTier === tier.code}
              onClick={() => focusZone(tier.code)}
              className={`rounded-xl border p-3 text-left transition ${theme.surface} ${activeTier === tier.code ? theme.focus : ''}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-bold">
                  <span className={`h-2.5 w-2.5 rounded-sm ${theme.dot}`} />
                  {tier.name}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${theme.badge}`}>
                  Khu {tier.code}
                </span>
              </span>
              <span className={`mt-2 block text-base font-bold ${theme.text}`}>
                {money(tier.price)}
                <span className="ml-1 text-[9px] font-normal text-muted">/ vé</span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted">
                <span>
                  {loaded ? `${Math.max(0, available)} ghế còn trống` : 'Đang kiểm tra ghế'}
                </span>
                {selectedCount > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${theme.text}`}
                  >
                    <Check size={10} />
                    Đã chọn {selectedCount}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {configuredLayout ? (
        <div>
          <p className="mb-3 flex items-start gap-1.5 text-[10px] leading-5 text-muted">
            <Info size={12} className="mt-1 shrink-0" />
            Bố trí sân khấu, màu khu và lối đi theo sơ đồ ban tổ chức đã thiết kế. Có thể phóng to
            để chọn từng ghế; không theo tỷ lệ mét.
          </p>
          {!loaded ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-stone-50 text-xs text-muted">
              {availabilityError ? (
                <>
                  <p>Chưa tải được tình trạng ghế.</p>
                  <button type="button" onClick={onRetry} className="btn-secondary">
                    Thử lại
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle size={22} className="animate-spin" />
                  <p>Đang cập nhật các khu vé...</p>
                </>
              )}
            </div>
          ) : (
            <FloorplanCanvas
              layout={configuredLayout}
              tiers={tiers}
              mode="select"
              activeTier={activeTier}
              selectedSeats={selected}
              claims={claims}
              onToggle={(code) => {
                setActiveTier(code.split('-')[0])
                onToggle(code)
              }}
              onZoneRef={(code, element) => {
                zones.current[code] = element
              }}
            />
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-[9px] text-muted">
            <span>Ô màu: ghế trống</span>
            <span className="flex items-center gap-1">
              <Check size={12} />
              Đang chọn
            </span>
            <span className="flex items-center gap-1">
              <X size={12} />
              Đã giữ / Đã bán
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 flex items-start gap-1.5 text-[9px] leading-5 text-muted">
            <Info size={12} className="mt-1 shrink-0" />
            Bố trí minh họa theo giá vé, không theo khoảng cách thực tế. Mặt bằng chính thức cần ban
            tổ chức xác nhận.
          </p>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-[#f7f9f6] px-2.5 pb-4 pt-4 sm:px-5">
            <div className="mb-3 flex items-center justify-center gap-1.5 text-[9px] font-medium uppercase tracking-[1.5px] text-stone-400">
              <span className="h-px w-6 bg-stone-200" />
              Sơ đồ không gian · Minh họa
              <span className="h-px w-6 bg-stone-200" />
            </div>
            <div className="mx-auto mb-4 flex w-[78%] flex-col items-center rounded-b-[35%] border-b-4 border-mint bg-[#173b30] px-4 py-2 text-white shadow-[0_8px_24px_-16px_#173b30]">
              <div className="flex items-center gap-2">
                <Music2 size={15} className="text-mint" />
                <span className="text-[11px] font-bold tracking-[4px]">SÂN KHẤU</span>
              </div>
              <span className="mt-1 text-[8px] tracking-widest text-white/50">HƯỚNG NHÌN</span>
            </div>

            {!loaded ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-xs text-muted">
                {availabilityError ? (
                  <>
                    <Info size={24} />
                    <p>Chưa tải được tình trạng ghế.</p>
                    <button type="button" onClick={onRetry} className="btn-secondary">
                      Thử lại
                    </button>
                  </>
                ) : (
                  <>
                    <LoaderCircle size={23} className="animate-spin text-emerald-700" />
                    <p>Đang cập nhật các khu vé...</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {views.map(({ tier, theme }, index) => (
                  <section
                    key={tier.code}
                    ref={(element) => {
                      zones.current[tier.code] = element
                    }}
                    aria-label={`Khu ${tier.name}`}
                    data-tier-code={tier.code}
                    data-unit-price={tier.price}
                    data-active={activeTier === tier.code}
                    className={`mx-auto scroll-mt-4 rounded-xl border px-2.5 py-3 transition sm:px-4 ${index === 0 && views.length > 1 ? 'w-[94%] sm:w-[88%]' : 'w-full'} ${theme.surface} ${activeTier === tier.code ? theme.focus : ''}`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4
                        id={`seat-zone-${tier.code}`}
                        className={`flex items-center gap-1.5 text-[11px] font-bold ${theme.text}`}
                      >
                        {/vip|premium|platinum/i.test(tier.name) ? (
                          <Crown size={14} />
                        ) : (
                          <Ticket size={14} />
                        )}
                        {tier.name}
                        <span className="font-normal opacity-65">· Khu {tier.code}</span>
                      </h4>
                      <p
                        id={`seat-price-${tier.code}`}
                        className={`text-[11px] font-bold ${theme.text}`}
                      >
                        {money(tier.price)}
                        <span className="ml-1 text-[8px] font-normal text-muted">/ vé</span>
                      </p>
                    </div>
                    <div className="overflow-x-auto pb-1">
                      <div className="mx-auto w-fit space-y-1.5 sm:space-y-2">
                        {Array.from({ length: tier.rows }, (_, row) => (
                          <div key={row} className="flex w-max items-center gap-1.5 sm:gap-2">
                            <span className="w-5 shrink-0 text-[8px] font-medium text-stone-400">
                              {tier.code}
                              {row + 1}
                            </span>
                            <div className="flex gap-3 sm:gap-5">
                              {[0, 1].map((half) => {
                                const midpoint = Math.ceil(tier.seatsPerRow / 2)
                                const start = half === 0 ? 0 : midpoint
                                const length = half === 0 ? midpoint : tier.seatsPerRow - midpoint
                                return (
                                  <div key={half} className="flex gap-1 sm:gap-1.5">
                                    {Array.from({ length }, (_, offset) => {
                                      const seat = start + offset
                                      const code = `${tier.code}-${row + 1}-${seat + 1}`
                                      const claimed = claimedCodes.has(code)
                                      const isSelected = selected.includes(code)
                                      return (
                                        <button
                                          key={code}
                                          type="button"
                                          disabled={claimed}
                                          onClick={() => {
                                            setActiveTier(tier.code)
                                            onToggle(code)
                                          }}
                                          aria-label={`Ghế ${code}${claimed ? ' đã được đặt' : ''}`}
                                          aria-describedby={`seat-zone-${tier.code} seat-price-${tier.code}`}
                                          aria-pressed={isSelected}
                                          title={`${tier.name} · Hàng ${row + 1}, ghế ${seat + 1} · ${money(tier.price)}${claimed ? ' · Đã giữ / đã bán' : ''}`}
                                          className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-t-md rounded-b-sm border text-[8px] font-medium transition disabled:cursor-not-allowed disabled:opacity-100 sm:h-7 sm:w-7 sm:text-[9px] ${claimed ? 'border-stone-200 bg-stone-200 text-stone-400' : isSelected ? theme.selectedSeat : theme.seat}`}
                                        >
                                          {claimed ? (
                                            <X size={10} />
                                          ) : isSelected ? (
                                            <Check size={12} strokeWidth={2.8} />
                                          ) : (
                                            seat + 1
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-current/5 pt-2 text-[8px] text-muted">
                      <span>
                        {tier.rows} hàng × {tier.seatsPerRow} ghế
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 border-l border-dashed border-stone-300" />
                        Lối đi giữa
                      </span>
                    </div>
                  </section>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[9px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded border border-stone-300 bg-white" />
                Ghế trống
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-ink text-white">
                  <Check size={10} />
                </span>
                Đang chọn
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-stone-200 text-stone-400">
                  <X size={10} />
                </span>
                Đã giữ / Đã bán
              </span>
            </div>
          </div>
        </>
      )}
      {availabilityError && loaded && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-[10px] leading-5 text-amber-800"
        >
          Chưa cập nhật được tình trạng mới nhất. Hệ thống sẽ kiểm tra lại khi bạn tiếp tục thanh
          toán.
          <button type="button" onClick={onRetry} className="ml-1 font-semibold underline">
            Thử lại
          </button>
        </p>
      )}
    </div>
  )
}
