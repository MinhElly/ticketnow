'use client'

import React, { useState } from 'react'
import { Ticket, ShieldCheck, X } from 'lucide-react'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Record<string, any>, mode: 'login' | 'signup') => Promise<void>
}

export function AuthModal({ isOpen, onClose, onSubmit }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const formData = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await onSubmit(formData, mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  async function handleQuickLogin(email: string, pass: string) {
    setBusy(true)
    setError('')
    try {
      await onSubmit({ email, password: pass }, 'login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#10231d]/55 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-muted hover:bg-stone-100 transition"
          aria-label="Đóng"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-mint/25 text-emerald-800">
          <Ticket size={24} />
        </div>

        <h2 id="auth-title" className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
          {mode === 'login' ? 'Chào mừng bạn trở lại!' : 'Bắt đầu những trải nghiệm mới'}
        </h2>
        <p className="mt-1.5 mb-6 text-xs text-muted leading-relaxed">
          {mode === 'login'
            ? 'Đăng nhập để quản lý vé, sự kiện hoặc đặt chỗ yêu thích.'
            : 'Tạo tài khoản Customer và tìm sự kiện dành cho bạn.'}
        </p>

        {mode === 'login' ? (
          <>
            <LoginForm
              onSubmit={handleFormSubmit}
              onSwitchToSignup={() => {
                setMode('signup')
                setError('')
              }}
              busy={busy}
              error={error}
            />

            {/* Quick Demo Login Buttons */}
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">
                Đăng nhập nhanh theo vai trò
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickLogin('customer01@example.com', 'admin')}
                  className="rounded-xl border border-line bg-stone-50 py-2 px-1 text-[10px] font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-95 disabled:opacity-50 text-center"
                >
                  Customer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickLogin('organizer01@example.com', 'admin')}
                  className="rounded-xl border border-line bg-stone-50 py-2 px-1 text-[10px] font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-95 disabled:opacity-50 text-center"
                >
                  Organizer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickLogin('admin01@example.com', 'admin')}
                  className="rounded-xl border border-line bg-stone-50 py-2 px-1 text-[10px] font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-50 active:scale-95 disabled:opacity-50 text-center"
                >
                  Admin
                </button>
              </div>
            </div>
          </>
        ) : (
          <SignupForm
            onSubmit={handleFormSubmit}
            onSwitchToLogin={() => {
              setMode('login')
              setError('')
            }}
            busy={busy}
            error={error}
          />
        )}

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 text-[11px] text-muted">
          <ShieldCheck size={14} className="text-emerald-700" />
          Bảo mật tài khoản · Phân quyền độc lập
        </div>
      </section>
    </div>
  )
}
