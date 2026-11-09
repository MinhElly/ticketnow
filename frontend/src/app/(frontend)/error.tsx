'use client'
import { ArrowRight, RefreshCw } from 'lucide-react'

export default function ErrorPage({
  unstable_retry,
  reset,
}: {
  error: Error
  reset?: () => void
  unstable_retry?: () => void
}) {
  return (
    <main className="mx-auto min-h-[60vh] max-w-md px-6 py-24 text-center">
      <RefreshCw className="mx-auto mb-6 text-emerald-700" size={38} />
      <h1 className="text-2xl font-bold">Một chút gián đoạn.</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        Không thể tải dữ liệu ngay lúc này. Đơn và vé đã xác nhận của bạn vẫn được lưu trong hệ
        thống.
      </p>
      <button
        className="btn-primary mt-6"
        onClick={() => {
          const retry = unstable_retry ?? reset
          if (retry) retry()
          else window.location.reload()
        }}
      >
        Thử lại
        <ArrowRight size={16} />
      </button>
    </main>
  )
}
