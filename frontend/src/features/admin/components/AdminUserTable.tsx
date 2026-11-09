'use client'

import React from 'react'
import type { User } from '@/payload-types'

interface AdminUserTableProps {
  users: User[]
  currentUserId: string
  busy?: boolean
  onRoleChange: (userId: string, role: string, userName: string) => void
}

export function AdminUserTable({
  users,
  currentUserId,
  busy = false,
  onRoleChange,
}: AdminUserTableProps) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="border-b border-line p-5">
        <h2 className="text-sm font-bold text-ink">Tài khoản &amp; Phân quyền</h2>
        <p className="mt-2 text-[10px] text-muted">
          Quyền mới có hiệu lực ngay trên các yêu cầu tiếp theo, kể cả phiên đang đăng nhập.
        </p>
      </div>
      <div className="divide-y divide-line">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">
                {u.name.slice(0, 1)}
              </div>
              <div>
                <p className="text-xs font-semibold text-ink">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-[9px] font-normal text-muted">(Bạn)</span>
                  )}
                </p>
                <p className="mt-1.5 text-[10px] text-muted">{u.email}</p>
              </div>
            </div>
            <select
              aria-label={`Phân quyền ${u.name}`}
              disabled={u.id === currentUserId || busy}
              value={u.role}
              onChange={(e) => onRoleChange(u.id, e.target.value, u.name)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="customer">Customer</option>
              <option value="organizer">Organizer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}
