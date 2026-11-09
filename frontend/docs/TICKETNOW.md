# TicketNow

Ứng dụng bán vé sự kiện tiếng Việt, xây dựng trên Next.js và Payload của Figma Make.

## Không gian và quyền truy cập

| Vai trò           | Trang                                 | Quyền                                                                                                                |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Công khai         | `/`, `/events/[slug]`                 | Khám phá, tìm kiếm, lọc, xem sự kiện                                                                                 |
| Customer          | `/customer/tickets`, `/checkout/[id]` | Đặt 1–6 ghế, một đơn giữ ghế cùng lúc; thanh toán mô phỏng; xem và tải QR; hoàn vé của mình                          |
| Organizer         | `/organizer`                          | Tạo sự kiện/hạng vé/lưới ghế/lịch mở bán, quản lý trạng thái và xem đơn thuộc sự kiện của mình, xác thực vé tại cổng |
| Admin ứng dụng    | `/dashboard/admin`                    | Xem các sự kiện/giao dịch/tài khoản, cấp quyền, soát vé                                                              |
| Biên tập viên CMS | `/admin`                              | Tài khoản Figma/Payload riêng, không phải tài khoản ứng dụng                                                         |

Tài khoản mới luôn là Customer. Để thiết lập Admin đầu tiên: đăng ký tài khoản
ứng dụng, mở CMS bằng quyền Figma của bạn, vào **Users**, chọn tài khoản vừa tạo
và đặt **role = Admin**. Sau đó Admin có thể cấp quyền Organizer/Admin trong
`/dashboard/admin`. App users không được truy cập CMS bằng tài khoản ứng dụng.
Không có tài khoản mật khẩu công khai hoặc nút chuyển vai trò bỏ qua xác thực.

## Điều hướng theo vai trò

- Guest chỉ thấy khám phá sự kiện, hỗ trợ và đăng nhập; không có liên kết Vé của
  tôi, tạo sự kiện hoặc khu quản lý ở header, mobile menu, footer hay banner.
- Customer chỉ thấy menu vé/đơn hàng của mình và nội dung công khai.
- Organizer được cấp tài khoản riêng; đăng nhập vào thẳng `/organizer` với các
  tab quản lý sự kiện, giao dịch và soát vé. Không có menu Customer/Admin.
- Admin vào thẳng `/dashboard/admin` và chỉ thấy menu quản trị. Việc quản lý
  toàn hệ thống diễn ra tại trang Admin, không dùng trang Organizer.
- Menu tài khoản chỉ có lối vào không gian hiện tại và đăng xuất. Đăng xuất gỡ
  toàn bộ menu riêng. Trong lúc đang xác thực phiên không hiển thị liên kết riêng.
- Trang riêng tiếp tục kiểm tra chính xác vai trò ở server. Nhập URL của vai trò
  khác không cấp quyền; trang từ chối có liên kết quay lại đúng không gian.
- Đăng ký công khai chỉ dành cho Customer. Không có đăng ký Organizer hoặc nút
  mời người mua vé trở thành nhà tổ chức. CMS/Figma vẫn là quyền độc lập và không
  được quảng bá như một tính năng của tài khoản Admin ứng dụng.

Kiểm tra vai trò, quyền sở hữu và trường workflow diễn ra ở server và collection
access. Cookie `app-session` HTTP-only độc lập với phiên CMS. Xác thực và thu hồi
phiên dùng các API JWT/session chính thức của Payload. Runtime Make chỉ đăng ký
CMS OAuth trong `payload.auth`; helper ứng dụng dùng native `JWTAuthentication`
của Payload làm fallback với header JWT được cô lập. Không tự triển khai ký JWT
hoặc mã hóa mật khẩu. Vai trò được đọc lại từ storage để thay đổi quyền có hiệu
lực với phiên hiện hữu.

## Dữ liệu và luồng vé

### Phân biệt hạng vé trên sơ đồ

Sơ đồ hiển thị đồng thời mọi khu vé với màu riêng, mã khu, giá, số hàng/ghế và
lối đi minh họa. Thẻ giá, ghế và giỏ vé sử dụng cùng một bảng màu; ghế đã chọn
có dấu kiểm, ghế đã giữ/bán có dấu xám và không thể chọn. Có thể chọn kết hợp các
hạng, tối đa 6 ghế, với tổng tiền tính từ giá thật của từng hạng.

Với sự kiện cũ chưa có `seatLayout`, các khu được sắp theo giá giảm dần chỉ để
minh họa. Không tự suy diễn vị trí thực tế hoặc quyền lợi VIP.

Với sự kiện đã được thiết kế bằng Event Studio, mặt bằng Customer đọc trực tiếp
sân khấu, tọa độ, kích thước, màu và lối đi do Organizer lưu. Thay đổi giá không
tự di chuyển khu. Sơ đồ dùng tọa độ chuẩn hóa theo %, không phải bản vẽ CAD theo
đơn vị mét; không tự thêm dịch vụ hay quyền lợi VIP ngoài dữ liệu sự kiện.

### Event Studio: tạo và hoàn thiện bản nháp

- Bốn bước: thông tin → hạng vé → seat map → xác nhận.
- Cấu hình 1–4 hạng; tên, mã khu, giá, màu, số hàng và số ghế/hàng. Sức chứa và
  tổng giá trị vé tối đa được tính trực tiếp từ cấu hình.
- Ba mẫu bố trí: hội trường, sân khấu bên trái, sân khấu trung tâm. Áp dụng mẫu
  chỉ đổi hình học, giữ tên hạng, giá, màu và lựa chọn lối đi.
- Kéo sân khấu/khu vé, kéo góc để đổi kích thước hoặc nhập X/Y/rộng/cao. Hỗ trợ
  phím mũi tên, Shift + mũi tên, phóng to/thu nhỏ và vừa khung.
- Kiểm tra khu chồng nhau, chồng sân khấu, vượt mặt bằng, mã khu không thuộc
  sự kiện và màu trùng. Cùng bộ kiểm tra chạy ở UI, API và collection boundary.
- Lưu bản nháp cùng ảnh bìa và mặt bằng; có thể mở lại để sửa hoặc xem sơ đồ.
  API chỉ cho sửa bản nháp chưa có booking và giữ nguyên chủ sở hữu/slug.
- Công bố không đổi mã ghế `{khu}-{hàng}-{ghế}`. Sau công bố không cho đổi/xóa
  mặt bằng; Customer chọn đúng các ghế với giá được máy chủ kiểm tra lại.

`events.seatLayout` là group tùy chọn bổ sung, không đổi kiểu dữ liệu `tiers`,
không backfill, đổi giá hoặc đánh lại mã ghế của tài liệu hiện hữu.

- `events`: sự kiện, upload ảnh, chủ sở hữu, hạng vé, lưới ghế và `seatLayout`
  tùy chọn gồm sân khấu cùng các khu tham chiếu bằng `tierCode`.
- `users`: tài khoản ứng dụng, vai trò và sự kiện yêu thích.
- `bookings`: lịch sử đơn, ghế, giá máy chủ tính lại, trạng thái, mã QR.
- `seat-claims`: khóa duy nhất `eventId:seatCode` chống giữ trùng giữa các request.
- `booking-locks`: khóa bền vững theo đơn, tuần tự hóa thanh toán/hủy/hoàn.
- `ticket-scans`: bản ghi bất biến; token duy nhất đảm bảo vé dùng một lần.
- `media`: ảnh bìa được lưu qua hệ thống upload Figma/Payload.

Thời gian giữ ghế là 10 phút. Availability loại ghế giữ hết hạn khỏi sơ đồ; luồng
đặt mới thu hồi claim hết hạn trước khi giữ. Đơn hết hạn được chuyển trạng thái
khi chủ tài khoản xem vé/checkout hoặc thực hiện giao dịch. Đây là thu hồi theo
yêu cầu, không phải Redis TTL/Kafka scheduler nền.

Thất bại khi giữ nhiều ghế nhả các claim đã tạo. Giá và ghế được kiểm tra lại tại
collection boundary; client không được quyết định tổng tiền. Khóa thanh toán
ngăn hai thao tác workflow đồng thời. Các request thanh toán/hoàn đã thành công
có thể gọi lại mà không phát sinh một giao dịch tiền thật.

Chính sách hoàn: 100% từ 7 ngày trước sự kiện, 50% từ 48 giờ đến dưới 7 ngày,
không hoàn trong 48 giờ hoặc sau khi đã vào cổng. Hoàn thành công vô hiệu hóa QR
và nhả claim. Organizer chỉ được soát vé của chính sự kiện mình.

## Vòng đời nội dung

- `/` và `/events/[slug]`: static/SSG với `unstable_cache`, tag `events` và
  `event:<slug>`.
- Collection `events` có `afterChange` và `afterDelete` invalidation cho list,
  slug cũ và slug mới. Media thay đổi/xóa làm hết hạn tag `events`, bao gồm cả
  các detail đã được cache.
- `/organizer`, `/dashboard/admin`, `/customer/tickets`, `/checkout/[id]`:
  request-time, vì phụ thuộc phiên đăng nhập và dữ liệu giao dịch.
- Những thay đổi qua CMS/luồng Organizer được render mới ở request production
  tiếp theo, không yêu cầu Publish lại. Thay đổi bằng CLI ngoài Next không có
  Next cache context; sau các đợt import offline phải Publish lại hoặc thực hiện
  một lần lưu từ CMS để invalidation chạy trong runtime.

## Giới hạn minh bạch

Đây là MVP tích hợp, **không phải** triển khai toàn bộ hệ microservice Java,
Kafka Outbox/Saga, Redis Lua, Keycloak, Kubernetes, giám sát hạ tầng và benchmark
50.000 người trong các tài liệu. Không tuyên bố đạt các NFR tải cao khi chưa
benchmark. Thanh toán, hoàn tiền và phòng chờ đều được gắn nhãn mô phỏng. Chưa
cấu hình email thực, cổng thanh toán thật, AI Agent hoặc camera soát QR; màn soát
vé nhận dữ liệu từ thiết bị quét dạng bàn phím hoặc nội dung QR được dán vào.
Trợ giúp là hướng dẫn theo chính sách, không phải chatbot AI.

## Kiểm tra

```sh
pnpm exec tsc --noEmit
pnpm exec playwright test tests/ticketnow.spec.ts --workers=1
figma make verify-deploy
```

Test public chạy không cần thông tin đăng nhập. Test có xác thực đọc file tạm
qua `TICKETNOW_TEST_ACCOUNTS_FILE` (mảng 4 tài khoản: Admin, Organizer, Customer,
Customer). Không đưa mật khẩu hoặc file này vào Git. Có thể đặt
`TICKETNOW_TEST_URL` để chạy trên production verification server.

Ảnh khởi tạo: Unsplash, lưu thành Media documents qua Payload CLI. Tên sự kiện
là dữ liệu trải nghiệm, không phải thông báo mở bán được ủy quyền.
