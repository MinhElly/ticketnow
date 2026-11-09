'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useApp } from './AppProvider'
import { ROLE_WORKSPACES } from '@/lib/roles'

export function AccessPage({
  role,
  denied = false,
}: {
  role: 'Customer' | 'Organizer' | 'Admin'
  denied?: boolean
}) {
  const { user, loading, openAuth } = useApp()
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-800">
        {denied ? (
          <LockKeyhole size={33} strokeWidth={1.5} />
        ) : (
          <ShieldCheck size={36} strokeWidth={1.5} />
        )}
      </div>
      <span className="mb-3 rounded-full border border-emerald-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
        Không gian {role}
      </span>
      <h1 className="text-3xl font-bold tracking-tight">
        {denied
          ? 'Khu vực được phân quyền'
          : role === 'Customer'
            ? 'Những trải nghiệm đang chờ bạn'
            : role === 'Organizer'
              ? 'Biến ý tưởng thành sự kiện'
              : 'Trung tâm vận hành TicketNow'}
      </h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        {denied
          ? `Tài khoản hiện tại chưa có quyền ${role}. Quyền được xác thực tại máy chủ, không thể đổi bằng giao diện.`
          : `Đăng nhập tài khoản ${role} để ${role === 'Customer' ? 'quản lý đơn hàng, xem vé QR và các sự kiện đã đặt.' : role === 'Organizer' ? 'tạo sự kiện, cấu hình hạng vé và theo dõi doanh thu của bạn.' : 'quản lý tài khoản, phân quyền và giám sát giao dịch.'}`}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {!user ? (
          <button disabled={loading} onClick={openAuth} className="btn-primary">
            Đăng nhập để tiếp tục
            <ArrowRight size={17} />
          </button>
        ) : (
          <Link href={ROLE_WORKSPACES[user.role].href} className="btn-primary">
            Về không gian của tôi
            <ArrowRight size={17} />
          </Link>
        )}
        <Link href="/" className="btn-secondary">
          <ArrowLeft size={15} />
          Về trang khám phá
        </Link>
      </div>
      <p className="mt-6 text-xs leading-6 text-muted">
        Tài khoản mới được cấp quyền Customer.
        <br />
        Tài khoản Organizer và Admin được quản trị viên cấp riêng, không đăng ký công khai.
      </p>
    </main>
  )
}
