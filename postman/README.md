# TicketNow - Postman

## Import và đăng nhập

1. Postman Desktop > Import > chọn `TicketNow.postman_collection.json` và
   `TicketNow.local.postman_environment.json`.
2. Chọn environment **TicketNow - Local** ở góc trên bên phải.
3. Khởi động MariaDB, Keycloak (:8180), Event Service (:8081), Gateway (:8080).
4. Mở **00 - Login > 01 - OIDC discovery**, Send: mong đợi 200.
5. Mở **Login admin - PKCE then UserInfo**, tab Authorization:
   - Type OAuth 2.0 đã cấu hình sẵn.
   - Get New Access Token; Grant Type Authorization Code (With PKCE).
   - SHA-256; client `ticketnow-postman`; không có client secret.
   - Bỏ Authorize using browser, callback đúng `https://oauth.pstmn.io/v1/callback`.
   - Đăng nhập `admin01`, Proceed > Use Token > Send.
   - Copy **access token** vào environment `admin_access_token` (giá trị local).
     Script cũng thử lưu từ OAuth helper nếu Postman cung cấp token cho script.
   - UserInfo phải trả 200; script lưu `admin_sub`.
6. Lặp lại với **Login organizer** (`organizer01`) và **Login customer** (`customer01`).
   Điền `organizer_access_token`, `customer_access_token` tương ứng; Send UserInfo
   để lưu subject. Nếu tự đăng nhập nhầm tài khoản, xóa cookie phiên đăng nhập
   trong cửa sổ xác thực hoặc đăng xuất tài khoản đó trước khi lấy token mới.

Mật khẩu là `KC_DEMO_PASSWORD` khi import realm; nếu chưa cấu hình, Compose dùng
`LocalDemo_2026`. Đổi .env không đổi mật khẩu của user đã tồn tại.
`admin01` là admin TicketNow; KHÔNG phải quản trị viên Keycloak realm master.
Không dùng ID token thay cho access token. Giữ token/password ở giá trị local,
không sync hoặc export các giá trị đã điền vào Git. File environment đi kèm
chỉ chứa trường bí mật rỗng; type secret chỉ che UI, không mã hóa file export.

## Chạy 15 endpoint nghiệp vụ

Chạy theo thứ tự folder **01 Venues > 02 Events > 03 Ticket tiers > 04 Security**.
Có thể chọn riêng bốn folder này trong Collection Runner sau khi đã lấy token.
Không chạy toàn bộ collection từ đầu trong Runner: PKCE cần đăng nhập tương tác.

- Venues dùng token admin; Events/Tiers dùng token organizer.
- POST thành công tự lưu `venue_id`, `event_id`, `tier_id` trong environment.
- PUT dùng body mẫu đầy đủ; danh sách hỗ trợ page/size.
- Event tạo ra ở DRAFT, chỉ chủ sở hữu/admin đọc được; không xuất hiện trong
  danh sách chung. `organizerId` phải trùng `organizer_sub` đã lưu qua UserInfo.
- Security kiểm tra 401, 403, phân trang sai 400 và bảo vệ bản nháp/hạng vé.
- Test organizer khác tự bỏ qua nếu `other_organizer_access_token` trống.
  Tạo organizer thứ hai và lấy token của người đó nếu muốn kiểm tra case này.
- Các lần chạy mới tạo dữ liệu mới và ghi đè ID test trong environment.

GET/POST/PUT/DELETE của cả 3 tài nguyên đều có trong collection. Ba DELETE được
đặt cuối ở **07 Cleanup** để không xóa dữ liệu trước các test đọc/phân quyền.
Đặt `enable_cleanup=true` rồi chạy folder 07: xóa tier > draft event > venue.
Kiểm tra ID trong environment trước khi chạy; đặt lại false sau đó.

## Đăng ký / tạo tài khoản

**Hiện không có endpoint đăng ký công khai của TicketNow.** Realm JSON đặt
`registrationAllowed=false`, không thể dùng Postman POST `/register` để tự đăng ký.
Collection không thay đổi thiết lập này và không tạo endpoint giả.

Folder **05 Registration** là luồng quản trị cấp tài khoản qua Keycloak Admin REST API:

1. Điền environment local:
   - `enable_admin_registration=true`
   - `keycloak_admin_username`: `KC_ADMIN_USERNAME` của realm master.
   - `keycloak_admin_password`: mật khẩu quản trị hiện tại.
   - `new_username`, `new_email`, `new_user_password`: tài khoản mới cần tạo.
2. Gửi lần lượt 01-05 trong folder:
   - Login master bằng client `admin-cli`, lấy admin token.
   - Create user: 201, tự lưu ID từ Location.
   - Lấy ID role customer.
   - Gán role customer: 204.
   - Kiểm tra role đã gán: 200.
3. Token admin thường ngắn hạn; nếu hết hạn, chạy lại bước 01 rồi tiếp tục.
4. User mới đăng nhập qua helper PKCE, dùng chính username/password vừa tạo.
   Dùng một bản sao request Login customer nếu cần giữ token demo customer01.
5. Đặt lại `enable_admin_registration=false` sau khi xong.

Chỉ master/admin-cli dùng password grant cho công cụ quản trị local này.
Client ứng dụng `ticketnow-postman` vẫn tắt password grant và dùng PKCE.
Luồng này tạo tài khoản thật, không tự xóa sau test. Username trùng trả 409.
Tài khoản mới chỉ được gán customer; không tự nâng lên organizer/admin.
Email được để chưa xác minh; collection không giả lập email đã xác minh.
Nếu cần tự đăng ký công khai, đó là hạng mục triển khai tiếp theo: bật/configure
Keycloak registration và chính sách default role customer, xác minh email.

## Refresh / logout

- Copy refresh_token từ hộp thoại PKCE vào `organizer_refresh_token`.
- **06 Refresh** đổi access token và lưu refresh token mới nếu có.
- Chỉ đặt `enable_logout=true` khi muốn kết thúc phiên; logout chạy sau CRUD.
- Logout session không đảm bảo JWT access token bị từ chối ngay tại service:
  service xác thực JWT offline có thể chấp nhận tới lúc hết hạn.

## Lỗi thường gặp

- redirect_uri: callback phải trùng tuyệt đối URL đã đăng ký; không đổi sang
  `/v1/browser-callback` nếu chưa cấu hình Keycloak.
- 401: token hết hạn, sai issuer/audience, hoặc chưa điền token vào environment.
- 403: sai role/chủ sở hữu hoặc đang cố đọc bản nháp của người khác.
- 409 khi sửa/xóa: sự kiện không còn DRAFT hoặc dữ liệu đang được tham chiếu.
- 5xx từ Gateway: kiểm tra Event Service :8081 và MariaDB.
- Import JSON sửa rồi restart không cập nhật realm đã tồn tại.

## Phạm vi kiểm tra artifact

Collection v2.1 được tạo để import trực tiếp vào Postman Desktop.
`python postman/build_collection.py` tái tạo collection/environment rỗng từ mẫu.
`python postman/validate_collection.py` kiểm tra độ phủ 15 operation từ controller,
36 request, biến tham chiếu, token/password rỗng và cú pháp JavaScript bằng Node.js.
CLI `postman collection lint` hiện tại báo Scanned: 0 cho JSON v2.1, nên không
được coi là bằng chứng lint/schema thành công.
Kiểm tra cấu trúc và script không thay thế chạy API thật; việc tạo collection
không đăng nhập, tạo tài khoản hay xóa dữ liệu trên Keycloak/MariaDB.

Nguồn: controller/DTO/security của Event Service và realm JSON trong repository.
Tài liệu tham chiếu:
- https://learning.postman.com/docs/use/send-requests/authorization/oauth-20/
- https://www.keycloak.org/docs/26.5.7/server_development/
- https://www.keycloak.org/docs-api/26.7.4/rest-api/index.html
