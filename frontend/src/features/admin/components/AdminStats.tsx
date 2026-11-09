'use client'

import React from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Shield,
  Ticket,
} from 'lucide-react'
import type { Booking } from '@/payload-types'
import { money, statusLabels } from '@/lib/format'

interface AdminStatsProps {
  eventsCount: number
  onSaleEventsCount: number
  ticketsSoldCount: number
  revenue: number
  heldBookingsCount: number
  bookings: Booking[]
}

export function AdminStats({
  eventsCount,
  onSaleEventsCount,
  ticketsSoldCount,
  revenue,
  heldBookingsCount,
  bookings,
}: AdminStatsProps) {
  const stats = [
    {
      icon: CalendarDays,
      label: 'Tổng sự kiện',
      value: String(eventsCount),
      caption: `${onSaleEventsCount} sự kiện đang mở bán`,
      isEmerald: false,
    },
    {
      icon: Ticket,
      label: 'Vé đã bán',
      value: String(ticketsSoldCount),
      caption: 'Từ các đơn đã xác nhận',
      isEmerald: true,
    },
    {
      icon: CircleDollarSign,
      label: 'Tổng doanh thu',
      value: money(revenue),
      caption: 'Không bao gồm đơn đã hoàn',
      isEmerald: false,
    },
    {
      icon: Clock3,
      label: 'Đơn chờ thanh toán',
      value: String(heldBookingsCount),
      caption: 'Giữ ghế tối đa 10 phút',
      isEmerald: true,
    },
  ]

  const statusConfigs = [
    { status: 'confirmed', color: 'bg-emerald-500' },
    { status: 'held', color: 'bg-amber-400' },
    { status: 'refunded', color: 'bg-violet-400' },
    { status: 'cancelled', color: 'bg-stone-300' },
  ]

  return (
    <>
      {/* 4 Metric Cards */}
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted">{s.label}</p>
              <span
                className={`rounded-lg p-2 ${
                  s.isEmerald ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-600'
                }`}
              >
                <s.icon size={18} />
              </span>
            </div>
            <p className="mt-4 text-[25px] font-bold tracking-tight text-ink">{s.value}</p>
            <p className="mt-3 text-[9px] text-muted">{s.caption}</p>
          </div>
        ))}
      </div>

      {/* Distribution & Architecture note */}
      <div className="mb-7 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold text-ink">Phân bố trạng thái đơn hàng</h2>
          <p className="mt-2 text-[10px] text-muted">
            Dữ liệu thực từ hệ thống · {bookings.length} đơn
          </p>
          <div className="mt-6 space-y-5">
            {statusConfigs.map((s) => {
              const qty = bookings.filter((b) => b.status === s.status).length
              const pct = bookings.length ? (qty / bookings.length) * 100 : 0
              return (
                <div key={s.status}>
                  <div className="mb-2 flex justify-between text-[10px]">
                    <span className="text-muted">{statusLabels[s.status]}</span>
                    <strong className="text-ink">{qty}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-[#14382b] p-6 text-white">
          <Shield size={25} className="text-emerald-400" />
          <h2 className="mt-5 text-lg font-bold">
            Mọi hoạt động,
            <br />
            trong tầm kiểm soát.
          </h2>
          <p className="mt-3 text-[11px] leading-7 text-white/65">
            Giữ ghế độc quyền, vé QR dùng một lần và phân quyền theo tài khoản. Dữ liệu bán vé được
            lưu bền vững.
          </p>
          <p className="mt-5 border-t border-white/15 pt-4 text-[9px] leading-5 text-white/45">
            Kết nối trực tiếp qua Spring Cloud Gateway &amp; Microservices backend.
          </p>
        </div>
      </div>
    </>
  )
}
