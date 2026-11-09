'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  MapPin,
  QrCode,
  ShieldCheck,
  Sparkles,
  Ticket,
  Wallet,
  X,
} from 'lucide-react'
import type { Booking, Event } from '@/payload-types'
import { eventDate, mediaOf, money, statusLabels } from '@/lib/format'

interface PaymentModalData {
  orderCode: number
  amount: number
  qrCode: string
  checkoutUrl?: string
  bankName: string
  accountNumber: string
  accountName: string
  transferContent: string
}

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
  const [paymentModal, setPaymentModal] = useState<PaymentModalData | null>(null)
  const [generatedQr, setGeneratedQr] = useState<string>('')
  const [copiedField, setCopiedField] = useState<string>('')

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

  function copyToClipboard(text: string, fieldName: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(''), 2000)
    }
  }

  // Step 1: Open Payment Modal with QR
  async function handleOpenPayment() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ticketnow/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: booking.id, action: 'create-payment', method }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Không thể tạo phiên thanh toán.')
      }

      const pData: PaymentModalData = data.payment || {
        orderCode: Math.floor(100000 + Math.random() * 900000),
        amount: booking.total,
        qrCode: '',
        bankName: 'MBBank (Ngân hàng Quân Đội)',
        accountNumber: '0345678902',
        accountName: 'TICKETNOW VIETNAM',
        transferContent: `TN${booking.id.slice(0, 8).toUpperCase()}`,
      }

      setPaymentModal(pData)

      // Generate local QR Code Data URL
      try {
        const qrPayload =
          pData.qrCode ||
          `00020101021238540010A000000727012400069704220110034567890208QRIBFTTA5303704540${pData.amount}5802VN62180814${pData.transferContent}6304MOCK`
        const url = await QRCode.toDataURL(qrPayload, {
          width: 320,
          margin: 2,
          color: { dark: '#163b2c', light: '#ffffff' },
        })
        setGeneratedQr(url)
      } catch {
        // Fallback to online VietQR image
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể khởi tạo thanh toán.')
    } finally {
      setBusy(false)
    }
  }

  // Step 2: Finalize Payment
  async function handleConfirmPayment(orderCode?: number) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/ticketnow/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: booking.id,
          action: 'confirm-payment',
          method,
          orderCode: orderCode || paymentModal?.orderCode,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Thanh toán chưa thành công.')
      }
      setPaymentModal(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể hoàn tất thanh toán.')
    } finally {
      setBusy(false)
    }
  }

  async function mutateAction(action: string) {
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
        throw new Error(data.error)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể kết nối.')
    } finally {
      setBusy(false)
    }
  }

  const vietQrImageUrl = paymentModal
    ? `https://img.vietqr.io/image/MB-0345678902-compact2.png?amount=${paymentModal.amount}&addInfo=${paymentModal.transferContent}&accountName=TICKETNOW%20VIETNAM`
    : ''

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
                  label: 'Chuyển khoản ngân hàng (VietQR)',
                  desc: 'Quét mã VietQR chuyển khoản tức thì 24/7 bằng app ngân hàng',
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
                  className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                    method === m.id
                      ? 'border-emerald-500 bg-emerald-50/50'
                      : 'border-line bg-white'
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-emerald-800">
                    <m.icon size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-xs font-semibold">{m.label}</span>
                    <span className="mt-1.5 block text-[10px] text-muted">{m.desc}</span>
                  </span>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      method === m.id
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-stone-300'
                    }`}
                  >
                    {method === m.id && <Check size={10} />}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-stone-100 p-4 text-xs leading-6 text-muted">
              <strong className="text-ink">Giao dịch an toàn &amp; bảo mật.</strong> Toàn bộ thông
              tin thanh toán được mã hóa và xử lý theo chuẩn ngân hàng quốc gia Napas / VietQR.
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
              onClick={handleOpenPayment}
              disabled={!agreed || busy}
              className="btn-primary mt-6 w-full"
            >
              {busy ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <>
                  {method === 'bank' ? (
                    <>
                      <QrCode size={16} />
                      Hiển thị mã VietQR
                    </>
                  ) : (
                    <>
                      Xác nhận thanh toán
                      <ArrowRight size={16} />
                    </>
                  )}
                </>
              )}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-muted">
              <ShieldCheck size={13} />
              Giao dịch an toàn được bảo vệ bởi TicketNow
            </p>

            <button
              onClick={() => mutateAction('cancel')}
              disabled={busy}
              className="mt-5 w-full text-[10px] text-muted underline"
            >
              Hủy đơn và nhả ghế
            </button>

            <button
              onClick={() => mutateAction('fail')}
              disabled={busy}
              className="mt-3 w-full text-[9px] text-stone-400"
            >
              Thử kịch bản thanh toán thất bại
            </button>
          </aside>
        </div>
      )}

      {/* VIETQR & PAYMENT DIALOG MODAL */}
      {paymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
          onClick={() => setPaymentModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thanh toán chuyển khoản VietQR"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl"
          >
            <button
              onClick={() => setPaymentModal(null)}
              className="absolute right-5 top-5 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Đóng"
            >
              <X size={20} />
            </button>

            <div className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-700">
              <QrCode size={18} />
              VIETQR · QUÉT MÃ CHUYỂN KHOẢN TỨC THÌ
            </div>

            <h2 className="text-xl font-bold">Thanh toán đơn hàng {booking.reference}</h2>
            <p className="mt-1 text-xs text-muted">
              Mở ứng dụng ngân hàng bất kỳ để quét mã QR và xác nhận chuyển khoản.
            </p>

            {/* QR CODE CONTAINER */}
            <div className="my-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/30 p-5">
              <div className="relative h-60 w-60 overflow-hidden rounded-xl bg-white p-2 shadow-sm">
                {generatedQr ? (
                  <img
                    src={generatedQr}
                    alt="Mã VietQR"
                    className="h-full w-full object-contain"
                  />
                ) : vietQrImageUrl ? (
                  <img
                    src={vietQrImageUrl}
                    alt="Mã VietQR"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                    <LoaderCircle size={28} className="animate-spin text-emerald-700" />
                  </div>
                )}
              </div>

              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-800">
                <Sparkles size={12} />
                Quét mã để tự động điền số tài khoản &amp; nội dung
              </span>
            </div>

            {/* BANK ACCOUNT DETAILS */}
            <div className="space-y-2.5 rounded-2xl bg-stone-50 p-4 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-stone-200/60">
                <span className="text-muted">Ngân hàng</span>
                <span className="font-semibold text-ink">{paymentModal.bankName}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-stone-200/60">
                <span className="text-muted">Chủ tài khoản</span>
                <span className="font-semibold text-ink">{paymentModal.accountName}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-stone-200/60">
                <span className="text-muted">Số tài khoản</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-ink">
                    {paymentModal.accountNumber}
                  </span>
                  <button
                    onClick={() => copyToClipboard(paymentModal.accountNumber, 'acc')}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    title="Sao chép"
                  >
                    {copiedField === 'acc' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-stone-200/60">
                <span className="text-muted">Số tiền</span>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-emerald-700">
                    {money(paymentModal.amount)}
                  </strong>
                  <button
                    onClick={() => copyToClipboard(String(paymentModal.amount), 'amount')}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    title="Sao chép"
                  >
                    {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-muted">Nội dung chuyển khoản</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-800">
                    {paymentModal.transferContent}
                  </span>
                  <button
                    onClick={() => copyToClipboard(paymentModal.transferContent, 'memo')}
                    className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                    title="Sao chép"
                  >
                    {copiedField === 'memo' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {copiedField && (
              <p className="mt-2 text-center text-[10px] text-emerald-700 font-medium animate-pulse">
                Đã sao chép vào bộ nhớ tạm!
              </p>
            )}

            {/* ACTION BUTTONS */}
            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => handleConfirmPayment()}
                disabled={busy}
                className="btn-primary w-full py-3 text-sm justify-center"
              >
                {busy ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={17} />
                    Tôi đã chuyển khoản thành công
                  </>
                )}
              </button>

              <button
                onClick={() => handleConfirmPayment()}
                disabled={busy}
                className="btn-secondary w-full py-2.5 text-xs justify-center"
              >
                Mô phỏng thanh toán thành công (Test Mock)
              </button>

              {paymentModal.checkoutUrl && (
                <a
                  href={paymentModal.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs text-muted hover:text-emerald-700 hover:underline"
                >
                  <ExternalLink size={13} />
                  Mở cổng thanh toán PayOS trực tiếp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
