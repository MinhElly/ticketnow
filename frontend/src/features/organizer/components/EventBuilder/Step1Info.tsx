'use client'

import React from 'react'
import Image from 'next/image'
import { Upload } from 'lucide-react'

export interface EventInfoState {
  title: string
  category: string
  city: string
  venue: string
  date: string
  onSaleAt: string
  description: string
  waitingRoom: boolean
}

interface Step1InfoProps {
  info: EventInfoState
  onChange: <K extends keyof EventInfoState>(key: K, value: EventInfoState[K]) => void
  coverURL?: string
  onCoverChange: (file: File | undefined) => void
}

const categories = [
  'Âm nhạc',
  'Sân khấu & Nghệ thuật',
  'Thể thao',
  'Workshop',
  'Hội thảo',
  'Lễ hội',
]

const cities = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt']

export function Step1Info({ info, onChange, coverURL, onCoverChange }: Step1InfoProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <label className="block text-xs font-semibold text-ink">
          Tên sự kiện
          <input
            name="title"
            value={info.title}
            onChange={(e) => onChange('title', e.target.value)}
            required
            minLength={5}
            maxLength={160}
            placeholder="Ví dụ: Một đêm Indie giữa Sài Gòn"
            className="field mt-1.5"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink">
            Danh mục
            <select
              value={info.category}
              onChange={(e) => onChange('category', e.target.value)}
              className="field mt-1.5"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-ink">
            Thành phố
            <select
              value={info.city}
              onChange={(e) => onChange('city', e.target.value)}
              className="field mt-1.5"
            >
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs font-semibold text-ink">
          Địa điểm tổ chức
          <input
            name="venue"
            value={info.venue}
            onChange={(e) => onChange('venue', e.target.value)}
            required
            placeholder="Ví dụ: Nhà hát Hòa Bình"
            className="field mt-1.5"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink">
            Ngày & Giờ diễn ra
            <input
              type="datetime-local"
              value={info.date}
              onChange={(e) => onChange('date', e.target.value)}
              required
              className="field mt-1.5"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Thời điểm mở bán vé (tùy chọn)
            <input
              type="datetime-local"
              value={info.onSaleAt}
              onChange={(e) => onChange('onSaleAt', e.target.value)}
              className="field mt-1.5"
            />
          </label>
        </div>

        <label className="block text-xs font-semibold text-ink">
          Mô tả sự kiện
          <textarea
            rows={4}
            value={info.description}
            onChange={(e) => onChange('description', e.target.value)}
            required
            minLength={30}
            placeholder="Giới thiệu nội dung, các nghệ sĩ tham gia và lưu ý cho khán giả..."
            className="field mt-1.5 resize-none leading-relaxed"
          />
        </label>
      </div>

      {/* Cover Image Upload */}
      <div className="space-y-4 rounded-2xl border border-line bg-white p-5 flex flex-col items-center text-center">
        <h4 className="text-xs font-bold text-ink self-start">Ảnh bìa sự kiện</h4>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center p-4">
          {coverURL ? (
            <Image src={coverURL} alt="Ảnh bìa sự kiện" fill className="object-cover" />
          ) : (
            <>
              <Upload size={24} className="text-stone-400 mb-2" />
              <p className="text-[11px] text-muted">Kéo thả ảnh hoặc chọn từ máy tính</p>
              <p className="text-[9px] text-stone-400 mt-1">Hỗ trợ JPG, PNG, WebP (Tối đa 8MB)</p>
            </>
          )}
        </div>

        <label className="w-full cursor-pointer rounded-xl border border-line bg-white py-2 text-xs font-semibold text-ink hover:border-emerald-500 hover:bg-stone-50 transition text-center block">
          Chọn ảnh mới
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onCoverChange(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  )
}
