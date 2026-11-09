'use client'

import React, { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { Input, Button } from '@/components/ui'

interface LoginFormProps {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
  onSwitchToSignup: () => void
  busy: boolean
  error: string
}

export function LoginForm({ onSubmit, onSwitchToSignup, busy, error }: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Email hoặc Tên đăng nhập"
        type="text"
        name="email"
        placeholder="Ví dụ: customer01@example.com hoặc customer01"
        autoComplete="username"
        required
        autoFocus
      />
      <Input
        label="Mật khẩu"
        type="password"
        name="password"
        placeholder="Nhập mật khẩu của bạn"
        autoComplete="current-password"
        required
      />

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-medium">
          {error}
        </p>
      )}

      <Button disabled={busy} isLoading={busy} className="w-full mt-2" rightIcon={<ArrowRight size={16} />}>
        Đăng nhập
      </Button>

      <p className="mt-4 text-center text-xs text-muted">
        Chưa có tài khoản?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="font-semibold text-emerald-700 hover:underline"
        >
          Đăng ký ngay
        </button>
      </p>
    </form>
  )
}
