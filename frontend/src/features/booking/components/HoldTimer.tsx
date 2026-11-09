'use client'

import React, { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'

interface HoldTimerProps {
  expiresAt?: string
  initialSeconds?: number
  onExpire?: () => void
}

export function HoldTimer({ expiresAt, initialSeconds, onExpire }: HoldTimerProps) {
  const calculateSecondsLeft = () => {
    if (expiresAt) {
      return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    }
    return initialSeconds ?? 600
  }

  const [seconds, setSeconds] = useState(calculateSecondsLeft)

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateSecondsLeft()
      setSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        onExpire?.()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [expiresAt])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const isUrgent = seconds < 120

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
        isUrgent
          ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
          : 'bg-amber-50 text-amber-800 border border-amber-200'
      }`}
    >
      <Clock3 size={15} />
      <span>
        Giữ ghế trong: {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  )
}
