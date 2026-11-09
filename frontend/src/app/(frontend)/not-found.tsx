import Link from 'next/link'
import { ArrowLeft, Ticket } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 -rotate-12 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
        <Ticket size={40} strokeWidth={1.3} />
      </div>
      <p className="text-[10px] font-semibold tracking-[3px] text-emerald-700">
        404 · LẠC MỘT NHỊP
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Trải nghiệm này chưa có ở đây.</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        Sự kiện hoặc trang bạn tìm có thể đã được chuyển đi, chưa công bố hoặc không thuộc tài khoản
        của bạn.
      </p>
      <Link href="/" className="btn-primary mt-7">
        <ArrowLeft size={16} />
        Khám phá những sự kiện khác
      </Link>
    </main>
  )
}
