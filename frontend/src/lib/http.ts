import 'server-only'

export function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const expected = process.env.NEXT_PUBLIC_SITE_URL
  const hosts = [
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
    expected ? new URL(expected).host : null,
  ]
  if (!origin || !hosts.includes(new URL(origin).host))
    throw new Error('Yêu cầu không hợp lệ. Vui lòng tải lại trang.')
}
export const failure = (error: unknown, status = 400) => {
  const message = error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.'
  // Never expose adapter, credential, or internal validation details.
  const safe =
    /^(Vui lòng|Bạn |Không thể|Chọn |Ghế |Sự kiện |Đơn |Tài khoản |Email |Mật khẩu |Chỉ |Yêu cầu|Phiên |Vé |Hoàn |Quyền |Tên |Ngày |Mã |Nội dung)/.test(
      message,
    )
  return Response.json(
    {
      ok: false,
      error: safe ? message : 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra thông tin và thử lại.',
    },
    { status },
  )
}
