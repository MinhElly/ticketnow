'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  LoaderCircle,
  MapPin,
  QrCode,
  RotateCcw,
  Ticket,
  X,
} from 'lucide-react'
import type { Booking, Event } from '@/payload-types'
import { eventDate, mediaOf, money, statusLabels } from '@/lib/format'

export function MyTickets({
  bookings,
  qrs,
}: {
  bookings: Booking[]
  qrs: Record<string, string[]>
}) {
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const [qr, setQr] = useState<Booking | null>(null)
  const [refund, setRefund] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const visible = bookings.filter((b) => filter === 'all' || b.status === filter)
  async function submitRefund() {
    if (!refund) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ticketnow/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: refund.id, action: 'refund' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setRefund(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể hoàn vé.')
    } finally {
      setBusy(false)
    }
  }
  const hoursBefore =
    refund && typeof refund.event === 'object'
      ? (new Date(refund.event.date).getTime() - Date.now()) / 3600000
      : 0
  return (
    <main className="mx-auto min-h-[60vh] max-w-5xl px-5 py-10">
      <span className="text-[10px] font-semibold uppercase tracking-[2px] text-emerald-700">
        KHÔNG GIAN CUSTOMER
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Tấm vé đến những kỷ niệm.</h1>
      <p className="mt-3 text-xs text-muted">
        Tất cả vé, đơn hàng và trải nghiệm của bạn ở một nơi.
      </p>
      <div className="mb-7 mt-8 flex gap-5 overflow-auto border-b border-line">
        {[
          { id: 'all', text: 'Tất cả' },
          { id: 'confirmed', text: 'Vé của tôi' },
          { id: 'held', text: 'Chờ thanh toán' },
          { id: 'refunded', text: 'Đã hoàn vé' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 border-b-2 pb-4 text-xs font-semibold ${filter === f.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted'}`}
          >
            {f.text}
            <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[9px]">
              {f.id === 'all' ? bookings.length : bookings.filter((b) => b.status === f.id).length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="space-y-5">
          {visible.map((booking) => {
            const event = booking.event as Event
            if (!event || typeof event !== 'object') return null
            const image = mediaOf(event.image)
            const refundable =
              booking.status === 'confirmed' &&
              new Date(event.date).getTime() - Date.now() >= 48 * 3600000
            return (
              <article
                key={booking.id}
                className="overflow-hidden rounded-2xl border border-line bg-white sm:flex"
              >
                <Link
                  href={`/events/${event.slug}`}
                  className="relative block min-h-40 shrink-0 bg-stone-100 sm:w-52"
                >
                  {image?.url && (
                    <Image
                      src={image.url}
                      alt={image.alt}
                      fill
                      sizes="210px"
                      className="object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <span className="absolute bottom-4 left-4 text-lg font-extrabold uppercase text-white">
                    {event.subtitle}
                  </span>
                </Link>
                <div className="flex-1 p-5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : booking.status === 'held' ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-muted'}`}
                    >
                      {statusLabels[booking.status]}
                    </span>
                    <span className="text-[10px] text-muted">{booking.reference}</span>
                  </div>
                  <Link href={`/events/${event.slug}`} className="mt-3 block text-sm font-bold">
                    {event.title}
                  </Link>
                  <p className="mt-3 flex items-center gap-2 text-[10px] text-muted">
                    <CalendarDays size={13} />
                    {eventDate(event.date)}
                    <span className="mx-1">·</span>
                    <MapPin size={13} />
                    {event.city}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {booking.seats.map((s) => (
                      <span
                        key={s.code}
                        className="rounded border border-line px-2 py-1 text-[9px] text-muted"
                      >
                        Ghế {s.code}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-xs font-semibold text-emerald-700">
                      {money(booking.total)}
                      {booking.status === 'refunded' && (
                        <span className="ml-2 font-normal text-muted">
                          · Đã hoàn {money(booking.refundAmount ?? 0)}
                        </span>
                      )}
                    </p>
                    <div className="flex gap-3">
                      {refundable && (
                        <button
                          onClick={() => {
                            setRefund(booking)
                            setError('')
                          }}
                          className="flex items-center gap-1.5 text-[10px] text-muted"
                        >
                          <RotateCcw size={13} />
                          Hoàn vé
                        </button>
                      )}
                      {booking.status === 'confirmed' && (
                        <button
                          onClick={() => setQr(booking)}
                          className="btn-primary min-h-0! px-3! py-2! text-[10px]!"
                        >
                          <QrCode size={14} />
                          Xem vé QR
                        </button>
                      )}
                      {booking.status === 'held' && (
                        <Link
                          href={`/checkout/${booking.id}`}
                          className="btn-primary min-h-0! px-3! py-2! text-[10px]!"
                        >
                          Thanh toán
                          <ArrowRight size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-16 text-center">
          <Ticket size={44} strokeWidth={1.3} className="mx-auto mb-5 text-emerald-700" />
          <h2 className="text-xl font-bold">Câu chuyện của bạn bắt đầu từ đây</h2>
          <p className="mt-3 text-xs leading-6 text-muted">
            Bạn chưa có vé trong mục này. Khám phá một sự kiện và tạo nên kỷ niệm mới nhé.
          </p>
          <Link href="/#explore" className="btn-primary mt-6">
            Tìm sự kiện yêu thích
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 p-5 backdrop-blur-sm"
          onClick={() => setQr(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Vé điện tử"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-md overflow-auto rounded-3xl bg-white p-7"
          >
            <button
              onClick={() => setQr(null)}
              className="absolute right-4 top-4 p-2"
              aria-label="Đóng vé"
            >
              <X size={18} />
            </button>
            <div className="mb-5 flex items-center gap-2 text-xs font-bold text-emerald-700">
              <Ticket size={19} />
              TICKETNOW · E-TICKET
            </div>
            <h2 className="text-lg font-bold leading-7">{(qr.event as Event).title}</h2>
            <p className="mt-2 text-[10px] text-muted">
              {qr.reference} · {eventDate((qr.event as Event).date)}
            </p>
            <div className="mt-5 space-y-6">
              {qr.seats.map((seat, index) => (
                <div
                  key={seat.code}
                  className="rounded-xl border border-dashed border-stone-300 p-4 text-center"
                >
                  <div
                    className="mx-auto h-48 w-48 [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: qrs[qr.id]?.[index] ?? '' }}
                  />
                  <p className="mt-2 text-sm font-bold">GHẾ {seat.code}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {money(seat.price)} · Vé có hiệu lực một lần
                  </p>
                  <button
                    onClick={() => {
                      const svg = qrs[qr.id]?.[index]
                      if (!svg) return
                      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${qr.reference}-${seat.code}.svg`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="mx-auto mt-3 flex items-center gap-2 text-[10px] font-semibold text-emerald-700"
                  >
                    <Download size={13} />
                    Tải vé QR
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-[10px] leading-5 text-muted">
              Vui lòng bảo mật mã QR và xuất trình tại cổng vào sự kiện.
            </p>
          </section>
        </div>
      )}
      {refund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-5 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Xác nhận hoàn vé"
            className="w-full max-w-md rounded-2xl bg-white p-7"
          >
            <RotateCcw className="mb-4 text-emerald-700" size={30} />
            <h2 className="text-xl font-bold">Xác nhận hoàn vé?</h2>
            <p className="mt-4 text-xs leading-7 text-muted">
              Tất cả {refund.seats.length} vé của đơn {refund.reference} sẽ bị vô hiệu hóa và các
              ghế sẽ được nhả. Thao tác này không thể hoàn tác.
            </p>
            <div className="my-5 rounded-xl bg-emerald-50 p-4">
              <p className="text-[10px] text-emerald-800 font-medium">
                Số tiền hoàn dự kiến ({hoursBefore >= 168 ? '100%' : '50%'})
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-800">
                {money(Math.round(refund.total * (hoursBefore >= 168 ? 1 : 0.5)))}
              </p>
            </div>
            {error && (
              <p className="mb-4 text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setRefund(null)}
                disabled={busy}
                className="btn-secondary flex-1"
              >
                Giữ lại vé
              </button>
              <button onClick={submitRefund} disabled={busy} className="btn-primary flex-1">
                {busy ? <LoaderCircle className="animate-spin" size={17} /> : 'Xác nhận hoàn'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
