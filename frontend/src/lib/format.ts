import type { Media } from '@/payload-types'
import type { Event } from '@/types/event'

export const mediaOf = (value: any) => {
  if (!value) return null
  if (typeof value === 'object' && value.url) return value as Media
  if (typeof value === 'object' && value.imageUrl)
    return { url: value.imageUrl, alt: 'Ảnh sự kiện' } as any
  if (
    typeof value === 'string' &&
    (value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/') ||
      value.startsWith('blob:'))
  ) {
    return { url: value, alt: 'Ảnh sự kiện' } as any
  }
  return null
}

export const priceOf = (event: Event) => {
  const tiers = event.ticketTiers || event.tiers || []
  return tiers.length ? Math.min(...tiers.map((t: any) => t.price)) : 0
}

export const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + 'đ'

export const eventDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...options })

export const statusLabels: Record<string, string> = {
  draft: 'Bản nháp',
  published: 'Sắp mở bán',
  on_sale: 'Đang mở bán',
  closed: 'Đã đóng',
  cancelled: 'Đã hủy',
  held: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  expired: 'Đã hết hạn',
  failed: 'Thanh toán lỗi',
  refunded: 'Đã hoàn vé',
}
