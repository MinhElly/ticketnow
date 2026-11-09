'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Ticket,
  Wallet,
} from 'lucide-react'
import type { Booking, Event } from '@/payload-types'
import { eventDate, mediaOf, money, statusLabels } from '@/lib/format'

export function Checkout({ booking }: { booking: Booking }) {
  const router = useRouter()
  const event = booking.event as Event
  const image = mediaOf(event.image)
  const [method, setMethod] = useState('bank')
  const [agreed, setAgreed] = useState(false)
  const [seconds, setSeconds] = useState(
    Math.max(0, Math.floor((new Date(booking.expiresAt).getTime() - Date.now()) / 1000)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (booking.status !== 'held') return
    const timer = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.floor((new Date(booking.expiresAt).getTime() - Date.now()) / 1000)),
        ),
      1000,
    )
    return () => clearInterval(timer)
  }, [booking.expiresAt, booking.status])
  async function mutate(action: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ticketnow/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: booking.id, action, method }),
      })
      const data = await response.json()
      if (!response.ok) {
        router.refresh()
        throw new Error(data.error)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể kết nối.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto min-h-[60vh] max-w-5xl px-5 py-9">
      <Link
        href={`/events/${event.slug}`}
        className="mb-7 inline-flex items-center gap-2 text-xs text-muted"
      >
        <ArrowLeft size={14} />
        Quay lại sự kiện
      </Link>
      <div className="mb-8 flex items-center gap-3 text-xs">
        <span className="flex items-center gap-2 text-emerald-700">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50">
            <Check size={13} />
          </span>
          Chọn vé
        </span>
        <span className="h-px w-8 bg-line" />
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint">2</span>
          Thanh toán
        </span>
        <span className="h-px w-8 bg-line" />
        <span className="text-muted">3. Nhận vé</span>
      </div>
      {booking.status === 'confirmed' ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-10 text-center">
          <CheckCircle2 size={55} strokeWidth={1.4} className="mx-auto mb-6 text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Một tấm vé. Một kỷ niệm mới.
          </span>
          <h1 className="mt-3 text-3xl font-bold">Bạn đã sẵn sàng cho trải nghiệm!</h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            Đơn {booking.reference} đã được xác nhận.
            <br />
            Vé điện tử của bạn đang chờ trong “Vé của tôi”.
          </p>
          <p className="mt-3 text-[11px] text-emerald-800 font-medium">
            Thanh toán thành công · Vé đã được lưu vào hệ thống
          </p>
          <Link href="/customer/tickets" className="btn-primary mt-7">
            Xem vé QR của tôi
            <Ticket size={17} />
          </Link>
        </div>
      ) : booking.status !== 'held' || seconds <= 0 ? (
        <div className="rounded-3xl border border-line bg-white p-12 text-center">
          <Clock3 size={44} className="mx-auto mb-5 text-muted" />
          <h1 className="text-2xl font-bold">
            {seconds <= 0 && booking.status === 'held'
              ? 'Thời gian giữ ghế đã kết thúc'
              : statusLabels[booking.status]}
          </h1>
          <p className="mt-4 text-sm text-muted">
            Ghế đã được nhả. Bạn có thể quay lại và chọn những vị trí khác.
          </p>
          <Link href={`/events/${event.slug}`} className="btn-primary mt-7">
            Chọn vé mới
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_350px]">
          <section>
            <h1 className="text-3xl font-bold tracking-tight">Chỉ một bước nữa thôi.</h1>
            <p className="mt-3 text-xs leading-6 text-muted">
              Hoàn tất thanh toán để giữ trọn khoảnh khắc của bạn.
            </p>
            <div className="my-7 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
              <span className="flex items-center gap-2 text-xs">
                <Clock3 size={18} />
                Thời gian giữ ghế còn lại
              </span>
              <strong className="font-mono text-xl">
                {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                {String(seconds % 60).padStart(2, '0')}
              </strong>
            </div>
            <h2 className="mb-4 text-base font-bold">Phương thức thanh toán</h2>
            <div className="space-y-3">
              {[
                {
                  id: 'bank',
                  label: 'Chuyển khoản ngân hàng',
                  desc: 'VietQR · Quét mã chuyển khoản tức thì',
                  icon: Banknote,
                },
                {
                  id: 'card',
                  label: 'Thẻ thanh toán quốc tế',
                  desc: 'Visa / Mastercard / JCB',
                  icon: CreditCard,
                },
                {
                  id: 'wallet',
                  label: 'Ví điện tử',
                  desc: 'Ví điện tử MoMo / ZaloPay',
                  icon: Wallet,
                },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${method === m.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-line bg-white'}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-emerald-800">
                    <m.icon size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-xs font-semibold">{m.label}</span>
                    <span className="mt-1.5 block text-[10px] text-muted">{m.desc}</span>
                  </span>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${method === m.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300'}`}
                  >
                    {method === m.id && <Check size={10} />}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-stone-100 p-4 text-xs leading-6 text-muted">
              <strong className="text-ink">Giao dịch an toàn &amp; bảo mật.</strong> Toàn bộ thông tin
              thanh toán được xử lý và mã hóa theo chuẩn an ninh quốc tế.
            </div>
            <label className="mt-6 flex items-start gap-3 text-[11px] leading-6 text-muted">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1.5 accent-emerald-700"
              />
              Tôi đồng ý với điều kiện đặt vé và chính sách bảo mật của sự kiện.
            </label>
          </section>
          <aside className="h-fit rounded-2xl border border-line bg-white p-5">
            <div className="flex gap-3">
              {image?.url && (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              )}
              <div>
                <h2 className="text-xs font-bold leading-6">{event.title}</h2>
                <p className="mt-1 text-[10px] text-muted">{eventDate(event.date)}</p>
              </div>
            </div>
            <div className="my-5 border-y border-dashed border-stone-200 py-4 text-[11px]">
              <p className="mb-4 flex justify-between text-muted">
                <span>Mã đơn</span>
                <span className="font-semibold text-ink">{booking.reference}</span>
              </p>
              {booking.seats.map((s) => (
                <p key={s.code} className="my-2 flex justify-between">
                  <span>Ghế {s.code}</span>
                  <span>{money(s.price)}</span>
                </p>
              ))}
            </div>
            <p className="flex items-center justify-between text-xs">
              Tổng thanh toán
              <strong className="text-xl text-emerald-700">{money(booking.total)}</strong>
            </p>
            <p className="mt-2 text-right text-[9px] text-muted">Đã bao gồm thuế và phí</p>
            {error && (
              <p role="alert" className="mt-4 text-xs leading-6 text-red-600">
                {error}
              </p>
            )}
            <button
              onClick={() => mutate('pay')}
              disabled={!agreed || busy}
              className="btn-primary mt-6 w-full"
            >
              {busy ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <>
                  Xác nhận thanh toán
                  <ArrowRight size={16} />
                </>
              )}
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-muted">
              <ShieldCheck size={13} />
              Giao dịch an toàn được bảo vệ bởi TicketNow
            </p>
            <button
              onClick={() => mutate('cancel')}
              disabled={busy}
              className="mt-5 w-full text-[10px] text-muted underline"
            >
              Hủy đơn và nhả ghế
            </button>
            <button
              onClick={() => mutate('fail')}
              disabled={busy}
              className="mt-3 w-full text-[9px] text-stone-400"
            >
              Thử kịch bản thanh toán thất bại
            </button>
          </aside>
        </div>
      )}
    </main>
  )
}
