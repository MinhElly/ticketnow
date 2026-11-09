'use client'

import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white p-5 transition ${
        hover ? 'hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
