'use client'

import React from 'react'
import { ArrowRight } from 'lucide-react'
import { Input, Button } from '@/components/ui'

interface SignupFormProps {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
  onSwitchToLogin: () => void
  busy: boolean
  error: string
}

export function SignupForm({ onSubmit, onSwitchToLogin, busy, error }: SignupFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Họ và tên"
        name="name"
        placeholder="Nguyễn Minh Anh"
        minLength={2}
        maxLength={100}
        required
        autoFocus
      />
      <Input
        label="Email"
        type="email"
        name="email"
        placeholder="ban@example.com"
        autoComplete="email"
        required
      />
      <Input
        label="Mật khẩu"
        type="password"
        name="password"
        placeholder="Ít nhất 8 ký tự"
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        required
      />

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-medium">
          {error}
        </p>
      )}

      <Button disabled={busy} isLoading={busy} className="w-full mt-2" rightIcon={<ArrowRight size={16} />}>
        Tạo tài khoản
      </Button>

      <p className="mt-4 text-center text-xs text-muted">
        Đã có tài khoản?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-semibold text-emerald-700 hover:underline"
        >
          Đăng nhập
        </button>
      </p>

      <p className="mt-2 text-center text-[10px] leading-4 text-muted">
        Đăng ký công khai chỉ dành cho Customer. Tài khoản Organizer và Admin được quản trị viên cấp
        riêng.
      </p>
    </form>
  )
}
