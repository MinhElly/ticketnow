'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Info,
  LoaderCircle,
  MapPin,
  Share2,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import type { Event } from '@/types/event'
import { eventDate, mediaOf, money, priceOf, statusLabels } from '@/lib/format'
import { useApp } from './AppProvider'
import { ROLE_WORKSPACES } from '@/lib/roles'
import { getTicketTierViews } from '@/lib/ticket-tiers'
import { SeatMap, type SeatClaim } from './SeatMap'

export function EventDetail({ event }: { event: Event }) {
  const { user, openAuth, loading } = useApp()
  const router = useRouter()
  const [tab, setTab] = useState('about')
  const [booking, setBooking] = useState(false)
  const [queue, setQueue] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [claims, setClaims] = useState<SeatClaim[]>([])
  const [availabilityError, setAvailabilityError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const image = mediaOf(event.image)
  const staffWorkspace = user && user.role !== 'customer' ? ROLE_WORKSPACES[user.role] : null
  const tiers = (event.ticketTiers || event.tiers || []) as any[]
  const tierViews = getTicketTierViews(tiers, event.seatLayout?.zones)
  const canBuy =
    event.status === 'on_sale' &&
    new Date(event.date).getTime() > Date.now() &&
    (!event.onSaleAt || new Date(event.onSaleAt).getTime() <= Date.now())
  const total = selected.reduce(
    (sum, code) => sum + (tiers.find((t: any) => t.code === code.split('-')[0])?.price ?? 0),
    0,
  )
  async function refreshAvailability() {
    try {
      const response = await fetch(`/api/ticketnow/availability?event=${event.id}`)
      if (!response.ok) throw new Error()
      const result = await response.json()
      setClaims(result.claims)
      setAvailabilityError(false)
      setLoaded(true)
    } catch {
      setAvailabilityError(true)
    }
  }
  useEffect(() => {
    if (!booking) return
    void refreshAvailability()
    const interval = setInterval(refreshAvailability, 10000)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearInterval(interval)
      document.body.style.overflow = previous
    }
  }, [booking])
  useEffect(() => {
    if (!queue) return
    const timer = setTimeout(() => setQueue((q) => Math.max(q - 1, 0)), 1000)
    return () => clearTimeout(timer)
  }, [queue])
  function begin() {
    if (!user) {
      openAuth()
      return
    }
    if (user.role !== 'customer') {
      setError('Chỉ tài khoản Customer có thể mua vé.')
      return
    }
    setError('')
    setBooking(true)
    setSelected([])
    setLoaded(false)
    setClaims([])
    setAvailabilityError(false)
    setQueue(event.waitingRoom ? 5 : 0)
  }
  function toggle(code: string) {
    setError('')
    if (selected.includes(code)) setSelected(selected.filter((s) => s !== code))
    else if (selected.length >= 6) setError('Bạn chỉ có thể chọn tối đa 6 ghế mỗi đơn.')
    else setSelected([...selected, code])
  }
  async function hold() {
    if (!selected.length) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ticketnow/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hold',
          event: event.id,
          seats: selected,
          key: crypto.randomUUID(),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setBooking(false)
      router.push(`/checkout/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể giữ ghế.')
      void refreshAvailability()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-[1264px] px-5 py-7 lg:px-0">
      <nav className="mb-6 flex items-center gap-2 text-[11px] text-muted">
        <Link href="/" className="hover:text-emerald-700">
          Khám phá
        </Link>
        <ChevronRight size={12} />
        <span>{event.category}</span>
        <ChevronRight size={12} />
        <span className="truncate text-ink">{event.title}</span>
      </nav>
      <div className="relative h-64 overflow-hidden rounded-2xl bg-ink sm:h-[370px]">
        {image?.url && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority
            loading="eager"
            sizes="(max-width:1280px) 100vw, 1264px"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#081b16]/90 via-black/10 to-transparent" />
        <div className="absolute bottom-8 left-7 right-7 text-white sm:left-10">
          <span className="rounded bg-mint px-2.5 py-1 text-[10px] font-bold text-ink">
            {event.category}
          </span>
          <p className="mt-4 text-3xl font-extrabold uppercase tracking-tight sm:text-6xl">
            {event.subtitle || event.title.split('–')[0]}
          </p>
          <p className="mt-3 text-xs text-white/70">FEEL THE MOMENT. MAKE IT YOURS.</p>
        </div>
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold ${canBuy ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabels[event.status]}
          </span>
          <h1 className="mt-4 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            {event.title}
          </h1>
          <div className="mt-5 flex flex-col gap-3 text-xs text-muted">
            <p className="flex items-center gap-2.5">
              <CalendarDays size={17} className="text-emerald-700" />
              {eventDate(event.date, {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}{' '}
              ·{' '}
              {new Date(event.date).toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <p className="flex items-center gap-2.5">
              <MapPin size={17} className="text-emerald-700" />
              {event.venue}, {event.city}
            </p>
          </div>
          <div className="mt-7 flex items-center gap-6 border-b border-line text-xs font-semibold">
            {[
              { value: 'about', text: 'Giới thiệu' },
              { value: 'tickets', text: 'Thông tin vé' },
              { value: 'policy', text: 'Điều khoản & Chính sách' },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`border-b-2 py-4 ${tab === t.value ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted'}`}
              >
                {t.text}
              </button>
            ))}
          </div>
          <div className="min-h-56 py-7">
            {tab === 'about' && (
              <>
                <h2 className="mb-4 text-xl font-bold">Một trải nghiệm không thể bỏ lỡ</h2>
                <p className="whitespace-pre-line text-sm leading-8 text-muted">
                  {event.description}
                </p>
                <div className="mt-7 rounded-xl bg-emerald-50 p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <Info size={17} />
                    Trước khi bạn đến
                  </h3>
                  <p className="mt-2 text-xs leading-7 text-emerald-900/70">
                    Vui lòng đến trước giờ diễn 30 phút và chuẩn bị vé QR trong mục Vé của tôi. Mỗi
                    vé chỉ có giá trị cho một lần vào cổng.
                  </p>
                </div>
              </>
            )}
            {tab === 'tickets' && (
              <div className="space-y-3">
                <h2 className="mb-5 text-xl font-bold">Chọn trải nghiệm dành cho bạn</h2>
                {tierViews.map(({ tier, theme }) => (
                  <div
                    key={tier.code}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${theme.surface}`}
                  >
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className={`h-3 w-3 rounded-sm ${theme.dot}`} />
                        {tier.name}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Khu {tier.code} · {tier.rows} hàng × {tier.seatsPerRow} ghế ·{' '}
                        {tier.rows * tier.seatsPerRow} ghế
                      </p>
                    </div>
                    <strong className={`shrink-0 ${theme.text}`}>{money(tier.price)}</strong>
                  </div>
                ))}
              </div>
            )}
            {tab === 'policy' && (
              <div className="space-y-5 text-sm leading-7 text-muted">
                <h2 className="text-xl font-bold text-ink">Mua vé an tâm</h2>
                <p>
                  Giới hạn 6 ghế/đơn và 1 đơn đang giữ ghế cho mỗi tài khoản. Ghế được giữ trong 10
                  phút để hoàn tất thanh toán.
                </p>
                <p>
                  Hoàn 100% trước sự kiện từ 7 ngày; hoàn 50% trong khoảng từ 48 giờ đến dưới 7
                  ngày. Không hoàn trong vòng 48 giờ trước sự kiện.
                </p>
              </div>
            )}
          </div>
        </div>
        <aside className="sticky top-6 rounded-2xl border border-line bg-white p-6 shadow-[0_10px_35px_-20px_#133d2530]">
          <p className="text-xs text-muted">Giá vé chỉ từ</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
            {money(priceOf(event))}
          </p>
          <p className="mt-2 text-[10px] text-muted">Đã bao gồm thuế và phí dịch vụ</p>
          <div className="my-6 space-y-3 border-y border-dashed border-stone-200 py-5">
            {tierViews.map(({ tier, theme }) => (
              <p key={tier.code} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted">
                  <span className={`h-2.5 w-2.5 rounded-sm ${theme.dot}`} />
                  {tier.name}
                  <span className="text-[9px]">· Khu {tier.code}</span>
                </span>
                <span className={`font-semibold ${theme.text}`}>{money(tier.price)}</span>
              </p>
            ))}
          </div>
          {staffWorkspace ? (
            <div>
              <p className="mb-4 text-xs leading-6 text-muted">
                Bạn đang xem thông tin công khai. Chức năng mua vé dành cho tài khoản Customer.
              </p>
              <Link href={staffWorkspace.href} className="btn-primary w-full">
                Về không gian quản lý
                <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <button disabled={!canBuy || loading} onClick={begin} className="btn-primary w-full">
              {canBuy
                ? 'Đặt vé ngay'
                : event.status === 'published' ||
                    (event.onSaleAt && new Date(event.onSaleAt).getTime() > Date.now())
                  ? 'Sắp mở bán'
                  : 'Đã ngừng bán'}
              <ArrowRight size={18} />
            </button>
          )}
          {event.onSaleAt &&
            !canBuy &&
            (event.status === 'published' || new Date(event.onSaleAt).getTime() > Date.now()) && (
              <p className="mt-3 text-center text-xs text-muted">
                Mở bán {eventDate(event.onSaleAt)} lúc{' '}
                {new Date(event.onSaleAt).toLocaleTimeString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          {error && !booking && (
            <p role="alert" className="mt-3 text-xs leading-6 text-red-600">
              {error}
            </p>
          )}
          <p className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted">
            <ShieldCheck size={15} className="text-emerald-700" />
            Vé chính thức · Giao dịch bảo mật
          </p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href)
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 border-t border-line pt-4 text-[11px] font-medium text-muted"
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            {copied ? 'Đã sao chép liên kết' : 'Chia sẻ với bạn bè'}
          </button>
        </aside>
      </div>
      {booking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Chọn ghế"
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="mb-1.5 text-[9px] font-bold tracking-[1.5px] text-emerald-700">
                  CHỌN VỊ TRÍ · TỐI ĐA 6 VÉ MỖI ĐƠN
                </p>
                <h2 className="text-lg font-bold sm:text-xl">
                  {queue ? 'Phòng chờ trải nghiệm' : 'Vị trí đẹp. Trải nghiệm trọn vẹn.'}
                </h2>
                <p className="mt-1.5 text-[11px] text-muted">{event.title}</p>
              </div>
              <button
                aria-label="Đóng sơ đồ ghế"
                onClick={() => setBooking(false)}
                disabled={busy}
                className="shrink-0 rounded-full p-2 hover:bg-stone-100"
              >
                <X size={21} />
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="shrink-0 border-b border-red-100 bg-red-50 px-5 py-3 text-xs leading-6 text-red-700"
              >
                {error}
              </p>
            )}
            {queue > 0 ? (
              <div className="flex min-h-80 flex-col items-center justify-center gap-5 p-8 text-center">
                <Users size={42} className="text-emerald-700" />
                <h3 className="text-xl font-semibold">Một chút chờ đợi, thật nhiều cảm xúc.</h3>
                <p className="max-w-md text-sm leading-7 text-muted">
                  Hệ thống đang chuẩn bị sơ đồ ghế cho bạn. Vui lòng chờ trong giây lát...
                </p>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint text-2xl font-bold tabular-nums">
                  {queue}
                </div>
                <button onClick={() => setBooking(false)} className="text-xs text-muted underline">
                  Rời phòng chờ
                </button>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_310px] md:overflow-hidden">
                <div className="min-w-0 p-4 sm:p-6 md:overflow-y-auto">
                  <SeatMap
                    tiers={tiers}
                    claims={claims}
                    selected={selected}
                    loaded={loaded}
                    availabilityError={availabilityError}
                    onToggle={toggle}
                    onRetry={refreshAvailability}
                    layout={event.seatLayout}
                  />
                </div>
                <aside className="flex min-h-0 flex-col border-t border-line bg-[#f8faf7] p-5 md:border-l md:border-t-0 md:p-6">
                  <p aria-live="polite" className="text-sm font-bold">
                    Vé của bạn <span className="ml-1 text-muted">({selected.length}/6)</span>
                  </p>
                  <p className="mt-2 text-[10px] leading-5 text-muted">
                    Tên hạng, vị trí và giá vé luôn đi cùng nhau.
                  </p>
                  <div className="my-5 min-h-28 flex-1 space-y-4 md:overflow-y-auto">
                    {selected.length ? (
                      tierViews.map(({ tier, theme }) => {
                        const codes = selected.filter((code) => code.startsWith(`${tier.code}-`))
                        if (!codes.length) return null
                        return (
                          <section key={tier.code} aria-label={`Vé ${tier.name}`}>
                            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold">
                              <span className={`h-2.5 w-2.5 rounded-sm ${theme.dot}`} />
                              {tier.name}
                              <span className="font-normal text-muted">· {codes.length} vé</span>
                            </h3>
                            <ul className="space-y-2">
                              {codes.map((code) => (
                                <li
                                  key={code}
                                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${theme.surface}`}
                                >
                                  <span
                                    className={`rounded px-1.5 py-1 text-[10px] font-bold ${theme.badge}`}
                                  >
                                    {code}
                                  </span>
                                  <span className="ml-auto text-[11px] font-semibold">
                                    {money(tier.price)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggle(code)}
                                    aria-label={`Bỏ ghế ${code}`}
                                    className="rounded-full p-1 text-muted hover:bg-white"
                                  >
                                    <X size={13} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-stone-200 bg-white/60 px-4 py-8 text-center">
                        <Ticket
                          size={30}
                          strokeWidth={1.3}
                          className="mx-auto mb-3 text-stone-400"
                        />
                        <p className="text-xs font-semibold">Một vị trí dành riêng cho bạn</p>
                        <p className="mt-2 text-[10px] leading-6 text-muted">
                          Chọn ghế ở bất kỳ khu vé nào.
                          <br />
                          Bạn có thể kết hợp các hạng trong cùng đơn.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 border-t border-dashed border-stone-200 pt-5">
                    <p className="flex items-center justify-between text-xs">
                      Tổng cộng
                      <output
                        aria-label="Tổng tiền vé"
                        className="text-2xl font-bold tracking-tight text-emerald-700"
                      >
                        {money(total)}
                      </output>
                    </p>
                    <p className="mt-2 text-[9px] text-muted">
                      {selected.length} vé · Đã bao gồm thuế và phí
                    </p>
                  </div>
                  <button
                    onClick={hold}
                    disabled={busy || !selected.length}
                    className="btn-primary mt-5 hidden w-full disabled:cursor-not-allowed md:flex"
                  >
                    {busy ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <>
                        Tiếp tục thanh toán
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                  <p className="mt-4 flex items-start gap-2 text-[9px] leading-5 text-muted">
                    <Clock3 size={14} className="mt-0.5 shrink-0" />
                    Ghế sẽ được giữ trong 10 phút kể từ khi bạn tiếp tục thanh toán.
                  </p>
                </aside>
              </div>
            )}
            {!queue && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 md:hidden">
                <div>
                  <p className="text-[9px] text-muted">{selected.length}/6 vé đã chọn</p>
                  <output
                    aria-label="Tổng tiền thanh toán"
                    className="mt-1 block text-lg font-bold text-emerald-700"
                  >
                    {money(total)}
                  </output>
                </div>
                <button
                  onClick={hold}
                  disabled={busy || !selected.length}
                  aria-label="Tiếp tục thanh toán"
                  className="btn-primary disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <>
                      Tiếp tục
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
