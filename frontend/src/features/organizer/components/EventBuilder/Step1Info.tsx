'use client'

import React from 'react'
import Image from 'next/image'
import { Upload, Trash2, LoaderCircle } from 'lucide-react'

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
  isUploading?: boolean
  onCoverChange: (file: File | undefined) => void
  onCoverUrlChange: (url: string) => void
  onRemoveCover: () => void
}

const categories = [
  'Âm nhạc',
  'Sân khấu & Nghệ thuật',
  'Thể thao',
  'Workshop',
  'Hội thảo',
  'Lễ hội',
]

const cities = ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Đà Lạt', 'Toàn quốc']

export function Step1Info({
  info,
  onChange,
  coverURL,
  isUploading,
  onCoverChange,
  onCoverUrlChange,
  onRemoveCover,
}: Step1InfoProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <label className="block text-xs font-semibold text-ink">
          Tên sự kiện
          <input
            name="title"
            value={info.title}
            onChange={(e) => onChange('title', e.target.value)}
            required
            minLength={3}
            maxLength={200}
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
            minLength={10}
            placeholder="Giới thiệu nội dung, các nghệ sĩ tham gia và lưu ý cho khán giả..."
            className="field mt-1.5 resize-none leading-relaxed"
          />
        </label>
      </div>

      {/* Cover Image Upload */}
      <div className="space-y-4 rounded-2xl border border-line bg-white p-5 flex flex-col items-center text-center">
        <div className="w-full flex items-center justify-between">
          <h4 className="text-xs font-bold text-ink">Ảnh bìa sự kiện</h4>
          {coverURL && (
            <button
              type="button"
              onClick={onRemoveCover}
              className="text-[11px] text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition"
            >
              <Trash2 size={13} />
              Xóa ảnh
            </button>
          )}
        </div>

        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center p-4">
          {coverURL ? (
            <Image src={coverURL} alt="Ảnh bìa sự kiện" fill unoptimized className="object-cover" />
          ) : isUploading ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <LoaderCircle size={28} className="animate-spin text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-700">Đang tải ảnh lên...</p>
            </div>
          ) : (
            <>
              <Upload size={24} className="text-stone-400 mb-2" />
              <p className="text-[11px] text-muted">Kéo thả ảnh hoặc chọn từ máy tính</p>
              <p className="text-[9px] text-stone-400 mt-1">Hỗ trợ JPG, PNG, WebP (Tối đa 10MB)</p>
            </>
          )}
        </div>

        <div className="w-full space-y-3">
          <label className="w-full cursor-pointer rounded-xl border border-line bg-white py-2 text-xs font-semibold text-ink hover:border-emerald-500 hover:bg-stone-50 transition text-center block">
            {coverURL ? 'Chọn ảnh khác từ máy tính' : 'Chọn ảnh từ máy tính'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => onCoverChange(e.target.files?.[0])}
            />
          </label>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-line"></div>
            <span className="flex-shrink mx-2 text-[10px] text-muted uppercase">hoặc liên kết URL</span>
            <div className="flex-grow border-t border-line"></div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.currentTarget
              const input = form.elements.namedItem('imgUrl') as HTMLInputElement
              if (input && input.value.trim()) {
                onCoverUrlChange(input.value.trim())
                input.value = ''
              }
            }}
            className="flex gap-2"
          >
            <input
              name="imgUrl"
              type="url"
              placeholder="Dán link ảnh (https://...)"
              className="field text-xs py-1.5 flex-1"
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition whitespace-nowrap"
            >
              Áp dụng
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
