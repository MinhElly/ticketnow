# TicketNow Frontend

Giao diện web của hệ thống bán vé sự kiện trực tuyến **TicketNow**, được xây dựng trên **Next.js (App Router)**, **React 19**, **Payload CMS**, và **Tailwind CSS**.

---

## 🚀 Yêu cầu môi trường

- **Node.js**: >= 20.x hoặc khuyến nghị Node v24.x (hiện máy đã cài Node `v24.16.0`).
- **Package Manager**: `pnpm` (phiên bản 9, 10 hoặc 11).

---

## 🛠️ Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Cài đặt `pnpm` (nếu máy chưa có)
Mở PowerShell / Terminal và chạy lệnh sau (chỉ cần chạy một lần):
```powershell
npm install -g pnpm
```
Kiểm tra cài đặt:
```powershell
pnpm -v
```

### Bước 2: Cài đặt dependencies cho frontend
Điều hướng vào thư mục `frontend`:
```powershell
cd C:\Code\ticketnow\frontend
pnpm install
```

### Bước 3: Cấu hình biến môi trường
File `.env.local` đã được tạo sẵn tại thư mục `frontend` với các giá trị mặc định:
```ini
PORT=3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8180
NEXT_PUBLIC_KEYCLOAK_REALM=ticketnow
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=ticketnow-postman
```

### Bước 4: Chạy môi trường phát triển (Development)
```powershell
pnpm dev
```
Hoặc:
```powershell
npm run dev
```

Ứng dụng sẽ khả dụng tại: [http://localhost:3000](http://localhost:3000)

---

## 📁 Cấu trúc dự án

- `src/app/(frontend)/`: Các trang giao diện người dùng
  - `/`: Trang chủ khám phá sự kiện, banner slider, lọc sự kiện theo thành phố/thời gian.
  - `/events/[slug]`: Chi tiết sự kiện, sơ đồ ghế tương tác, chọn vé.
  - `/checkout/[id]`: Quy trình giữ ghế và thanh toán (mô phỏng).
  - `/customer/tickets`: Không gian vé của khách hàng (vé điện tử QR).
  - `/organizer`: Không gian ban tổ chức (Event Studio, cấu hình hạng vé, sơ đồ ghế).
  - `/dashboard/admin`: Không gian quản trị viên (phân quyền, quản lý giao dịch).
  - `/api/ticketnow/*`: Các API endpoints xác thực phiên, giữ vé, hủy đơn, soát vé QR.
- `src/components/`: Bộ components UI (Explore, SeatMap, FloorplanCanvas, EventBuilder, Checkout, Shell, AppProvider, ...).
- `src/collections/`: Cấu hình schema dữ liệu (Events, Users, Bookings, SeatClaims, TicketScans, ...).
- `tests/`: Bộ kiểm thử Playwright E2E.

---

## 📜 Các lệnh hữu ích

- `pnpm dev`: Khởi chạy Next.js dev server cổng 3000.
- `pnpm dev:host`: Khởi chạy dev server lắng nghe `0.0.0.0` (cho phép truy cập từ thiết bị khác trong mạng LAN).
- `pnpm build`: Build ứng dụng cho môi trường production.
- `pnpm start`: Chạy production server sau khi đã build.
