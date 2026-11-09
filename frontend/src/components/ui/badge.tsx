'use client'

import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'amber' | 'violet' | 'teal' | 'blue' | 'orange' | 'stone' | 'rose'
  size?: 'sm' | 'md'
}

export function Badge({
  children,
  variant = 'emerald',
  size = 'sm',
  className = '',
  ...props
}: BadgeProps) {
  const variantStyles = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-100 text-amber-900 border-amber-300',
    violet: 'bg-violet-100 text-violet-900 border-violet-300',
    teal: 'bg-teal-100 text-teal-900 border-teal-300',
    blue: 'bg-blue-100 text-blue-900 border-blue-300',
    orange: 'bg-orange-100 text-orange-900 border-orange-300',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  }

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] font-semibold',
    md: 'px-2.5 py-1 text-xs font-semibold',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
