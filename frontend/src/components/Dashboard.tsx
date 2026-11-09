'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  Pencil,
  QrCode,
  Search,
  Shield,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import type { Booking, Event, User } from '@/payload-types'
import { eventDate, mediaOf, money, statusLabels } from '@/lib/format'
import { EventBuilder } from './EventBuilder'
import { FloorplanCanvas } from './FloorplanCanvas'
import { readSeatLayout } from '@/lib/seat-layout'
import { AdminStats } from '@/features/admin/components/AdminStats'
import { AdminUserTable } from '@/features/admin/components/AdminUserTable'

export function Dashboard({
  user,
  events,
  bookings,
  users = [],
}: {
  user: User
  events: Event[]
  bookings: Booking[]
  users?: User[]
}) {
  const isAdmin = user.role === 'admin'
  const router = useRouter()
  const [tab, setTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditing] = useState<string | undefined>()
  const [previewId, setPreview] = useState<string | null>(null)
  const editing = events.find((event) => event.id === editingId)
  const preview = events.find((event) => event.id === previewId)
  const previewTiers = ((preview?.tiers || (preview as any)?.ticketTiers || []) as Array<{
    id?: string | null
    name: string
    code: string
    price: number
    rows: number
    seatsPerRow: number
    capacity?: number
    currency?: string
    color?: string
  }>)
  const previewLayout = preview ? readSeatLayout(preview.seatLayout, previewTiers as any) : null
  const [refreshing, startRefresh] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scan, setScan] = useState('')
  const [scanResult, setScanResult] = useState('')
  const [roleConfirm, setRoleConfirm] = useState<{ id: string; role: string; name: string } | null>(
    null,
  )
  const [eventConfirm, setEventConfirm] = useState<{
    id: string
    status: string
    title: string
  } | null>(null)
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const revenue = confirmed.reduce((sum, b) => sum + b.total, 0)
  const count = confirmed.reduce((sum, b) => sum + b.seats.length, 0)
  const nav = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'events', label: isAdmin ? 'Tất cả sự kiện' : 'Sự kiện của tôi', icon: CalendarDays },
    { id: 'bookings', label: 'Đơn hàng & Giao dịch', icon: Ticket },
    ...(isAdmin ? [{ id: 'users', label: 'Tài khoản & Phân quyền', icon: Users }] : []),
    { id: 'scan', label: 'Soát vé tại cổng', icon: QrCode },
    { id: 'access', label: 'Quyền truy cập', icon: Shield },
  ]
  async function mutate(data: Record<string, unknown>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/ticketnow/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setNotice('Đã lưu thay đổi thành công.')
      setRoleConfirm(null)
      setEventConfirm(null)
      startRefresh(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu thay đổi.')
    } finally {
      setBusy(false)
    }
  }

  async function checkTicket(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setScanResult('')
    try {
      const response = await fetch('/api/ticketnow/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: scan.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setScanResult(`Vé hợp lệ · ${result.reference} · Ghế ${result.seat}. Đã ghi nhận vào cổng.`)
      setScan('')
      startRefresh(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xác thực vé.')
    } finally {
      setBusy(false)
    }
  }
  const visibleEvents = events.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()))
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-[1440px]">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-white px-4 py-8 lg:block">
        <div className="mb-8 px-3">
          <span
            className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${isAdmin ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}
          >
            {isAdmin ? 'ADMIN WORKSPACE' : 'ORGANIZER WORKSPACE'}
          </span>
          <p className="mt-4 text-sm font-bold">{user.name}</p>
          <p className="mt-1.5 text-[10px] text-muted">
            {isAdmin ? 'Quản trị & Vận hành' : 'Không gian nhà tổ chức'}
          </p>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setTab(n.id)
                setError('')
                setQuery('')
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-[11px] font-medium transition ${tab === n.id ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-muted hover:bg-stone-50'}`}
            >
              <n.icon size={17} />
              {n.label}
              {tab === n.id && <ChevronRight size={13} className="ml-auto" />}
            </button>
          ))}
        </nav>
        <div className="mt-12 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <Shield size={21} className="text-emerald-700" />
          <p className="mt-3 text-[10px] font-semibold">Phân quyền ở phía máy chủ</p>
          <p className="mt-2 text-[10px] leading-5 text-muted">
            {isAdmin
              ? 'Bạn có thể quản lý mọi sự kiện và cấp quyền cho người dùng.'
              : 'Bạn chỉ được truy cập dữ liệu thuộc sự kiện do mình tổ chức.'}
          </p>
        </div>
        <Link href="/" className="mt-7 flex items-center gap-2 px-3 text-[10px] text-muted">
          <ArrowLeft size={13} />
          Về trang khám phá
        </Link>
      </aside>
      <div className="min-w-0 flex-1 bg-[#f8faf7] px-5 py-8 sm:px-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[10px] text-muted">
              Không gian {isAdmin ? 'Admin' : 'Organizer'}
              <span className="mx-2">/</span>
              {nav.find((n) => n.id === tab)?.label}
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">
              {tab === 'overview'
                ? `Chào ${user.name.split(' ').slice(-1)[0]}, một ngày thật nhiều kết nối.`
                : nav.find((n) => n.id === tab)?.label}
            </h1>
            <p className="mt-2 text-xs text-muted">
              {isAdmin
                ? 'Giám sát và quản lý toàn bộ hoạt động trên TicketNow.'
                : 'Mọi thứ bạn cần để tạo nên một sự kiện đáng nhớ.'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditing(undefined)
              setCreating(true)
              setError('')
            }}
            className="btn-primary"
          >
            <Plus size={16} />
            Tạo sự kiện mới
          </button>
        </div>
        <nav className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setTab(n.id)
                setQuery('')
                setError('')
              }}
              className={`shrink-0 rounded-lg border px-3 py-2 text-[10px] ${tab === n.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-muted'}`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"
          >
            <CheckCircle2 size={17} />
            {notice}
            <button onClick={() => setNotice('')} aria-label="Đóng thông báo" className="ml-auto">
              <X size={15} />
            </button>
          </div>
        )}
        {error && !creating && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-4 text-xs leading-6 text-red-700"
          >
            {error}
          </div>
        )}
        {tab === 'overview' && (
          <AdminStats
            eventsCount={events.length}
            onSaleEventsCount={events.filter((e) => e.status === 'on_sale').length}
            ticketsSoldCount={count}
            revenue={revenue}
            heldBookingsCount={
              bookings.filter(
                (b) => b.status === 'held' && new Date(b.expiresAt).getTime() > Date.now(),
              ).length
            }
            bookings={bookings}
          />
        )}
        {(tab === 'overview' || tab === 'events') && (
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
              <h2 className="text-sm font-bold">
                {isAdmin ? 'Quản lý sự kiện' : 'Sự kiện của bạn'}
                <span className="ml-2 text-xs font-normal text-muted">({events.length})</span>
              </h2>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-muted" />
                <input
                  placeholder="Tìm theo tên sự kiện..."
                  aria-label="Tìm sự kiện quản lý"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-lg border border-line py-2 pl-9 pr-3 text-[10px] outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-[10px]">
                <thead className="bg-stone-50 text-muted">
                  <tr>
                    {['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Vé đã bán', 'Quản lý'].map((c) => (
                      <th key={c} className="px-5 py-3.5 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => {
                    const image = mediaOf(event.image)
                    const sold = confirmed
                      .filter(
                        (b) =>
                          String(typeof b.event === 'object' ? b.event.id : b.event) ===
                          String(event.id),
                      )
                      .reduce((sum, b) => sum + b.seats.length, 0)
                    const eventTiers = ((event.tiers || (event as any).ticketTiers || []) as Array<{
                      rows?: number
                      seatsPerRow?: number
                      capacity?: number
                      code?: string
                      name?: string
                    }>)
                    const totalCapacity = eventTiers.reduce(
                      (s, t) =>
                        s + (t.capacity ?? (t.rows && t.seatsPerRow ? t.rows * t.seatsPerRow : 0)),
                      0,
                    )
                    return (
                      <tr key={event.id} className="border-t border-line">
                        <td className="max-w-72 px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-stone-100">
                              {image?.url && (
                                <Image
                                  src={image.url}
                                  alt={image.alt}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold leading-5">{event.title}</p>
                              <p className="mt-1 text-[9px] text-muted">{event.city}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-muted">{eventDate(event.date)}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[9px] ${event.status === 'on_sale' ? 'bg-emerald-50 text-emerald-700' : event.status === 'draft' ? 'bg-stone-100 text-muted' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {statusLabels[event.status]}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {sold}
                          {totalCapacity > 0 ? (
                            <span className="ml-1 text-muted">
                              / {totalCapacity}
                            </span>
                          ) : eventTiers.length > 0 ? (
                            <span className="ml-1 text-muted">
                              / 0
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {event.status === 'draft' && (
                              <button
                                type="button"
                                aria-label={`Sửa bản nháp ${event.title}`}
                                onClick={() => {
                                  setEditing(event.id)
                                  setCreating(true)
                                  setError('')
                                }}
                                className="text-emerald-700 hover:text-emerald-900"
                                disabled={busy || refreshing}
                              >
                                <Pencil size={15} />
                              </button>
                            )}
                            {readSeatLayout(event.seatLayout, eventTiers as any) && (
                              <button
                                type="button"
                                aria-label={`Xem sơ đồ ${event.title}`}
                                onClick={() => setPreview(event.id)}
                                className="text-muted hover:text-emerald-700"
                                disabled={busy || refreshing}
                              >
                                <LayoutDashboard size={15} />
                              </button>
                            )}
                            <select
                              value={event.status}
                              aria-label={`Trạng thái ${event.title}`}
                              disabled={busy || refreshing || event.status === 'cancelled'}
                              onChange={(e) =>
                                setEventConfirm({
                                  id: event.id,
                                  status: e.target.value,
                                  title: event.title,
                                })
                              }
                              className="max-w-28 rounded border border-line bg-white p-1.5 text-[9px]"
                            >
                              <option value="draft" disabled>
                                Bản nháp
                              </option>
                              <option value="published">Sắp mở bán</option>
                              <option value="on_sale">Mở bán</option>
                              <option value="closed">Đóng bán</option>
                              <option value="cancelled">Hủy sự kiện</option>
                            </select>
                            {event.status !== 'draft' && (
                              <Link
                                href={`/events/${event.slug}`}
                                aria-label={`Mở ${event.title}`}
                                className="text-muted hover:text-emerald-700"
                              >
                                <ArrowUpRight size={16} />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!visibleEvents.length && (
                <div className="py-14 text-center">
                  <CalendarDays size={30} className="mx-auto mb-4 text-stone-300" />
                  <p className="text-xs text-muted">
                    {query
                      ? 'Không tìm thấy sự kiện phù hợp.'
                      : 'Chưa có sự kiện. Bắt đầu ý tưởng đầu tiên của bạn.'}
                  </p>
                  <button
                    onClick={() => {
                      setEditing(undefined)
                      setCreating(true)
                    }}
                    className="mt-4 text-xs font-semibold text-emerald-700"
                  >
                    Tạo sự kiện mới
                    <Plus size={14} className="ml-1 inline" />
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
        {tab === 'bookings' && (
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="border-b border-line p-5">
              <h2 className="text-sm font-bold">
                Đơn hàng & Giao dịch{' '}
                <span className="font-normal text-muted">({bookings.length})</span>
              </h2>
              <p className="mt-2 text-[10px] text-muted">
                Giao dịch thanh toán và hoàn tiền được xử lý an toàn qua hệ thống.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-[10px]">
                <thead className="bg-stone-50 text-muted">
                  <tr>
                    {['Mã đơn', 'Sự kiện', 'Vé', 'Tổng tiền', 'Trạng thái'].map((s) => (
                      <th className="px-5 py-4 font-medium" key={s}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-t border-line">
                      <td className="px-5 py-4 font-semibold">
                        {b.reference}
                        <p className="mt-2 text-[9px] font-normal text-muted">
                          {eventDate(b.createdAt)}
                        </p>
                      </td>
                      <td className="max-w-60 px-5 py-4 leading-6">
                        {typeof b.event === 'object' ? b.event.title : 'Sự kiện không còn khả dụng'}
                      </td>
                      <td className="px-5 py-4">{b.seats.length}</td>
                      <td className="px-5 py-4 font-semibold">{money(b.total)}</td>
                      <td className="px-5 py-4 text-muted">{statusLabels[b.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bookings.length && (
                <p className="py-16 text-center text-xs text-muted">
                  Chưa có đơn hàng nào được ghi nhận.
                </p>
              )}
            </div>
          </section>
        )}
        {tab === 'users' && isAdmin && (
          <AdminUserTable
            users={users}
            currentUserId={user.id}
            busy={busy}
            onRoleChange={(id, role, name) => setRoleConfirm({ id, role, name })}
          />
        )}
        {tab === 'scan' && (
          <section className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-7">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <QrCode size={29} />
            </span>
            <h2 className="text-xl font-bold">Chào đón những trải nghiệm.</h2>
            <p className="mt-3 text-xs leading-7 text-muted">
              Quét mã bằng thiết bị đọc QR hoặc dán nội dung mã vào ô bên dưới. Mỗi vé chỉ được xác
              nhận một lần{isAdmin ? '.' : ', và phải thuộc sự kiện của bạn.'}
            </p>
            <form onSubmit={checkTicket} className="mt-6">
              <label className="text-xs font-semibold">
                Nội dung mã QR
                <input
                  autoFocus
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  placeholder="TN:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:A-1-1"
                  required
                  className="field mt-3 font-mono text-[11px]!"
                />
              </label>
              <button disabled={busy} className="btn-primary mt-4 w-full">
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <>
                    Xác thực & Ghi nhận vào cổng
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
            {scanResult && (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-xs leading-7 text-emerald-800">
                <CheckCircle2 className="mb-2" size={22} />
                {scanResult}
              </div>
            )}
            <p className="mt-5 text-[10px] leading-6 text-muted">
              Dành cho thiết bị đọc QR ở chế độ nhập bàn phím. Phiên bản này chưa hỗ trợ mở camera
              trong trình duyệt.
            </p>
          </section>
        )}
        {tab === 'access' && (
          <section className="rounded-xl border border-line bg-white p-7">
            <h2 className="text-xl font-bold">Ba vai trò. Ba không gian độc lập.</h2>
            <p className="mt-3 text-xs leading-7 text-muted">
              Ẩn nút không phải là bảo mật. Các trang, API và dữ liệu đều kiểm tra vai trò và chủ sở
              hữu tại máy chủ.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                {
                  role: 'Customer',
                  icon: Ticket,
                  color: 'bg-blue-50 text-blue-700',
                  permissions: [
                    'Khám phá sự kiện công khai',
                    'Đặt tối đa 6 ghế/đơn',
                    'Thanh toán và nhận vé QR',
                    'Chỉ xem và hoàn vé của mình',
                  ],
                },
                {
                  role: 'Organizer',
                  icon: CalendarDays,
                  color: 'bg-emerald-50 text-emerald-700',
                  permissions: [
                    'Tạo sự kiện, cấu hình hạng vé',
                    'Công bố và điều khiển mở bán',
                    'Chỉ quản lý sự kiện của mình',
                    'Soát vé thuộc sự kiện của mình',
                  ],
                },
                {
                  role: 'Admin',
                  icon: Shield,
                  color: 'bg-violet-50 text-violet-700',
                  permissions: [
                    'Giám sát mọi sự kiện, giao dịch',
                    'Quản lý tài khoản ứng dụng',
                    'Cấp quyền Organizer và Admin',
                    'Không được đổi quyền chính mình',
                  ],
                },
              ].map((r) => (
                <div key={r.role} className="rounded-xl border border-line p-5">
                  <div
                    className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${r.color}`}
                  >
                    <r.icon size={22} />
                  </div>
                  <h3 className="text-sm font-bold">{r.role}</h3>
                  <ul className="mt-4 space-y-3 text-[10px] leading-5 text-muted">
                    {r.permissions.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Check size={12} className="mt-1 shrink-0 text-emerald-600" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-6 border-t border-line pt-5 text-[11px] leading-7 text-muted">
              Đăng ký công khai chỉ tạo tài khoản Customer. Organizer và Admin được cấp riêng bởi
              quản trị viên; không có nút tự chuyển vai trò. Mỗi tài khoản chỉ thấy menu dành cho
              vai trò hiện tại.
            </p>
          </section>
        )}
      </div>
      {creating && (
        <EventBuilder
          key={editing?.id ?? 'new-event'}
          event={editing}
          onClose={() => {
            setCreating(false)
            setEditing(undefined)
          }}
          onSaved={(message) => {
            setCreating(false)
            setEditing(undefined)
            setNotice(message)
            setQuery('')
            setError('')
            setTab('events')
            startRefresh(() => router.refresh())
          }}
        />
      )}
      {preview && previewLayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Xem sơ đồ sự kiện"
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 sm:p-7"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                  Mặt bằng đã lưu
                </p>
                <h2 className="mt-2 text-lg font-bold">{preview.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng xem sơ đồ"
                onClick={() => setPreview(null)}
                className="rounded-full p-2 hover:bg-stone-100"
              >
                <X size={20} />
              </button>
            </div>
            <FloorplanCanvas
              layout={previewLayout}
              tiers={previewTiers as any}
            />
            <p className="mt-4 text-[10px] leading-6 text-muted">
              {previewTiers.reduce((sum, tier) => sum + (tier.capacity ?? (tier.rows * tier.seatsPerRow || 0)), 0)} ghế · Đây
              là bản xem bố trí, không thể chọn hoặc giữ ghế tại màn hình này.
            </p>
          </section>
        </div>
      )}
      {(roleConfirm || eventConfirm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-5 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Xác nhận thay đổi"
            className="w-full max-w-md rounded-2xl bg-white p-7"
          >
            <Shield className="mb-5 text-emerald-700" size={29} />
            <h2 className="text-xl font-bold">
              {roleConfirm ? 'Thay đổi quyền truy cập?' : 'Cập nhật trạng thái sự kiện?'}
            </h2>
            <p className="mt-4 text-xs leading-7 text-muted">
              {roleConfirm
                ? `${roleConfirm.name} sẽ được cấp quyền ${roleConfirm.role}. Thay đổi có hiệu lực ngay với tất cả phiên đăng nhập.`
                : `${eventConfirm?.title} sẽ chuyển sang “${statusLabels[eventConfirm?.status ?? '']}”. ${eventConfirm?.status === 'cancelled' ? 'Khách hàng không thể đặt thêm vé. Sự kiện đã hủy không thể mở lại.' : 'Thông tin công khai sẽ cập nhật ngay sau khi lưu.'}`}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                disabled={busy}
                onClick={() => {
                  setRoleConfirm(null)
                  setEventConfirm(null)
                }}
                className="btn-secondary flex-1"
              >
                Quay lại
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  mutate(
                    roleConfirm
                      ? { action: 'role', id: roleConfirm.id, role: roleConfirm.role }
                      : { action: 'status', id: eventConfirm!.id, status: eventConfirm!.status },
                  )
                }
                className="btn-primary flex-1"
              >
                {busy ? <LoaderCircle size={17} className="animate-spin" /> : 'Xác nhận'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
