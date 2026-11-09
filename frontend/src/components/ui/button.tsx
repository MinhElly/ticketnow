'use client'

import React from 'react'
import { LoaderCircle } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold transition rounded-lg outline-none select-none disabled:opacity-50 disabled:cursor-not-allowed'

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-8',
      md: 'px-4 py-2.5 text-xs gap-2 min-h-10',
      lg: 'px-6 py-3 text-sm gap-2.5 min-h-12',
    }

    const variantStyles = {
      primary: 'bg-mint text-ink hover:bg-[#a5e969] font-bold active:scale-[0.98]',
      secondary: 'bg-white border border-line text-ink hover:border-emerald-500 hover:bg-stone-50',
      outline: 'border border-line text-muted hover:text-ink hover:border-emerald-600',
      danger: 'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]',
      ghost: 'bg-transparent text-muted hover:text-ink hover:bg-stone-100',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'
