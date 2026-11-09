'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Globe, Shield } from 'lucide-react'
import { ROLE_WORKSPACES } from '@/lib/roles'
import { useApp } from '@/components/AppProvider'
import { Brand } from './brand'

export function Footer() {
  const { user, openHelp } = useApp()
  const workspace = user ? ROLE_WORKSPACES[user.role] : null

  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1344px] gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <Brand />
          <p className="mt-5 max-w-xs text-xs leading-6 text-muted">
            Kết nối bạn với những trải nghiệm đáng nhớ.
            <br />
            Mỗi tấm vé, một câu chuyện mới.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-medium text-emerald-800 border border-emerald-100">
            <Shield size={13} />
            Đặt vé an tâm. Trải nghiệm trọn vẹn.
          </span>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-ink">Khám phá</h3>
          <div className="space-y-3 text-xs text-muted">
            <Link className="block hover:text-emerald-700 transition" href="/#explore">
              Sự kiện sắp diễn ra
            </Link>
            <button className="block hover:text-emerald-700 transition" onClick={openHelp}>
              Hướng dẫn đặt vé
            </button>
            <button className="block hover:text-emerald-700 transition" onClick={openHelp}>
              Chính sách hoàn vé
            </button>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-ink">
            {workspace ? 'Không gian của bạn' : 'Đặt vé an tâm'}
          </h3>
          {workspace ? (
            <div className="space-y-3 text-xs">
              <Link
                className="block font-semibold text-emerald-700 hover:underline"
                href={workspace.href}
              >
                {workspace.label}
              </Link>
              <p className="leading-6 text-muted">{workspace.description}</p>
            </div>
          ) : (
            <p className="text-xs leading-6 text-muted">
              Chọn vị trí yêu thích.
              <br />
              Giữ ghế trong 10 phút.
              <br />
              Nhận vé QR sau thanh toán.
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-ink">Chúng tôi luôn lắng nghe</h3>
          <p className="text-xs leading-6 text-muted">
            Bạn cần hỗ trợ về vé hay sự kiện?
            <br />
            Tìm câu trả lời ngay tại đây.
          </p>
          <button
            onClick={openHelp}
            className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
          >
            Trung tâm hỗ trợ
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1264px] flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-5 text-[10px] text-muted lg:px-0">
        <p>© 2026 TicketNow. All rights reserved.</p>
        <p className="text-stone-400">Nền tảng đặt vé &amp; quản trị sự kiện trực tuyến TicketNow</p>
        <span className="flex items-center gap-2">
          <Globe size={13} />
          Tiếng Việt
        </span>
      </div>
    </footer>
  )
}
