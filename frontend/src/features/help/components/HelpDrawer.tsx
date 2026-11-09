'use client'

import React, { useState } from 'react'
import { ArrowRight, Check, CircleHelp, MessageCircle, Send, X } from 'lucide-react'

interface HelpDrawerProps {
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
}

const defaultQuestions = [
  'Làm thế nào để đặt vé?',
  'Ghế được giữ trong bao lâu?',
  'Chính sách hoàn vé',
  'Nhận vé QR ở đâu?',
]

const defaultAnswers = [
  'Chọn sự kiện yêu thích, nhấn “Đặt vé ngay”, chọn tối đa 6 ghế và đăng nhập để tiếp tục. Hoàn tất thanh toán để nhận vé QR trong “Vé của tôi”.',
  'Ghế được giữ tối đa 10 phút từ khi bạn nhấn “Tiếp tục thanh toán”. Khi hết hạn hoặc hủy đơn, ghế sẽ được mở lại cho người khác.',
  'Bạn được hoàn 100% trước sự kiện ít nhất 7 ngày, 50% từ 48 giờ đến dưới 7 ngày. Không hỗ trợ hoàn trong 48 giờ trước sự kiện.',
  'Sau khi thanh toán thành công, đăng nhập tài khoản Customer và mở “Vé của tôi” để xem hoặc tải mã QR. Chỉ tài khoản sở hữu đơn được truy cập vé.',
]

export function HelpDrawer({ isOpen, onClose, onOpen }: HelpDrawerProps) {
  const [answer, setAnswer] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')

  function ask(value: string) {
    const index = defaultQuestions.indexOf(value)
    const normalized = value.toLowerCase()
    if (/tổ chức|organizer|admin/.test(normalized)) {
      setAnswer(
        'Tài khoản Organizer và Admin được quản trị viên cấp riêng. Đăng ký công khai chỉ dành cho Customer; không thể tự đăng ký hoặc tự chuyển sang vai trò quản lý.',
      )
      setCustomQuestion('')
      return
    }
    setAnswer(
      defaultAnswers[
        index >= 0
          ? index
          : normalized.includes('hoàn')
            ? 2
            : normalized.includes('giữ')
              ? 1
              : normalized.includes('qr') || normalized.includes('nhận vé')
                ? 3
                : 0
      ],
    )
    setCustomQuestion('')
  }

  return (
    <>
      {/* Floating help launcher */}
      <button
        onClick={onOpen}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full border border-white/60 bg-[#122a25] px-4 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-xl transition hover:-translate-y-1 active:scale-95"
        aria-label="Mở trợ giúp TicketNow"
      >
        <MessageCircle size={18} />
        <span className="hidden sm:inline">Bạn cần hỗ trợ?</span>
        <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
      </button>

      {/* Help Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#10231d]/45 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Trung tâm hỗ trợ"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between bg-[#122a25] p-5 sm:p-6 text-white">
              <div className="flex items-center gap-3">
                <CircleHelp size={26} className="text-mint shrink-0" />
                <div>
                  <h2 className="font-bold text-base sm:text-lg">TicketNow luôn ở đây</h2>
                  <p className="mt-0.5 text-xs text-white/70">
                    Trung tâm hướng dẫn & câu hỏi thường gặp
                  </p>
                </div>
              </div>
              <button
                aria-label="Đóng trợ giúp"
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 p-5 sm:p-6 max-h-[75vh] overflow-y-auto">
              <p className="mb-2 text-xs text-muted">Chào bạn, chúng tôi có thể giúp gì cho bạn?</p>

              {defaultQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-2.5 text-left text-xs font-medium text-ink hover:border-emerald-500 hover:bg-emerald-50/50 transition"
                >
                  {q}
                  <ArrowRight size={14} className="text-muted shrink-0" />
                </button>
              ))}

              {answer && (
                <div
                  className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-xs leading-relaxed text-emerald-950 animate-in fade-in"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 mb-1.5 font-bold text-emerald-800">
                    <Check size={16} />
                    <span>Giải đáp:</span>
                  </div>
                  {answer}
                </div>
              )}

              <form
                className="relative mt-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (customQuestion.trim()) ask(customQuestion)
                }}
              >
                <input
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 pr-11 text-xs outline-none transition placeholder:text-stone-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  aria-label="Câu hỏi của bạn"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Nhập câu hỏi về đặt vé..."
                />
                <button
                  aria-label="Gửi câu hỏi"
                  type="submit"
                  className="absolute right-2.5 top-2.5 text-emerald-700 hover:text-emerald-800 p-1"
                >
                  <Send size={16} />
                </button>
              </form>

              <p className="text-center text-[10px] text-muted pt-2">
                Hướng dẫn tự động theo chính sách, không phải tư vấn AI trực tiếp.
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
